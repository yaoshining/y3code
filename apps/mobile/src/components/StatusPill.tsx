import { View } from "react-native";

import { useMobileStockDark } from "../features/settings/appearance/AppearancePreferencesProvider";
import { AppText as Text } from "./ui/AppText";
import { cn } from "../lib/cn";

export interface StatusTone {
  readonly label: string;
  readonly pillClassName: string;
  readonly textClassName: string;
}

export function StatusPill(
  props: StatusTone & {
    readonly size?: "default" | "compact";
  },
) {
  const size = props.size ?? "default";
  const stockDark = useMobileStockDark();
  return (
    <View
      className={cn(
        "rounded-full",
        size === "compact" ? "px-2.5 py-1" : "px-3 py-1.5",
        props.pillClassName,
        stockDark && "border border-focus/25",
      )}
    >
      <Text
        className={cn(
          "font-t3-bold",
          size === "compact" ? "text-2xs" : "text-xs",
          props.textClassName,
        )}
      >
        {props.label}
      </Text>
    </View>
  );
}
