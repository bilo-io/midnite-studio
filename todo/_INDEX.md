# midnite-git — Phase Index

Design source of truth: [`../docs/INITIAL_PLAN.md`](../docs/INITIAL_PLAN.md).
Completed work is logged append-only in [`done.md`](done.md). Deferred scope lives in
[`outstanding.md`](outstanding.md).

| Phase | Doc | Status |
|-------|-----|--------|
| 0 | [Scaffold](phase-0-scaffold.md) | ⬜ |
| 1 | [Shared contracts + git-engine exec/parsers](phase-1-contracts-and-parsers.md) | ⬜ |
| 2 | [Lane layout engine](phase-2-lane-layout.md) | ⬜ |
| 3 | [Electron shell boots](phase-3-electron-shell.md) | ⬜ |
| 4 | [Repo open/list + worktree sidebar](phase-4-repos-and-worktrees.md) | ⬜ |
| 5 | [Commit graph, read-only](phase-5-commit-graph.md) | ⬜ |
| 6 | [Status / stage / commit / sync panel](phase-6-status-and-sync.md) | ⬜ |
| 7 | [Graph interactions](phase-7-graph-interactions.md) | ⬜ |
| 8 | [Drag-drop ops + conflicts](phase-8-drag-drop-ops.md) | ⬜ |
| 9 | [Integrated terminal + keybindings](phase-9-terminal-and-keybindings.md) | ⬜ |
| 10 | [Watcher / live refresh](phase-10-watcher.md) | ⬜ |
| 11 | [Packaging + docs](phase-11-packaging.md) | ⬜ |

## Conventions

- One phase per PR where practical; update this table + `done.md` as work lands.
- Every phase ends green on `moon run :typecheck :lint :test` plus its own verification list.
- Visual phases (3–9) capture a screenshot as part of verification.
