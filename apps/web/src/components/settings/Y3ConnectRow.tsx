import {
  AuthAccessWriteScope,
  AuthEnvironmentMaintainScope,
  AuthStandardClientScopes,
  type AuthEnvironmentScope,
  type AuthGrantScope,
  type AuthPairingCredentialResult,
  type EnvironmentId,
} from "@t3tools/contracts";
import {
  Y3_CONNECT_DEVICE_SUBJECT_PREFIX,
  Y3_CONNECT_PAIRING_SUBJECT,
  type Y3ConnectChange,
  type Y3ConnectProblem,
} from "@t3tools/contracts/y3Connect";
import * as DateTime from "effect/DateTime";
import { msg, T, useGT, useMessages } from "gt-react";
import { QrCodeIcon } from "lucide-react";
import { useId, useState } from "react";

import type { ServerClientSessionRecord } from "~/environments/primary";
import { useNowSecond } from "~/hooks/useNowSecond";
import { authEnvironment } from "~/state/auth";
import { refreshY3ConnectState, useY3ConnectState } from "~/state/desktopY3Connect";
import { readEnvironmentScope } from "~/state/session";
import { useAtomCommand } from "~/state/use-atom-command";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { QRCodeSvg } from "../ui/qr-code";
import { Switch } from "../ui/switch";
import { resolveDesktopPairingUrl } from "./pairingUrls";
import { useSearchableSetting } from "./settingsSearch";
import { SettingsRow } from "./settingsLayout";

const errors = {
  origin: msg("Enter an HTTPS server address without a path."),
  code: msg("Enter the one-time host binding code from your gateway."),
  gateway: msg("Could not reach a compatible Y3 Connect gateway at that address."),
  binding: msg("The gateway could not bind this host. Check the binding code and try again."),
  backend: msg("The local Y3 Code server is not ready."),
  environment: msg(
    "That address does not serve this environment. Check your gateway configuration.",
  ),
  tunnel: msg("The gateway could not reach this environment through the tunnel."),
  storage: msg("Could not save the host credential securely on this device."),
  policy: msg("Your organization's policy does not allow remote connections."),
  "disable-first": msg("Turn off Y3 Connect before changing servers."),
  "not-bound": msg("Bind this host to your Y3 Connect gateway first."),
} satisfies Record<Y3ConnectProblem, ReturnType<typeof msg>>;

export function Y3ConnectRow({
  environmentId,
  canPair,
  scopes,
  sessions,
  lanAddress,
  managed,
}: {
  readonly environmentId: EnvironmentId;
  readonly canPair: boolean;
  readonly scopes: readonly AuthEnvironmentScope[];
  readonly sessions: readonly ServerClientSessionRecord[] | null;
  readonly lanAddress: string | null;
  readonly managed: string | undefined;
}) {
  const gt = useGT();
  const m = useMessages();
  const setupFormId = useId();
  const result = useY3ConnectState();
  const state = result._tag === "Success" ? result.value : null;
  const [setup, setSetup] = useState<{ serverOrigin: string; bindingCode: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<Y3ConnectProblem | "ipc" | null>(null);
  const setting = useSearchableSetting()("y3-connect");
  const address = state?.serverOrigin ?? null;
  const isBoundHere = state?.environmentId === environmentId;
  const enabled = state?.enabled === true && isBoundHere;
  const online = enabled && state.online;
  const pairScopes = AuthStandardClientScopes.filter((scope) => scopes.includes(scope));
  const change = async (input: Y3ConnectChange) => {
    const setY3Connect = window.desktopBridge?.setY3Connect;
    if (!setY3Connect || !readEnvironmentScope(environmentId, AuthEnvironmentMaintainScope)) return;
    setSaving(true);
    setError(null);
    try {
      const reply = await setY3Connect(input);
      if (reply.ok) {
        setSetup(null);
      } else {
        setError(reply.problem);
        if (reply.problem === "tunnel") setSetup(null);
      }
    } catch {
      setError("ipc");
    }
    setSaving(false);
    refreshY3ConnectState();
  };
  const openSetup = () => {
    setError(null);
    setSetup({ serverOrigin: address ?? "", bindingCode: "" });
  };
  const problem = error ?? (result._tag === "Failure" ? "ipc" : null) ?? state?.problem;
  const message =
    problem === "ipc"
      ? gt("Could not read or update Y3 Connect.")
      : problem === "tunnel" && enabled
        ? gt("The tunnel is offline. Y3 Code will try to reconnect.")
        : problem
          ? m(errors[problem])
          : null;

  return (
    <SettingsRow
      id={setting.id}
      title={setting.title}
      description={gt("Reach this environment through a Y3 Connect gateway you host.")}
      managed={state?.enabled ? undefined : managed}
      control={
        <Switch
          checked={enabled}
          disabled={saving || state === null || (!state.enabled && state.problem === "policy")}
          onCheckedChange={(checked) => {
            if (!checked) void change({ action: "disable" });
            else if (address === null || !isBoundHere) openSetup();
            else void change({ action: "enable" });
          }}
          aria-label={gt("Enable Y3 Connect")}
        />
      }
    >
      {address !== null && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="break-all text-xs text-muted-foreground">{address}</span>
          {!state?.enabled && state?.problem !== "policy" ? (
            <Button size="xs" variant="outline" disabled={saving} onClick={openSetup}>
              <T>Change server</T>
            </Button>
          ) : null}
        </div>
      )}
      {isBoundHere && sessions !== null ? <DeviceSummary sessions={sessions} /> : null}
      {online && address && canPair && pairScopes.length > 0 ? (
        <PairingQr
          key={JSON.stringify([address, lanAddress])}
          environmentId={environmentId}
          address={address}
          lanAddress={lanAddress}
          scopes={pairScopes}
        />
      ) : null}
      {message && setup === null ? (
        <p role="status" className="text-xs text-destructive">
          {message}
        </p>
      ) : null}
      <Dialog
        open={setup !== null}
        onOpenChange={(open) => {
          if (!open && !saving) setSetup(null);
        }}
      >
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>
              <T>Set up Y3 Connect</T>
            </DialogTitle>
            <DialogDescription>
              <T>
                Use the HTTPS address of your own Y3 Connect gateway and a one-time code generated
                on that server.
              </T>
            </DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <form
              id={setupFormId}
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                if (setup && !saving) void change({ action: "bind", ...setup });
              }}
            >
              <label className="block space-y-1.5 text-sm">
                <span>
                  <T>Server address</T>
                </span>
                <Input
                  type="url"
                  required
                  autoComplete="url"
                  placeholder="https://connect.example.com"
                  value={setup?.serverOrigin ?? ""}
                  onChange={(event) =>
                    setSetup((value) => value && { ...value, serverOrigin: event.target.value })
                  }
                  disabled={saving}
                />
              </label>
              <label className="block space-y-1.5 text-sm">
                <span>
                  <T>Host binding code</T>
                </span>
                <Input
                  type="password"
                  required
                  autoComplete="off"
                  value={setup?.bindingCode ?? ""}
                  onChange={(event) =>
                    setSetup((value) => value && { ...value, bindingCode: event.target.value })
                  }
                  disabled={saving}
                />
              </label>
              {message ? (
                <p role="alert" className="text-sm text-destructive">
                  {message}
                </p>
              ) : null}
            </form>
          </DialogPanel>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => setSetup(null)}
            >
              <T>Cancel</T>
            </Button>
            <Button type="submit" form={setupFormId} disabled={saving}>
              {saving ? gt("Connecting…") : gt("Bind and enable")}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </SettingsRow>
  );
}

