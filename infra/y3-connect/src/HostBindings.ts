import type { EnvironmentId } from "@t3tools/contracts";
import { Y3ConnectHost, type Y3ConnectBindRequest } from "@t3tools/contracts/y3Connect";
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/sql/SqlClient";
import type { SqlError } from "effect/sql/SqlError";

const CODE_LIFETIME_MS = 10 * 60 * 1_000;
const decodeHost = Schema.decodeUnknownEffect(Y3ConnectHost);

class EnrollmentDenied extends Schema.TaggedError<
  EnrollmentDenied,
  { readonly brand: unique symbol }
>()("EnrollmentDenied", {}) {}

export class HostBindings extends Context.Service<
  HostBindings,
  {
    readonly issueCode: () => Effect.Effect<string, SqlError>;
    readonly bind: (input: Y3ConnectBindRequest) => Effect.Effect<Y3ConnectHost | null, SqlError>;
    readonly findHost: (hostToken: string) => Effect.Effect<Y3ConnectHost | null, SqlError>;
    readonly revokeHost: (environmentId: EnvironmentId) => Effect.Effect<void, SqlError>;
  }
>()("@t3tools/y3-connect/HostBindings") {}

const digest = (value: string) =>
  Effect.promise(async () =>
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))).toHex(),
  );

const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`CREATE TABLE IF NOT EXISTS y3_binding_codes (
    digest TEXT PRIMARY KEY NOT NULL,
    expires_at INTEGER NOT NULL
  ) STRICT`;
  yield* sql`CREATE TABLE IF NOT EXISTS y3_hosts (
    environment_id TEXT PRIMARY KEY NOT NULL,
    token_digest TEXT NOT NULL UNIQUE
  ) STRICT`;

  const issueCode = Effect.fn("Y3Connect.issueCode")(function* () {
    const code = crypto.getRandomValues(new Uint8Array(16)).toHex();
    const codeDigest = yield* digest(code);
    const now = yield* Clock.currentTimeMillis;
    yield* sql.withTransaction(
      Effect.gen(function* () {
        yield* sql`DELETE FROM y3_binding_codes WHERE expires_at <= ${now}`;
        yield* sql`INSERT INTO y3_binding_codes (digest, expires_at)
          VALUES (${codeDigest}, ${now + CODE_LIFETIME_MS})`;
      }),
    );
    return code;
  });

  const bind = Effect.fn("Y3Connect.bind")(function* (input: Y3ConnectBindRequest) {
    const codeDigest = yield* digest(input.bindingCode);
    const tokenDigest = yield* digest(input.hostToken);
    const host = { environmentId: input.environmentId };
    return yield* sql
      .withTransaction(
        Effect.gen(function* () {
          const matching = yield* sql`SELECT 1 FROM y3_hosts
          WHERE environment_id = ${input.environmentId} AND token_digest = ${tokenDigest}`;
          if (matching.length > 0) return host;

          const now = yield* Clock.currentTimeMillis;
          const consumed = yield* sql`DELETE FROM y3_binding_codes
          WHERE digest = ${codeDigest} AND expires_at > ${now}
          RETURNING expires_at`;
          if (consumed.length === 0) return yield* new EnrollmentDenied();

          const inserted = yield* sql`INSERT INTO y3_hosts (environment_id, token_digest)
          VALUES (${input.environmentId}, ${tokenDigest}) ON CONFLICT DO NOTHING
          RETURNING environment_id`;
          if (inserted.length === 0) return yield* new EnrollmentDenied();
          return host;
        }),
      )
      .pipe(Effect.catchTags({ EnrollmentDenied: () => Effect.succeed(null) }));
  });

  const findHost = Effect.fn("Y3Connect.findHost")(function* (token: string) {
    const tokenDigest = yield* digest(token);
    const [row] = yield* sql`SELECT environment_id AS environmentId
      FROM y3_hosts WHERE token_digest = ${tokenDigest}`;
    return row === undefined ? null : yield* decodeHost(row).pipe(Effect.orDie);
  });

  const revokeHost = Effect.fn("Y3Connect.revokeHost")(function* (environmentId: EnvironmentId) {
    yield* sql`DELETE FROM y3_hosts WHERE environment_id = ${environmentId}`;
  });

  return HostBindings.of({ issueCode, bind, findHost, revokeHost });
});

export const layer = Layer.effect(HostBindings, make);
