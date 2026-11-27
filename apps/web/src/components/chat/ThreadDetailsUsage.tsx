import type {
  ProviderInstanceId,
  ServerProvider,
  ServerProviderUsageLimits,
  ServerProviderUsageWindow,
  UsageLimitSourceSnapshots,
} from "@t3tools/contracts";
import {
  type LimitPace,
  type LimitPoolWindow,
  paceOf,
  paceRemainingPercent,
  remainingPercent,
} from "@t3tools/shared/usageLimits";
import { formatDuration, limitsNotice } from "@t3tools/shared/usageLimitsCopy";
import { msg, useGT, useLocale, useMessages } from "gt-react";
import type { MouseEventHandler, ReactNode } from "react";
import { Badge } from "../ui/badge";
import { LedQuotaMeter } from "../usage/LedQuotaMeter";
import { PaceIcon } from "../usage/UsageLimits";

import { usePrimarySettings } from "../../hooks/useSettings";
import { useNowMinute } from "../../hooks/useNowMinute";
import type { ContextWindowSnapshot } from "@t3tools/client-runtime/state/context-window";
import { formatContextWindowTokens } from "../../lib/contextWindow";
import { cn } from "../../lib/utils";
import { formatUpcomingTimestamp } from "../../timestampFormat";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { formatContextWindowCompactionMessage } from "./compaction.logic";
import { ThreadDetailsSection } from "./ThreadDetailsSection";
import {
  nextPoolReset,
  poolSources,
  resolveThreadDetailsLimits,
  resolveThreadHttpQuotas,
} from "./ThreadDetailsUsage.logic";

const PACE_LABEL: Record<LimitPace, string> = {
  ahead: msg("Ahead of pace"),
  on: msg("On pace"),
  under: msg("Under pace"),
};

export interface ThreadDetailsUsageInput {
  readonly providerInstanceId: ProviderInstanceId | null;
  readonly model: string | null;
  readonly providers: readonly ServerProvider[];
  readonly sources: UsageLimitSourceSnapshots;
  readonly contextWindow: ContextWindowSnapshot | null;
}

type UsageTone = "error" | "warning" | null;
type SpotlightTrigger = MouseEventHandler<HTMLButtonElement>;

const SPOTLIGHT_CARD =
  "relative silk-hairline-top flex flex-col gap-2 rounded-xl border border-border bg-card p-3 stock-dark:border-(--silk-soft-edge) stock-dark:bg-(--silk-surface-glass) stock-dark:shadow-(--silk-card-shadow)";

function limitTone(left: number): UsageTone {
  if (left <= 10) return "error";
  if (left <= 20) return "warning";
  return null;
}

export function ThreadDetailsUsage({
  providerInstanceId,
  model,
  providers,
  sources,
  spotlight = false,
  onSpotlight,
}: Omit<ThreadDetailsUsageInput, "contextWindow"> & {
  readonly spotlight?: boolean;
  readonly onSpotlight?: SpotlightTrigger;
}) {
  const gt = useGT();
  const nowMinute = useNowMinute();
  const now = Date.parse(`${nowMinute}:00Z`);
  const resolved = resolveThreadDetailsLimits(providerInstanceId, model, providers, sources, now);
  const quotas = resolveThreadHttpQuotas(providerInstanceId, sources);
  if (!resolved && quotas.length === 0 && !spotlight) return null;

  const rows = (
    <>
      {resolved?.kind === "pool"
        ? resolved.windows.map((window) => (
            <PoolRow
              key={window.id}
              window={window}
              now={now}
              spotlight={spotlight}
              onSpotlight={onSpotlight}
            />
          ))
        : resolved &&
          (quotas.length === 0 || limitsNotice(resolved.limits) === null) && (
            <InstanceRows
              limits={resolved.limits}
              now={now}
              spotlight={spotlight}
              onSpotlight={onSpotlight}
            />
          )}
      {quotas.map(({ key, accountLabel, window }) => (
        <LimitRow
          key={key}
          window={window}
          now={now}
          accountLabel={accountLabel}
          spotlight={spotlight}
          onSpotlight={onSpotlight}
        />
      ))}
    </>
  );
  if (spotlight) {
    return (
      <section className={SPOTLIGHT_CARD}>
        <h3 className="text-xs font-medium text-muted-foreground stock-dark:text-(--silk-violet)">
          {gt("Usage limits")}
        </h3>
        <div className="flex flex-col gap-3">
          {resolved || quotas.length > 0 ? (
            rows
          ) : (
            <p className="text-xs text-muted-foreground">{gt("No usage limits reported.")}</p>
          )}
        </div>
      </section>
    );
  }
  return (
    <ThreadDetailsSection
      headingId="thread-details-usage-heading"
      title={gt("Usage limits")}
      showHeading={false}
    >
      <div className="grid grid-cols-[auto_minmax(3rem,1fr)_auto] gap-x-3 text-xs">{rows}</div>
    </ThreadDetailsSection>
  );
}

