import { EnvironmentId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { parseConnectorOrigin } from "@t3tools/shared/y3ConnectConnector";
import type { GatewayRoute } from "./Gateway.ts";

const decodeRoutes = Schema.decodeUnknownEffect(
  Schema.fromJsonString(Schema.Record(Schema.String, EnvironmentId)),
);

class InvalidRoutes extends Schema.TaggedError<InvalidRoutes, { readonly brand: unique symbol }>()(
  "InvalidRoutes",
  {},
) {
  override get message() {
    return "Y3_CONNECT_ROUTES must map distinct HTTPS origins to environment IDs.";
  }
}

export const parseRoutes = Effect.fn("Y3Connect.parseRoutes")(function* (raw: string) {
  const configured = yield* decodeRoutes(raw).pipe(Effect.mapError(() => new InvalidRoutes()));
  const routes = new Map<string, GatewayRoute>();
  for (const [address, environmentId] of Object.entries(configured)) {
    const origin = parseConnectorOrigin(address);
    if (!origin || routes.has(origin.host)) return yield* new InvalidRoutes();
    routes.set(origin.host, { environmentId, origin });
  }
  return routes;
});
