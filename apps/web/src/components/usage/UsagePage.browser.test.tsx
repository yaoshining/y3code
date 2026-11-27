import { expect, it, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";

import "~/index.css";
import { render } from "../../../test/render";
import { readUsagePagePreferences, saveUsagePagePreferences } from "./usagePagePreferences";
import { UsagePage } from "./UsagePage";

vi.mock(import("../../localEnvironment"), () => ({ isLocalEnvironmentDisabled: () => true }));

it("moves the pressed styling with the Usage metric, even when the old metric is hovered", async () => {
  await page.viewport(1280, 800);
  const originalPreferences = readUsagePagePreferences();
  saveUsagePagePreferences({ metric: "cost", windowDays: 30 });
  const root = document.documentElement;
  const wasDark = root.classList.contains("dark");
  root.classList.add("dark");
  using _restore = {
    [Symbol.dispose]() {
      saveUsagePagePreferences(originalPreferences);
      root.classList.toggle("dark", wasDark);
    },
  };
  await using _screen = await render(<UsagePage />, { router: "/usage" });

  const metrics = page.getByRole("group", { name: "Usage metric" });
  for (const name of ["Cost", "Tokens", "Limits"]) {
    const selected = metrics.getByRole("button", { name });
    await selected.click();
    await expect.element(metrics.getByRole("button", { pressed: true })).toHaveTextContent(name);
    await expect.element(selected).toHaveAttribute("data-pressed");
    expect(getComputedStyle(selected.element()).backgroundImage).toContain("linear-gradient");

    const unselected = metrics.getByRole("button", { name: name === "Cost" ? "Tokens" : "Cost" });
    await unselected.hover();
    await expect.element(unselected).toHaveAttribute("aria-pressed", "false");
    await expect.element(unselected).not.toHaveAttribute("data-pressed");
    expect(getComputedStyle(selected.element()).backgroundImage).toContain("linear-gradient");
    expect(getComputedStyle(unselected.element()).backgroundImage).toBe("none");
  }
});
