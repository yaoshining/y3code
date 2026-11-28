import { page, userEvent } from "vite-plus/test/browser";
import { expect, it, vi } from "vite-plus/test";
import "~/index.css";
import { act, render } from "../../test/render";
import {
  __setClientSettingsForTests,
  getClientSettings,
  persistClientSettingsPatch,
} from "../hooks/useSettings";
import { AppRouteModal } from "./AppRouteModal";
import { AppSidebarLayout } from "./AppSidebarLayout";
import { SidebarInset } from "./ui/sidebar";

vi.mock(import("../env"), async (original) => ({ ...(await original()), isElectron: true }));
vi.mock(import("./Sidebar"), () => ({ default: (() => null) as never }));

it("keeps the sidebar and workspace inside the frame and removes it in full-bleed modes", async () => {
  await page.viewport(1280, 800);
  using _platform = vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
  using cleanup = new DisposableStack();
  const root = document.documentElement;
  const previousClass = root.getAttribute("class") ?? "";
  const previousTheme = root.getAttribute("data-theme-id");
  cleanup.defer(() => {
    root.setAttribute("class", previousClass);
    if (previousTheme === null) root.removeAttribute("data-theme-id");
    else root.setAttribute("data-theme-id", previousTheme);
    vi.unstubAllGlobals();
    localStorage.removeItem("chat_thread_sidebar_open");
  });
  root.classList.add("dark");
  root.removeAttribute("data-theme-id");
  let notifyFullscreen: ((fullscreen: boolean) => void) | undefined;
  vi.stubGlobal("desktopBridge", {
    onMenuAction: () => () => {},
    onTrackpadScrollBegin: () => () => {},
    onTrackpadScrollEnd: () => () => {},
    getWindowFullscreenState: () => false,
    onWindowFullscreenStateChange(listener: (fullscreen: boolean) => void) {
      notifyFullscreen = listener;
      return () => {
        notifyFullscreen = undefined;
      };
    },
  });
  const settings = getClientSettings();
  cleanup.defer(() => __setClientSettingsForTests(settings));
  __setClientSettingsForTests({ ...settings, silkWindowFrame: true });
  await using screen = await render(
    <AppSidebarLayout>
      <SidebarInset className="h-dvh">
        <button type="button">Workspace action</button>
      </SidebarInset>
    </AppSidebarLayout>,
  );

  const workspace = screen.container.querySelector<HTMLElement>("[data-slot=sidebar-wrapper]")!;
  const content = screen.container.querySelector<HTMLElement>("[data-slot=sidebar-inset]")!;
  const sidebar = screen.container.querySelector<HTMLElement>("[data-slot=sidebar-container]")!;
  const frameInset = () => getComputedStyle(workspace).getPropertyValue("--app-shell-frame-inset");
  const control = screen.getByRole("button", { name: "Toggle main sidebar" });
  await expect.element(control).toBeVisible();
  expect(frameInset()).toBe("8px");
  expect(workspace.getBoundingClientRect().top).toBe(8);
  expect(content.getBoundingClientRect().bottom).toBe(791);
  expect(sidebar.getBoundingClientRect().bottom).toBe(791);
  expect(sidebar.getBoundingClientRect().left).toBe(9);
  expect(sidebar.contains(document.elementFromPoint(4, 300))).toBe(false);
  expect(control.element().getBoundingClientRect().left).toBeGreaterThan(90);

  await userEvent.click(control);
  expect(workspace.dataset.sidebarState).toBe("collapsed");
  await userEvent.click(control);
  expect(workspace.dataset.sidebarState).toBe("expanded");

  await act(() => notifyFullscreen?.(true));
  expect(frameInset()).toBe("8px");
  expect(workspace.getBoundingClientRect().top).toBe(8);
  expect(control.element().getBoundingClientRect().left).toBeLessThan(90);
  await act(() => notifyFullscreen?.(false));
  expect(frameInset()).toBe("8px");
  expect(control.element().getBoundingClientRect().left).toBeGreaterThan(90);

  const persist = vi.fn(async () => {});
  await act(() => persistClientSettingsPatch({ silkWindowFrame: false }, persist));
  expect(frameInset()).toBe("0px");
  expect(persist).toHaveBeenCalledExactlyOnceWith({ ...settings, silkWindowFrame: false });
  await act(() => persistClientSettingsPatch({ silkWindowFrame: true }, persist));
  root.dataset.themeId = "grove";
  expect(frameInset()).toBe("0px");
  root.removeAttribute("data-theme-id");
  root.classList.remove("dark");
  expect(frameInset()).toBe("0px");
  root.classList.add("dark");
  await page.viewport(767, 800);
  await vi.waitFor(() => expect(frameInset()).toBe("0px"));

  await page.viewport(768, 800);
  await screen.rerender(
    <AppSidebarLayout>
      <SidebarInset className="h-dvh" />
      <AppRouteModal label="Settings">
        <button type="button">Modal action</button>
      </AppRouteModal>
    </AppSidebarLayout>,
  );
  const modal = page.getByRole("dialog", { name: "Settings" });
  await expect.element(modal).toBeVisible();
  expect(frameInset()).toBe("8px");
  expect(getComputedStyle(modal.element().parentElement!).borderLeftWidth).toBe("8px");
  await userEvent.click(page.getByRole("button", { name: "Modal action" }));
});
