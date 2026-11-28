import * as NodeHttpServer from "@effect/platform-node/NodeHttpServer";
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { EnvironmentId, PortSchema } from "@t3tools/contracts";
import { Y3ConnectHostToken } from "@t3tools/contracts/y3Connect";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import * as Config from "effect/Config";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as HttpRouter from "effect/http/HttpRouter";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import * as Scope from "effect/Scope";
import * as Argument from "effect/cli/Argument";
import * as Command from "effect/cli/Command";
import * as Flag from "effect/cli/Flag";

import { parseRoutes } from "./config.ts";
import { openConnector, parseConnectorOrigin } from "@t3tools/shared/y3ConnectConnector";
import { createGateway } from "./Gateway.ts";
import * as HostBindings from "./HostBindings.ts";
import { routes } from "./http.ts";

const layerBindings = HostBindings.layer.pipe(
  Layer.provide(
    Layer.unwrap(
      Effect.gen(function* () {
        const filename = yield* Config.String("Y3_CONNECT_DB").pipe(
          Config.withDefault("y3-connect.sqlite"),
        );
        return NodeSqliteClient.layer({ filename, readerWorker: false });
      }),
    ),
  ),
);

class ListenFailed extends Schema.TaggedError<ListenFailed, { readonly brand: unique symbol }>()(
  "ListenFailed",
  { port: Schema.Number, cause: Schema.Defect() },
) {}

class ConnectFailed extends Schema.TaggedError<ConnectFailed, { readonly brand: unique symbol }>()(
  "ConnectFailed",
  { reason: Schema.Literals(["invalid_origin", "invalid_token", "disconnected"]) },
) {}

const isHostToken = Schema.is(Y3ConnectHostToken);

const serve = Effect.fn("Y3Connect.serve")(
  function* () {
    const host = yield* Config.String("Y3_CONNECT_LISTEN_HOST").pipe(
      Config.withDefault("127.0.0.1"),
    );
    const port = yield* Config.Port("Y3_CONNECT_PORT").pipe(Config.withDefault(17890));
    const configured = yield* Config.String("Y3_CONNECT_ROUTES").pipe(Config.withDefault("{}"));
    const publicRoutes = yield* parseRoutes(configured);
    const bindings = yield* HostBindings.HostBindings;
    const scope = yield* Scope.Scope;
    const app = yield* HttpRouter.toHttpEffect(routes);
    const control = yield* NodeHttpServer.makeHandler(app, { scope });
    const context = yield* Effect.context<never>();
    const run = Effect.runPromiseWith(context);
    const gateway = yield* Effect.acquireRelease(
      Effect.sync(() =>
        createGateway({
          routes: publicRoutes,
          control,
          authorize: (token) => run(bindings.findHost(token)),
        }),
      ),
      (gateway) => Effect.promise(gateway.close),
    );
    yield* Effect.callback<void, ListenFailed>((resume) => {
      const onError = (cause: Error) => resume(Effect.fail(new ListenFailed({ port, cause })));
      gateway.server.once("error", onError);
      gateway.server.listen(port, host, () => resume(Effect.void));
      return Effect.sync(() => gateway.server.off("error", onError));
    });
    yield* Console.log(`Listening on ${host}:${port}`);
    return yield* Effect.never;
  },
  Effect.scoped,
  Effect.provide(layerBindings),
);

const connect = Effect.fn("Y3Connect.connect")(function* (input: {
  server: string;
  localPort: number;
}) {
  const serverOrigin = parseConnectorOrigin(input.server);
  if (!serverOrigin) return yield* new ConnectFailed({ reason: "invalid_origin" });
  const hostToken = Redacted.value(yield* Config.Redacted("Y3_CONNECT_HOST_TOKEN"));
  if (!isHostToken(hostToken)) return yield* new ConnectFailed({ reason: "invalid_token" });
  return yield* Effect.callback<never, ConnectFailed>((resume) => {
    const socket = openConnector({ serverOrigin, hostToken, localPort: input.localPort });
    const disconnected = () => resume(Effect.fail(new ConnectFailed({ reason: "disconnected" })));
    socket.on("error", disconnected);
    socket.once("close", disconnected);
    return Effect.sync(() => socket.terminate());
  });
});

const command = Command.make("y3-connect").pipe(
  Command.withSubcommands([
    Command.make("serve", {}, serve),
    Command.make(
      "connect",
      {
        server: Flag.String("server"),
        localPort: Flag.Int("local-port").pipe(Flag.withSchema(PortSchema)),
      },
      connect,
    ),
    Command.make(
      "binding-code",
      {},
      Effect.fn("Y3Connect.printBindingCode")(function* () {
        const bindings = yield* HostBindings.HostBindings;
        yield* Console.log(yield* bindings.issueCode());
      }, Effect.provide(layerBindings)),
    ),
    Command.make(
      "revoke-host",
      { environmentId: Argument.String("environment-id").pipe(Argument.withSchema(EnvironmentId)) },
      Effect.fn("Y3Connect.revokeHostCommand")(function* ({ environmentId }) {
        const bindings = yield* HostBindings.HostBindings;
        yield* bindings.revokeHost(environmentId);
      }, Effect.provide(layerBindings)),
    ),
  ]),
);

if (import.meta.main) {
  Command.run(command, { version: "0.1.0" }).pipe(
    Effect.provide(NodeServices.layer),
    NodeRuntime.runMain,
  );
}
