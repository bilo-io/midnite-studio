# Midnite Git — Phase Index

**Headline:** the MVP (phases 0–11) is landed — the app packages, installs and runs from /Applications. Three phases are open at once: **[12](phase-12-commit-inspector.md)** makes the commit graph a place you can read and act in (only its diffs have landed), **[14](phase-14-graph-themes.md)** makes the graph itself configurable, and **[15](phase-15-multi-terminal-sessions.md)** turns the single terminal into several — shells and coding agents, persisted across restarts. Post-MVP scope lives in [`outstanding.md`](outstanding.md).

Completed work is logged append-only in [`done.md`](done.md). Deferred scope lives in [`outstanding.md`](outstanding.md).

## Phases

<!-- Newest-first. Status: ✅ DONE · 🔄 WIP · ◻ TODO. Done = checked/total in-scope items; Progress = 10-cell bar. -->

| Phase | Status | Done | Progress | % | 🔄 WIP | ◻ TODO |
|-------|--------|------|----------|---|--------|--------|
| [15 · Multi-terminal sessions + agents](phase-15-multi-terminal-sessions.md) | 🔄 WIP | 7/37 | `██░░░░░░░░` | 19% | — | B C D E |
| [14 · Graph themes + avatars](phase-14-graph-themes.md) | ✅ DONE | 28/28 | `██████████` | 100% | — | — |
| [13 · UI polish](phase-13-ui-polish.md) | ✅ DONE | 26/26 | `██████████` | 100% | — | — |
| [12 · Commit inspector + live badges](phase-12-commit-inspector.md) | 🔄 WIP | 9/51 | `██░░░░░░░░` | 18% | — | A B C E F |
| [11 · Packaging + docs](phase-11-packaging.md) | ✅ DONE | 12/12 | `██████████` | 100% | — | — |
| [10 · Watcher / live refresh](phase-10-watcher.md) | ✅ DONE | 9/9 | `██████████` | 100% | — | — |
| [9 · Integrated terminal + keybindings](phase-9-terminal-and-keybindings.md) | ✅ DONE | 11/11 | `██████████` | 100% | — | — |
| [8 · Drag-drop ops + conflicts](phase-8-drag-drop-ops.md) | ✅ DONE | 10/10 | `██████████` | 100% | — | — |
| [7 · Graph interactions](phase-7-graph-interactions.md) | ✅ DONE | 10/10 | `██████████` | 100% | — | — |
| [6 · Status / stage / commit / sync](phase-6-status-and-sync.md) | ✅ DONE | 11/11 | `██████████` | 100% | — | — |
| [5 · Commit graph, read-only](phase-5-commit-graph.md) | ✅ DONE | 11/11 | `██████████` | 100% | — | — |
| [4 · Repo open/list + worktree sidebar](phase-4-repos-and-worktrees.md) | ✅ DONE | 10/10 | `██████████` | 100% | — | — |
| [3 · Electron shell boots](phase-3-electron-shell.md) | ✅ DONE | 15/15 | `██████████` | 100% | — | — |
| [2 · Lane layout engine](phase-2-lane-layout.md) | ✅ DONE | 10/10 | `██████████` | 100% | — | — |
| [1 · Shared contracts + git-engine parsers](phase-1-contracts-and-parsers.md) | ✅ DONE | 14/14 | `██████████` | 100% | — | — |
| [0 · Scaffold](phase-0-scaffold.md) | ✅ DONE | 17/17 | `██████████` | 100% | — | — |

## Theme key

<!-- Each phase currently carries a single theme A = its full deliverables checklist. Split into
     lettered themes if a phase gets parallelised. -->

### [Phase 15 — Multi-terminal sessions + agents](phase-15-multi-terminal-sessions.md)

*Several terminals at once — shells and coding agents — in a VS Code-style sidebar, surviving a restart with their scrollback. A is the spine: B/C/D all render what A persists. E is independent and also covers the repos sidebar.*

- ✅ **A** — session record + capped scrollback in main; `terminal:*` channels; agent roster with an `agents.json` override
- ◻ **B** — per-session renderer model; multi-xterm host; the cwd-change kill effect deleted (fixes a dead pane)
- ◻ **C** — maximize chevron and the `+` → New Terminal / New Agent menu
- ◻ **D** — the session sidebar, dockable left/right, with a Claude mark for agent sessions
- ◻ **E** — drag-to-reorder via `@dnd-kit/sortable`, for terminals *and* repos

### [Phase 12 — Commit inspector + live badges](phase-12-commit-inspector.md)

*Turns Phase 5's detail stub into a real inspector, and ref badges into controls. **E before A** (issue links need remotes); B/D pair; C and F are independent.*

