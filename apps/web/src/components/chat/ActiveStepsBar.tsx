import type { EnvironmentId } from "@t3tools/contracts";
import { formatDuration } from "@t3tools/shared/orchestrationTimingCopy";
import { useGT, useLocale, useMessages } from "gt-react";
import { CheckIcon, ChevronDownIcon, ClockIcon } from "lucide-react";
import { useId, useState } from "react";
import { tickTextContent } from "~/lib/tickTextContent";
import { cn } from "~/lib/utils";
import type { deriveActiveSteps } from "./ActiveStepsBar.logic";
import { formatWorkingTimerNow } from "./TimelineWorkGroupRows.logic";

const FILLED_SEGMENT =
  "bg-primary stock-dark:bg-(image:--silk-accent) stock-dark:shadow-(--silk-progress-glow)";

export function ActiveStepsBar({
  progress,
  activeWorkStartedAt,
  environmentId,
}: {
  progress: NonNullable<ReturnType<typeof deriveActiveSteps>>;
  activeWorkStartedAt: string | null;
  environmentId: EnvironmentId;
}) {
  const gt = useGT();
  const messages = useMessages();
  const locale = useLocale();
  const [expanded, setExpanded] = useState(false);
  const checklistId = useId();
  const { activeStep, currentNumber, total, steps, completedCount, isWorking } = progress;
  const startedAt = isWorking
    ? activeStep?.status === "running"
      ? (activeStep.durationAnchorAt ?? activeWorkStartedAt)
      : activeWorkStartedAt
    : null;
  const duration = activeStep?.durationMs;
  const filled = completedCount + steps.filter((step) => step.status === "running").length;

  return (
    <div className="chat-composer-lane shrink-0 pt-2">
      <div className="chat-content-lane">
        <div className="rounded-xl border border-border/70 bg-card/80 stock-dark:border-(--silk-glass-border) stock-dark:bg-transparent stock-dark:bg-(image:--silk-progress-bg) stock-dark:shadow-(--silk-settings-card-shadow)">
          <button
            type="button"
            className="flex w-full min-w-0 cursor-pointer flex-col gap-2 rounded-xl px-2.5 py-2 text-start outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            aria-expanded={expanded}
            aria-controls={checklistId}
            onClick={() => setExpanded(!expanded)}
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-xs font-semibold tabular-nums stock-dark:bg-(--silk-surface-well) stock-dark:text-(--silk-violet)">
                {gt("Step {current}/{total}", { current: currentNumber, total })}
              </span>
              <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground sm:text-sm">
                {activeStep?.text}
              </span>
              {startedAt || duration !== undefined ? (
                <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground tabular-nums">
                  <ClockIcon aria-hidden="true" className="size-3" />
                  {startedAt ? (
                    <span
                      key={locale}
                      ref={tickTextContent(
                        () => formatWorkingTimerNow(startedAt, environmentId),
                        true,
                      )}
                    />
                  ) : (
                    formatDuration(duration ?? 0, messages)
                  )}
                </span>
              ) : null}
              <ChevronDownIcon
                aria-hidden="true"
                className={cn("size-3.5 shrink-0 text-muted-foreground", expanded && "rotate-180")}
              />
            </span>
            {total <= 16 ? (
              <span
                aria-hidden="true"
                className="grid w-full gap-1.5"
                style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }}
              >
                {steps.map((step) => (
                  <span
                    key={step.id}
                    data-step-segment={step.status}
                    className={cn(
                      "h-[3px] rounded-full",
                      step.status === "pending"
                        ? "bg-border/70 stock-dark:bg-(--silk-soft-edge)"
                        : FILLED_SEGMENT,
                      step.status === "running" && "stock-dark:brightness-125",
                    )}
                  />
                ))}
              </span>
            ) : (
              <span
                aria-hidden="true"
                className="h-[3px] w-full rounded-full bg-border/70 stock-dark:bg-(--silk-soft-edge)"
              >
                <span
                  className={cn("block h-full rounded-full", FILLED_SEGMENT)}
                  style={{ width: `${(100 * filled) / total}%` }}
                />
              </span>
            )}
          </button>
          <ol
            id={checklistId}
            hidden={!expanded}
            className="max-h-[min(14rem,35vh)] overflow-y-auto overscroll-contain border-t border-border/60 px-2.5 py-1.5 stock-dark:border-(--silk-soft-edge)"
          >
            {steps.map((step) => (
              <li key={step.id} className="flex items-start gap-2 py-1 text-xs break-words">
                <span className="flex size-4 shrink-0 items-center justify-center">
                  {step.status === "completed" ? (
                    <CheckIcon
                      aria-hidden="true"
                      className="size-3 text-success stock-dark:text-(--silk-green)"
                    />
                  ) : (
                    <span
                      aria-hidden="true"
                      className={cn(
                        "size-1.5 rounded-full",
                        step.status === "running"
                          ? "bg-primary stock-dark:bg-(--silk-cyan)"
                          : "bg-muted-foreground/60",
                      )}
                    />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="sr-only">
                    {step.status === "completed"
                      ? gt("Completed", { $context: "checklist step status" })
                      : step.status === "running"
                        ? gt("Running", { $context: "checklist step status" })
                        : gt("Pending", { $context: "checklist step status" })}
                    {": "}
                  </span>
                  {step.text}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}
