# Midnite Git — Phase Index

**Headline:** **[18](phase-18-footer-monitor-diagnostics.md)** is the next frontier — the footer bar's empty right half becomes a live system monitor (CPU/RAM/GPU/disk, sparklines inline and area-chart timelines in a flyout) alongside per-repo lint counts, gated behind an explicit per-repository trust prompt because running a repo's own linter is the first arbitrary code execution this app would do. **[17](phase-17-repos-workbench.md)** turns the repositories sidebar into a workbench — per-worktree change counts, menus on everything, a whole-checkout diff in a tab strip, and the app's first forge integration (Actions + Reviews through the user's own `gh`). The MVP (phases 0–11) is landed — the app packages, installs and runs from /Applications. Three phases are open at once: **[12](phase-12-commit-inspector.md)** makes the commit graph a place you can read and act in (its diffs and its remote model have landed), **[14](phase-14-graph-themes.md)** makes the graph itself configurable, and **[15](phase-15-multi-terminal-sessions.md)** turns the single terminal into several — shells and coding agents, persisted across restarts. **[16](phase-16-explorer-and-settings-pages.md)** has landed its five themes — a read-only Folder explorer with a preview pane, and Settings split into pages (including an Agent page into `~/.claude`) — with only its real-app manual verification open. Post-MVP scope lives in [`outstanding.md`](outstanding.md).

Completed work is logged append-only in [`done.md`](done.md). Deferred scope lives in [`outstanding.md`](outstanding.md).

## Phases

<!-- Newest-first. Status: ✅ DONE · 🔄 WIP · ◻ TODO. Done = checked/total in-scope items; Progress = 10-cell bar. -->

| Phase | Status | Done | Progress | % | 🔄 WIP | ◻ TODO |
|-------|--------|------|----------|---|--------|--------|
| [18 · Footer system monitor + repo diagnostics](phase-18-footer-monitor-diagnostics.md) | ◻ TODO | 0/54 | `░░░░░░░░░░` | 0% | — | A B C D E F |
| [17 · Repositories workbench + forge](phase-17-repos-workbench.md) | 🔄 WIP | 46/48 | `█████████░` | 96% | — | 2 manual checks |
| [16 · Folder explorer, preview pane + settings pages](phase-16-explorer-and-settings-pages.md) | 🔄 WIP | 34/36 | `█████████░` | 94% | — | manual verification |
| [15 · Multi-terminal sessions + agents](phase-15-multi-terminal-sessions.md) | 🔄 WIP | 38/39 | `█████████░` | 97% | — | manual relaunch check |
| [14 · Graph themes + avatars](phase-14-graph-themes.md) | ✅ DONE | 28/28 | `██████████` | 100% | — | — |
| [13 · UI polish](phase-13-ui-polish.md) | ✅ DONE | 26/26 | `██████████` | 100% | — | — |
| [12 · Commit inspector + live badges](phase-12-commit-inspector.md) | 🔄 WIP | 15/51 | `███░░░░░░░` | 29% | A B C F | — |
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

### [Phase 18 — Footer system monitor + repo diagnostics](phase-18-footer-monitor-diagnostics.md)

*The footer's empty right half becomes the app's live-state strip. A and B are the spine — C, D
and F all read the sample stream they push; E is the trust boundary F prompts through.*

- ◻ **A** — darwin metric probes in main (`vm_stat`, `ioreg`, `os.cpus()` deltas, `statfs`), each
  a pure parser behind a thin `execFile`, with a self-disabling GPU probe
- ◻ **B** — `mgit:metrics:*` contract: an all-optional `MetricSample`, a one-way sample stream,
  and an adaptive sampler that stops on window blur
- ◻ **C** — metrics store with flat-seeded ring buffers, a data-colour palette, geometry-as-data,
  and hand-rolled area chart + sparkline
- ◻ **D** — the first real click-toggled popover primitive, plus the footer's right cluster:
  dot, percentage and sparkline per metric
- ◻ **E** — the diagnostics trust policy, written down: per-repo opt-in, a `repoId`-only channel,
  a configurable command, and a total eslint-JSON parser
- ◻ **F** — the diagnostics segment (absent ≠ zero, sidebar-selection-driven) and a Monitor &
  Diagnostics settings page

### [Phase 17 — Repositories workbench + forge](phase-17-repos-workbench.md)

*The sidebar stops being a read-mostly tree. A is the spine — B, C and the "View all changes"
buttons all read the per-checkout status it fetches; E is the surface D and F open into.*

