import * as NodeEvents from "node:events";

import * as NodeWS from "@effect/platform-node/NodeWS";
import { expect, it, vi } from "vite-plus/test";

import { openConnector } from "./y3ConnectConnector.ts";

it("closes a half-open gateway connection after a missed heartbeat", async () => {
  const gateway = new NodeWS.WebSocketServer({ host: "127.0.0.1", port: 0 });
  await using _gateway = {
    [Symbol.asyncDispose]: async () => {
      for (const client of gateway.clients) client.terminate();
      await new Promise<void>((resolve) => gateway.close(() => resolve()));
    },
  };
  await NodeEvents.EventEmitter.once(gateway, "listening");
  const address = gateway.address();
  if (!address || typeof address === "string") throw new Error("Expected a TCP listener");

  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  using _timers = { [Symbol.dispose]: () => vi.useRealTimers() };
  const connected = NodeEvents.EventEmitter.once(gateway, "connection");
  const connector = openConnector({
    serverOrigin: new URL(`http://127.0.0.1:${address.port}`),
    hostToken: "a".repeat(64),
    localPort: 1,
  });
  using _connector = { [Symbol.dispose]: () => connector.terminate() };
  const [[peer]] = await Promise.all([connected, NodeEvents.EventEmitter.once(connector, "open")]);

  using ping = vi.spyOn(connector, "ping");
  const pong = NodeEvents.EventEmitter.once(connector, "pong");
  vi.advanceTimersByTime(5_000);
  expect(ping).toHaveBeenCalledTimes(1);
  await pong;
  expect(connector.readyState).toBe(NodeWS.WebSocket.OPEN);

  peer.pause();
  const closed = NodeEvents.EventEmitter.once(connector, "close");
  vi.advanceTimersByTime(5_000);
  expect(ping).toHaveBeenCalledTimes(2);
  expect(connector.readyState).toBe(NodeWS.WebSocket.OPEN);
  vi.advanceTimersByTime(5_000);
  await closed;
  expect(connector.readyState).toBe(NodeWS.WebSocket.CLOSED);
  expect(vi.getTimerCount()).toBe(0);
});
