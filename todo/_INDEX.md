# Midnite Git — Phase Index

**Headline:** **[20](phase-20-reviews-page.md)** is the newest frontier, and its read half has
landed: a Reviews page joins the nav rail — a PR list filterable by state/author/search, beside a
tabbed PR detail (Files/Conversation/Checks) — and diffs across the whole app are now
syntax-highlighted through the one `DiffView` shared by Reviews, Changes and Graph. Left ahead:
Themes E/F/G, which — deliberately reversing Phase 17/19's read-only-forge rule for PR review
specifically — will let you approve, request changes, comment (inline or top-level) and merge
without leaving the app. **[19](phase-19-dashboard-actions-tests.md)** is the previous *landed*
frontier — the nav rail stops being three views and becomes the app's table of contents. Its forge half is now deep enough to triage from — issues in the sidebar, and a job tree under each failed run — and the **Dashboard has landed**: a `react-grid-layout` board of widgets over one repo's history, contributors, PRs, issues and runs, all scoped together by one author filter; an **Actions** view with job trees and logs; and a **Tests** view that discovers each repo's suites and — trusted per suite, riding the same runner 18's diagnostics generalised into `process-runner.ts` — runs them, with a live output stream and parsed pass/fail counts. Three manual passes remain, all needing a packaged app or a large real repository. **[18](phase-18-footer-monitor-diagnostics.md)** has landed both halves — the footer bar's empty right half is now a live system monitor (CPU/RAM/GPU/disk as dot, percentage and sparkline, opening into area-chart timelines over the app's first real popover primitive), and beside it per-repo lint counts gated behind an explicit per-repository trust prompt, because running a repo's own linter is the first arbitrary code execution this app does. Three human passes remain. **[17](phase-17-repos-workbench.md)** turns the repositories sidebar into a workbench — per-worktree change counts, menus on everything, a whole-checkout diff in a tab strip, and the app's first forge integration (Actions + Reviews through the user's own `gh`). The MVP (phases 0–11) is landed — the app packages, installs and runs from /Applications. **[12](phase-12-commit-inspector.md)** has landed **all six themes** — the commit graph is now a place you can read and act in: the inspector, real diffs, the remote model, ref badges that act, and rows that read at two densities; only two manual passes remain, both needing a packaged app or a real remote. Still open: **[14](phase-14-graph-themes.md)** makes the graph itself configurable, and **[15](phase-15-multi-terminal-sessions.md)** turns the single terminal into several — shells and coding agents, persisted across restarts. **[16](phase-16-explorer-and-settings-pages.md)** is **done** — a read-only Folder explorer with a preview pane, and Settings split into pages (including an Agent page into `~/.claude`), with both real-app manual passes signed off; a follow-up has since made that settings sidebar grouped and collapsible, and given Appearance the side-navigation control that reaches the rail's third mode. Post-MVP scope lives in [`outstanding.md`](outstanding.md).

Completed work is logged append-only in [`done.md`](done.md). Deferred scope lives in [`outstanding.md`](outstanding.md).

## Phases

<!-- Newest-first. Status: ✅ DONE · 🔄 WIP · ◻ TODO. Done = checked/total in-scope items; Progress = 10-cell bar. -->

| Phase | Status | Done | Progress | % | 🔄 WIP | ◻ TODO |
|-------|--------|------|----------|---|--------|--------|
| [20 · Reviews page & unified diff syntax highlighting](phase-20-reviews-page.md) | 🔄 WIP | 24/40 | `██████░░░░` | 60% | — | E F G |
| [19 · Dashboard, Actions and Tests as views](phase-19-dashboard-actions-tests.md) | 🔄 WIP | 73/76 | `██████████` | 96% | — | 3 manual checks |
| [18 · Footer system monitor + repo diagnostics](phase-18-footer-monitor-diagnostics.md) | 🔄 WIP | 51/54 | `█████████░` | 94% | — | 3 manual checks |
| [17 · Repositories workbench + forge](phase-17-repos-workbench.md) | 🔄 WIP | 46/48 | `█████████░` | 96% | — | 2 manual checks |
| [16 · Folder explorer, preview pane + settings pages](phase-16-explorer-and-settings-pages.md) | ✅ DONE | 41/41 | `██████████` | 100% | — | — |
| [15 · Multi-terminal sessions + agents](phase-15-multi-terminal-sessions.md) | 🔄 WIP | 38/39 | `█████████░` | 97% | — | manual relaunch check |
| [14 · Graph themes + avatars](phase-14-graph-themes.md) | ✅ DONE | 28/28 | `██████████` | 100% | — | — |
| [13 · UI polish](phase-13-ui-polish.md) | ✅ DONE | 26/26 | `██████████` | 100% | — | — |
| [12 · Commit inspector + live badges](phase-12-commit-inspector.md) | 🔄 WIP | 10/12 | `████████░░` | 83% | — | 2 manual checks |
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

### [Phase 20 — Reviews page & unified diff syntax highlighting](phase-20-reviews-page.md)

*Reviews grows from a sidebar-section stub into a full nav-rail view, and diffs finally get syntax
colour. A is the shell (same `VIEW_FILTERS` mechanism Actions/Tests already use); B and C are the
two read surfaces (list, then detail); D is the highlighting pass shared by every diff surface in
the app; E, F and G are the phase's one deliberate write path — approve/request-changes/comment/
merge, kept in a new `gh-write.ts` so `gh-cli.ts`'s "strictly reads" comment stays true.*

- ✅ **A** — Reviews joins the nav rail as a first-class view, reusing the `VIEW_FILTERS` mechanism
  Actions/Tests already established, hidden for repos with no GitHub remote (landed 2026-08-27)
- ✅ **B** — PR list filterable across every state (open/draft/merged/closed) plus author and
  search, not just the open-only list Phase 17 fetches today; the sidebar section and dashboard
  widget keep asking for open-only via a `state` request param (landed 2026-08-27)
- ✅ **C** — PR detail grows Files/Conversation/Checks tabs, reusing the existing hunk parser for
  PR diffs rather than a second parser — plus a `pull-detail` channel for the head sha no listing
  carries, and Checks matching that sha against the cached run listing rather than costing a
  third subprocess (landed 2026-08-27)
- ✅ **D** — syntax highlighting wired into the one shared `DiffView`, reusing Phase 16's
  already-installed, theme-synced `shiki` highlighter, so Reviews/Changes/Graph render diffs
  identically; deferred per-row through `requestIdleCallback` and cached module-level so it never
  competes with the virtualized scroll path (landed 2026-08-27)
- *(follow-up)* A and B landed against `main` as it stood before Theme C existed; a rebase
  integration mounted `PrDetail` beside the list — a resizable split matching `ActionsView`'s,
  with a new `reviews-store.ts` carrying a sidebar-selected PR number into the view
  (landed 2026-08-27)
- ◻ **E** — inline diff-line comment threads, right-side (added/context) lines only for v1 — the
  phase's highest-unknown piece
- ◻ **F** — the phase's one deliberate write path: approve/request-changes/comment/merge (with a
  blast-radius confirm), in a new `gh-write.ts` kept separate from the read-only `gh-cli.ts`
