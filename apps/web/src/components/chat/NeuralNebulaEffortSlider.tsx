import { msg, useGT, useMessages } from "gt-react";
import { type KeyboardEvent, useEffect, useEffectEvent, useId, useRef } from "react";
import { observeResize } from "~/lib/observeResize";
import { cn } from "~/lib/utils";
import { SharedTooltipTrigger } from "../ui/shared-tooltip";
import { EffortGlyph } from "./EffortGlyph";
import {
  clamp,
  createNebulaLayers,
  interpolateNebulaLevel,
  isOverloadLevel,
  mapNebulaLevels,
  renderNeuralNebulaFrame,
  renderNeuralNebulaLens,
  silkNebulaPalette,
  type NebulaPalette,
} from "./neuralNebulaScene";

interface EffortChoice {
  readonly id: string;
  readonly label: string;
  readonly description?: string | undefined;
  readonly isDefault?: boolean | undefined;
}

const hints = {
  off: msg("Respond without extra reasoning."),
  minimal: msg("Use just enough reasoning for straightforward tasks."),
  low: msg("Answer quick questions and make simple changes."),
  medium: msg("Handle everyday code changes and focused debugging."),
  high: msg("Reason through multi-file changes and refactors."),
  xhigh: msg("Investigate complex dependencies and cross-module problems."),
  max: msg("Spend more time reasoning through difficult changes."),
  ultra: msg("Use the most reasoning for complex architecture and debugging."),
  default: msg("Let the provider choose the reasoning level."),
};

function stopPosition(position: number) {
  return `calc(var(--nebula-stop-inset) + (100% - 2 * var(--nebula-stop-inset)) * ${position})`;
}

function paletteFor(track: HTMLElement): NebulaPalette {
  const styles = getComputedStyle(track);
  if (styles.getPropertyValue("--nebula-silk").trim() === "1") return silkNebulaPalette;
  const card = styles.getPropertyValue("--card").trim() || "#f3f4f6";
  const primary = styles.getPropertyValue("--primary").trim() || "#6777af";
  return {
    deep: `color-mix(in srgb, ${card} 16%, #10111b)`,
    space: `color-mix(in srgb, ${card} 24%, #1b2031)`,
    cyan: `color-mix(in srgb, ${primary} 25%, #a5e5ff)`,
    violet: `color-mix(in srgb, ${primary} 45%, #cabdff)`,
    pink: `color-mix(in srgb, ${primary} 35%, #f6d8f1)`,
    gold: "#efd397",
    hot: "#fff6df",
  };
}

