import * as NodeWS from "@effect/platform-node/NodeWS";
// @effect-diagnostics-next-line nodeBuiltinImport:off -- HTTP/2 and WebSocket have a native duplex boundary.
import type * as NodeStream from "node:stream";

export const tunnelProtocol = "y3-connect.v1";
export const streamAuthority = "environment";
export const maxStreamsPerHost = 64;

export const websocketLimits = {
  maxPayload: 1024 * 1024,
  perMessageDeflate: false,
};

export function transport(socket: NodeWS.WebSocket): NodeStream.Duplex {
  const duplex = NodeWS.createWebSocketStream(socket);
  duplex.on("error", () => socket.terminate());
  return duplex;
}

export function bridge(left: NodeStream.Duplex, right: NodeStream.Duplex) {
  left.on("error", () => right.destroy());
  right.on("error", () => left.destroy());
  left.once("close", () => {
    if (!left.readableEnded) right.destroy();
  });
  right.once("close", () => {
    if (!right.readableEnded) left.destroy();
  });
  left.pipe(right);
  right.pipe(left);
}
