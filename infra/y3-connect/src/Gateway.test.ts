import * as NodeEvents from "node:events";
// @effect-diagnostics-next-line nodeBuiltinImport:off -- Tests use a real loopback HTTP and WebSocket origin.
import * as NodeHttp from "node:http";

import * as NodeWS from "@effect/platform-node/NodeWS";
import { EnvironmentId } from "@t3tools/contracts";
import { Y3_CONNECT_PATHS } from "@t3tools/contracts/y3Connect";
import { expect, it } from "vite-plus/test";

import { openConnector } from "@t3tools/shared/y3ConnectConnector";
import { createGateway } from "./Gateway.ts";
import { maxStreamsPerHost, tunnelProtocol } from "@t3tools/shared/y3ConnectTransport";

async function listen(server: NodeHttp.Server) {
  server.listen(0, "127.0.0.1");
  await NodeEvents.EventEmitter.once(server, "listening");
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("Expected a TCP listener");
  return new URL(`http://127.0.0.1:${address.port}`);
}

function request(url: URL, options: NodeHttp.RequestOptions, body?: string) {
  return new Promise<{
    status: number | undefined;
    headers: NodeHttp.IncomingHttpHeaders;
    body: string;
  }>((resolve, reject) => {
    const req = NodeHttp.request(url, options, (res) => {
      res.setEncoding("utf8");
      let responseBody = "";
      res.on("data", (chunk: string) => (responseBody += chunk));
      res.once("error", reject);
      res.once("end", () =>
        resolve({ status: res.statusCode, headers: res.headers, body: responseBody }),
      );
    });
    req.once("error", reject);
    req.end(body);
  });
}

it("forwards HTTP and live WebSockets only to the mapped host and closes them with the connector", async () => {
  const echo = new NodeWS.WebSocketServer({ noServer: true });
  const releaseAssets = Promise.withResolvers<void>();
  const origin = NodeHttp.createServer((req, res) => {
    if (req.url?.startsWith("/assets/")) {
      void releaseAssets.promise.then(() => res.writeHead(200).end(req.url));
      return;
    }
    res.setHeader("content-type", "application/octet-stream");
    res.setHeader("set-cookie", ["one=1", "two=2"]);
    res.setHeader("x-environment-host", req.headers.host ?? "");
    res.setHeader("x-environment-proto", req.headers["x-forwarded-proto"] ?? "");
    req.pipe(res);
  });
  origin.on("upgrade", (req, socket, head) => {
    echo.handleUpgrade(req, socket, head, (ws) => {
      ws.on("message", (data, isBinary) => ws.send(data, { binary: isBinary }));
    });
  });
  await using _origin = {
    [Symbol.asyncDispose]: async () => {
      for (const client of echo.clients) client.terminate();
      echo.close();
      origin.closeAllConnections();
      await new Promise<void>((resolve) => origin.close(() => resolve()));
    },
  };
  const upstream = await listen(origin);
  const host = { environmentId: EnvironmentId.make("host") };
  const hostToken = "a".repeat(64);
  const gateway = createGateway({
    routes: new Map([
      ["host.example.test", { ...host, origin: new URL("https://host.example.test") }],
      [
        "other.example.test",
        {
          environmentId: EnvironmentId.make("other"),
          origin: new URL("https://other.example.test"),
        },
      ],
    ]),
    authorize: (token) => Promise.resolve(token === hostToken ? host : null),
    control: (_req, res) => res.writeHead(204).end(),
  });
  await using _gateway = { [Symbol.asyncDispose]: gateway.close };
  const gatewayOrigin = await listen(gateway.server);
  const address = new URL("/echo", gatewayOrigin);
  function attemptTunnel(token: string) {
    return request(new URL(Y3_CONNECT_PATHS.tunnel, gatewayOrigin), {
      headers: {
        connection: "Upgrade",
        upgrade: "websocket",
        "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==",
        "sec-websocket-version": "13",
        "sec-websocket-protocol": tunnelProtocol,
        authorization: `Bearer ${token}`,
      },
    });
  }
  expect((await attemptTunnel("b".repeat(64))).status).toBe(401);
  const connector = openConnector({
    serverOrigin: gatewayOrigin,
    localPort: Number(upstream.port),
    hostToken,
  });
  using _connector = { [Symbol.dispose]: () => connector.terminate() };
  await NodeEvents.EventEmitter.once(connector, "open");
  expect((await attemptTunnel(hostToken)).status).toBe(409);

  const approval = await request(
    new URL("/oauth/mcp/approval", gatewayOrigin),
    { method: "POST", headers: { host: "host.example.test", "content-type": "application/json" } },
    '{"decision":"test"}',
  );
  expect(approval.status).toBe(200);
  expect(approval.body).toBe('{"decision":"test"}');

  const body = "Y3".repeat(256 * 1024);
  const response = await request(
    address,
    {
      method: "POST",
      headers: { host: "host.example.test", "x-forwarded-proto": "http" },
    },
    body,
  );
  expect(response.status).toBe(200);
  expect(response.body).toBe(body);
  expect(response.headers["set-cookie"]).toEqual(["one=1", "two=2"]);
  expect(response.headers["x-environment-host"]).toBe("host.example.test");
  expect(response.headers["x-environment-proto"]).toBe("https");
  expect((await request(address, { headers: { host: "other.example.test" } })).status).toBe(503);

  const assetPaths = Array.from({ length: 219 }, (_, index) => `/assets/chunk-${index}.js`);
  const assetAgent = new NodeHttp.Agent({ maxSockets: maxStreamsPerHost + 16 });
  using _assetAgent = { [Symbol.dispose]: () => assetAgent.destroy() };
  const receivedAssets = Promise.withResolvers<void>();
  let receivedCount = 0;
  gateway.server.on("request", (req) => {
    if (req.url?.startsWith("/assets/") && ++receivedCount === maxStreamsPerHost + 1) {
      receivedAssets.resolve();
    }
  });
  const [responses] = await Promise.all([
    Promise.all(
      assetPaths.map((path) =>
        request(new URL(path, gatewayOrigin), {
          agent: assetAgent,
          headers: { host: "host.example.test" },
        }),
      ),
    ),
    receivedAssets.promise.then(() => releaseAssets.resolve()),
  ]);
  expect(responses.filter((response) => response.status !== 200)).toEqual([]);
  expect(responses.map((response) => response.body)).toEqual(assetPaths);

  address.protocol = "ws:";
  const client = new NodeWS.WebSocket(address, { headers: { host: "host.example.test" } });
  using _client = { [Symbol.dispose]: () => client.terminate() };
  await NodeEvents.EventEmitter.once(client, "open");
  const received = NodeEvents.EventEmitter.once(client, "message");
  client.send("Y3 WebSocket");
  expect(String((await received)[0])).toBe("Y3 WebSocket");

  const closed = NodeEvents.EventEmitter.once(client, "close");
  connector.terminate();
  await closed;
  address.protocol = "http:";
  expect((await request(address, { headers: { host: "host.example.test" } })).status).toBe(503);
});
