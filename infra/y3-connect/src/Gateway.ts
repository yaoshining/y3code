// @effect-diagnostics nodeBuiltinImport:off -- The gateway owns native HTTP upgrades and the HTTP/2 tunnel.
import * as NodeHttp from "node:http";
import * as NodeHttp2 from "node:http2";
import type * as NodeNet from "node:net";
import type * as NodeStream from "node:stream";

import * as NodeWS from "@effect/platform-node/NodeWS";
import type { EnvironmentId } from "@t3tools/contracts";
import {
  Y3_CONNECT_PATHS,
  Y3ConnectHostToken,
  type Y3ConnectHost,
} from "@t3tools/contracts/y3Connect";
import * as Schema from "effect/Schema";

import { proxyHttp, proxyUpgrade, rejectUpgrade } from "./proxy.ts";
import {
  maxStreamsPerHost,
  transport,
  tunnelProtocol,
  websocketLimits,
} from "@t3tools/shared/y3ConnectTransport";

const isHostToken = Schema.is(Y3ConnectHostToken);
const heartbeatMs = 5_000;
// The connector can still be tearing down streams after the gateway observes close.
const maxActiveRequestsPerHost = Math.floor(maxStreamsPerHost / 2);
const maxPendingRequestsPerHost = 256;
const pendingRequestTimeoutMs = 10_000;

export interface GatewayRoute {
  readonly environmentId: EnvironmentId;
  readonly origin: URL;
}

type Tunnel = {
  session: NodeHttp2.ClientHttp2Session;
  active: number;
  readonly pending: Set<() => void>;
};

