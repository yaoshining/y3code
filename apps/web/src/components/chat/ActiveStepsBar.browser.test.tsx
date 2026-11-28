import { EnvironmentId, RunId, TurnItemId, type OrchestrationV2PlanStep } from "@t3tools/contracts";
import { expect, it } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";
import { render } from "../../../test/render";
import { ActiveStepsBar } from "./ActiveStepsBar";
import { deriveActiveSteps } from "./ActiveStepsBar.logic";

function Strip({ steps }: { steps: readonly OrchestrationV2PlanStep[] }) {
  const progress = deriveActiveSteps(
    [{ item: { type: "todo_list", id: TurnItemId.make("plan"), runId: RunId.make("run"), steps } }],
    null,
  );
  return progress ? (
    <ActiveStepsBar
      progress={progress}
      activeWorkStartedAt={null}
      environmentId={EnvironmentId.make("env")}
    />
  ) : null;
}

it("shows incomplete step segments, discloses the checklist, then hides when finished", async () => {
  const steps = [
    { id: "1", text: "Inspect", status: "completed" },
    { id: "2", text: "Update", status: "running" },
    { id: "3", text: "Verify", status: "pending" },
  ] as const;
  await using screen = await render(<Strip steps={steps} />, { router: false }); // no routes involved
  const toggle = screen.getByRole("button", { name: /Step 2\/3.*Update/ });
  await expect.element(toggle).toHaveAttribute("aria-expanded", "false");
  expect(
    Array.from(
      toggle.element().querySelectorAll<HTMLElement>("[data-step-segment]"),
      (segment) => segment.dataset.stepSegment,
    ),
  ).toEqual(["completed", "running", "pending"]);
  await expect.element(screen.getByRole("list")).not.toBeInTheDocument();
  await userEvent.click(toggle);
  await expect.element(toggle).toHaveAttribute("aria-expanded", "true");
  await expect.element(screen.getByRole("listitem")).toHaveLength(3);
  await userEvent.keyboard("{Enter}");
  await expect.element(screen.getByRole("list")).not.toBeInTheDocument();
  await screen.rerender(<Strip steps={steps.map((step) => ({ ...step, status: "completed" }))} />);
  await expect.element(screen.getByRole("button")).not.toBeInTheDocument();
});
