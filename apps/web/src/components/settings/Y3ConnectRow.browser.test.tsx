import { AuthSessionId, AuthStandardClientScopes, EnvironmentId } from "@t3tools/contracts";
import {
  Y3_CONNECT_DEVICE_SUBJECT_PREFIX,
  type Y3ConnectChange,
  type Y3ConnectChangeResult,
  type Y3ConnectState,
} from "@t3tools/contracts/y3Connect";
import * as DateTime from "effect/DateTime";
import { expect, it, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";

import "~/index.css";
import type { ServerClientSessionRecord } from "~/environments/primary";
import { AppAtomRegistryProvider } from "~/rpc/atomRegistry";
import { render, stubGlobal } from "../../../test/render";
import { Y3ConnectRow } from "./Y3ConnectRow";

const { mint } = vi.hoisted(() => ({ mint: vi.fn() }));
vi.mock(import("~/state/use-atom-command"), async (original) => ({
  ...(await original()),
  useAtomCommand: (() => mint) as never,
}));
vi.mock(import("~/state/session"), async (original) => ({
  ...(await original()),
  readEnvironmentScope: () => true,
}));

it("only offers a device QR after the desktop verifies the gateway", async () => {
  const environmentId = EnvironmentId.make("local");
  const address = "https://connect.example.com";
  let state: Y3ConnectState = {
    serverOrigin: null,
    environmentId: null,
    enabled: false,
    online: false,
    problem: null,
  };
  mint.mockResolvedValue({
    _tag: "Success",
    value: {
      id: "single-use",
      credential: "device-credential",
      expiresAt: DateTime.makeUnsafe(Date.now() + 60_000),
    },
  });
  const change = vi.fn(async (input: Y3ConnectChange): Promise<Y3ConnectChangeResult> => {
    if (input.action === "bind" && input.bindingCode === "wrong") {
      return { ok: false, problem: "binding" };
    }
    if (input.action === "bind") {
      state = { serverOrigin: address, environmentId, enabled: true, online: true, problem: null };
    } else if (input.action === "disable") {
      state = { ...state, enabled: false, online: false };
    }
    return { ok: true, state };
  });
  using _bridge = stubGlobal("desktopBridge", {
    getLocalEnvironmentEnabled: () => false,
    getLocalEnvironmentBootstraps: () => [],
    getY3ConnectState: async () => state,
    setY3Connect: change,
  });
  const session = (id: string, subject: string, connected: boolean): ServerClientSessionRecord => ({
    sessionId: AuthSessionId.make(id),
    subject,
    connected,
    method: "dpop-access-token",
    scopes: [],
    client: { deviceType: "mobile" },
    issuedAt: "",
    expiresAt: "",
    lastConnectedAt: null,
    current: false,
  });
  const sessions = [
    session("gateway", Y3_CONNECT_DEVICE_SUBJECT_PREFIX + "phone", false),
    session("lan", Y3_CONNECT_DEVICE_SUBJECT_PREFIX + "phone", true),
    session("other", Y3_CONNECT_DEVICE_SUBJECT_PREFIX + "tablet", false),
    session("t3-connect", "cloud-connect", true),
  ];
  await using screen = await render(
    <AppAtomRegistryProvider>
      <Y3ConnectRow
        environmentId={environmentId}
        canPair
        scopes={AuthStandardClientScopes}
        sessions={sessions}
        lanAddress="http://192.168.1.2:3773"
        managed={undefined}
      />
    </AppAtomRegistryProvider>,
  );
  const toggle = screen.getByRole("switch", { name: "Enable Y3 Connect" });
  const showQr = screen.getByRole("button", { name: "Show pairing QR code" });
  await expect.element(toggle).not.toBeChecked();
  expect(showQr.query()).toBeNull();
  await toggle.click();
  const dialog = page.getByRole("dialog", { name: "Set up Y3 Connect" });
  const origin = dialog.getByLabelText("Server address");
  const bindingCode = dialog.getByLabelText("Host binding code");
  await expect.element(origin).toHaveValue("");
  await origin.fill(address);
  await bindingCode.fill("wrong");
  await dialog.getByRole("button", { name: "Bind and enable" }).click();
  await expect
    .element(
      dialog.getByText(
        "The gateway could not bind this host. Check the binding code and try again.",
      ),
    )
    .toBeVisible();
  expect(showQr.query()).toBeNull();

  await bindingCode.fill("a".repeat(32));
  await dialog.getByRole("button", { name: "Bind and enable" }).click();
  await expect.element(toggle).toBeChecked();
  await showQr.click();
  await expect
    .element(screen.getByRole("img", { name: "Y3 Connect pairing QR code" }))
    .toBeVisible();
  expect(mint).toHaveBeenCalledWith({
    environmentId,
    input: { scopes: AuthStandardClientScopes, purpose: "y3-connect" },
  });
  await expect.element(screen.getByText("Paired: 2 · Online: 1")).toBeVisible();
  expect(screen.container.querySelectorAll("[data-online=true]")).toHaveLength(1);
  await screen.getByRole("button", { name: "Pair a LAN route" }).click();
  await expect.element(screen.getByRole("img", { name: "LAN pairing QR code" })).toBeVisible();
  await toggle.click();
  await expect.element(toggle).not.toBeChecked();
  expect(showQr.query()).toBeNull();
  expect(change).toHaveBeenLastCalledWith({ action: "disable" });
  await expect.element(screen.getByText(address)).toBeVisible();
});
