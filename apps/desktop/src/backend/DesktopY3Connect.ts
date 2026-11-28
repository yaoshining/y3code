import { ExecutionEnvironmentDescriptor } from "@t3tools/contracts";
import {
  Y3_CONNECT_PATHS,
  Y3ConnectBindingCode,
  Y3ConnectDescriptor,
  Y3ConnectHost,
  Y3ConnectHostToken,
  type Y3ConnectChange,
  type Y3ConnectChangeResult,
  Y3ConnectProblem,
  type Y3ConnectState,
} from "@t3tools/contracts/y3Connect";
import { openConnector, parseConnectorOrigin } from "@t3tools/shared/y3ConnectConnector";
import * as Context from "effect/Context";
import * as SecureRandom from "effect/crypto/SecureRandom";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as FiberHandle from "effect/FiberHandle";
import * as FileSystem from "effect/FileSystem";
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import * as Schedule from "effect/Schedule";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";

import * as DesktopEnvironment from "../app/DesktopEnvironment.ts";
import * as DesktopManagedPolicy from "../app/DesktopManagedPolicy.ts";
import * as ElectronSafeStorage from "../electron/ElectronSafeStorage.ts";
import * as DesktopBackendPool from "./DesktopBackendPool.ts";

const BindingDocument = Schema.fromJsonString(
  Schema.Struct({
    version: Schema.Literal(1),
    ...Y3ConnectHost.fields,
    serverOrigin: Schema.String,
    hostToken: Y3ConnectHostToken,
    enabled: Schema.Boolean,
  }),
);
type Binding = typeof BindingDocument.Type;
const encodeBinding = Schema.encodeEffect(BindingDocument);
const decodeBinding = Schema.decodeEffect(BindingDocument);
const isBindingCode = Schema.is(Y3ConnectBindingCode);

class ConnectError extends Schema.TaggedError<ConnectError, { readonly brand: unique symbol }>()(
  "DesktopY3ConnectError",
  {
    problem: Y3ConnectProblem,
  },
) {}

const fail = (problem: Y3ConnectProblem) => new ConnectError({ problem });
const requireHttpsOrigin = (value: string) => {
  const origin = parseConnectorOrigin(value);
  return origin?.protocol === "https:" ? origin : null;
};

export class DesktopY3Connect extends Context.Service<
  DesktopY3Connect,
  {
    readonly restore: Effect.Effect<void>;
    readonly getState: Effect.Effect<Y3ConnectState>;
    readonly change: (input: Y3ConnectChange) => Effect.Effect<Y3ConnectChangeResult>;
  }
>()("@t3tools/desktop/backend/DesktopY3Connect") {}

