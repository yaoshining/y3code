import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import { EnvironmentId } from "@t3tools/contracts";
import { describe, it, expect } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as TestClock from "effect/testing/TestClock";

import * as HostBindings from "./HostBindings.ts";

const layer = HostBindings.layer.pipe(
  Layer.provide(NodeSqliteClient.layer({ filename: ":memory:" })),
);

describe("Y3 Connect host enrollment", () => {
  it.effect("accepts one enrollment per code and lets a host retry a lost response", () =>
    Effect.gen(function* () {
      const bindings = yield* HostBindings.HostBindings;
      const code = yield* bindings.issueCode();
      const first = {
        environmentId: EnvironmentId.make("first"),
        bindingCode: code,
        hostToken: "a".repeat(64),
      };
      const second = {
        environmentId: EnvironmentId.make("second"),
        bindingCode: code,
        hostToken: "b".repeat(64),
      };
      const accepted = yield* Effect.all([bindings.bind(first), bindings.bind(second)], {
        concurrency: "unbounded",
      });
      expect(accepted.filter(Boolean)).toHaveLength(1);
      const winner = accepted[0] ? first : second;
      const loser = accepted[0] ? second : first;
      expect(yield* bindings.bind(winner)).toEqual({ environmentId: winner.environmentId });
      expect(yield* bindings.findHost(loser.hostToken)).toBeNull();
      expect(yield* bindings.findHost(winner.hostToken)).toEqual({
        environmentId: winner.environmentId,
      });
    }).pipe(Effect.provide(layer)),
  );

  it.effect("does not accept an expired code or let another code replace an enrolled host", () =>
    Effect.gen(function* () {
      const bindings = yield* HostBindings.HostBindings;
      const expired = yield* bindings.issueCode();
      yield* TestClock.adjust("10 minutes");
      const first = { environmentId: EnvironmentId.make("first"), hostToken: "a".repeat(64) };
      expect(yield* bindings.bind({ ...first, bindingCode: expired })).toBeNull();
      const code = yield* bindings.issueCode();
      yield* bindings.bind({ ...first, bindingCode: code });
      const next = yield* bindings.issueCode();
      expect(
        yield* bindings.bind({ ...first, hostToken: "b".repeat(64), bindingCode: next }),
      ).toBeNull();
      expect(
        yield* bindings.bind({
          environmentId: EnvironmentId.make("second"),
          hostToken: "b".repeat(64),
          bindingCode: next,
        }),
      ).toEqual({ environmentId: "second" });
      yield* bindings.revokeHost(first.environmentId);
      expect(yield* bindings.findHost(first.hostToken)).toBeNull();
    }).pipe(Effect.provide(layer)),
  );
});