- ◻ **A** — markdown + linkify commit bodies: clickable SHAs, URLs, `#123`, emails, trailer styling
- ◻ **B** — inspector rebuild: sha header + copy button, tree ⇄ list toggle, parent navigation, drop the duplicate stat block
- ◻ **C** — ref badges as controls: subtle `isHead` glow, hover-expand pull/push with tooltips, branch-scoped sync in the context menu
- ✅ **D** — real diffs: `mgit:commit:file-diff` channel, hunk parser, one restrained `<DiffView>` shared with the status panel (branch `feature/phase-12-diffs`)
- ◻ **E** — `Remote` domain type, `listRemotes`, ssh/https URL normaliser, guarded `shell:open-external`
- ◻ **F** — graph row polish: selection treatment, lane contrast, badge/subject width, row density

### [Phase 14 — Graph themes + avatars](phase-14-graph-themes.md)

*Four selectable graph styles, avatars in the commit bubble, and the Settings view to hold the picker. A is the spine — B/C/D all render through it.*

- ✅ **A** — `GraphTheme` descriptor + four styles; theme-driven `graph-svg`
- ✅ **B** — Gravatar avatars in the node, generated fallback; Author column deleted
- ✅ **C** — dedicated BRANCH / TAG column, `graphColumns` migration
- ✅ **D** — author filter (dim, never remove); shared multi-select menu
- ✅ **E** — Settings view + live style picker, plus the shell's appearance runtime

### [Phase 13 — UI polish](phase-13-ui-polish.md)

- ✅ **A** — lucide, motion keyframes, applyMotion, Tooltip, IconButton, cascade
- ✅ **B** — use-resizable + ResizeHandle, persisted ui-store, four resizable panes
- ✅ **C** — TreeSection, per-repo collapsible Local/Remotes/Tags/Worktrees, icon overhaul
- ✅ **D** — lockable nav rail (navMode persisted, pin in the brand slot)
- ✅ **E** — theme toggle + sync cluster in the title bar, three dead CommandIds wired
- ✅ **F** — graph column headers, resizable columns, multi-select branch filter
- ✅ **G** — cascading fade-in, view cross-fade, once-per-stream graph fade

### [Phase 11 — Packaging + docs](phase-11-packaging.md)

- ✅ **A** — electron-builder arm64, afterpack/install-local scripts, CI workflow, README/docs final

### [Phase 10 — Watcher / live refresh](phase-10-watcher.md)

- ✅ **A** — fs.watch repo watcher, own-write suppression, kind→invalidation map

### [Phase 9 — Integrated terminal + keybindings](phase-9-terminal-and-keybindings.md)

- ✅ **A** — pty-service (node-pty in main), xterm panel, Ctrl+` keybinding service + menu + footer bar

### [Phase 8 — Drag-drop ops + conflicts](phase-8-drag-drop-ops.md)

- ✅ **A** — merge/rebase/cherry-pick + sequencer, @dnd-kit gestures, conflict banner

### [Phase 7 — Graph interactions](phase-7-graph-interactions.md)

- ✅ **A** — context menus, checkout, branch/tag create, blast-radius-gated reset/delete

### [Phase 6 — Status / stage / commit / sync](phase-6-status-and-sync.md)

- ✅ **A** — stage/unstage/discard/commit, ahead-behind chips, fetch/pull/push (no force)

### [Phase 5 — Commit graph, read-only](phase-5-commit-graph.md)

- ✅ **A** — streaming log service, virtualized SVG rows, ref badges, detail stub

### [Phase 4 — Repo open/list + worktree sidebar](phase-4-repos-and-worktrees.md)

- ✅ **A** — repo registry + persistence, VSCode-style sidebar with nested worktrees, add/remove

### [Phase 3 — Electron shell boots](phase-3-electron-shell.md)

- ✅ **A** — frameless window, AppFrame/TitleBar/theme on @bilo-io/ui+shell, preload windowChrome bridge

### [Phase 2 — Lane layout engine](phase-2-lane-layout.md)

- ✅ **A** — straight-lane layout with recycling, LaneLayoutSession streaming, stable colors

### [Phase 1 — Shared contracts + git-engine parsers](phase-1-contracts-and-parsers.md)

- ✅ **A** — zod domain/IPC contracts, dugite exec + write queue, NUL-delimited parsers, smoke script

### [Phase 0 — Scaffold](phase-0-scaffold.md)

- ✅ **A** — proto/moon/pnpm skeleton, four packages, boundary lint rules, GH Packages auth proven

## Conventions

- One phase per PR where practical; claim a theme in the `🔄 WIP` column (commit to `main`) before branching; update this table + `done.md` as work lands.
- Every phase ends green on `moon run :typecheck :lint :test` plus its own verification list.
- Visual phases (3–9) capture a screenshot as part of verification.
