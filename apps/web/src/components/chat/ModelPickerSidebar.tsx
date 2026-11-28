import { Toolbar } from "@base-ui/react/toolbar";
import { type ProviderInstanceId } from "@t3tools/contracts";
import { memo, useState } from "react";
import { msg, T, useMessages } from "gt-react";
import { StarIcon } from "lucide-react";
import { ProviderInstanceIcon } from "./ProviderInstanceIcon";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { cn } from "~/lib/utils";
import type { MessageResolver } from "../../i18n/messages";
import {
  isProviderInstancePickerReady,
  shouldShowInstanceBadge,
  type ProviderInstanceEntry,
} from "../../providerInstances";

function describeUnavailableInstance(
  entry: ProviderInstanceEntry,
  resolve: MessageResolver,
): string {
  const label = entry.displayName;
  // An unavailable instance (a driver this build lacks or the policy leaves out) says why instead.
  if ((!entry.enabled && entry.isAvailable) || entry.status === "disabled") {
    return resolve(msg("{label}: Disabled in settings.", { label }));
  }
  if (entry.status === "ready" && entry.isAvailable) {
    return label;
  }
  const message = entry.snapshot.message?.trim();
  if (message) {
    return resolve(
      entry.status === "error"
        ? msg("{label}: Unavailable. {message}", { label, message })
        : entry.status === "warning"
          ? msg("{label}: Limited. {message}", { label, message })
          : msg("{label}: Not ready. {message}", { label, message }),
    );
  }
  return resolve(
    entry.status === "error"
      ? msg("{label}: Unavailable.", { label })
      : entry.status === "warning"
        ? msg("{label}: Limited.", { label })
        : msg("{label}: Not ready.", { label }),
  );
}

const PICKER_TOOLTIP_SIDE = "left" as const;
const PICKER_TOOLTIP_SIDE_OFFSET = 8;

const PROVIDER_BUTTON_CLASS =
  "relative isolate flex w-full cursor-pointer aspect-square items-center justify-center rounded-md transition-colors hover:bg-foreground/10 focus-visible:bg-foreground/10 focus-visible:outline-none stock-dark:aria-pressed:bg-(--silk-surface-selected) stock-dark:aria-pressed:ring-1 stock-dark:aria-pressed:ring-inset stock-dark:aria-pressed:ring-(--silk-soft-edge)";

const EXPANDED_PROVIDER_ROW =
  "sm:h-8 sm:aspect-auto sm:justify-start sm:gap-1.5 sm:rounded-md sm:border sm:border-transparent sm:px-2 sm:text-start sm:text-xs sm:aria-pressed:bg-accent sm:stock-dark:aria-pressed:silk-model-picker-active";
const EXPANDED_LABEL = "hidden min-w-0 flex-1 truncate sm:block";

function CompactSelectionIndicator({ expanded }: { expanded: boolean }) {
  return (
    <span
      aria-hidden="true"
      data-model-picker-selected-indicator="true"
      className={cn(
        "pointer-events-none absolute end-0 top-1/2 z-10 h-5 w-0.75 -translate-y-1/2 rounded-full bg-primary stock-dark:bg-(--silk-violet) stock-dark:shadow-(--silk-led-glow)",
        expanded && "sm:hidden",
      )}
    />
  );
}

