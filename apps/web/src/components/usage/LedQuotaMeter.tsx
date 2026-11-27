import { cn } from "../../lib/utils";

const SEGMENTS = 20;

function clampPercent(value: number) {
  return Number.isNaN(value) ? 0 : Math.max(0, Math.min(100, value));
}

export function LedQuotaMeter({
  remainingPercent,
  paceRemainingPercent,
  tone = "default",
  size = "sm",
  ariaLabel,
}: {
  readonly remainingPercent: number;
  readonly paceRemainingPercent?: number | null;
  readonly tone?: "default" | "warning" | "error";
  readonly size?: "sm" | "md";
  readonly ariaLabel: string;
}) {
  const remaining = clampPercent(remainingPercent);
  const litSegments = Math.round((remaining / 100) * SEGMENTS);
  const litColor =
    tone === "error" || remaining <= 10
      ? "bg-destructive stock-dark:bg-(--silk-rose)"
      : tone === "warning" || remaining <= 20
        ? "bg-warning stock-dark:bg-(--silk-amber)"
        : remaining <= 50
          ? "bg-primary stock-dark:bg-(--silk-violet)"
          : "bg-primary stock-dark:bg-linear-to-b stock-dark:from-(--silk-cyan) stock-dark:to-(--silk-green)";
  return (
    <div
      role="meter"
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={remaining}
      className={cn(
        "relative grid grid-cols-[repeat(20,minmax(0,1fr))] gap-px",
        size === "md" ? "h-3 stock-dark:gap-0.5" : "h-1.5",
      )}
    >
      {Array.from({ length: SEGMENTS }, (_, index) => (
        <span
          key={index}
          aria-hidden
          data-lit={index < litSegments || undefined}
          className={cn(
            "rounded-xs",
            index < litSegments
              ? cn(litColor, "stock-dark:shadow-(--silk-led-glow)")
              : "bg-muted stock-dark:bg-(--silk-surface-well)",
          )}
        />
      ))}
      {paceRemainingPercent != null && Number.isFinite(paceRemainingPercent) ? (
        <span
          aria-hidden
          className="absolute -inset-y-0.5 w-0.5 -translate-x-1/2 rounded-full bg-foreground ring-1 ring-background"
          style={{ left: `clamp(1px, ${clampPercent(paceRemainingPercent)}%, calc(100% - 1px))` }}
        />
      ) : null}
    </div>
  );
}
