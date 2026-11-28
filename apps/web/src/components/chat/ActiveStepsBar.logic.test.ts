import { RunId, TurnItemId } from "@t3tools/contracts";
import { expect, it } from "vite-plus/test";
import { deriveActiveSteps } from "./ActiveStepsBar.logic";

const runId = RunId.make("run");
const completed = { id: "1", text: "Inspect", status: "completed" } as const;
const pending = { id: "2", text: "Update", status: "pending" } as const;
const running = { id: "3", text: "Verify", status: "running" } as const;

it("uses the last non-empty checklist and prefers a running step over a pending one", () => {
  const entries = [
    { item: { type: "todo_list", id: TurnItemId.make("old"), runId, steps: [running] } },
    {
      item: {
        type: "todo_list",
        id: TurnItemId.make("current"),
        runId,
        steps: [completed, pending, running],
      },
    },
    { item: { type: "todo_list", id: TurnItemId.make("empty"), runId, steps: [] } },
  ] as const;
  expect(deriveActiveSteps(entries, null)).toMatchObject({
    id: "current",
    activeStep: running,
    currentNumber: 2,
    completedCount: 1,
    total: 3,
    isWorking: false,
  });
});

it("hides a finished checklist unless its own run is still working", () => {
  const entries = [
    { item: { type: "todo_list", id: TurnItemId.make("finished"), runId, steps: [completed] } },
  ] as const;
  expect(deriveActiveSteps(entries, null)).toBeNull();
  expect(deriveActiveSteps(entries, RunId.make("different-run"))).toBeNull();
  expect(deriveActiveSteps(entries, runId)).toMatchObject({
    activeStep: completed,
    currentNumber: 1,
    isWorking: true,
  });
});
