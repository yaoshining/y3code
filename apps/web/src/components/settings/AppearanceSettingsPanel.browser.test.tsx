import { expect, it, vi } from "vite-plus/test";

import "~/index.css";
import { render } from "../../../test/render";
import { getClientSettings, updateClientSettings } from "../../hooks/useSettings";
import { refreshTheme, setTheme } from "../../hooks/useTheme";
import {
  THEME_APPEARANCE_MODE_STORAGE_KEY,
  THEME_FOLLOW_SYSTEM_STORAGE_KEY,
  THEME_HALVES_STORAGE_KEY,
} from "../../themePalette";
import { AppearanceSettingsPanel } from "./AppearanceSettingsPanel";
import { SettingsScopeProvider } from "./SettingsScopeContext";

vi.mock(import("../../localEnvironment"), () => ({ isLocalEnvironmentDisabled: () => true }));

it("highlights the selected scheme, current theme, and checked switch only in stock dark", async () => {
  const themeStorage = [
    "t3code:theme",
    THEME_APPEARANCE_MODE_STORAGE_KEY,
    THEME_FOLLOW_SYSTEM_STORAGE_KEY,
    THEME_HALVES_STORAGE_KEY,
  ].map((key) => [key, localStorage.getItem(key)] as const);
  using _restoreTheme = {
    [Symbol.dispose]() {
      for (const [key, value] of themeStorage) {
        if (value === null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
      }
      refreshTheme();
    },
  };
  setTheme("dark");
  await using screen = await render(
    <SettingsScopeProvider deviceOnly search={{}} onChange={() => {}}>
      <AppearanceSettingsPanel />
    </SettingsScopeProvider>,
    { router: "/settings/appearance" },
  );

  const dark = screen.getByRole("button", { name: "Use dark mode" });
  await dark.click();
  await expect.element(dark).toHaveAttribute("aria-pressed", "true");
  const standardTheme = screen.getByRole("button", { name: "Use T3 Code theme", exact: true });
  const themeCard = standardTheme.element().closest("[data-theme-library-card]")!;
  const activeBorder = "rgba(209, 140, 240, 0.6)";
  expect(getComputedStyle(dark.element()).borderColor).toBe(activeBorder);
  expect(getComputedStyle(themeCard).borderColor).toBe(activeBorder);

  const windowFrame = screen.getByRole("switch", { name: "Nebula Silk frame" });
  const { silkWindowFrame } = getClientSettings();
  await using _restoreSwitch = {
    [Symbol.asyncDispose]: () => updateClientSettings({ silkWindowFrame }),
  };
  if (windowFrame.element().getAttribute("aria-checked") === "true") await windowFrame.click();
  await expect.element(windowFrame).not.toBeChecked();
  expect(getComputedStyle(windowFrame.element()).backgroundImage).toBe("none");
  await windowFrame.click();
  await expect.element(windowFrame).toBeChecked();
  expect(getComputedStyle(windowFrame.element()).backgroundImage).toContain("linear-gradient");

  await screen.getByRole("button", { name: "Use Iris theme", exact: true }).click();
  expect(document.documentElement).toHaveAttribute("data-theme-id", "iris");
  expect(getComputedStyle(dark.element()).borderColor).not.toBe(activeBorder);
  expect(getComputedStyle(themeCard).borderColor).not.toBe(activeBorder);
  expect(getComputedStyle(windowFrame.element()).backgroundImage).toBe("none");

  await standardTheme.click();
  const light = screen.getByRole("button", { name: "Use light mode" });
  await light.click();
  await expect.element(light).toHaveAttribute("aria-pressed", "true");
  expect(getComputedStyle(light.element()).borderColor).not.toBe(activeBorder);
  expect(getComputedStyle(themeCard).borderColor).not.toBe(activeBorder);
});