function InstanceRows({
  limits,
  now,
  spotlight,
  onSpotlight,
}: {
  readonly limits: ServerProviderUsageLimits;
  readonly now: number;
  readonly spotlight: boolean;
  readonly onSpotlight: SpotlightTrigger | undefined;
}) {
  const gt = useGT();
  const m = useMessages();
  const notice = limitsNotice(limits, m);
  if (notice) {
    if (spotlight) return <p className="text-xs text-muted-foreground">{notice}</p>;
    return (
      <UsageRow
        label={gt("Limits", { $context: "usage limits row label" })}
        fill={null}
        tone={null}
        value={gt("Unavailable")}
        tooltip={<span className="text-foreground">{notice}</span>}
        onSpotlight={onSpotlight}
      />
    );
  }
  return limits.windows.map((window) => (
    <LimitRow
      key={window.id}
      window={window}
      now={now}
      spotlight={spotlight}
      onSpotlight={onSpotlight}
    />
  ));
}

/** The thread's context window. The bar fills as context is used; the tick marks auto-compaction. */
export function ThreadDetailsContext({
  usage,
  spotlight = false,
  onSpotlight,
}: {
  readonly usage: ContextWindowSnapshot | null;
  readonly spotlight?: boolean;
  readonly onSpotlight?: SpotlightTrigger;
}) {
  const maxTokens = usage?.maxTokens != null && usage.maxTokens > 0 ? usage.maxTokens : null;
  const used =
    maxTokens !== null && usage?.usedPercentage != null
      ? Math.round(Math.max(0, Math.min(100, usage.usedPercentage)))
      : null;
  const threshold = usage?.autoCompactThreshold ?? null;
  const tick =
    maxTokens !== null && threshold !== null && threshold > 0 && threshold < maxTokens
      ? (threshold / maxTokens) * 100
      : null;
  const gt = useGT();
  const m = useMessages();
  const locale = useLocale();
  const usedTokens = usage ? formatContextWindowTokens(usage.usedTokens) : null;
  const tokenCount =
    maxTokens !== null ? `${usedTokens} / ${formatContextWindowTokens(maxTokens)}` : usedTokens;
  const compactionMessage =
    threshold !== null && threshold > 0 ? formatContextWindowCompactionMessage(threshold, m) : null;
  if (spotlight) {
    return (
      <section className={SPOTLIGHT_CARD}>
        <h3 className="text-xs font-medium text-muted-foreground stock-dark:text-(--silk-violet)">
          {gt("Context window")}
        </h3>
        {tokenCount ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xl font-semibold tabular-nums">{tokenCount}</p>
            {used !== null ? (
              <Badge variant="silk" size="pill-sm">
                {gt("{used}% used", { used })}
              </Badge>
            ) : null}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">{gt("No context usage reported.")}</p>
        )}
        {used !== null ? (
          <div
            role="meter"
            aria-label={gt("Context window")}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={used}
            className="relative h-1.5 rounded-full bg-muted stock-dark:bg-(--silk-surface-well)"
          >
            <span
              className="absolute inset-y-0 left-0 rounded-full bg-primary stock-dark:bg-(image:--silk-accent)"
              style={{ width: `${used}%` }}
            />
            {tick !== null ? (
              <span
                aria-hidden
                className="absolute -inset-y-0.5 w-px -translate-x-1/2 bg-foreground ring-1 ring-background"
                style={{ left: `${tick}%` }}
              />
            ) : null}
          </div>
        ) : null}
        {compactionMessage ? (
          <p className="text-xs text-muted-foreground">{compactionMessage}</p>
        ) : null}
      </section>
    );
  }
  if (!usage || usedTokens === null || tokenCount === null) return null;
  return (
    <ThreadDetailsSection
      headingId="thread-details-context-heading"
      title={gt("Context window")}
      showHeading={false}
    >
      <div className="grid grid-cols-[auto_minmax(3rem,1fr)_auto] gap-x-3 text-xs">
        <UsageRow
          label={gt("Context", { $context: "context window row label" })}
          fill={used}
          tone={used === null ? null : used >= 90 ? "error" : used >= 80 ? "warning" : null}
          tick={tick}
          muted
          value={tokenCount}
          onSpotlight={onSpotlight}
          ariaValue={
            used !== null
              ? gt("{used}% used", { used })
              : gt("{usedTokens} tokens used", { usedTokens })
          }
          tooltip={
            <>
              <span className="text-foreground">
                {used !== null
                  ? gt("Context: {used}% used", { used })
                  : gt("Context: {usedTokens} tokens used", { usedTokens })}
              </span>
              {maxTokens !== null ? (
                <span className="text-muted-foreground">
                  {gt("{used} of {max} tokens", {
                    used: usage.usedTokens.toLocaleString(locale),
                    max: maxTokens.toLocaleString(locale),
                  })}
                </span>
              ) : null}
              {compactionMessage ? (
                <span className="text-muted-foreground">{compactionMessage}</span>
              ) : null}
            </>
          }
        />
      </div>
    </ThreadDetailsSection>
  );
}

