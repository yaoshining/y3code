import type { EnvironmentId } from "@t3tools/contracts";
import type { Y3ConnectState } from "@t3tools/contracts/y3Connect";

export function resolveMcpGate(input: {
  readonly environmentId: EnvironmentId;
  readonly connected: boolean;
  readonly approvalCodes: boolean | undefined;
  readonly desktopHost: boolean;
  readonly state: Y3ConnectState | "checking" | "failed" | null;
}) {
  if (!input.connected) return { kind: "disconnected" } as const;
  if (input.approvalCodes === undefined) return { kind: "checking" } as const;
  if (!input.approvalCodes) return { kind: "update" } as const;
  if (!input.desktopHost) return { kind: "on-host" } as const;
  const { state } = input;
  if (state === "checking") return { kind: "checking" } as const;
  if (state === "failed") return { kind: "error" } as const;
  if (state?.enabled !== true || state.environmentId !== input.environmentId) {
    return { kind: "turn-on" } as const;
  }
  if (!state.online || state.serverOrigin === null) return { kind: "offline" } as const;
  return { kind: "open", mcpUrl: new URL("/mcp", state.serverOrigin).href } as const;
}
