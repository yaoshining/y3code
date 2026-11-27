import { msg } from "gt-react-native";
import { StyleSheet, type ViewStyle } from "react-native";

import { m, type MessageResolver } from "../../i18n/messages";
import type { MobileThemeVariables } from "../../lib/mobileTheme";

export const THREAD_LIST_V2_ROW_CONTENT_CLASS_NAME = "px-5 py-2.5";
export const THREAD_LIST_V2_ROW_DIVIDERS = true;
export const THREAD_LIST_V2_SIDEBAR_ROW_STYLE = {
  borderRadius: 12,
  paddingHorizontal: 12,
  paddingVertical: 10,
} satisfies ViewStyle;
export const THREAD_LIST_V2_SIDEBAR_ROW_CONTAINER_STYLE = {
  borderRadius: 12,
  overflow: "hidden",
} satisfies ViewStyle;

export const selectedThreadRowColors = {
  foregroundClassName: "text-thread-selected-foreground",
  mutedForegroundClassName: "text-thread-selected-foreground-muted",
  iconTintClassName: "accent-thread-selected-foreground",
  mutedIconTintClassName: "accent-thread-selected-foreground-muted",
};

export function getThreadListV2NewBranchMenuTitle(_branch: string, resolve: MessageResolver = m) {
  return resolve(msg("New thread on branch"));
}

export function getThreadListV2RowAppearance(
  theme: MobileThemeVariables,
  sidebarPane: boolean,
  selected: boolean,
  stockDark: boolean,
) {
  const backgroundColor = theme[sidebarPane ? "--color-drawer" : "--color-screen"];
  const rowColor = selected
    ? theme["--color-thread-selected"]
    : stockDark
      ? theme["--color-card"]
      : backgroundColor;
  const style: ViewStyle | undefined =
    sidebarPane || stockDark
      ? {
          backgroundColor: rowColor,
          borderRadius: THREAD_LIST_V2_SIDEBAR_ROW_STYLE.borderRadius,
          ...(stockDark
            ? {
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: selected ? "#b896f27a" : theme["--color-border"],
              }
            : {}),
        }
      : undefined;
  const swipeContainerStyle: ViewStyle | undefined = stockDark
    ? { ...THREAD_LIST_V2_SIDEBAR_ROW_CONTAINER_STYLE, marginHorizontal: 8, marginVertical: 2 }
    : sidebarPane
      ? THREAD_LIST_V2_SIDEBAR_ROW_CONTAINER_STYLE
      : undefined;

  return {
    className: style ? undefined : "bg-screen",
    interactionClassName: sidebarPane ? "bg-thread-hover" : "bg-row-hover",
    interactionOpacity: selected ? 0 : 1,
    foregroundClassName: sidebarPane ? "text-drawer-foreground" : "text-foreground",
    mutedForegroundClassName: sidebarPane
      ? "text-drawer-foreground-muted"
      : "text-foreground-muted",
    tertiaryForegroundClassName: sidebarPane
      ? "text-drawer-foreground-muted"
      : "text-foreground-tertiary",
    mutedIconTintClassName: sidebarPane
      ? "accent-drawer-foreground-muted"
      : "accent-foreground-muted",
    tertiaryIconTintClassName: sidebarPane
      ? "accent-drawer-foreground-muted"
      : "accent-foreground-tertiary",
    style,
    cardStyle: sidebarPane ? { ...style, ...THREAD_LIST_V2_SIDEBAR_ROW_STYLE } : style,
    swipeContainerStyle,
    swipeBackgroundColor: backgroundColor,
    providerIconSurfaceColor: style ? rowColor : backgroundColor,
  };
}
