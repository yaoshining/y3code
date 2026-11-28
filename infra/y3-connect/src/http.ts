import {
  Y3_CONNECT_PATHS,
  Y3ConnectBindRequest,
  Y3ConnectHostToken,
  type Y3ConnectDescriptor,
} from "@t3tools/contracts/y3Connect";
import * as ByteSize from "effect/ByteSize";
import * as Effect from "effect/Effect";
import * as HttpIncomingMessage from "effect/http/HttpIncomingMessage";
import * as HttpRouter from "effect/http/HttpRouter";
import * as HttpServerRequest from "effect/http/HttpServerRequest";
import * as HttpServerResponse from "effect/http/HttpServerResponse";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import * as HostBindings from "./HostBindings.ts";

const headers = { "cache-control": "no-store" };
const readBinding = HttpServerRequest.schemaBodyJson(Y3ConnectBindRequest);
const isHostToken = Schema.is(Y3ConnectHostToken);

const bind = Effect.fn("Y3Connect.http.bind")(function* (
  bindings: HostBindings.HostBindings["Service"],
) {
  const input = yield* readBinding.pipe(
    Effect.provideService(HttpIncomingMessage.MaxBodySize, ByteSize.bytes(4096)),
    Effect.option,
  );
  if (input._tag === "None") {
    return HttpServerResponse.empty({ status: 400, headers });
  }
  const host = yield* bindings.bind(input.value);
  return host === null
    ? HttpServerResponse.empty({ status: 401, headers })
    : HttpServerResponse.jsonUnsafe(host, { headers });
});

const self = Effect.fn("Y3Connect.http.self")(function* (
  bindings: HostBindings.HostBindings["Service"],
) {
  const request = yield* HttpServerRequest.HttpServerRequest;
  const token = request.headers.authorization?.match(/^Bearer (\S+)$/iu)?.[1];
  if (!isHostToken(token)) {
    return HttpServerResponse.empty({ status: 401, headers });
  }
  const host = yield* bindings.findHost(token);
  return host === null
    ? HttpServerResponse.empty({ status: 401, headers })
    : HttpServerResponse.jsonUnsafe(host, { headers });
});

const descriptor = { service: "y3-connect", version: 1 } satisfies typeof Y3ConnectDescriptor.Type;
export const routes = Layer.effectDiscard(
  Effect.gen(function* () {
    const router = yield* HttpRouter.HttpRouter;
    const bindings = yield* HostBindings.HostBindings;
    yield* router.add(
      "GET",
      Y3_CONNECT_PATHS.descriptor,
      HttpServerResponse.jsonUnsafe(descriptor, { headers }),
    );
    yield* router.add("POST", Y3_CONNECT_PATHS.bind, bind(bindings));
    yield* router.add("GET", Y3_CONNECT_PATHS.host, self(bindings));
  }),
);