export const ModelPickerSidebar = memo(function ModelPickerSidebar(props: {
  selectedInstanceId: ProviderInstanceId | "favorites";
  onSelectInstance: (instanceId: ProviderInstanceId | "favorites") => void;
  onFocusSearch: () => void;
  instanceEntries: ReadonlyArray<ProviderInstanceEntry>;
  showFavorites?: boolean;
  favoriteCount?: number;
  expanded?: boolean;
  disabledInstanceIds?: ReadonlySet<ProviderInstanceId>;
  selectableUnavailableInstanceIds?: ReadonlySet<ProviderInstanceId>;
  getDisabledInstanceTooltip?: (entry: ProviderInstanceEntry) => string;
}) {
  const m = useMessages();
  const handleSelect = (instanceId: ProviderInstanceId | "favorites") => {
    props.onSelectInstance(instanceId);
  };
  const showFavorites = props.showFavorites ?? true;
  const [hoveredInstanceId, setHoveredInstanceId] = useState<ProviderInstanceId | null>(null);
  const expanded = props.expanded ?? false;
  const rowClass = cn(PROVIDER_BUTTON_CLASS, expanded && EXPANDED_PROVIDER_ROW);

  return (
    <Toolbar.Root
      className={cn(
        "w-11 shrink-0 overflow-hidden bg-muted/30",
        expanded
          ? "sm:w-40 stock-dark:bg-transparent stock-dark:bg-(image:--silk-picker-sidebar-bg)"
          : "stock-dark:bg-(--silk-surface-recessed)",
      )}
      data-model-picker-sidebar="true"
      aria-label={m(msg("Providers"))}
      orientation="vertical"
      onKeyDown={(event) => {
        if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
        if (event.key === "ArrowRight") {
          event.preventDefault();
          props.onFocusSearch();
          return;
        }
      }}
    >
      <div className="h-full overflow-y-auto overscroll-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className={cn("relative flex min-h-full flex-col gap-1 p-1", expanded && "sm:p-2.5")}>
          {expanded ? (
            <div className="hidden px-1 pt-0.5 pb-1 text-xs font-semibold text-muted-foreground sm:block">
              {m(msg("Providers"))}
            </div>
          ) : null}
          {showFavorites ? (
            <>
              <div className="relative w-full" data-model-picker-provider="favorites">
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Toolbar.Button
                        className={rowClass}
                        onClick={() => handleSelect("favorites")}
                        type="button"
                        aria-label={m(msg("Favorites"))}
                        aria-pressed={props.selectedInstanceId === "favorites"}
                      >
                        <StarIcon
                          className={cn(
                            "size-5 shrink-0",
                            expanded
                              ? "max-sm:fill-current sm:size-4 stock-dark:text-(--silk-violet)"
                              : "fill-current",
                          )}
                          aria-hidden
                        />
                        {expanded ? (
                          <>
                            <span className={EXPANDED_LABEL}>{m(msg("Favorites"))}</span>
                            <span
                              aria-hidden="true"
                              className="hidden rounded-sm border border-border bg-muted px-1 text-3xs tabular-nums sm:inline stock-dark:border-(--silk-soft-edge) stock-dark:bg-(--silk-surface-well)"
                            >
                              {props.favoriteCount ?? 0}
                            </span>
                          </>
                        ) : null}
                        {props.selectedInstanceId === "favorites" ? (
                          <CompactSelectionIndicator expanded={expanded} />
                        ) : null}
                      </Toolbar.Button>
                    }
                  />
                  <TooltipPopup
                    side={PICKER_TOOLTIP_SIDE}
                    sideOffset={PICKER_TOOLTIP_SIDE_OFFSET}
                    align="center"
                  >
                    <T>Favorites</T>
                  </TooltipPopup>
                </Tooltip>
              </div>
              <div
                className="border-b border-border/70 stock-dark:border-(--silk-soft-edge)"
                aria-hidden="true"
              />
            </>
          ) : null}

          {props.instanceEntries.map((entry) => {
            const isUnavailable = !isProviderInstancePickerReady(entry);
            const isContextDisabled = props.disabledInstanceIds?.has(entry.instanceId) ?? false;
            const unavailableSelectionIsReachable =
              props.selectableUnavailableInstanceIds?.has(entry.instanceId) ?? false;
            const isDisabled =
              (isUnavailable && !unavailableSelectionIsReachable) || isContextDisabled;
            const isSelected = props.selectedInstanceId === entry.instanceId;
            const isHovered = hoveredInstanceId === entry.instanceId;
            const showInstanceBadge = shouldShowInstanceBadge(entry, props.instanceEntries);

            const tooltip = isUnavailable
              ? describeUnavailableInstance(entry, m)
              : isContextDisabled
                ? (props.getDisabledInstanceTooltip?.(entry) ?? entry.displayName)
                : entry.displayName;

            const button = (
              <Toolbar.Button
                className={cn(
                  rowClass,
                  isDisabled && "opacity-50 cursor-not-allowed hover:bg-transparent",
                )}
                data-provider-accent-color={entry.accentColor}
                onClick={() => !isDisabled && handleSelect(entry.instanceId)}
                onMouseEnter={() => setHoveredInstanceId(entry.instanceId)}
                onMouseLeave={() =>
                  setHoveredInstanceId((current) => (current === entry.instanceId ? null : current))
                }
                onFocus={() => setHoveredInstanceId(entry.instanceId)}
                onBlur={() =>
                  setHoveredInstanceId((current) => (current === entry.instanceId ? null : current))
                }
                disabled={isDisabled}
                focusableWhenDisabled={!isDisabled}
                aria-pressed={isSelected}
                type="button"
                aria-label={isUnavailable || isContextDisabled ? tooltip : entry.displayName}
              >
                {expanded ? (
                  <span
                    aria-hidden="true"
                    className={cn(
                      "hidden size-1.5 shrink-0 rounded-full sm:block",
                      isContextDisabled || !entry.isAvailable || !entry.enabled
                        ? "bg-muted-foreground/50"
                        : entry.status === "warning"
                          ? "bg-warning stock-dark:bg-(--silk-amber)"
                          : isUnavailable
                            ? "bg-muted-foreground/50"
                            : "bg-success stock-dark:bg-(--silk-green) stock-dark:shadow-(--silk-provider-ready-glow)",
                    )}
                  />
                ) : null}
                <ProviderInstanceIcon
                  driverKind={entry.driverKind}
                  displayName={entry.displayName}
                  accentColor={entry.accentColor}
                  acpRegistryAgentId={entry.acpRegistryAgentId}
                  acpRegistryIconUrl={entry.acpRegistryIconUrl}
                  showBadge={showInstanceBadge}
                  className={cn("size-6 z-30 shrink-0", expanded && "sm:size-4")}
                  iconClassName={cn("size-5", expanded && "sm:size-4")}
                  indicatorBackground={
                    isHovered && !isDisabled
                      ? "var(--muted)"
                      : isSelected
                        ? "var(--background)"
                        : "color-mix(in oklab, var(--muted) 30%, transparent)"
                  }
                  {...(entry.accentColor ? { badgeClassName: "h-3 min-w-3 px-0.5 text-5xs" } : {})}
                />
                {expanded ? <span className={EXPANDED_LABEL}>{entry.displayName}</span> : null}
                {isSelected ? <CompactSelectionIndicator expanded={expanded} /> : null}
              </Toolbar.Button>
            );

            const trigger = isDisabled ? (
              <span className="relative block w-full">{button}</span>
            ) : (
              button
            );

            return (
              <div
                key={entry.instanceId}
                className="relative w-full"
                data-model-picker-provider={entry.instanceId}
              >
                <Tooltip>
                  <TooltipTrigger render={trigger} />
                  <TooltipPopup
                    side={PICKER_TOOLTIP_SIDE}
                    sideOffset={PICKER_TOOLTIP_SIDE_OFFSET}
                    align="center"
                  >
                    {tooltip}
                  </TooltipPopup>
                </Tooltip>
              </div>
            );
          })}
        </div>
      </div>
    </Toolbar.Root>
  );
});