function LimitRow({
  window,
  now,
  accountLabel,
  spotlight,
  onSpotlight,
}: {
  readonly window: ServerProviderUsageWindow;
  readonly now: number;
  readonly accountLabel?: string;
  readonly spotlight: boolean;
  readonly onSpotlight: SpotlightTrigger | undefined;
}) {
  const gt = useGT();
  const m = useMessages();
  const timestampFormat = usePrimarySettings((settings) => settings.timestampFormat);
  const left = remainingPercent(window);
  const pace = paceOf(window, now);
  const timeLeft = paceRemainingPercent(window, now);
  const resetsAt = window.resetsAt ? Date.parse(window.resetsAt) : Number.NaN;
  const reset =
    window.resetsAt && resetsAt > now
      ? gt("Resets in {duration} · {time}", {
          duration: formatDuration(resetsAt - now, m),
          time: formatUpcomingTimestamp(window.resetsAt, timestampFormat, now, undefined, m),
        })
      : null;
  if (spotlight) {
    return (
      <SpotlightQuota
        label={window.label}
        left={left}
        pace={pace}
        timeLeft={timeLeft}
        reset={reset}
        source={accountLabel}
      />
    );
  }
  return (
    <UsageRow
      label={window.label}
      fill={left}
      tone={limitTone(left)}
      tick={timeLeft}
      value={`${left}%`}
      ariaValue={gt("{left}% left", { left })}
      onSpotlight={onSpotlight}
      tooltip={
        <>
          <span className="text-foreground">
            {gt("{label}: {left}% left", { label: window.label, left })}
          </span>
          {accountLabel ? <span className="text-muted-foreground">{accountLabel}</span> : null}
          {pace && timeLeft !== null ? (
            <span className="text-muted-foreground">
              {m(PACE_LABEL[pace])} · {gt("{timeLeft}% of the window left", { timeLeft })}
            </span>
          ) : null}
          {reset ? <span className="text-muted-foreground">{reset}</span> : null}
        </>
      }
    />
  );
}

function PoolRow({
  window,
  now,
  spotlight,
  onSpotlight,
}: {
  readonly window: LimitPoolWindow;
  readonly now: number;
  readonly spotlight: boolean;
  readonly onSpotlight: SpotlightTrigger | undefined;
}) {
  const gt = useGT();
  const m = useMessages();
  const timestampFormat = usePrimarySettings((settings) => settings.timestampFormat);
  const left = window.remainingPercent;
  const accounts = window.members.length;
  const from = poolSources(window);
  const sourceLabels = [...from.hubs, ...(from.signedIn ? [gt("Signed-in accounts")] : [])];
  const next = nextPoolReset(window, now);
  const resetsAt = next?.member.window.resetsAt;
  const reset =
    next && resetsAt
      ? {
          duration: formatDuration(next.at - now, m),
          time: formatUpcomingTimestamp(resetsAt, timestampFormat, now, undefined, m),
        }
      : null;
  const resetLabel =
    next && reset
      ? accounts > 1
        ? gt("+{percent}% in {duration} · {time}", { percent: next.restoresPercent, ...reset })
        : gt("Resets in {duration} · {time}", reset)
      : null;
  const source =
    sourceLabels.length > 0
      ? gt("From {sources}", { sources: sourceLabels.join(", ") })
      : undefined;
  if (spotlight) {
    const member = accounts === 1 ? window.members[0] : undefined;
    return (
      <SpotlightQuota
        label={window.label}
        left={left}
        pace={window.pace}
        timeLeft={member ? paceRemainingPercent(member.window, now) : null}
        reset={resetLabel}
        source={source}
      />
    );
  }
  return (
    <UsageRow
      label={window.label}
      fill={left}
      tone={limitTone(left)}
      value={`${left}%`}
      ariaValue={gt("{left}% left", { left })}
      onSpotlight={onSpotlight}
      tooltip={
        <>
          <span className="text-foreground">
            {accounts > 1
              ? gt("{label}: {left}% left across {accounts} accounts", {
                  label: window.label,
                  left,
                  accounts,
                })
              : gt("{label}: {left}% left", { label: window.label, left })}
          </span>
          {window.pace ? (
            <span className="text-muted-foreground">{m(PACE_LABEL[window.pace])}</span>
          ) : null}
          {resetLabel ? <span className="text-muted-foreground">{resetLabel}</span> : null}
          {source ? <span className="text-muted-foreground">{source}</span> : null}
        </>
      }
    />
  );
}

