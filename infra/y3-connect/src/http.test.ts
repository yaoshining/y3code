import { Y3_CONNECT_PATHS } from "@t3tools/contracts/y3Connect";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import * as HttpRouter from "effect/http/HttpRouter";
import * as Layer from "effect/Layer";
import { expect, it } from "vite-plus/test";

import * as HostBindings from "./HostBindings.ts";
import { routes } from "./http.ts";

it("requires an enrollment code to bind and accepts host tokens only in the authorization header", async () => {
  const app = HttpRouter.toWebHandler(
    routes.pipe(
      Layer.provide(HostBindings.layer),
      Layer.provide(NodeSqliteClient.layer({ filename: ":memory:" })),
    ),
    { disableLogger: true },
  );
  await using _cleanup = { [Symbol.asyncDispose]: app.dispose };
  const hostToken = "a".repeat(64);
  const request = (path: string, input?: RequestInit) =>
    app.handler(new Request(new URL(path, "https://connect.example.test"), input));

  const invalid = await request(Y3_CONNECT_PATHS.bind, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      environmentId: "host",
      bindingCode: "b".repeat(32),
      hostToken,
    }),
  });
  expect(invalid.status).toBe(401);
  expect(await invalid.text()).toBe("");
  expect((await request(`${Y3_CONNECT_PATHS.host}?token=${hostToken}`)).status).toBe(401);

  const oversized = await request(Y3_CONNECT_PATHS.bind, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      environmentId: "a".repeat(8192),
      bindingCode: "b".repeat(32),
      hostToken,
    }),
  });
  expect(oversized.status).toBe(400);
});
