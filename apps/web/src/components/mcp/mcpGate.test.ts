import { EnvironmentId } from "@t3tools/contracts";
import type { Y3ConnectState } from "@t3tools/contracts/y3Connect";
import { describe, expect, it } from "vite-plus/test";

import { resolveMcpGate } from "./mcpGate";

const environmentId = EnvironmentId.make("local");
const state = {
  environmentId,
  serverOrigin: "https://connect.example.com",
  enabled: true,
  online: true,
  problem: null,
} satisfies Y3ConnectState;
const input = { environmentId, connected: true, approvalCodes: true, desktopHost: true, state };

describe("Y3 Connect MCP gate", () => {
  it("uses the verified gateway address without a T3 account", () => {
    expect(resolveMcpGate(input)).toEqual({
      kind: "open",
      mcpUrl: "https://connect.example.com/mcp",
    });
  });

  it("does not offer a different environment's tunnel", () => {
    expect(resolveMcpGate({ ...input, environmentId: EnvironmentId.make("other") })).toEqual({
      kind: "turn-on",
    });
    expect(resolveMcpGate({ ...input, desktopHost: false })).toEqual({ kind: "on-host" });
  });

  it("holds offline and disabled tunnels, and requires the existing host approval capability", () => {
    expect(resolveMcpGate({ ...input, state: { ...state, online: false } })).toEqual({
      kind: "offline",
    });
    expect(resolveMcpGate({ ...input, state: { ...state, enabled: false } })).toEqual({
      kind: "turn-on",
    });
    expect(resolveMcpGate({ ...input, approvalCodes: false })).toEqual({ kind: "update" });
  });
});
