import type { OrchestrationV2ProjectedTurnItem, RunId } from "@t3tools/contracts";

type TurnItem = OrchestrationV2ProjectedTurnItem["item"];
type StepItem =
  | Pick<Extract<TurnItem, { type: "todo_list" }>, "type" | "id" | "runId" | "steps">
  | { readonly type: Exclude<TurnItem["type"], "todo_list"> };

export function deriveActiveSteps(
  entries: readonly { readonly item: StepItem }[],
  workingRunId: RunId | null,
) {
  const item = entries.findLast(
    ({ item }) => item.type === "todo_list" && item.steps.length > 0,
  )?.item;
  if (item?.type !== "todo_list") return null;
  const { steps } = item;
  const total = steps.length;
  const completedCount = steps.filter((step) => step.status === "completed").length;
  const isWorking = workingRunId !== null && item.runId === workingRunId;
  if (!isWorking && completedCount === total) return null;
  const activeStep =
    steps.find((step) => step.status === "running") ??
    steps.find((step) => step.status === "pending") ??
    steps.at(-1);
  const currentNumber =
    activeStep && activeStep.status !== "completed" ? Math.min(total, completedCount + 1) : total;
  return { id: item.id, steps, total, completedCount, activeStep, currentNumber, isWorking };
}
