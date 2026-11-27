import {
  EnvironmentId,
  ProjectId,
  ProviderDriverKind,
  ProviderInstanceId,
  ThreadId,
  UsageLimitSourceId,
  type ScopedThreadRef,
  type ThreadPullRequestLink,
} from "@t3tools/contracts";
import { deriveLatestContextWindowSnapshot } from "@t3tools/client-runtime/state/context-window";
import { AsyncResult, Atom } from "effect/reactivity";
import { expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

const SCRATCH_ROOT = "/home/user/.t3/scratch";

const state = vi.hoisted(() => ({
  workspaceRoot: "",
  folder: "",
  pullRequests: [] as unknown[],
  configLoaded: true,
}));

// The read of t3.json is a cache: a re-read is the only way to see what is on disk now.
const t3File = vi.hoisted(() => ({
  disk: "",
  cached: "",
  listeners: new Set<() => void>(),
}));

vi.mock(import("~/components/files/projectFilesQueryState"), async (importOriginal) => {
  const actual = await importOriginal();
  const { useSyncExternalStore } = await import("react");
  return {
    ...actual,
    useProjectFileQuery: ((_environmentId: unknown, _cwd: string, relativePath: string | null) => {
      const contents = useSyncExternalStore(
        (listener) => {
          t3File.listeners.add(listener);
          return () => t3File.listeners.delete(listener);
        },
        () => t3File.cached,
      );
      const refresh = () => {
        t3File.cached = t3File.disk;
        for (const listener of t3File.listeners) listener();
      };
      const data =
        relativePath === "t3.json" && contents !== ""
          ? { relativePath, contents, byteLength: contents.length, truncated: false }
          : null;
      return {
        data,
        error: null,
        isPending: false,
        readError: null,
        isNotFile: false,
        isFile: data !== null,
        refresh,
      };
    }) as never,
  };
});

vi.mock(import("~/state/entities"), async (importOriginal) => ({
  ...(await importOriginal()),
  useProject: ((ref: unknown) =>
    ref === null
      ? null
      : {
          id: "project",
          environmentId: "environment",
          title: state.workspaceRoot === SCRATCH_ROOT ? "No project" : "plain",
          workspaceRoot: state.workspaceRoot,
          scripts: [],
        }) as never,
  useProjects: (() => []) as never,
  useQuietThreadShell: ((ref: unknown) =>
    ref === null
      ? null
      : {
          id: "thread",
          environmentId: "environment",
          projectId: "project",
          worktreePath: state.folder,
          branch: null,
          pullRequests: state.pullRequests,
        }) as never,
  useServerConfigs: (() =>
    new Map(
      state.configLoaded
        ? [
            [
              EnvironmentId.make("environment"),
              {
                scratchWorkspaceRoot: SCRATCH_ROOT,
                environment: { capabilities: { pullRequests: true } },
              },
            ],
          ]
        : [],
    )) as never,
}));
// Neither folder is a repository, which is what the server reports for both.
vi.mock(import("~/state/vcs"), async (importOriginal) => {
  const actual = await importOriginal();
  const notARepo = Atom.make(
    AsyncResult.success({
      isRepo: false,
      hasPrimaryRemote: false,
      isDefaultRef: false,
      refName: null,
      hasWorkingTreeChanges: false,
      workingTree: { files: [], insertions: 0, deletions: 0 },
      hasUpstream: false,
      aheadCount: 0,
      behindCount: 0,
      aheadOfDefaultCount: 0,
      pr: null,
    }),
  );
  return {
    ...actual,
    vcsEnvironment: { ...actual.vcsEnvironment, status: (() => notARepo) as never },
  };
});

import { render } from "../../../test/render";
import { getClientSettings, updateClientSettings } from "../../hooks/useSettings";
import { useRightPanelStore } from "../../rightPanelStore";
import { PopoverCreateHandle } from "../ui/popover";
import { ChatCanvasContext } from "./ChatCanvasContext";
import { resolveChatCanvasLayout } from "./chatCanvasLayout";
import { ThreadDetailsPanel } from "./ThreadDetailsPanel";
import type { ThreadDetailsUsageInput } from "./ThreadDetailsUsage";

const threadRef: ScopedThreadRef = {
  environmentId: EnvironmentId.make("environment"),
  threadId: ThreadId.make("thread"),
};
const container = { width: 1200, height: 800 };
const placement = { x: 908, y: 0, right: 12, width: 280, height: 400 } as const;
const linkedPullRequest: ThreadPullRequestLink = {
  host: "github.com",
  repository: "pingdotgg/t3code",
  number: 27513,
  url: "https://github.com/pingdotgg/t3code/pull/27513",
  source: "manual",
  linkedAt: "2026-10-30T00:00:00.000Z",
  snapshot: null,
  stack: null,
};

function setup(input: {
  workspaceRoot: string;
  folder: string;
  pullRequests?: ThreadPullRequestLink[];
  configLoaded?: boolean;
}) {
  state.configLoaded = input.configLoaded ?? true;
  state.workspaceRoot = input.workspaceRoot;
  state.folder = input.folder;
  state.pullRequests = input.pullRequests ?? [];
  useRightPanelStore.setState({ threadPanelVisibilityByThreadKey: {} });
  const anchor = document.createElement("div");
  document.body.append(anchor);
  return {
    anchor: { current: anchor },
    handle: PopoverCreateHandle(),
    [Symbol.dispose]: () => anchor.remove(),
  };
}

const machines = (["This Mac", "Server"] as const).map((label, index) => ({
  environmentId: EnvironmentId.make(index === 0 ? "environment" : "other"),
  projectId: ProjectId.make("project"),
  label,
  isPrimary: index === 0,
  machine: "server" as const,
}));

function Panel({
  fixture,
  draftEnvMode,
  onMachines = false,
  withScripts = false,
  usage = {
    providerInstanceId: null,
    model: null,
    providers: [],
    sources: [],
    contextWindow: null,
  },
}: {
  fixture: ReturnType<typeof setup>;
  /** Renders an unsent draft in this mode instead of a started thread. */
  draftEnvMode?: "local" | "worktree";
  onMachines?: boolean;
  withScripts?: boolean;
  usage?: ThreadDetailsUsageInput;
}) {
  const noop = () => {};
  const scriptResult = async () => ({ ok: true }) as never;
  return (
    <ChatCanvasContext
      value={{
        container,
        lane: { padding: 48, minChatWidth: 640 },
        layout: resolveChatCanvasLayout({ container, preview: null }),
        previewKey: null,
        registerTimeline: noop,
        measureDetailsCard: noop,
        detailsCardTopInset: 0,
        preferredDetailsCard: placement,
        detailsCardPlacement: placement,
      }}
    >
      <ThreadDetailsPanel
        anchor={fixture.anchor}
        handle={fixture.handle}
        environmentId={threadRef.environmentId}
        threadId={threadRef.threadId}
        projectId={ProjectId.make("project")}
        composerDraftTarget={threadRef}
        worktreePath={draftEnvMode === undefined ? state.folder : null}
        isServerThread={draftEnvMode === undefined}
        activeProjectName={state.workspaceRoot === SCRATCH_ROOT ? "No project" : "plain"}
        activeProjectScripts={withScripts ? [] : undefined}
        preferredScriptId={null}
        keybindings={[]}
        availableEditors={[]}
        showOpenInPicker={false}
        openInShortcutEnabled={false}
        gitCwd={state.folder}
        workspaceMutationId={null}
        isGitRepo={false}
        offersWorkspaceModes={false}
        envLocked={draftEnvMode === undefined}
        availableEnvironments={onMachines ? machines : []}
        {...(onMachines ? { onEnvironmentChange: noop } : {})}
        onEnvModeChange={noop}
        envMode={draftEnvMode ?? "local"}
        startFromOrigin={false}
        onStartFromOriginChange={noop}
        onComposerFocusRequest={noop}
        onRunProjectScript={noop}
        onAddProjectScript={scriptResult}
        onUpdateProjectScript={scriptResult}
        onDeleteProjectScript={scriptResult}
        usage={usage}
      />
    </ChatCanvasContext>
  );
}

it("drills into context and quota details without replacing the inspector's 12-item menu", async () => {
  using fixture = setup({ workspaceRoot: "/project", folder: "/project" });
  const original = getClientSettings();
  using _settings = {
    [Symbol.dispose]: () =>
      updateClientSettings({
        threadDetailsItems: original.threadDetailsItems,
        threadDetailsUsageEnabled: original.threadDetailsUsageEnabled,
      }),
  };
  const instanceId = ProviderInstanceId.make("spotlight-provider");
  const providerWindow = {
    id: "session",
    kind: "session",
    label: "Session quota",
    usedPercent: 25,
  } as const;
  const updatedAt = "2026-10-30T11:59:00Z";
  const usage: ThreadDetailsUsageInput = {
    providerInstanceId: instanceId,
    model: null,
    contextWindow: deriveLatestContextWindowSnapshot([], {
      updatedAt,
      usedTokens: 165_000,
      maxTokens: 1_000_000,
      autoCompactThreshold: 800_000,
    }),
    providers: [
      {
        instanceId,
        driver: ProviderDriverKind.make("codex"),
        enabled: true,
        installed: true,
        version: null,
        status: "ready",
        auth: { status: "authenticated" },
        checkedAt: updatedAt,
        models: [],
        slashCommands: [],
        skills: [],
        usageLimits: { checkedAt: updatedAt, windows: [providerWindow] },
      },
    ],
    sources: [
      {
        id: UsageLimitSourceId.make("spotlight-http"),
        kind: "http",
        label: "HTTP quotas",
        checkedAt: updatedAt,
        accounts: [],
        quotaAccounts: [
          {
            id: "account",
            label: "API account",
            providerInstanceId: instanceId,
            windows: [{ id: "monthly", kind: "monthly", label: "HTTP quota", usedPercent: 85 }],
          },
        ],
      },
    ],
  };
  await using screen = await render(<Panel fixture={fixture} usage={usage} />);
  const card = screen.getByRole("region", { name: "Thread details" });
  await card.click({ button: "right" });
  await expect.element(page.getByText("Show in thread details")).toBeVisible();
  expect(page.getByRole("menuitemcheckbox").all()).toHaveLength(12);
  await page.getByRole("menuitemcheckbox", { name: "Context window" }).click();
  await page.getByRole("menuitemcheckbox", { name: "Usage limits" }).click();
  await userEvent.keyboard("{Escape}");

  const contextRow = screen.getByRole("button", { name: /^Context:/ });
  const quotaRow = screen.getByRole("button", { name: /^Session quota:/ });
  const back = screen.getByRole("button", { name: "Back", exact: true });
  await contextRow.click();
  await expect.element(screen.getByRole("heading", { name: "Context & Quotas" })).toBeVisible();
  await expect.element(back).toHaveFocus();
  await expect
    .element(screen.getByRole("meter", { name: "Context window" }))
    .toHaveAttribute("aria-valuenow", "17");
  await expect
    .element(screen.getByRole("meter", { name: "Session quota" }))
    .toHaveAttribute("aria-valuenow", "75");
  await expect
    .element(screen.getByRole("meter", { name: "HTTP quota" }))
    .toHaveAttribute("aria-valuenow", "15");
  await expect
    .element(screen.getByRole("link", { name: "Open usage" }))
    .toHaveAttribute("href", "/usage");
  await back.click();
  await expect.element(contextRow).toHaveFocus();

  await quotaRow.click();
  await expect.element(back).toBeVisible();
  await back.click();
  await expect.element(quotaRow).toHaveFocus();
  await card.click({ button: "right" });
  expect(page.getByRole("menuitemcheckbox").all()).toHaveLength(12);
  await page.getByRole("menuitem", { name: "Reset to default" }).click();
  await expect.element(contextRow).not.toBeInTheDocument();
  await expect.element(quotaRow).not.toBeInTheDocument();
});

it("offers no git controls in a No project thread, but shows its linked pull request", async () => {
  using fixture = setup({
    workspaceRoot: SCRATCH_ROOT,
    folder: `${SCRATCH_ROOT}/thread`,
    pullRequests: [linkedPullRequest],
  });
  await using _screen = await render(<Panel fixture={fixture} />);
  await expect.element(page.getByText("#27513")).toBeVisible();
  await expect
    .element(page.getByRole("button", { name: "Initialize Git" }))
    .not.toBeInTheDocument();
});

it("shows Current checkout where no worktree can come from, even when New worktree is the default", async () => {
  using fixture = setup({ workspaceRoot: SCRATCH_ROOT, folder: SCRATCH_ROOT });
  await using _screen = await render(<Panel fixture={fixture} draftEnvMode="worktree" />);
  await expect.element(page.getByLabelText("Run context: Current checkout")).toBeVisible();
  await expect.element(page.getByRole("button", { name: /Run context/ })).not.toBeInTheDocument();
});

it("offers only machines where no worktree can come from and several machines exist", async () => {
  using fixture = setup({ workspaceRoot: SCRATCH_ROOT, folder: SCRATCH_ROOT });
  await using _screen = await render(
    <Panel fixture={fixture} draftEnvMode="worktree" onMachines />,
  );
  await page.getByRole("button", { name: "Run context: This Mac, Current checkout" }).click();
  await expect.element(page.getByText("Run on")).toBeVisible();
  await expect.element(page.getByText("New worktree")).not.toBeInTheDocument();
});

it("shows a linked pull request in a folder that is not a git repository", async () => {
  using fixture = setup({
    workspaceRoot: "/work/plain",
    folder: "/work/plain",
    pullRequests: [linkedPullRequest],
  });
  await using _screen = await render(<Panel fixture={fixture} />);
  await expect.element(page.getByRole("region", { name: "Workspace" })).toBeVisible();
  await expect.element(page.getByText("#27513")).toBeVisible();
  await expect.element(page.getByRole("button", { name: "Initialize Git" })).toBeVisible();
});

it("offers no Initialize Git before the server config says where No project lives", async () => {
  using fixture = setup({
    workspaceRoot: SCRATCH_ROOT,
    folder: `${SCRATCH_ROOT}/thread`,
    configLoaded: false,
  });
  await using _screen = await render(<Panel fixture={fixture} />);
  await expect.element(page.getByRole("region", { name: "Workspace" })).toBeVisible();
  await expect
    .element(page.getByRole("button", { name: "Initialize Git" }))
    .not.toBeInTheDocument();
});

it("lists the t3.json actions on disk when the actions menu opens again after the file changed", async () => {
  using fixture = setup({ workspaceRoot: "/work/plain", folder: "/work/plain" });
  const t3Json = (name: string) =>
    JSON.stringify({ scripts: [{ name, command: `npm run dev -- --port ${name.slice(-4)}` }] });
  t3File.disk = t3Json("Dev 4100");
  t3File.cached = t3File.disk;
  await using _screen = await render(<Panel fixture={fixture} withScripts />);

  const chooser = page.getByRole("button", { name: "Choose project action" });
  await chooser.click();
  await expect.element(page.getByRole("menuitem", { name: /Dev 4100/ })).toBeVisible();
  await chooser.click();
  await expect.element(page.getByRole("menu")).not.toBeInTheDocument();

  // A setup hook rewrites this checkout's t3.json outside T3 Code.
  t3File.disk = t3Json("Dev 4200");

  await chooser.click();
  await expect.element(page.getByRole("menuitem", { name: /Dev 4200/ })).toBeVisible();
});
