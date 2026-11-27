import { converter, wcagContrast } from "culori/fn";
import { describe, expect, it } from "vite-plus/test";

import "~/index.css";
import { getStandardPaintedThemeColors } from "./themePalette";

const toRgb = converter("rgb");

function paintedChannels(variable: string, canvas: readonly number[] = [0, 0, 0]): number[] {
  const probe = document.createElement("div");
  probe.style.backgroundColor = `var(${variable})`;
  document.body.append(probe);
  try {
    const color = toRgb(getComputedStyle(probe).backgroundColor)!;
    const alpha = color.alpha ?? 1;
    return [color.r, color.g, color.b].map(
      (channel, index) => (channel * alpha + (canvas[index]! / 255) * (1 - alpha)) * 255,
    );
  } finally {
    probe.remove();
  }
}

describe("standard painted theme colors", () => {
  it("match the chip surfaces index.css paints", () => {
    const root = document.documentElement;
    try {
      for (const appearance of ["light", "dark"] as const) {
        root.classList.toggle("dark", appearance === "dark");
        const colors = getStandardPaintedThemeColors(appearance);
        const canvas = paintedChannels("--background");
        for (const [variable, role] of [
          ["--background", "canvas"],
          ["--card", "surface"],
          ["--surface-raised", "surfaceRaised"],
          ["--message-surface", "messageSurface"],
        ] as const) {
          const expected = toRgb(colors[role])!;
          const painted = paintedChannels(variable, canvas);
          [expected.r, expected.g, expected.b].forEach((channel, index) => {
            expect(Math.abs(channel * 255 - painted[index]!), `${appearance} ${role}`).toBeLessThan(
              1.5,
            );
          });
        }
      }
    } finally {
      root.classList.remove("dark");
    }
  });

  it("keeps the stock dark scrollbar visible on the canvas and sidebar", () => {
    const root = document.documentElement;
    root.classList.add("dark");
    try {
      for (const surface of ["--background", "--sidebar"]) {
        const backdrop = paintedChannels(surface);
        for (const thumb of ["--app-scrollbar-thumb", "--app-scrollbar-thumb-hover"]) {
          const fill = paintedChannels(thumb, backdrop);
          expect(
            wcagContrast(`rgb(${fill.join(" ")})`, `rgb(${backdrop.join(" ")})`),
            `${thumb} on ${surface}`,
          ).toBeGreaterThanOrEqual(3);
        }
      }
    } finally {
      root.classList.remove("dark");
    }
  });
});
