import "~/index.css";
import { expect, it } from "vite-plus/test";

import { render } from "../../../test/render";
import { LedQuotaMeter } from "./LedQuotaMeter";

it("rounds the visible 20 blocks without rounding the accessible value and clamps out-of-range readings", async () => {
  await using screen = await render(<LedQuotaMeter ariaLabel="Session" remainingPercent={68} />);
  const meter = screen.getByRole("meter", { name: "Session" });
  await expect.element(meter).toHaveAttribute("aria-valuenow", "68");
  expect(meter.element().children).toHaveLength(20);
  expect(meter.element().querySelectorAll("[data-lit]")).toHaveLength(14);

  await screen.rerender(<LedQuotaMeter ariaLabel="Session" remainingPercent={130} />);
  await expect.element(meter).toHaveAttribute("aria-valuenow", "100");
  expect(meter.element().querySelectorAll("[data-lit]")).toHaveLength(20);

  await screen.rerender(<LedQuotaMeter ariaLabel="Session" remainingPercent={-10} />);
  await expect.element(meter).toHaveAttribute("aria-valuenow", "0");
  expect(meter.element().querySelectorAll("[data-lit]")).toHaveLength(0);
});

it("isolates the stock-dark critical color and glow from other themes", async () => {
  const root = document.documentElement;
  const originalClass = root.className;
  const originalTheme = root.getAttribute("data-theme-id");
  using _theme = {
    [Symbol.dispose]() {
      root.className = originalClass;
      if (originalTheme === null) root.removeAttribute("data-theme-id");
      else root.setAttribute("data-theme-id", originalTheme);
    },
  };
  root.classList.add("dark");
  root.removeAttribute("data-theme-id");
  await using screen = await render(<LedQuotaMeter ariaLabel="Session" remainingPercent={10} />);
  const segment = screen.getByRole("meter").element().querySelector("[data-lit]")!;
  expect(getComputedStyle(segment).backgroundColor).toBe("rgb(255, 145, 168)");
  expect(getComputedStyle(segment).boxShadow).not.toBe("none");

  root.setAttribute("data-theme-id", "t3-chat");
  expect(getComputedStyle(segment).backgroundColor).not.toBe("rgb(255, 145, 168)");
  expect(getComputedStyle(segment).boxShadow).toBe("none");
});