function SpotlightQuota({
  label,
  left,
  pace,
  timeLeft,
  reset,
  source,
}: {
  readonly label: string;
  readonly left: number;
  readonly pace: LimitPace | null;
  readonly timeLeft: number | null;
  readonly reset: string | null;
  readonly source: string | undefined;
}) {
  const gt = useGT();
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="min-w-0 wrap-anywhere">{label}</span>
        <span className="flex shrink-0 items-center gap-1.5 font-medium tabular-nums">
          {pace ? <PaceIcon pace={pace} /> : null}
          {gt("{left}% left", { left })}
        </span>
      </div>
      <LedQuotaMeter
        size="md"
        ariaLabel={label}
        remainingPercent={left}
        paceRemainingPercent={timeLeft}
      />
      {reset || source ? (
        <div className="flex flex-wrap justify-between gap-x-2 text-2xs text-muted-foreground">
          {source ? <span className="min-w-0 wrap-anywhere">{source}</span> : null}
          {reset ? <span className="tabular-nums">{reset}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
function UsageRow({
  label,
  fill,
  tone,
  tick = null,
  value,
  ariaValue = value,
  tooltip,
  muted = false,
  onSpotlight,
}: {
  readonly label: string;
  /** Bar fill from 0 to 100. Null hides the bar. */
  readonly fill: number | null;
  readonly tone: UsageTone;
  /** A marker on the bar, from 0 to 100. */
  readonly tick?: number | null;
  readonly value: string;
  readonly ariaValue?: string;
  readonly tooltip: ReactNode;
  readonly muted?: boolean;
  readonly onSpotlight?: SpotlightTrigger | undefined;
}) {
  const gt = useGT();
  const rowProps = {
    "aria-label": gt("{label}: {value}", { label, value: ariaValue }),
    className: cn(
      "col-span-3 grid h-6 grid-cols-subgrid items-center rounded-lg px-2.5 outline-none hover:bg-black/[0.035] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring data-popup-open:bg-black/[0.035] dark:hover:bg-white/[0.08] dark:data-popup-open:bg-white/[0.08]",
      onSpotlight
        ? "group cursor-pointer text-start active:bg-black/[0.06] dark:active:bg-white/[0.12] stock-dark:hover:bg-(--silk-soft-edge)"
        : "cursor-default",
    ),
  };
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          onSpotlight ? (
            <button type="button" onClick={onSpotlight} {...rowProps} />
          ) : (
            <div tabIndex={0} {...rowProps} />
          )
        }
      >
        <span className="max-w-28 truncate text-muted-foreground group-hover:text-foreground">
          {label}
        </span>
        {fill !== null ? (
          <span className="relative h-[3px] rounded-full bg-muted-foreground/30 dark:bg-muted-foreground/20">
            {fill > 0 ? (
              <span
                className={cn(
                  "absolute inset-y-0 left-0 rounded-full",
                  tone === "error"
                    ? "bg-error"
                    : tone === "warning"
                      ? "bg-warning"
                      : muted
                        ? "bg-muted-foreground"
                        : "bg-foreground/80",
                )}
                style={{ width: `max(${fill}%, 6px)` }}
              />
            ) : null}
            {tick !== null ? (
              <span
                aria-hidden
                className="absolute -top-[3px] h-[9px] w-px -translate-x-1/2 bg-foreground/75"
                style={{ left: `clamp(0.5px, ${tick}%, calc(100% - 0.5px))` }}
              />
            ) : null}
          </span>
        ) : null}
        <span
          className={cn(
            // Text-only rows span the bar column so they never widen the shared value column.
            "text-end font-medium tabular-nums",
            fill === null && "col-span-2",
            tone === "error"
              ? "text-error-foreground"
              : tone === "warning"
                ? "text-warning-foreground"
                : fill === null
                  ? "text-muted-foreground"
                  : "text-foreground/80",
          )}
        >
          {value}
        </span>
      </TooltipTrigger>
      {/* Rows sit 8px inside the card; clear its edge instead of overlapping it. */}
      <TooltipPopup side="left" sideOffset={16}>
        <div className="flex flex-col gap-0.5">
          {tooltip}
          {onSpotlight ? (
            <span className="text-muted-foreground">{gt("Open context & quotas")}</span>
          ) : null}
        </div>
      </TooltipPopup>
    </Tooltip>
  );
}
