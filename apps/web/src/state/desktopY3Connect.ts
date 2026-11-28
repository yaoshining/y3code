import { useAtomValue } from "@effect/atom-react";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { Atom } from "effect/reactivity";
import { useEffect } from "react";
import { appAtomRegistry } from "~/rpc/atomRegistry";

class Y3ConnectStatusError extends Schema.TaggedError<
  Y3ConnectStatusError,
  { readonly brand: unique symbol }
>()("Y3ConnectStatusError", { cause: Schema.Defect() }) {}

const desktopY3ConnectState = Atom.make(
  Effect.tryPromise({
    try: () => window.desktopBridge?.getY3ConnectState?.() ?? Promise.resolve(null),
    catch: (cause) => new Y3ConnectStatusError({ cause }),
  }),
).pipe(Atom.withLabel("desktop:y3-connect"));

export function refreshY3ConnectState() {
  appAtomRegistry.refresh(desktopY3ConnectState);
}

export function useY3ConnectState() {
  const state = useAtomValue(desktopY3ConnectState);
  const enabled = state._tag === "Success" && state.value?.enabled === true;
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- refresh desktop IPC status while an enabled tunnel is visible
  useEffect(() => {
    if (!enabled) return;
    const timer = window.setInterval(refreshY3ConnectState, 5_000);
    return () => window.clearInterval(timer);
  }, [enabled]);
  return state;
}
