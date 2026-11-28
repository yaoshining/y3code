import { describe, expect, it } from "vite-plus/test";

import { quotaMeterState } from "./MobileLedQuotaMeter.logic";

describe("mobile LED quota levels", () => {
  it.each([
    [Number.NaN, 0, 0, "critical"],
    [-12, 0, 0, "critical"],
    [2, 2, 0, "critical"],
    [10, 10, 2, "critical"],
    [11, 11, 2, "warning"],
    [20, 20, 4, "warning"],
    [21, 21, 4, "mid"],
    [50, 50, 10, "mid"],
    [51, 51, 10, "healthy"],
    [97.5, 97.5, 20, "healthy"],
    [200, 100, 20, "healthy"],
  ] as const)(
    "maps %s%% remaining to the matching capacity and tone",
    (input, remaining, litSegments, tone) => {
      expect(quotaMeterState(input)).toEqual({ remaining, litSegments, tone, pace: null });
    },
  );

  it("keeps a valid pace marker independent of remaining credit", () => {
    expect(quotaMeterState(23, 65).pace).toBe(65);
    expect(quotaMeterState(23, -1).pace).toBe(0);
    expect(quotaMeterState(23, 103).pace).toBe(100);
    expect(quotaMeterState(23, Number.POSITIVE_INFINITY).pace).toBeNull();
  });
});