function DeviceSummary({ sessions }: { readonly sessions: readonly ServerClientSessionRecord[] }) {
  const gt = useGT();
  const devices = new Map<string, boolean>();
  for (const session of sessions) {
    const key = session.subject.startsWith(Y3_CONNECT_DEVICE_SUBJECT_PREFIX)
      ? session.subject
      : session.subject === Y3_CONNECT_PAIRING_SUBJECT && session.method === "bearer-access-token"
        ? session.sessionId
        : null;
    if (key !== null) devices.set(key, devices.get(key) === true || session.connected);
  }
  const paired = devices.size;
  const online = [...devices.values()].filter(Boolean).length;
  return (
    <div className="space-y-1.5">
      <p className="text-xs text-muted-foreground">
        {gt("Paired: {paired} · Online: {online}", { paired, online })}
      </p>
      {paired > 0 ? (
        <div aria-hidden className="flex max-w-56 flex-wrap gap-0.5">
          {Array.from({ length: paired }, (_, index) => (
            <span
              key={index}
              data-online={index < online ? "true" : undefined}
              className="h-1.5 min-w-1.5 flex-1 rounded-xs bg-muted data-[online=true]:bg-success"
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function PairingQr({
  environmentId,
  address,
  lanAddress,
  scopes,
}: {
  readonly environmentId: EnvironmentId;
  readonly address: string;
  readonly lanAddress: string | null;
  readonly scopes: readonly AuthGrantScope[];
}) {
  const gt = useGT();
  const mint = useAtomCommand(authEnvironment.createPairingCredential, { reportFailure: false });
  const [pairing, setPairing] = useState<{
    readonly credential: AuthPairingCredentialResult;
    readonly address: string;
    readonly lan: boolean;
  } | null>(null);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const showQr = async (endpoint: string, lan: boolean) => {
    if (
      !readEnvironmentScope(environmentId, AuthAccessWriteScope) ||
      !scopes.every((scope) => readEnvironmentScope(environmentId, scope))
    )
      return;
    setPending(true);
    setFailed(false);
    setPairing(null);
    const result = await mint({ environmentId, input: { scopes, purpose: "y3-connect" } });
    setPending(false);
    if (result._tag === "Success") setPairing({ credential: result.value, address: endpoint, lan });
    else setFailed(true);
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button
          size="xs"
          variant="outline"
          disabled={pending}
          onClick={() => void showQr(address, false)}
        >
          <QrCodeIcon />
          <T>Show pairing QR code</T>
        </Button>
        {lanAddress !== null && (
          <Button
            size="xs"
            variant="outline"
            disabled={pending}
            onClick={() => void showQr(lanAddress, true)}
          >
            <QrCodeIcon />
            <T>Pair a LAN route</T>
          </Button>
        )}
      </div>
      {failed ? (
        <p role="alert" className="text-xs text-destructive">
          {gt("Could not create a pairing URL.")}
        </p>
      ) : null}
      {pairing && <PairingCode {...pairing} />}
    </div>
  );
}

function PairingCode({
  address,
  credential,
  lan,
}: {
  readonly address: string;
  readonly credential: AuthPairingCredentialResult;
  readonly lan: boolean;
}) {
  const gt = useGT();
  const now = useNowSecond();
  if (DateTime.toEpochMillis(credential.expiresAt) <= now)
    return (
      <p className="text-xs text-muted-foreground">
        <T>Pairing code expired.</T>
      </p>
    );
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        {lan
          ? gt(
              "On a trusted local network, open the saved environment in the mobile app, choose Add route, then scan this code.",
            )
          : gt("Scan this one-time code in the mobile app.")}
      </p>
      <QRCodeSvg
        value={resolveDesktopPairingUrl(address, credential.credential)}
        title={lan ? gt("LAN pairing QR code") : gt("Y3 Connect pairing QR code")}
        size={160}
        marginSize={4}
      />
    </div>
  );
}