- ◻ **G** — reviewer re-request, draft→ready, re-run checks

### [Phase 19 — Dashboard, Actions and Tests as views](phase-19-dashboard-actions-tests.md)

*The nav rail becomes the app's table of contents. A is the shell every other theme renders into;
B and C are the two data layers (local history, and a deeper `gh`); D, E and F are the three
surfaces; G is the one piece that waits on someone else.*

- ✅ **A** — `ViewId` grows to seven, Dashboard rides `NavConfig.pinned` (ungrouped, above the
  sections), Actions/Tests join the rail, and one `VIEW_FILTERS` table reshapes the sidebar on two
  axes — sections and dirty-only — folding Phase 17's Changes filter in rather than leaving it a
  parallel one-off, with a "show all sections" escape hatch (landed 2026-08-26)
- ✅ **B** — `git-engine/src/stats/`: one `--all` history pass feeding a local-timezone commit
  calendar, contributors by email, opt-in churn, and repo health — cached on a digest of every
  ref tip rather than HEAD, because an `--all` traversal changes when any branch moves
  (landed 2026-08-26)
- ✅ **C** — forge deepening through the existing `gh` wrapper: `gh issue list`,
  `gh run view --json jobs`, `gh run view --log`, plus `gh workflow list` for the `.yml` paths a
  run listing never carries — and an Issues sidebar section with a job peek under each run
  (landed 2026-08-26)
- ✅ **D** — the dashboard: a `react-grid-layout` v2 board with theme-token overrides, a widget
  registry that gates on the repo's data sources, per-repo persisted layout, and one board-wide
  author filter every widget reads (landed 2026-08-26)
