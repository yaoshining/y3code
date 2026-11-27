import { View } from "react-native";

import { QUOTA_SEGMENTS, quotaMeterState } from "./MobileLedQuotaMeter.logic";

const SEGMENTS = Array.from({ length: QUOTA_SEGMENTS }, (_, index) => index);

const STOCK_DARK_SEGMENT = {
  critical: "bg-[#ff91a8]",
  warning: "bg-[#ffd18a]",
  mid: "bg-[#c2adff]",
  healthy: "bg-[#61e5b5] bg-linear-to-b from-[#78e8fa] to-[#61e5b5]",
} as const;

const THEMED_SEGMENT = {
  critical: "bg-danger-foreground",
  warning: "bg-warning-foreground",
  mid: "bg-primary-text",
  healthy: "bg-primary-text",
} as const;

export function MobileLedQuotaMeter(props: {
  readonly label: string;
  readonly remainingPercent: number;
  readonly paceRemainingPercent?: number | null;
  readonly stockDark: boolean;
}) {
  const { remaining, litSegments, pace, tone } = quotaMeterState(
    props.remainingPercent,
    props.paceRemainingPercent,
  );
  const lit = (props.stockDark ? STOCK_DARK_SEGMENT : THEMED_SEGMENT)[tone];
  const unlit = props.stockDark ? "border border-[#413456] bg-[#100c1d]" : "bg-subtle-strong";

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={props.label}
      accessibilityValue={{ min: 0, max: 100, now: remaining }}
      className="relative h-3 justify-center"
    >
      <View className="h-1.5 flex-row gap-px">
        {SEGMENTS.map((index) => (
          <View
            key={index}
            className={`flex-1 rounded-[1px] ${index < litSegments ? lit : unlit}`}
          />
        ))}
      </View>
      {pace !== null ? (
        <View pointerEvents="none" className="absolute inset-x-0.5 inset-y-0">
          <View
            className="absolute -ml-0.5 h-full w-1 rounded-full border border-screen bg-foreground"
            style={{ left: `${pace}%` }}
          />
        </View>
      ) : null}
    </View>
  );
}
