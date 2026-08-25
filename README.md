# midnite-git

A GitKraken-inspired desktop git client. Plain Electron + typed IPC, Vite + React renderer,
built on the published [`@bilo-io/ui`](https://github.com/bilo-io/midnite-ui) design system.

**Design source of truth:** [`docs/INITIAL_PLAN.md`](docs/INITIAL_PLAN.md).
**Progress tracker:** [`todo/`](todo/) — one checklist per phase + append-only `done.md`.

## Product pillars

1. **Interactive commit graph** — colored branch lanes; drag branch→branch to merge, drag+menu
   rebase, double-click checkout, right-click create branch/tag, drag commit→branch cherry-pick,
   right-click reset (soft/mixed/hard).
2. **Worktree view** (VSCode SCM-style) — multi-repo sidebar with worktrees nested under each repo,
   per-worktree changes, stage/commit, sync (fetch/pull/push).
3. **Toggleable integrated terminal** in a footer bar — button + `Ctrl+`` on all platforms.

## Prerequisites

- [proto](https://moonrepo.dev/proto) — `proto use` installs the pinned node/pnpm/moon (Phase 0).
- A GitHub PAT (classic) with **`read:packages`** exported as `GITHUB_PACKAGES_TOKEN` —
  GitHub Packages requires auth even for public packages:

  ```sh
  export GITHUB_PACKAGES_TOKEN=ghp_...   # read:packages scope
  ```

## Executing the plan

Work phase by phase from `todo/phase-0-scaffold.md` upward. Each phase is PR-sized, has its own
verification checklist, and appends an entry to `todo/done.md` when it lands. Read
`docs/INITIAL_PLAN.md` in full before Phase 0 — it carries the architecture, IPC contract,
data model, and the verified research constraints (licensing, registry auth, ABI notes) that
the phases assume.