function mountTrack({
  track,
  scene,
  lens,
  levels,
  initial,
  onPick,
}: {
  track: HTMLDivElement;
  scene: HTMLCanvasElement;
  lens: HTMLCanvasElement;
  levels: ReturnType<typeof mapNebulaLevels>;
  initial: number;
  onPick: (index: number) => void;
}) {
  const ctx = scene.getContext("2d", { alpha: false });
  const lensCtx = lens.getContext("2d", { alpha: false });
  if (!ctx || !lensCtx) return;
  const { values, overload } = levels;
  const listeners = new AbortController();
  const { signal } = listeners;
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  const stopCount = values.length - 1;
  let palette = paletteFor(track);
  let dimensions: {
    width: number;
    height: number;
    diameter: number;
    offset: number;
    start: number;
    rail: number;
    dpr: number;
  } | null = null;
  let layers: ReturnType<typeof createNebulaLayers> | null = null;
  let visible = false;
  let frame = 0,
    timer = 0,
    last = 0,
    time = 0;
  let selection = initial;
  let target = Math.max(0, initial) / stopCount;
  let lastOffset: number | undefined;
  let lastTrim: number | undefined;
  let position = target,
    velocity = 0;
  let intensity = values[initial] ?? 0;
  let targetIntensity = intensity;
  let drag: { id: number; offset: number } | null = null;

  function allowed() {
    return visible && !document.hidden && layers !== null;
  }

  function pause() {
    clearTimeout(timer);
    cancelAnimationFrame(frame);
    frame = timer = last = 0;
  }

  function wake() {
    clearTimeout(timer);
    timer = 0;
    if (allowed() && !frame) frame = requestAnimationFrame(draw);
  }

  function draw(now: number) {
    frame = 0;
    if (!allowed() || !ctx || !lensCtx || !dimensions || !layers) return;
    const reduced = motion.matches;
    if (!reduced && last && now - last < 16) {
      frame = requestAnimationFrame(draw);
      return;
    }
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 1 / 60;
    last = now;
    if (!reduced) time += dt;
    if (reduced || drag) {
      position = target;
      velocity = 0;
    } else {
      const displacement = position - target;
      const slope = (velocity + 20 * displacement) / 15;
      const decay = Math.exp(-20 * dt);
      const cos = Math.cos(15 * dt),
        sin = Math.sin(15 * dt);
      position = target + decay * (displacement * cos + slope * sin);
      velocity =
        decay *
        ((-displacement * sin + slope * cos) * 15 - 20 * (displacement * cos + slope * sin));
      if (Math.abs(position - target) < 0.0004 && Math.abs(velocity) < 0.004) {
        position = target;
        velocity = 0;
      }
    }
    intensity = reduced
      ? targetIntensity
      : intensity + (targetIntensity - intensity) * (1 - Math.exp(-dt * (drag ? 28 : 16)));
    if (Math.abs(intensity - targetIntensity) < 0.00035) intensity = targetIntensity;
    const { width, height, diameter, offset, start, rail } = dimensions;
    const center = start + rail * clamp(position) - offset;
    const boundary = overload
      ? { ...overload, x: start + rail * overload.position - offset }
      : null;
    const trim = boundary ? clamp((intensity - boundary.t) / (values[stopCount]! - boundary.t)) : 0;
    if (lastOffset !== center + offset) {
      lastOffset = center + offset;
      track.style.setProperty("--nebula-lens-position", `${lastOffset}px`);
    }
    if (lastTrim !== trim) {
      lastTrim = trim;
      track.style.setProperty("--nebula-trim", String(trim * trim * (3 - 2 * trim)));
    }
    renderNeuralNebulaFrame(ctx, width, height, intensity, time, palette, {
      ...layers,
      boundary,
      railStart: start - offset,
      railLength: rail,
      values,
      reduced,
    });
    renderNeuralNebulaLens(
      lensCtx,
      scene,
      width,
      height,
      diameter,
      center,
      intensity,
      time,
      reduced,
      palette,
      layers,
    );
    if (reduced) {
      last = 0;
    } else if (drag || position !== target || intensity !== targetIntensity) {
      frame = requestAnimationFrame(draw);
    } else {
      timer = window.setTimeout(wake, Math.max(0, 50 - (performance.now() - now) - 8));
    }
  }

  function resize() {
    if (!ctx || !lensCtx || !visible || document.hidden) return;
    const outer = track.clientWidth;
    const width = scene.clientWidth,
      height = scene.clientHeight,
      diameter = lens.clientWidth;
    if (width === 0 || height === 0 || diameter === 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (
      width === dimensions?.width &&
      height === dimensions.height &&
      diameter === dimensions.diameter &&
      dpr === dimensions.dpr &&
      layers
    )
      return;
    const start = Math.min(35, outer * 0.21);
    dimensions = {
      width,
      height,
      diameter,
      dpr,
      start,
      rail: outer - 2 * start,
      offset: (outer - width) / 2,
    };
    scene.width = Math.ceil(width * dpr);
    scene.height = Math.ceil(height * dpr);
    lens.width = lens.height = Math.ceil(diameter * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    lensCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    layers = createNebulaLayers(width, height, dpr, palette);
    wake();
  }

  function select(index: number) {
    selection = index;
    if (!drag) {
      target = Math.max(0, index) / stopCount;
      targetIntensity = values[index] ?? 0;
      wake();
    }
  }

  function move(event: PointerEvent) {
    if (drag?.id !== event.pointerId || !dimensions) return;
    const rect = track.getBoundingClientRect();
    const x = ((event.clientX - rect.left) * track.clientWidth) / rect.width;
    target = clamp((x - dimensions.start - drag.offset) / dimensions.rail);
    targetIntensity = interpolateNebulaLevel(target, values);
    wake();
  }

  function end(event: PointerEvent, commit: boolean) {
    if (drag?.id !== event.pointerId) return;
    if (commit) move(event);
    drag = null;
    delete track.dataset.grabbing;
    const next = commit ? Math.round(target * stopCount) : selection;
    select(next);
    if (commit) onPick(next);
  }

  track.addEventListener(
    "pointerdown",
    (event) => {
      if (!event.isPrimary || event.button !== 0 || drag || !dimensions) return;
      event.preventDefault();
      const rect = track.getBoundingClientRect();
      const x = ((event.clientX - rect.left) * track.clientWidth) / rect.width;
      const offset = x - (dimensions.start + dimensions.rail * position);
      track.setPointerCapture(event.pointerId);
      drag = {
        id: event.pointerId,
        offset: Math.abs(offset) < dimensions.diameter / 2 ? offset : 0,
      };
      track.dataset.grabbing = "true";
      move(event);
    },
    { signal },
  );
  track.addEventListener("pointermove", move, { signal });
  track.addEventListener("pointerup", (event) => end(event, true), { signal });
  track.addEventListener("pointercancel", (event) => end(event, false), { signal });
  track.addEventListener("lostpointercapture", (event) => end(event, false), { signal });
  motion.addEventListener(
    "change",
    () => {
      pause();
      wake();
    },
    { signal },
  );
  window.addEventListener("resize", resize, { signal });
  document.addEventListener(
    "visibilitychange",
    () => {
      if (document.hidden) pause();
      else {
        resize();
        wake();
      }
    },
    { signal },
  );
  const intersection = new IntersectionObserver(([entry]) => {
    visible = entry?.isIntersecting ?? false;
    if (visible) {
      resize();
      wake();
    } else pause();
  });
  intersection.observe(track);
  const unobserve = observeResize(track, resize);
  const theme = new MutationObserver(() => {
    palette = paletteFor(track);
    layers = null;
    resize();
  });
  theme.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "data-theme-id", "style"],
  });
  return {
    select,
    destroy() {
      pause();
      listeners.abort();
      if (drag && track.hasPointerCapture(drag.id)) track.releasePointerCapture(drag.id);
      delete track.dataset.grabbing;
      intersection.disconnect();
      unobserve();
      theme.disconnect();
    },
  };
}