- ✅ **E** — the Actions view: runs sectioned by workflow **id** (a name is whatever `name:` says
  this morning), a job/step tree with only the failed jobs expanded, one whole-run log fetch split
  in the renderer, a virtualised ANSI pane whose folding changes which rows *exist*, and
  Open-in-GitHub for anything stateful (landed 2026-08-26)
- ✅ **F** — Tests discovery: suites parsed from package.json/moon/vitest/playwright configs,
  monorepo-aware, classified by kind, with "run in terminal" and **no** new trust surface
  (landed 2026-08-27)
- ✅ **G** — real suite execution through a generalised `process-runner.ts` (shared with 18E's
  diagnostics), per-suite trust, `--reporter=json` parsing with an exit-code-plus-raw-output
  fallback, and a live output stream (landed 2026-08-27)

*Open: three human passes — the dashboard against a large real repository, the Actions view
against a real failing matrix run, and `react-grid-layout`'s stylesheet in both themes. All seven
themes are otherwise landed.*

### [Phase 18 — Footer system monitor + repo diagnostics](phase-18-footer-monitor-diagnostics.md)

*The footer's empty right half becomes the app's live-state strip. A and B are the spine — C, D
and F all read the sample stream they push; E is the trust boundary F prompts through.*

- ✅ **A** — darwin metric probes in main (`vm_stat`, `ioreg`, `os.cpus()` deltas, `statfs`), each
  a pure parser behind a thin `execFile`, with a self-disabling GPU probe (landed 2026-08-26)
- ✅ **B** — `mgit:metrics:*` contract: an all-optional `MetricSample`, a one-way sample stream,
  and an adaptive sampler that stops on window blur (landed 2026-08-26)
- ✅ **C** — metrics store with a time-windowed, flat-seeded buffer, a data-colour palette,
  geometry-as-data, and a hand-rolled area chart + sparkline with a cadence-change rule
  (landed 2026-08-26)
- ✅ **D** — the first real click-toggled popover primitive, plus the footer's slot-based right
  cluster: dot, percentage and sparkline per metric (landed 2026-08-26)
- ✅ **E** — the diagnostics trust policy, written down: per-repo opt-in, a `repoId`-only channel,
  a configurable command, a ranked parser-gated detector registry and a total, *streaming*
  eslint-JSON parser (landed 2026-08-26)
- ✅ **F** — the diagnostics segment (absent ≠ zero, sidebar-selection-driven) and a Monitor &
  Diagnostics settings page, now genuinely built on Theme E's contract: the `contract-shim.ts`
  F compiled against while E was in flight is deleted, and the duplicate `diag` mock the rebase
  left shadowing E's is folded into one (landed 2026-08-26)

*Open: three human passes — cross-checking the readings against Activity Monitor, the idle
battery cost over an hour, and the diagnostics fail-soft matrix (Theme E). Also noted while
landing D: `graph-themes.spec.ts` has twelve pre-existing failures on `main` (a stale
`link`/`button` locator for Settings, plus cross-test ordering the timeout was masking) —
Phase 14's, not this phase's.*

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

*Closed: both real-app manual verification passes done by the user on 2026-08-26 — the
phase is complete.*

- ✅ **F** (follow-up) — the settings sidebar becomes grouped and collapsible (General / Tools /
  System, one glyph per page), and Appearance gains the side-navigation control that exposes the
  rail's third mode (merged 2026-08-26)

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

*Phase 5's detail stub is now a real inspector, its badges are controls, and its rows read at two densities. **All six themes have landed**; two manual passes remain, both needing a packaged app or a real remote.*

- ✅ **A** — markdown + linkify commit bodies: clickable SHAs, URLs, `#123`, emails, trailer styling (2026-08-26)
- ✅ **B** — inspector rebuild: sha header + copy button, tree ⇄ list toggle, parent navigation, `stat` dropped from the wire, `repo:rev-parse` + `clipboard:write-text` channels (2026-08-26)
- ✅ **C** — ref badges as controls: `isHead` glow, hover-expand pull/push with real-count tooltips, branch-scoped sync in the context menu (2026-08-26)
- ✅ **D** — real diffs: `mgit:commit:file-diff` channel, hunk parser, one restrained `<DiffView>` shared with the status panel (branch `feature/phase-12-diffs`)
- ✅ **E** — `Remote` domain type, `listRemotes`, ssh/https URL normaliser, guarded `shell:open-external` (2026-08-26)
- ✅ **F** — graph row polish: lane-accent selection bar, a CVD-safe palette (+ the `laneInk` bug it exposed), badge width cap, row density, working-copy row (2026-08-26)

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