- ✅ **A** — per-worktree `git status` via `useQueries`, the accent change-count pill on
  worktrees, branches and the collapsed repo row
- ✅ **B** — the Changes view filters the tree to checkouts that have changes, with a visible,
  reversible toggle
- ✅ **C** — context menu + hover ellipsis on every actionable node; destructive verbs behind a
  danger-themed confirm (blast radius for commits, named warnings for everything else)
- ✅ **D** — "View all changes": a per-file accordion diff of one checkout, lazy per file,
  expand/collapse all with a stated cap
- ✅ **E** — the workbench tab strip; the Changes view becomes a tabbed content area with a
  permanent working-tree tab
- ✅ **F** — `mgit:forge:*` over the user's own `gh` CLI: Actions and Reviews sections, run and
  PR tabs, and the `ChecksVerdict` producer that `outstanding.md` had been waiting for

*Open: two manual passes — the packaged-app screenshots (Electron will not start in a
non-interactive session) and the `gh`-availability matrix.*

### [Phase 16 — Folder explorer, preview pane + settings pages](phase-16-explorer-and-settings-pages.md)

*The app grows real pages: a read-only Folder view with a preview pane, and Settings split into four pages behind an inner sidebar — including an Agent page into `~/.claude`. B is the spine (the fs IPC + path jail); C/D/E all read through it; A is independent chrome.*

- ✅ **A** — nav rail regrouped (Folder above Graph, Settings pinned bottom) + the settings page shell (merged 2026-08-26)
- ✅ **B** — read-only `mgit:fs:*` IPC with a path-confinement jail (repo root + `~/.claude`) and a jailed `mgit-file://` protocol (merged 2026-08-26)
- ✅ **C** — lazy repo file tree, dotfiles shown, gitignored dimmed and collapsed (merged 2026-08-26)
- ✅ **D** — preview pane: shiki code, rendered markdown w/ source toggle, images/PDF/media, fallback card (merged 2026-08-26)
- ✅ **E** — Agent settings page: `~/.claude` tree + preview, Claude version card, Update streams / Uninstall pastes into the terminal (merged 2026-08-26)

*Open: the two real-app manual verification passes (media/PDF in the packaged renderer).*

### [Phase 15 — Multi-terminal sessions + agents](phase-15-multi-terminal-sessions.md)

*Several terminals at once — shells and coding agents — in a VS Code-style sidebar, surviving a restart with their scrollback. A is the spine: B/C/D all render what A persists. E is independent and also covers the repos sidebar.*

- ✅ **A** — session record + capped scrollback in main; `terminal:*` channels; agent roster with an `agents.json` override
- ✅ **B** — per-session renderer model; multi-xterm host; the cwd-change kill effect deleted (fixes a dead pane)
- ✅ **C** — maximize chevron and the `+` → New Terminal / New Agent menu
- ✅ **D** — the session sidebar, dockable left/right, with a Claude mark for agent sessions
- ✅ **E** — drag-to-reorder via `@dnd-kit/sortable`, for terminals *and* repos
- ✅ **verification** — pty/terminal schema sweep, a fake pty that talks back, nine e2e specs and
  both screenshots; found and fixed two ptys per terminal, self-reviving restored sessions, and an
  `agentId`/`kind` pairing the schema documented but never enforced. One manual item is left for a
  human: quit, relaunch, and confirm `ps` shows no surviving shells

### [Phase 12 — Commit inspector + live badges](phase-12-commit-inspector.md)

*Turns Phase 5's detail stub into a real inspector, and ref badges into controls. **A is now unblocked** — E landed, so `#123` resolves; B/D pair; C and F are independent.*

- ◻ **A** — markdown + linkify commit bodies: clickable SHAs, URLs, `#123`, emails, trailer styling
- ◻ **B** — inspector rebuild: sha header + copy button, tree ⇄ list toggle, parent navigation, drop the duplicate stat block
- ◻ **C** — ref badges as controls: subtle `isHead` glow, hover-expand pull/push with tooltips, branch-scoped sync in the context menu
- ✅ **D** — real diffs: `mgit:commit:file-diff` channel, hunk parser, one restrained `<DiffView>` shared with the status panel (branch `feature/phase-12-diffs`)
- ✅ **E** — `Remote` domain type, `listRemotes`, ssh/https URL normaliser, guarded `shell:open-external` (2026-08-26)
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
