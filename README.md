<p align="center">
  <img src="./assets/y3code/logo.svg" width="96" height="96" alt="Y3 Code logo" />
</p>

<h1 align="center">Y3 Code</h1>

<p align="center">One workspace for the coding agents you already use.</p>

<p align="center">
  <a href="#run-from-source">Run from source</a> ·
  <a href="#connect-an-agent">Connect an agent</a> ·
  <a href="./docs/README.md">Upstream documentation</a>
</p>

**Y3 Code is an independent, unofficial fork of [T3 Code](https://github.com/pingdotgg/t3code).** It is not affiliated with or endorsed by T3 Tools, Inc.

Y3 Code brings coding-agent conversations, project files, and Git work into one workspace. Use the agent and account you already have. Y3 Code is not a model provider and does not require Codey or any other specific agent.

## What you can do

- **Work with multiple agents.** Use Codex, Claude Code, and other supported providers, or add a local agent that speaks the Agent Client Protocol (ACP).
- **Keep tasks separate.** Use Git worktrees for parallel changes and review diffs before committing.
- **Pick up work from another machine.** The server runs agents where the repository lives. The desktop or web client connects to that environment.

## Run from source

This repository is currently source-first. Official T3 Code downloads, package-manager commands, and mobile apps are **not** Y3 Code releases.

Install [Vite+](https://viteplus.dev/guide/) (the `vp` command), then:

```bash
git clone https://github.com/yaoshining/y3code.git
cd y3code
vp i
vp run dev
```

Open the pairing URL printed by the dev runner. For the desktop development app, run `vp run dev:desktop` instead. The [development runbook](./docs/operations/00_development.md#first-checkout) covers prerequisites and troubleshooting. It still uses upstream naming and build paths.

## Connect an agent

Install and sign in to at least one supported agent on the machine running Y3 Code. In **Settings → Providers**, select an existing provider or add a **Local ACP command**. The [provider guide](./docs/user/providers-acp.md) explains the ACP setup, and the [permission guide](./docs/user/permission-modes.md) explains which permissions the client can request. Individual agents may enforce additional restrictions.

## Project and upstream

- Report Y3 Code-specific issues in [this repository](https://github.com/yaoshining/y3code/issues).
- See the [architecture overview](./docs/internals/01_architecture.md) for how clients and execution environments fit together.
- The source code is distributed under the [MIT License](./LICENSE). Upstream names and marks belong to their respective owners; see the [upstream branding policy](./TRADEMARK.md).