function NeuralNebulaTrack({
  levels,
  index,
  onPick,
  open,
}: {
  levels: ReturnType<typeof mapNebulaLevels>;
  index: number;
  onPick: (index: number) => void;
  open: boolean;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HTMLCanvasElement>(null);
  const lensRef = useRef<HTMLCanvasElement>(null);
  const controller = useRef<ReturnType<typeof mountTrack>>(undefined);
  const readInitial = useEffectEvent(() => ({ index, levels }));
  const pick = useEffectEvent(onPick);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- owns the imperative canvases, frame scheduler and visibility observers
  useEffect(() => {
    const track = trackRef.current,
      scene = sceneRef.current,
      lens = lensRef.current;
    if (!open || !track || !scene || !lens) return;
    const initial = readInitial();
    const renderer = mountTrack({
      track,
      scene,
      lens,
      levels: initial.levels,
      initial: initial.index,
      onPick: (next) => pick(next),
    });
    controller.current = renderer;
    return () => {
      renderer?.destroy();
      controller.current = undefined;
    };
  }, [open]);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- updates the external canvas when a keyboard or remote selection changes
  useEffect(() => controller.current?.select(index), [index]);

  return (
    <div
      ref={trackRef}
      data-nebula-track
      aria-hidden="true"
      className="nebula-effort-track relative isolate mt-2 h-[60px] cursor-grab touch-pan-y rounded-full data-grabbing:cursor-grabbing"
      style={
        {
          "--nebula-initial-position": stopPosition(
            Math.max(0, index) / (levels.values.length - 1),
          ),
        } as React.CSSProperties
      }
    >
      <div className="nebula-effort-well pointer-events-none absolute inset-1 overflow-hidden rounded-full">
        <canvas ref={sceneRef} className="block size-full" />
      </div>
      {levels.overload ? (
        <span
          className="pointer-events-none absolute top-0 h-1.5 w-0.5 -translate-x-1/2 rounded-b-full bg-warning stock-dark:bg-(--silk-amber) stock-dark:shadow-(--silk-amber-tick-glow)"
          style={{ left: stopPosition(levels.overload.position) }}
        />
      ) : null}
      <div className="nebula-effort-lens pointer-events-none absolute top-1/2 z-10 size-[68px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-full">
        <canvas ref={lensRef} className="block size-full" />
      </div>
    </div>
  );
}

function moveTick(event: KeyboardEvent<HTMLButtonElement>, index: number, count: number) {
  if (
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    event.nativeEvent.isComposing
  )
    return;
  const next =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? count - 1
        : event.key === "ArrowRight"
          ? Math.min(index + 1, count - 1)
          : event.key === "ArrowLeft" && index > 0
            ? index - 1
            : null;
  if (next === null) return;
  event.preventDefault();
  event.stopPropagation();
  event.currentTarget
    .closest('[role="radiogroup"]')
    ?.querySelector<HTMLButtonElement>(`[data-nebula-stop="${next}"]`)
    ?.focus();
}

export function NeuralNebulaEffortSlider({
  label,
  choices,
  linear,
  value,
  open,
  onPick,
}: {
  label: string;
  choices: readonly EffortChoice[];
  linear: readonly EffortChoice[];
  value: string | null;
  open: boolean;
  onPick: (id: string) => void;
}) {
  const gt = useGT();
  const messages = useMessages();
  const groupRef = useRef<HTMLDivElement>(null);
  const hintId = useId();
  const current = choices.find((option) => option.id === value);
  const index = linear.findIndex((option) => option.id === value);
  const auto = choices.find((option) => option.id === "default");
  const hintKey = current?.id.toLowerCase() ?? "";
  const hint = Object.hasOwn(hints, hintKey) ? hints[hintKey as keyof typeof hints] : undefined;
  const description = current?.description || (hint && messages(hint));
  const hot = value !== null && isOverloadLevel(value);
  const levels = mapNebulaLevels(linear.map((option) => option.id));
  return (
    <div className="mx-auto flex w-full max-w-[292px] shrink-0 flex-col">
      <div className="flex min-w-0 items-center gap-2 pb-1">
        <span className="min-w-0 flex-1 truncate text-xs font-semibold">{label}</span>
        {current ? (
          <span
            className={cn(
              "max-w-[45%] truncate rounded-md bg-muted px-2 py-1 text-xs font-bold",
              hot
                ? "stock-dark:bg-(image:--silk-overload-bg) stock-dark:text-(--silk-cta-foreground) stock-dark:shadow-(--silk-overload-shadow)"
                : "stock-dark:bg-(image:--silk-cta-bg) stock-dark:text-(--silk-cta-foreground) stock-dark:shadow-(--silk-cta-shadow)",
            )}
          >
            {current.label}
          </span>
        ) : null}
        <EffortGlyph
          count={linear.length}
          filled={Math.max(0, index + 1)}
          tone={hot ? "overload" : "nebula"}
        />
      </div>
      <div
        ref={groupRef}
        role="radiogroup"
        aria-label={label}
        aria-describedby={description ? hintId : undefined}
        className="nebula-effort"
      >
        <NeuralNebulaTrack
          key={JSON.stringify(linear.map((option) => option.id))}
          index={index}
          levels={levels}
          open={open}
          onPick={(next) => {
            groupRef.current
              ?.querySelector<HTMLButtonElement>(`[data-nebula-stop="${next}"]`)
              ?.focus({ preventScroll: true });
            const option = linear[next];
            if (option && option.id !== value) onPick(option.id);
          }}
        />
        <div className="relative mt-1 h-7" dir="ltr">
          {linear.map((option, i) => {
            const selected = option.id === value;
            const text =
              linear.length >= 6 && option.label === "Medium"
                ? gt("Med", { $context: "abbreviated medium effort level" })
                : linear.length >= 5 && option.label === "Extra High"
                  ? "XHigh"
                  : linear.length >= 6 && option.label === "Minimal"
                    ? "Min"
                    : option.label;
            const tick = (
              <button
                type="button"
                role="radio"
                aria-label={option.label}
                aria-description={
                  option.isDefault
                    ? gt("Default", { $context: "marks the default option" })
                    : undefined
                }
                aria-checked={selected}
                data-effort-row
                data-effort-level={option.label}
                data-nebula-stop={i}
                tabIndex={selected || (!current && i === 0) ? 0 : -1}
                className={cn(
                  "absolute top-0 flex h-full -translate-x-1/2 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-sm text-3xs font-medium text-muted-foreground outline-none before:h-1.5 before:w-px before:bg-current before:opacity-65 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset aria-checked:font-bold aria-checked:text-primary aria-checked:before:w-0.5 aria-checked:before:opacity-100 stock-dark:aria-checked:text-(--silk-violet)",
                  isOverloadLevel(option.id) &&
                    "stock-dark:text-(--silk-amber) stock-dark:aria-checked:text-(--silk-amber) stock-dark:aria-checked:before:shadow-(--silk-amber-tick-glow)",
                )}
                style={{
                  left: stopPosition(i / (linear.length - 1)),
                  width: `calc((100% - 2 * var(--nebula-stop-inset)) / ${linear.length - 1})`,
                }}
                onClick={() => {
                  if (!selected) onPick(option.id);
                }}
                onKeyDown={(event) => moveTick(event, i, choices.length)}
              >
                <span className="w-full truncate text-center">{text}</span>
              </button>
            );
            return (
              <SharedTooltipTrigger
                key={option.id}
                render={tick}
                label={option.description ?? option.label}
                side="bottom"
              />
            );
          })}
        </div>
        {auto ? (
          <button
            type="button"
            role="radio"
            aria-label={auto.label}
            aria-checked={auto.id === value}
            data-effort-row
            data-effort-level={auto.label}
            data-nebula-stop={linear.length}
            tabIndex={auto.id === value ? 0 : -1}
            className="my-1 cursor-pointer rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset aria-checked:bg-muted aria-checked:text-foreground stock-dark:border-(--silk-soft-edge) stock-dark:aria-checked:bg-(--silk-surface-selected) stock-dark:aria-checked:text-(--silk-violet)"
            onClick={() => {
              if (auto.id !== value) onPick(auto.id);
            }}
            onKeyDown={(event) => moveTick(event, linear.length, choices.length)}
          >
            {gt("Auto", { $context: "automatic reasoning effort" })}
          </button>
        ) : null}
      </div>
      {current && description ? (
        <p
          id={hintId}
          className="mt-1 rounded-lg border border-border/70 bg-muted/40 px-2.5 py-2 text-xs leading-relaxed text-muted-foreground stock-dark:border-(--silk-selection-edge) stock-dark:bg-(image:--silk-effort-hint-bg)"
        >
          <strong className="font-semibold text-foreground">{current.label}</strong> · {description}
        </p>
      ) : null}
    </div>
  );
}
