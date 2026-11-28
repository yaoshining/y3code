import { expect, it } from "vite-plus/test";
import {
  interpolateNebulaLevel,
  mapNebulaLevels,
  renderNeuralNebulaFrame,
  silkNebulaPalette,
} from "./neuralNebulaScene";

it("uses evenly spaced stop positions and places the overload boundary between stops", () => {
  for (const count of [2, 3, 4, 5, 6, 7]) {
    const ids = [...Array.from({ length: count - 1 }, (_, i) => `provider-${i}`), "ultra"];
    const { values, overload } = mapNebulaLevels(ids);
    expect(values).toHaveLength(count);
    for (let i = 0; i < count; i++) {
      expect(interpolateNebulaLevel(i / (count - 1), values)).toBeCloseTo(values[i]!);
    }
    expect(overload?.position).toBeCloseTo((count - 1.5) / (count - 1));
    expect(interpolateNebulaLevel(overload!.position, values)).toBeCloseTo(overload!.t);
  }
  expect(mapNebulaLevels(["low", "medium", "high"]).overload).toBeNull();
  expect(mapNebulaLevels(["low", "medium", "high", "xhigh", "max", "ultra"])).toEqual({
    values: [0.2, 0.39, 0.58, 0.74, 0.89, 1],
    overload: { position: 0.7, t: (0.74 + 0.89) / 2, peak: 0.89 },
  });
});

it("issues the same drawing operations after approaching an intensity from above or below", () => {
  const commands: unknown[][] = [];
  const canvas = { width: 224, height: 52 };
  const ctx = new Proxy(
    { canvas },
    {
      get(target, key) {
        if (key === "canvas") return target.canvas;
        if (key === "globalAlpha") return 1;
        return (...args: unknown[]) => commands.push([key, ...args]);
      },
      set(_target, key, value) {
        commands.push([key, value]);
        return true;
      },
    },
  ) as unknown as CanvasRenderingContext2D;
  const sprite = canvas as HTMLCanvasElement;
  const opts = {
    sky: sprite,
    gas: sprite,
    sprites: { cyan: sprite, violet: sprite, pink: sprite, gold: sprite, hot: sprite },
    ramps: {
      cyan: Array<string>(129).fill(silkNebulaPalette.cyan),
      violet: Array<string>(129).fill(silkNebulaPalette.violet),
      pink: Array<string>(129).fill(silkNebulaPalette.pink),
    },
    railStart: 30,
    railLength: 164,
    values: [0.2, 0.39, 0.58, 0.74, 0.89, 1],
    boundary: { x: 160, t: 0.815, peak: 0.89 },
    reduced: false,
  };
  const draw = (level: number) => {
    commands.length = 0;
    renderNeuralNebulaFrame(ctx, 224, 52, level, 1.25, silkNebulaPalette, opts);
    return commands.slice();
  };
  const lower = draw(0.2);
  const fromBelow = draw(0.6);
  const upper = draw(1);
  const fromAbove = draw(0.6);
  expect(fromBelow).toEqual(fromAbove);
  expect(fromBelow).not.toEqual(lower);
  expect(fromAbove).not.toEqual(upper);
  expect(
    commands.flat().every((entry) => typeof entry !== "number" || Number.isFinite(entry)),
  ).toBe(true);
});
