import type { ComponentProps } from "react";

import { cn } from "../../lib/utils";

export function SettingsGroup({
  variant = "grouped",
  divided = true,
  className,
  ...props
}: ComponentProps<"div"> & {
  variant?: "grouped" | "plain";
  divided?: boolean;
}) {
  return (
    <div
      data-slot="settings-group"
      {...props}
      className={cn(
        "relative overflow-visible text-foreground",
        variant === "grouped"
          ? "rounded-xl border border-border/60 bg-card/40 shadow-xs/5 stock-dark:border-(--silk-soft-edge) stock-dark:bg-(image:--silk-settings-card-bg) stock-dark:shadow-(--silk-settings-card-shadow)"
          : "space-y-1",
        variant === "grouped" &&
          divided &&
          "*:not-first:border-t *:not-first:border-border/50 [&>[data-slot=settings-row]]:rounded-none stock-dark:py-1",
        className,
      )}
    />
  );
}
