import { expect, it } from "vite-plus/test";

import { DEFAULT_MOBILE_THEME_ID, MOBILE_THEME_IDS } from "../../lib/mobileTheme";
import { buildGhosttyThemeConfig, getMobileTerminalTheme } from "./terminalTheme";

it("sends the Silk terminal surface, cursor and selection to Ghostty only in stock dark", () => {
  const stock = buildGhosttyThemeConfig(getMobileTerminalTheme(DEFAULT_MOBILE_THEME_ID, "dark"));
  expect(stock).toContain("background = #0b0a13\n");
  expect(stock).toContain("cursor-color = #78e8fa\n");
  expect(stock).toContain("selection-background = #3a2860\n");
  for (const id of MOBILE_THEME_IDS) {
    expect(buildGhosttyThemeConfig(getMobileTerminalTheme(id, "light"))).not.toContain(
      "selection-background",
    );
    if (id !== DEFAULT_MOBILE_THEME_ID) {
      expect(buildGhosttyThemeConfig(getMobileTerminalTheme(id, "dark"))).not.toContain(
        "selection-background",
      );
    }
  }
});
