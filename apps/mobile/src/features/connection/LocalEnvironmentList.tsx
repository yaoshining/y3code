import { T } from "gt-react-native";
import type { EnvironmentId } from "@t3tools/contracts";
import type { ComponentProps } from "react";
import { View } from "react-native";

import { SymbolView } from "../../components/ui/AppSymbol";
import { AppText as Text } from "../../components/ui/AppText";
import { cn } from "../../lib/cn";
import { useMobileStockDark } from "../settings/appearance/AppearancePreferencesProvider";
import { ConnectionEnvironmentRow } from "./ConnectionEnvironmentRow";

type EnvironmentRowProps = ComponentProps<typeof ConnectionEnvironmentRow>;

export function LocalEnvironmentList({
  environments,
  expandedId,
  onToggle,
  ...rowActions
}: Pick<
  EnvironmentRowProps,
  "onReconnect" | "onRemove" | "onSetEnabled" | "onUpdate" | "opensDetails"
> & {
  readonly environments: ReadonlyArray<EnvironmentRowProps["environment"]>;
  readonly expandedId: EnvironmentId | null;
  readonly onToggle: (environmentId: EnvironmentId) => void;
}) {
  const stockDark = useMobileStockDark();
  const cardClassName = stockDark ? "border border-focus/20 bg-card" : "bg-grouped-card";

  if (environments.length === 0) {
    return (
      <View
        collapsable={false}
        className={cn("items-center gap-3 rounded-[24px] px-6 py-8", cardClassName)}
      >
        <View className="h-12 w-12 items-center justify-center rounded-[16px] bg-subtle">
          <SymbolView
            name="point.3.connected.trianglepath.dotted"
            size={20}
            tintColorClassName="accent-icon-muted"
            type="monochrome"
          />
        </View>
        <Text className="text-center text-sm leading-normal text-foreground-muted">
          <T>No environments connected yet.</T>
          {"\n"}
          <T>
            Tap <Text className="font-t3-bold text-foreground">+</Text> to add one.
          </T>
        </Text>
      </View>
    );
  }

  return (
    <View collapsable={false} className={cn("overflow-hidden rounded-[24px]", cardClassName)}>
      {environments.map((environment) => (
        <View key={environment.environmentId} collapsable={false}>
          <ConnectionEnvironmentRow
            environment={environment}
            expanded={expandedId === environment.environmentId}
            onToggle={() => onToggle(environment.environmentId)}
            {...rowActions}
          />
        </View>
      ))}
    </View>
  );
}
