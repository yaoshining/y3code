// @effect-diagnostics nodeBuiltinImport:off -- Proxy HTTP and upgrades through a native HTTP/2 stream.
import * as NodeHttp from "node:http";
import type * as NodeHttp2 from "node:http2";
import * as NodeNet from "node:net";
import type * as NodeStream from "node:stream";

import { bridge, streamAuthority } from "@t3tools/shared/y3ConnectTransport";

const hopHeaders = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "proxy-connection",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

function endToEnd(headers: NodeHttp.IncomingHttpHeaders): NodeHttp.OutgoingHttpHeaders {
  const connectionTokens = headers.connection
    ?.toLowerCase()
    .split(",")
    .map((name) => name.trim());
  const result: NodeHttp.OutgoingHttpHeaders = Object.create(null);
  for (const [name, value] of Object.entries(headers)) {
    if (
      value === undefined ||
      hopHeaders.has(name) ||
      connectionTokens?.includes(name) ||
      name === "forwarded" ||
      name.startsWith("x-forwarded-")
    )
      continue;
    result[name] = value;
  }
  return result;
}

function outgoingHeaders(req: NodeHttp.IncomingMessage, origin: URL, upgrade: boolean) {
  const headers = endToEnd(req.headers);
  headers.host = origin.host;
  headers["x-forwarded-proto"] = origin.protocol.slice(0, -1);
  const peer = req.socket.remoteAddress?.replace(/^::ffff:/u, "");
  if (peer) {
    const header = req.headers["x-forwarded-for"];
    const forwarded = (Array.isArray(header) ? header.at(-1) : header)?.split(",").at(-1)?.trim();
    const trustedProxy = peer === "::1" || peer.startsWith("127.");
    headers["x-forwarded-for"] =
      trustedProxy && forwarded && NodeNet.isIP(forwarded) ? forwarded : peer;
  }
  if (upgrade) {
    headers.upgrade = "websocket";
    headers.connection = "Upgrade";
  } else {
    headers.connection = "close";
  }
  return headers;
}

type TunnelSlot = {
  readonly session: NodeHttp2.ClientHttp2Session;
  readonly release: () => void;
};

function requestThroughTunnel(
  slot: TunnelSlot,
  req: NodeHttp.IncomingMessage,
  sink: NodeHttp.ServerResponse | NodeStream.Duplex,
  origin: URL,
  upgrade: boolean,
  onRequest: (upstream: NodeHttp.ClientRequest) => void,
  onError: () => void,
) {
  let stream: NodeHttp2.ClientHttp2Stream;
  try {
    stream = slot.session.request(
      { ":method": "CONNECT", ":authority": streamAuthority },
      { endStream: false },
    );
  } catch {
    onError();
    slot.release();
    return;
  }
  const release = () => stream.destroy();
  sink.once("close", release);
  stream.once("close", () => {
    sink.off("close", release);
    slot.release();
  });
  stream.on("error", onError);
  stream.setTimeout(8_000, () => {
    release();
    onError();
  });
  stream.once("response", (headers) => {
    stream.setTimeout(0);
    if (sink.destroyed || headers[":status"] !== 200) {
      release();
      onError();
      return;
    }
    const upstream = NodeHttp.request({
      method: req.method,
      path: req.url,
      headers: outgoingHeaders(req, origin, upgrade),
      createConnection: () => stream,
    });
    upstream.on("error", () => {
      release();
      onError();
    });
    onRequest(upstream);
  });
}

export function proxyHttp(
  slot: TunnelSlot,
  req: NodeHttp.IncomingMessage,
  res: NodeHttp.ServerResponse,
  origin: URL,
) {
  const onError = () => {
    if (res.writableEnded || res.destroyed) return;
    if (res.headersSent) res.destroy();
    else res.writeHead(502, { "cache-control": "no-store" }).end();
  };
  requestThroughTunnel(
    slot,
    req,
    res,
    origin,
    false,
    (upstream) => {
      // An upstream can end before the upload has finished; close the tunnel after the response.
      upstream.once("response", (response) => {
        response.on("error", onError);
        res.writeHead(response.statusCode ?? 502, endToEnd(response.headers));
        response.pipe(res);
      });
      res.once("close", () => upstream.destroy());
      req.on("error", () => upstream.destroy());
      // Flush the string header separately from Buffer body chunks on the HTTP/2 duplex.
      upstream.flushHeaders();
      req.pipe(upstream);
    },
    onError,
  );
}

export function rejectUpgrade(socket: NodeStream.Duplex, status: number) {
  if (socket.destroyed || socket.writableEnded) return;
  socket.end(
    `HTTP/1.1 ${status} ${NodeHttp.STATUS_CODES[status]}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`,
  );
}

export function proxyUpgrade(
  slot: TunnelSlot,
  req: NodeHttp.IncomingMessage,
  socket: NodeStream.Duplex,
  head: Buffer,
  origin: URL,
) {
  let upgraded = false;
  const onError = () => {
    if (upgraded) socket.destroy();
    else rejectUpgrade(socket, 502);
  };
  requestThroughTunnel(
    slot,
    req,
    socket,
    origin,
    true,
    (upstream) => {
      upstream.once("response", (response) => {
        rejectUpgrade(socket, response.statusCode ?? 502);
        upstream.destroy();
      });
      upstream.once("upgrade", (response, stream, upstreamHead) => {
        if (
          response.statusCode !== 101 ||
          response.headers.upgrade?.toLowerCase() !== "websocket"
        ) {
          stream.destroy();
          onError();
          return;
        }
        upgraded = true;
        let handshake =
          "HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n";
        for (const [name, value] of Object.entries(endToEnd(response.headers))) {
          for (const item of Array.isArray(value) ? value : [value])
            handshake += `${name}: ${item}\r\n`;
        }
        socket.write(handshake + "\r\n");
        if (upstreamHead.length > 0) socket.write(upstreamHead);
        if (head.length > 0) stream.write(head);
        bridge(socket, stream);
      });
      socket.once("close", () => upstream.destroy());
      upstream.end();
    },
    onError,
  );
}
