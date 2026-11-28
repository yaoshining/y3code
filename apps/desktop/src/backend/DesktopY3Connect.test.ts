import * as NodeEvents from "node:events";

import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import { EnvironmentId } from "@t3tools/contracts";
import { Y3_CONNECT_PATHS } from "@t3tools/contracts/y3Connect";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import { HttpClient, HttpClientResponse } from "effect/http";
import * as Layer from "effect/Layer";
import * as TestClock from "effect/testing/TestClock";
import { vi } from "vite-plus/test";

import { DesktopEnvironment } from "../app/DesktopEnvironment.ts";
import * as DesktopManagedPolicy from "../app/DesktopManagedPolicy.ts";
import { ElectronSafeStorage } from "../electron/ElectronSafeStorage.ts";
import { DesktopBackendPool, type DesktopBackendInstance } from "./DesktopBackendPool.ts";
import * as DesktopY3Connect from "./DesktopY3Connect.ts";

const openConnector = vi.hoisted(() => vi.fn());
vi.mock("@t3tools/shared/y3ConnectConnector", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@t3tools/shared/y3ConnectConnector")>()),
  openConnector,
}));

class TestSocket extends NodeEvents.EventEmitter {
  readonly OPEN = 1;
  readonly CLOSED = 3;
  readyState = 0;

  constructor() {
    super();
    queueMicrotask(() => {
      if (this.readyState === this.CLOSED) return;
      this.readyState = this.OPEN;
      this.emit("open");
    });
  }

  terminate() {
    this.readyState = this.CLOSED;
    this.emit("close");
  }
}

const environmentId = EnvironmentId.make("primary");
const serverOrigin = "https://gateway.example.com";
const bind = { action: "bind", serverOrigin, bindingCode: "a".repeat(32) } as const;

const setup = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const stateDir = yield* fs.makeTempDirectoryScoped();
  const sockets: TestSocket[] = [];
  openConnector.mockImplementation(() => {
    const socket = new TestSocket();
    sockets.push(socket);
    return socket;
  });
  const requests: string[] = [];
  const gateway = { environmentId };
  const http = HttpClient.make((request) =>
    Effect.sync(() => {
      requests.push(request.url);
      const url = new URL(request.url);
      const id = url.origin === serverOrigin ? gateway.environmentId : environmentId;
      const data =
        url.pathname === Y3_CONNECT_PATHS.descriptor
          ? { service: "y3-connect", version: 1 }
          : url.pathname === Y3_CONNECT_PATHS.bind
            ? { environmentId }
            : {
                environmentId: id,
                label: "Local",
                platform: { os: "darwin", arch: "arm64" },
                serverVersion: "1.0.0",
                capabilities: {},
              };
      return HttpClientResponse.fromWeb(request, Response.json(data));
    }),
  );
  const dependencies = Layer.mergeAll(
    Layer.succeed(DesktopEnvironment, { stateDir } as DesktopEnvironment["Service"]),
    DesktopManagedPolicy.layerTest(),
    Layer.mock(DesktopBackendPool, {
      primary: Effect.succeed({
        currentConfig: Effect.succeedSome({ httpBaseUrl: new URL("http://127.0.0.1:3773") }),
      } as DesktopBackendInstance),
    }),
    Layer.succeed(ElectronSafeStorage, {
      isEncryptionAvailable: Effect.succeed(true),
      selectedStorageBackend: Effect.succeedNone,
      encryptString: (value) => Effect.succeed(Buffer.from(value).reverse()),
      decryptString: (value) => Effect.succeed(Buffer.from(value).reverse().toString()),
    }),
    Layer.succeed(HttpClient.HttpClient, http),
  );
  const layer = DesktopY3Connect.layer.pipe(Layer.provide(dependencies));
  return { sockets, requests, gateway, layer };
});

it.effect(
  "binds and verifies the routed environment, then disables and re-enables without another code",
  () =>
    Effect.gen(function* () {
      const { layer, sockets, requests } = yield* setup;
      const program = Effect.gen(function* () {
        const service = yield* DesktopY3Connect.DesktopY3Connect;
        assert.deepInclude(yield* service.getState, { enabled: false, serverOrigin: null });
        const result = yield* service.change(bind);
        assert.isTrue(result.ok, JSON.stringify(result));
        assert.deepInclude(yield* service.getState, { enabled: true, online: true, serverOrigin });
        assert.isTrue((yield* service.change({ action: "disable" })).ok);
        assert.deepInclude(yield* service.getState, {
          enabled: false,
          online: false,
          serverOrigin,
        });
        assert.equal(sockets[0]?.readyState, 3);
      });
      yield* program.pipe(Effect.provide(layer));
      yield* Effect.gen(function* () {
        const service = yield* DesktopY3Connect.DesktopY3Connect;
        yield* service.restore;
        assert.deepInclude(yield* service.getState, {
          enabled: false,
          online: false,
          serverOrigin,
        });
        assert.isTrue((yield* service.change({ action: "enable" })).ok);
        assert.deepInclude(yield* service.getState, { enabled: true, online: true, serverOrigin });
        assert.lengthOf(sockets, 2);
        assert.lengthOf(
          requests.filter((url) => url.endsWith(Y3_CONNECT_PATHS.bind)),
          1,
        );
        yield* Effect.sync(() => sockets[1]?.terminate());
        yield* TestClock.adjust(0);
        assert.deepInclude(yield* service.getState, { enabled: true, online: false });
        yield* TestClock.adjust("5 seconds");
        assert.deepInclude(yield* service.getState, { enabled: true, online: true });
        assert.lengthOf(sockets, 3);
      }).pipe(Effect.provide(layer));
      assert.equal(sockets[2]?.readyState, 3);
    }).pipe(Effect.provide([NodeServices.layer, NodeCrypto.layer])),
);

it.effect("rejects an unverified route and keeps the binding for a later retry", () =>
  Effect.gen(function* () {
    const { layer, sockets, gateway } = yield* setup;
    yield* Effect.gen(function* () {
      const service = yield* DesktopY3Connect.DesktopY3Connect;
      const insecure = yield* service.change({ ...bind, serverOrigin: "http://localhost:17890" });
      assert.deepEqual(insecure, { ok: false, problem: "origin" });
      assert.isEmpty(sockets);
      gateway.environmentId = EnvironmentId.make("different-host");
      const result = yield* service.change(bind);
      assert.deepEqual(result, { ok: false, problem: "environment" });
      assert.equal(sockets[0]?.readyState, 3);
      assert.deepInclude(yield* service.getState, { enabled: false, online: false, serverOrigin });
      gateway.environmentId = environmentId;
      assert.isTrue((yield* service.change({ action: "enable" })).ok);
    }).pipe(Effect.provide(layer));
  }).pipe(Effect.provide([NodeServices.layer, NodeCrypto.layer])),
);
