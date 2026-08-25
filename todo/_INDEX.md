# midnite-git — Phase Index

**Headline:** nothing built yet — the plan is seeded (see [`../docs/INITIAL_PLAN.md`](../docs/INITIAL_PLAN.md)); Phase 0 (scaffold) is the live frontier.

Completed work is logged append-only in [`done.md`](done.md). Deferred scope lives in [`outstanding.md`](outstanding.md).

## Phases

<!-- Newest-first. Status: ✅ DONE · 🔄 WIP · ◻ TODO. Done = checked/total in-scope items; Progress = 10-cell bar. -->

| Phase | Status | Done | Progress | % | 🔄 WIP | ◻ TODO |
|-------|--------|------|----------|---|--------|--------|
| [11 · Packaging + docs](phase-11-packaging.md) | ◻ TODO | 0/12 | `░░░░░░░░░░` | 0% | — | A |
| [10 · Watcher / live refresh](phase-10-watcher.md) | ◻ TODO | 0/9 | `░░░░░░░░░░` | 0% | — | A |
| [9 · Integrated terminal + keybindings](phase-9-terminal-and-keybindings.md) | ◻ TODO | 0/11 | `░░░░░░░░░░` | 0% | — | A |
| [8 · Drag-drop ops + conflicts](phase-8-drag-drop-ops.md) | ◻ TODO | 0/10 | `░░░░░░░░░░` | 0% | — | A |
| [7 · Graph interactions](phase-7-graph-interactions.md) | ◻ TODO | 0/10 | `░░░░░░░░░░` | 0% | — | A |
| [6 · Status / stage / commit / sync](phase-6-status-and-sync.md) | ◻ TODO | 0/11 | `░░░░░░░░░░` | 0% | — | A |
| [5 · Commit graph, read-only](phase-5-commit-graph.md) | ◻ TODO | 0/11 | `░░░░░░░░░░` | 0% | — | A |
| [4 · Repo open/list + worktree sidebar](phase-4-repos-and-worktrees.md) | ◻ TODO | 0/10 | `░░░░░░░░░░` | 0% | — | A |
| [3 · Electron shell boots](phase-3-electron-shell.md) | ◻ TODO | 0/15 | `░░░░░░░░░░` | 0% | — | A |
| [2 · Lane layout engine](phase-2-lane-layout.md) | ◻ TODO | 0/10 | `░░░░░░░░░░` | 0% | — | A |
| [1 · Shared contracts + git-engine parsers](phase-1-contracts-and-parsers.md) | ◻ TODO | 0/14 | `░░░░░░░░░░` | 0% | — | A |
| [0 · Scaffold](phase-0-scaffold.md) | ◻ TODO | 0/17 | `░░░░░░░░░░` | 0% | — | A |

## Theme key

<!-- Each phase currently carries a single theme A = its full deliverables checklist. Split into
     lettered themes if a phase gets parallelised. -->

### [Phase 11 — Packaging + docs](phase-11-packaging.md)

- ◻ **A** — electron-builder arm64, afterpack/install-local scripts, CI workflow, README/docs final

### [Phase 10 — Watcher / live refresh](phase-10-watcher.md)

- ◻ **A** — fs.watch repo watcher, own-write suppression, kind→invalidation map

### [Phase 9 — Integrated terminal + keybindings](phase-9-terminal-and-keybindings.md)

- ◻ **A** — pty-service (node-pty in main), xterm panel, Ctrl+` keybinding service + menu + footer bar

### [Phase 8 — Drag-drop ops + conflicts](phase-8-drag-drop-ops.md)

- ◻ **A** — merge/rebase/cherry-pick + sequencer, @dnd-kit gestures, conflict banner

### [Phase 7 — Graph interactions](phase-7-graph-interactions.md)

- ◻ **A** — context menus, checkout, branch/tag create, blast-radius-gated reset/delete

### [Phase 6 — Status / stage / commit / sync](phase-6-status-and-sync.md)

- ◻ **A** — stage/unstage/discard/commit, ahead-behind chips, fetch/pull/push (no force)

### [Phase 5 — Commit graph, read-only](phase-5-commit-graph.md)

- ◻ **A** — streaming log service, virtualized SVG rows, ref badges, detail stub

### [Phase 4 — Repo open/list + worktree sidebar](phase-4-repos-and-worktrees.md)

- ◻ **A** — repo registry + persistence, VSCode-style sidebar with nested worktrees, add/remove

### [Phase 3 — Electron shell boots](phase-3-electron-shell.md)

- ◻ **A** — frameless window, AppFrame/TitleBar/theme on @bilo-io/ui+shell, preload windowChrome bridge

### [Phase 2 — Lane layout engine](phase-2-lane-layout.md)

- ◻ **A** — straight-lane layout with recycling, LaneLayoutSession streaming, stable colors

### [Phase 1 — Shared contracts + git-engine parsers](phase-1-contracts-and-parsers.md)

- ◻ **A** — zod domain/IPC contracts, dugite exec + write queue, NUL-delimited parsers, smoke script

### [Phase 0 — Scaffold](phase-0-scaffold.md)

- ◻ **A** — proto/moon/pnpm skeleton, four packages, boundary lint rules, GH Packages auth proven

## Conventions

- One phase per PR where practical; claim a theme in the `🔄 WIP` column (commit to `main`) before branching; update this table + `done.md` as work lands.
- Every phase ends green on `moon run :typecheck :lint :test` plus its own verification list.
- Visual phases (3–9) capture a screenshot as part of verification.