export function createGateway(input: {
  routes: ReadonlyMap<string, GatewayRoute>;
  authorize: (hostToken: string) => Promise<Y3ConnectHost | null>;
  control: (req: NodeHttp.IncomingMessage, res: NodeHttp.ServerResponse) => void;
}) {
  const live = new Map<EnvironmentId, Tunnel>();
  const acceptedSockets = new Set<NodeNet.Socket>();
  const allowedHosts = new Set([...input.routes.values()].map((route) => route.environmentId));
  const server = NodeHttp.createServer({
    headersTimeout: 15_000,
    requestTimeout: 300_000,
    maxHeaderSize: 16_384,
  });
  const wss = new NodeWS.WebSocketServer({ noServer: true, ...websocketLimits });
  let closed = false;

  function register(host: Y3ConnectHost, credential: string, ws: NodeWS.WebSocket) {
    const socket = transport(ws);
    const session = NodeHttp2.connect("http://y3-tunnel.invalid", {
      createConnection: () => socket,
      maxSessionMemory: 16,
    });
    const tunnel: Tunnel = { session, active: 0, pending: new Set() };
    live.set(host.environmentId, tunnel);
    let awaitingCheck = false;
    // @effect-diagnostics-next-line globalTimers:off -- This native heartbeat closes with its HTTP/2 session.
    const timer = setInterval(() => {
      if (awaitingCheck) {
        session.destroy();
        return;
      }
      awaitingCheck = true;
      void input
        .authorize(credential)
        .then((current) => {
          if (
            current?.environmentId !== host.environmentId ||
            session.closed ||
            session.destroyed
          ) {
            session.destroy();
            return;
          }
          session.ping((error) => {
            if (error) session.destroy();
            else awaitingCheck = false;
          });
        })
        .catch(() => session.destroy());
    }, heartbeatMs);
    session.on("error", () => session.destroy());
    session.once("close", () => {
      clearInterval(timer);
      if (live.get(host.environmentId) === tunnel) live.delete(host.environmentId);
      for (const resume of tunnel.pending) resume();
      ws.terminate();
    });
    ws.once("close", () => session.destroy());
  }

  async function acceptTunnel(
    req: NodeHttp.IncomingMessage,
    socket: NodeStream.Duplex,
    head: Buffer,
  ) {
    const protocol = req.headers["sec-websocket-protocol"]?.split(",").map((name) => name.trim());
    if (protocol?.length !== 1 || protocol[0] !== tunnelProtocol) {
      rejectUpgrade(socket, 400);
      return;
    }
    const credential = req.headers.authorization?.match(/^Bearer (\S+)$/iu)?.[1];
    if (!isHostToken(credential)) {
      rejectUpgrade(socket, 401);
      return;
    }
    const host = await input.authorize(credential);
    if (socket.destroyed || socket.writableEnded || closed) return;
    if (!host || !allowedHosts.has(host.environmentId)) {
      rejectUpgrade(socket, 401);
      return;
    }
    if (live.has(host.environmentId)) {
      rejectUpgrade(socket, 409);
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => register(host, credential, ws));
  }

  const select = (req: NodeHttp.IncomingMessage) =>
    req.headers.host === undefined ? undefined : input.routes.get(req.headers.host.toLowerCase());

  function reserve(tunnel: Tunnel | undefined) {
    if (
      !tunnel ||
      tunnel.session.closed ||
      tunnel.session.destroyed ||
      tunnel.active >= maxActiveRequestsPerHost
    )
      return null;
    tunnel.active++;
    return {
      session: tunnel.session,
      release: () => {
        tunnel.active--;
        tunnel.pending.values().next().value?.();
      },
    };
  }

  const unavailable = (res: NodeHttp.ServerResponse) =>
    res.writeHead(503, { "cache-control": "no-store" }).end();

  function forwardRequest(
    tunnel: Tunnel | undefined,
    req: NodeHttp.IncomingMessage,
    res: NodeHttp.ServerResponse,
    origin: URL,
  ) {
    const slot = reserve(tunnel);
    if (slot) {
      proxyHttp(slot, req, res, origin);
      return;
    }
    // Browser module preloads can exceed the tunnel's stream limit in a single burst.
    if (
      !tunnel ||
      tunnel.session.closed ||
      tunnel.session.destroyed ||
      tunnel.pending.size >= maxPendingRequestsPerHost ||
      (req.method !== "GET" && req.method !== "HEAD") ||
      (req.headers["content-length"] && req.headers["content-length"] !== "0") ||
      req.headers["transfer-encoding"]
    ) {
      unavailable(res);
      return;
    }
    function cancel() {
      tunnel?.pending.delete(resume);
      res.off("close", cancel);
      clearTimeout(timeout);
    }
    function resume() {
      cancel();
      if (res.destroyed) return;
      const next = reserve(tunnel);
      if (next) proxyHttp(next, req, res, origin);
      else unavailable(res);
    }
    // @effect-diagnostics-next-line globalTimers:off -- The queue deadline follows the native response lifecycle.
    const timeout = setTimeout(() => {
      cancel();
      unavailable(res);
    }, pendingRequestTimeoutMs).unref();
    res.once("close", cancel);
    tunnel.pending.add(resume);
  }

  const path = (req: NodeHttp.IncomingMessage) => req.url?.split("?", 1)[0];
  const isControlPath = (value: string) =>
    value === Y3_CONNECT_PATHS.descriptor || value.startsWith(Y3_CONNECT_PATHS.descriptor + "/");

  server.on("request", (req, res) => {
    const pathname = path(req);
    if (pathname && isControlPath(pathname)) {
      input.control(req, res);
      return;
    }
    const route = select(req);
    if (!pathname?.startsWith("/") || pathname.startsWith("//") || !route) {
      res.writeHead(404).end();
      return;
    }
    forwardRequest(live.get(route.environmentId), req, res, route.origin);
  });

  server.on("upgrade", (req, socket, head) => {
    socket.on("error", () => socket.destroy());
    if (
      req.method !== "GET" ||
      req.headers.upgrade?.toLowerCase() !== "websocket" ||
      (req.headers["content-length"] && req.headers["content-length"] !== "0") ||
      req.headers["transfer-encoding"]
    ) {
      rejectUpgrade(socket, 400);
      return;
    }
    const pathname = path(req);
    if (req.url === Y3_CONNECT_PATHS.tunnel) {
      void acceptTunnel(req, socket, head).catch(() => rejectUpgrade(socket, 503));
      return;
    }
    const route = select(req);
    if (
      !pathname?.startsWith("/") ||
      pathname.startsWith("//") ||
      isControlPath(pathname) ||
      !route
    ) {
      rejectUpgrade(socket, 404);
      return;
    }
    const slot = reserve(live.get(route.environmentId));
    if (slot) proxyUpgrade(slot, req, socket, head, route.origin);
    else rejectUpgrade(socket, 503);
  });

  server.on("connection", (socket) => {
    acceptedSockets.add(socket);
    socket.once("close", () => acceptedSockets.delete(socket));
  });

  return {
    server,
    close: () => {
      closed = true;
      for (const { session } of live.values()) session.destroy();
      for (const socket of acceptedSockets) socket.destroy();
      wss.close();
      return new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
