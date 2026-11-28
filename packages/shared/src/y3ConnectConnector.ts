// @effect-diagnostics nodeBuiltinImport:off -- The connector bridges native HTTP/2 streams to a loopback TCP origin.
import * as NodeHttp2 from "node:http2";
import * as NodeNet from "node:net";

import * as NodeWS from "@effect/platform-node/NodeWS";
import { Y3_CONNECT_PATHS } from "@t3tools/contracts/y3Connect";

import {
  bridge,
  maxStreamsPerHost,
  streamAuthority,
  transport,
  tunnelProtocol,
  websocketLimits,
} from "./y3ConnectTransport.ts";

export function openConnector(input: {
  serverOrigin: URL;
  hostToken: string;
  localPort: number;
}): NodeWS.WebSocket {
  const endpoint = new URL(Y3_CONNECT_PATHS.tunnel, input.serverOrigin);
  endpoint.protocol = endpoint.protocol === "https:" ? "wss:" : "ws:";
  const socket = new NodeWS.WebSocket(endpoint, tunnelProtocol, {
    ...websocketLimits,
    followRedirects: false,
    handshakeTimeout: 8_000,
    headers: { authorization: `Bearer ${input.hostToken}` },
  });
  socket.once("open", () => {
    const server = NodeHttp2.createServer({
      settings: { maxConcurrentStreams: maxStreamsPerHost },
    });
    let session: NodeHttp2.ServerHttp2Session | undefined;
    server.on("session", (connected) => {
      session = connected;
      connected.on("error", () => socket.terminate());
      connected.once("close", () => socket.terminate());
    });
    server.on("stream", (stream, headers) => {
      if (
        headers[":method"] !== "CONNECT" ||
        headers[":authority"] !== streamAuthority ||
        headers[":path"] !== undefined ||
        headers[":protocol"] !== undefined
      ) {
        stream.on("error", () => {});
        stream.respond({ ":status": 400 }, { endStream: true });
        return;
      }
      const local = NodeNet.connect({ host: "127.0.0.1", port: input.localPort });
      local.setTimeout(5_000, () => local.destroy());
      stream.once("close", () => local.destroy());
      stream.on("error", () => local.destroy());
      local.once("error", () => local.destroy());
      local.once("close", () => {
        if (!stream.destroyed && !stream.headersSent) {
          stream.respond({ ":status": 502 }, { endStream: true });
        }
      });
      local.once("connect", () => {
        local.setTimeout(0);
        if (stream.destroyed || stream.closed) {
          local.destroy();
          return;
        }
        stream.respond({ ":status": 200 });
        bridge(stream, local);
      });
    });
    server.on("error", () => socket.terminate());
    socket.once("close", () => {
      session?.destroy();
      server.close();
    });
    server.emit("connection", transport(socket));
  });
  return socket;
}

export function parseConnectorOrigin(value: string): URL | null {
  try {
    const url = new URL(value.trim());
    const local = ["127.0.0.1", "[::1]", "localhost"].includes(url.hostname);
    if (
      (url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    )
      return null;
    return url;
  } catch {
    return null;
  }
}
