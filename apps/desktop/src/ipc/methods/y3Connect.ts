import {
  Y3ConnectChange,
  Y3ConnectChangeResult,
  Y3ConnectState,
} from "@t3tools/contracts/y3Connect";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { DesktopY3Connect } from "../../backend/DesktopY3Connect.ts";
import * as IpcChannels from "../channels.ts";
import * as DesktopIpc from "../DesktopIpc.ts";

export const getY3ConnectState = DesktopIpc.makeIpcMethod({
  channel: IpcChannels.GET_Y3_CONNECT_STATE_CHANNEL,
  payload: Schema.Void,
  result: Y3ConnectState,
  handler: Effect.fn("desktop.ipc.y3Connect.getState")(function* () {
    return yield* (yield* DesktopY3Connect).getState;
  }),
});

export const setY3Connect = DesktopIpc.makeIpcMethod({
  channel: IpcChannels.SET_Y3_CONNECT_CHANNEL,
  payload: Y3ConnectChange,
  result: Y3ConnectChangeResult,
  handler: Effect.fn("desktop.ipc.y3Connect.change")(function* (input) {
    return yield* (yield* DesktopY3Connect).change(input);
  }),
});
