export const QUOTA_SEGMENTS = 20;

function clampPercent(value: number) {
  return Number.isNaN(value) ? 0 : Math.min(100, Math.max(0, value));
}

export function quotaMeterState(remainingPercent: number, paceRemainingPercent?: number | null) {
  const remaining = clampPercent(remainingPercent);
  return {
    remaining,
    litSegments: Math.round((remaining / 100) * QUOTA_SEGMENTS),
    pace:
      paceRemainingPercent != null && Number.isFinite(paceRemainingPercent)
        ? clampPercent(paceRemainingPercent)
        : null,
    tone:
      remaining <= 10
        ? "critical"
        : remaining <= 20
          ? "warning"
          : remaining <= 50
            ? "mid"
            : "healthy",
  } as const;
}