export const layer = Layer.effect(
  DesktopY3Connect,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const { stateDir } = yield* DesktopEnvironment.DesktopEnvironment;
    const primary = yield* (yield* DesktopBackendPool.DesktopBackendPool).primary;
    const safeStorage = yield* ElectronSafeStorage.ElectronSafeStorage;
    const client = yield* HttpClient.HttpClient;
    const random = yield* SecureRandom.SecureRandom;
    const randomHex = (length: number) =>
      random.randomBytes(length).pipe(Effect.map((bytes) => Buffer.from(bytes).toString("hex")));
    const remoteAllowed = yield* (yield* DesktopManagedPolicy.DesktopManagedPolicy).read.pipe(
      Effect.map((found) => found?.document.limits?.clients?.includes("remote") ?? true),
      Effect.orElseSucceed(() => false),
    );
    const file = path.join(stateDir, "y3-connect.binding");
    const lock = yield* Semaphore.make(1);
    const worker = yield* FiberHandle.make<void>();
    const bindingRef = yield* Ref.make<Binding | null>(null);
    const onlineRef = yield* Ref.make(false);
    const storageError = yield* Ref.make(false);
    const getState = Effect.gen(function* () {
      const binding = yield* Ref.get(bindingRef);
      const online = yield* Ref.get(onlineRef);
      const enabled = remoteAllowed && (binding?.enabled ?? false);
      const problem = (yield* Ref.get(storageError))
        ? "storage"
        : !remoteAllowed
          ? "policy"
          : enabled && !online
            ? "tunnel"
            : null;
      return {
        serverOrigin: binding?.serverOrigin ?? null,
        environmentId: binding?.environmentId ?? null,
        enabled,
        online: enabled && online,
        problem,
      } satisfies Y3ConnectState;
    });

    const requireSecureStorage = Effect.gen(function* () {
      const available = yield* safeStorage.isEncryptionAvailable;
      const backend = yield* safeStorage.selectedStorageBackend;
      if (!available || Option.getOrNull(backend) === "basic_text") return yield* fail("storage");
    }).pipe(Effect.mapError(() => fail("storage")));

    const writeBinding = Effect.fn("DesktopY3Connect.writeBinding")(
      function* (binding: Binding) {
        yield* requireSecureStorage;
        const json = yield* encodeBinding(binding);
        const encrypted = yield* safeStorage.encryptString(json);
        const temporary = `${file}.${yield* randomHex(8)}.tmp`;
        yield* fs.makeDirectory(stateDir, { recursive: true });
        yield* fs
          .writeFile(temporary, encrypted, { mode: 0o600, flag: "wx" })
          .pipe(
            Effect.andThen(fs.rename(temporary, file)),
            Effect.ensuring(fs.remove(temporary).pipe(Effect.ignore)),
          );
        yield* Ref.set(bindingRef, binding);
        yield* Ref.set(storageError, false);
      },
      Effect.mapError(() => fail("storage")),
      Effect.uninterruptible,
    );

    const readJson = <A>(
      request: HttpClientRequest.HttpClientRequest,
      decode: (response: HttpClientResponse.HttpClientResponse) => Effect.Effect<A, unknown>,
      problem: Y3ConnectProblem,
    ) =>
      client.execute(request).pipe(
        Effect.flatMap(HttpClientResponse.filterStatusOk),
        Effect.flatMap(decode),
        Effect.timeout("5 seconds"),
        Effect.mapError(() => fail(problem)),
      );
    const readIdentity = (origin: URL, problem: Y3ConnectProblem) =>
      readJson(
        HttpClientRequest.get(new URL("/.well-known/t3/environment", origin)),
        HttpClientResponse.schemaBodyJson(ExecutionEnvironmentDescriptor),
        problem,
      );

    const local = Effect.fn("DesktopY3Connect.localBackend")(function* () {
      const config = yield* primary.currentConfig;
      if (Option.isNone(config)) return yield* fail("backend");
      const url = config.value.httpBaseUrl;
      if (
        url.protocol !== "http:" ||
        !["localhost", "127.0.0.1"].includes(url.hostname) ||
        !url.port
      ) {
        return yield* fail("backend");
      }
      const identity = yield* readIdentity(url, "backend");
      return { localPort: Number(url.port), environmentId: identity.environmentId };
    });

    const session = Effect.fn("DesktopY3Connect.session")(function* (
      binding: Binding,
      first?: Deferred.Deferred<void, ConnectError>,
    ) {
      const serverOrigin = requireHttpsOrigin(binding.serverOrigin);
      if (!serverOrigin) return yield* fail("origin");
      const { localPort, environmentId } = yield* local();
      if (environmentId !== binding.environmentId) return yield* fail("environment");
      const socket = yield* Effect.acquireRelease(
        Effect.try({
          try: () => {
            const socket = openConnector({ serverOrigin, hostToken: binding.hostToken, localPort });
            socket.on("error", () => socket.terminate());
            return socket;
          },
          catch: () => fail("tunnel"),
        }),
        (socket) => Effect.sync(() => socket.terminate()),
      );
      yield* Effect.callback<void, ConnectError>((resume) => {
        const cleanup = () => {
          socket.off("open", open);
          socket.off("close", closed);
        };
        const open = () => {
          cleanup();
          resume(Effect.void);
        };
        const closed = () => {
          cleanup();
          resume(Effect.fail(fail("tunnel")));
        };
        socket.once("open", open);
        socket.once("close", closed);
        return Effect.sync(cleanup);
      }).pipe(
        Effect.timeout("10 seconds"),
        Effect.mapError(() => fail("tunnel")),
      );
      const remote = yield* readIdentity(serverOrigin, "tunnel");
      if (remote.environmentId !== binding.environmentId) return yield* fail("environment");
      if (socket.readyState !== socket.OPEN) return yield* fail("tunnel");
      yield* Ref.set(onlineRef, true);
      if (first) yield* Deferred.succeed(first, undefined);
      const closed = Effect.callback<void>((resume) => {
        if (socket.readyState === socket.CLOSED) {
          resume(Effect.void);
          return;
        }
        const closed = () => resume(Effect.void);
        socket.once("close", closed);
        return Effect.sync(() => socket.off("close", closed));
      });
      const verifyBackend = Effect.gen(function* () {
        const current = yield* local();
        if (current.environmentId !== environmentId || current.localPort !== localPort) {
          return yield* fail("backend");
        }
      }).pipe(Effect.delay("15 seconds"), Effect.forever);
      yield* Effect.raceFirst(closed, verifyBackend);
    });

    const supervise = (binding: Binding, first?: Deferred.Deferred<void, ConnectError>) =>
      Effect.scoped(session(binding, first)).pipe(
        Effect.ensuring(Ref.set(onlineRef, false)),
        Effect.catch((error) =>
          first ? Deferred.fail(first, error).pipe(Effect.asVoid) : Effect.void,
        ),
        Effect.repeat(Schedule.spaced("5 seconds")),
        Effect.asVoid,
      );

    const restore = Effect.gen(function* () {
      if (!(yield* fs.exists(file))) return;
      yield* requireSecureStorage;
      const encrypted = yield* fs.readFile(file);
      const json = yield* safeStorage.decryptString(encrypted);
      const binding = yield* decodeBinding(json);
      yield* Ref.set(bindingRef, binding);
      if (binding.enabled && remoteAllowed) yield* FiberHandle.run(worker, supervise(binding));
    }).pipe(
      Effect.catch(() => Ref.set(storageError, true)),
      lock.withPermit,
    );

    const change = Effect.fn("DesktopY3Connect.change")(function* (input: Y3ConnectChange) {
      let binding = yield* Ref.get(bindingRef);
      if (input.action === "disable") {
        yield* FiberHandle.clear(worker);
        if (binding?.enabled) {
          yield* writeBinding({ ...binding, enabled: false }).pipe(
            Effect.tapError(() => Ref.set(storageError, true)),
          );
        }
        return;
      }
      if (!remoteAllowed) return yield* fail("policy");
      if (input.action === "bind") {
        if (binding?.enabled) return yield* fail("disable-first");
        const serverOrigin = requireHttpsOrigin(input.serverOrigin);
        if (!serverOrigin) return yield* fail("origin");
        const bindingCode = input.bindingCode.trim();
        if (!isBindingCode(bindingCode)) return yield* fail("code");
        yield* requireSecureStorage;
        const { environmentId } = yield* local();
        yield* readJson(
          HttpClientRequest.get(new URL(Y3_CONNECT_PATHS.descriptor, serverOrigin)),
          HttpClientResponse.schemaBodyJson(Y3ConnectDescriptor),
          "gateway",
        );
        const hostToken = yield* randomHex(32);
        const payload = { environmentId, bindingCode, hostToken };
        const host = yield* readJson(
          HttpClientRequest.post(new URL(Y3_CONNECT_PATHS.bind, serverOrigin)).pipe(
            HttpClientRequest.bodyJsonUnsafe(payload),
          ),
          HttpClientResponse.schemaBodyJson(Y3ConnectHost),
          "binding",
        );
        if (host.environmentId !== environmentId) return yield* fail("environment");
        binding = {
          version: 1,
          serverOrigin: serverOrigin.origin,
          environmentId,
          hostToken,
          enabled: false,
        };
        yield* writeBinding(binding);
      }
      if (binding === null) return yield* fail("not-bound");
      if (binding.enabled) return;
      const first = yield* Deferred.make<void, ConnectError>();
      const next = { ...binding, enabled: true };
      yield* FiberHandle.run(worker, supervise(next, first));
      yield* Deferred.await(first).pipe(
        Effect.andThen(writeBinding(next)),
        Effect.onExit((exit) =>
          exit._tag === "Failure" ? FiberHandle.clear(worker) : Effect.void,
        ),
      );
    }, lock.withPermit);

    return DesktopY3Connect.of({
      restore,
      getState,
      change: Effect.fn("DesktopY3Connect.applyChange")((input) =>
        change(input).pipe(
          Effect.andThen(getState),
          Effect.map((state) => ({ ok: true, state }) as const),
          Effect.catch(({ problem }) => Effect.succeed({ ok: false, problem } as const)),
        ),
      ),
    });
  }),
);
