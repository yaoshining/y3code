import * as Schema from "effect/Schema";

import { EnvironmentId } from "./baseSchemas.ts";

export const Y3_CONNECT_PAIRING_SUBJECT = "y3-connect";
export const Y3_CONNECT_DEVICE_SUBJECT_PREFIX = `${Y3_CONNECT_PAIRING_SUBJECT}:`;

export const Y3_CONNECT_PATHS = {
  descriptor: "/v1/y3-connect",
  bind: "/v1/y3-connect/hosts/bind",
  host: "/v1/y3-connect/hosts/self",
  tunnel: "/v1/y3-connect/tunnel",
} as const;

export const Y3ConnectDescriptor = Schema.Struct({
  service: Schema.Literal("y3-connect"),
  version: Schema.Literal(1),
});

export const Y3ConnectBindingCode = Schema.String.check(Schema.isPattern(/^[0-9a-f]{32}$/u));
export const Y3ConnectHostToken = Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/u));

export const Y3ConnectBindRequest = Schema.Struct({
  environmentId: EnvironmentId,
  bindingCode: Y3ConnectBindingCode,
  hostToken: Y3ConnectHostToken,
});
export type Y3ConnectBindRequest = typeof Y3ConnectBindRequest.Type;

export const Y3ConnectHost = Schema.Struct({
  environmentId: EnvironmentId,
});
export type Y3ConnectHost = typeof Y3ConnectHost.Type;

export const Y3ConnectState = Schema.Struct({
  serverOrigin: Schema.NullOr(Schema.String),
  environmentId: Schema.NullOr(EnvironmentId),
  enabled: Schema.Boolean,
  online: Schema.Boolean,
  problem: Schema.NullOr(Schema.Literals(["storage", "tunnel", "policy"])),
});
export type Y3ConnectState = typeof Y3ConnectState.Type;

export const Y3ConnectChange = Schema.Union([
  Schema.Struct({ action: Schema.Literal("enable") }),
  Schema.Struct({ action: Schema.Literal("disable") }),
  Schema.Struct({
    action: Schema.Literal("bind"),
    serverOrigin: Schema.String,
    bindingCode: Schema.String,
  }),
]);
export type Y3ConnectChange = typeof Y3ConnectChange.Type;

export const Y3ConnectProblem = Schema.Literals([
  "origin",
  "code",
  "gateway",
  "binding",
  "backend",
  "environment",
  "tunnel",
  "storage",
  "policy",
  "disable-first",
  "not-bound",
]);
export type Y3ConnectProblem = typeof Y3ConnectProblem.Type;

export const Y3ConnectChangeResult = Schema.Union([
  Schema.Struct({ ok: Schema.Literal(true), state: Y3ConnectState }),
  Schema.Struct({ ok: Schema.Literal(false), problem: Y3ConnectProblem }),
]);
export type Y3ConnectChangeResult = typeof Y3ConnectChangeResult.Type;
