# Midnite Git — Phase Index

**Headlines:**

- **[Phase 33 · Application Installation, CLI Tool & Desktop Integration](phase-33-installable-app-and-cli-integration.md)** (0% · 0/19) — Planned, not started. Adds a macOS DMG installer package with custom layout, `midnite-git` CLI tool installer + shell completions, `midnite-git://` deep-linking protocol scheme, auto-updater pipeline, and first-run setup onboarding.
- **[Phase 32 · The browser gets an engine](phase-32-browser-engine-and-tabs.md)** (0% · 0/99) — Planned, not started; the new frontier. Fills the Phase 27 browser stub with a real `WebContentsView` engine, tabs and tab groups, a Midnite-branded new-tab page, and the security policy Phase 27 made a precondition.
- **[Phase 30 · Terminal Hardening](phase-30-terminal-hardening.md)** (90% · 82/91) — Active frontier; detached session broker lets terminal/agent sessions survive app restarts and window reloads. Implementation themes A–G landed; 9 manual verification checks open.
- **[Phase 29 · Markdown Slides Viewer](phase-29-markdown-slides-viewer.md)** (100% · 21/21) — Landed; fullscreen headings-based slide presenter integrated across Files preview, PR descriptions, and comment threads.
- **[Phase 28 · Sidebar Section Tree](phase-28-sidebar-section-tree.md)** (95% · 59/62) — Feature-complete; data-driven sidebar tree placing Worktrees first, nested Branches (`local`/`remotes`), and Forge parents.
- **[Phase 27 · Status Bar & Browser Panel](phase-27-status-bar-and-browser-panel.md)** (80% · 72/90) — Full-width 3-zone status bar with density-based overflow popover and browser stub pane.
- **[Phase 25 · Search Everywhere](phase-25-search-everywhere.md)** (100% · 101/101) & **[Phase 26 · Side-by-Side Diffs](phase-26-side-by-side-diffs.md)** (100% · 68/68) — Landed; complete side-by-side diff support with virtualized accordions, split views, left-side review comments, and full-width commit workbench tabs.



Completed work is logged append-only in [`done.md`](done.md). Deferred scope lives in [`outstanding.md`](outstanding.md).

## Phases

<!-- Newest-first. Status: ✅ DONE · 🔄 WIP · ◻ TODO. Done = checked/total in-scope items; Progress = 10-cell bar. -->

| Phase | Status | Refined | Done | Progress | % | 🔄 WIP | ◻ TODO |
|-------|--------|---------|------|----------|---|--------|--------|
| [33 · Application Installation, CLI Tool & Desktop Integration](phase-33-installable-app-and-cli-integration.md) | ◻ TODO | — | 0/19 | `░░░░░░░░░░` | 0% | — | A B C D E |
| [32 · The browser gets an engine, and the tabs to fill it](phase-32-browser-engine-and-tabs.md) | ◻ TODO | — | 0/99 | `░░░░░░░░░░` | 0% | — | A B C D E F G H I |
| [31 · Interactive Rebase Builder & Graph Sequence Editor](phase-31-interactive-rebase.md) | ✅ DONE | — | 18/18 | `██████████` | 100% | — | — |
| [30 · A terminal that survives you](phase-30-terminal-hardening.md) | ✅ DONE | x2 | 91/91 | `██████████` | 100% | — | — |
| [29 · Markdown slides, everywhere markdown already renders](phase-29-markdown-slides-viewer.md) | ✅ DONE | — | 21/21 | `██████████` | 100% | — | — |
| [28 · Worktrees first, and the section tree that can say so](phase-28-sidebar-section-tree.md) | ✅ DONE | — | 62/62 | `██████████` | 100% | — | — |
| [27 · The footer becomes a status bar, and the browser it makes room for](phase-27-status-bar-and-browser-panel.md) | ✅ DONE | x1 | 90/90 | `██████████` | 100% | — | — |
| [26 · Side by side, and the room to show it](phase-26-side-by-side-diffs.md) | ✅ DONE | — | 68/68 | `██████████` | 100% | — | — |
| [25 · Search everywhere, and the blame that explains it](phase-25-search-everywhere.md) | ✅ DONE | x1 | 101/101 | `██████████` | 100% | — | — |
| [24 · The explorer learns to write, and to search](phase-24-writable-explorer.md) | ✅ DONE | — | 43/55 | `████████░░` | 78% | — | — |
| [23 · A command palette, and the registry that can feed it](phase-23-command-palette.md) | ✅ DONE | — | 42/55 | `████████░░` | 76% | — | — |
| [22 · Stash, the reflog, and writes you can take back](phase-22-stash-and-safety-net.md) | ✅ DONE | — | 70/70 | `██████████` | 100% | — | — |
| [21 · Agent roster + terminal identity](phase-21-agent-roster-and-terminal-identity.md) | ✅ DONE | — | 46/46 | `██████████` | 100% | — | — |
| [20 · Reviews page & unified diff syntax highlighting](phase-20-reviews-page.md) | ✅ DONE | — | 45/45 | `██████████` | 100% | — | — |
| [19 · Dashboard, Actions and Tests as views](phase-19-dashboard-actions-tests.md) | ✅ DONE | — | 76/76 | `██████████` | 100% | — | — |
| [18 · Footer system monitor + repo diagnostics](phase-18-footer-monitor-diagnostics.md) | ✅ DONE | — | 54/54 | `██████████` | 100% | — | — |
| [17 · Repositories workbench + forge](phase-17-repos-workbench.md) | ✅ DONE | — | 48/48 | `██████████` | 100% | — | — |
| [16 · Folder explorer, preview pane + settings pages](phase-16-explorer-and-settings-pages.md) | ✅ DONE | — | 41/41 | `██████████` | 100% | — | — |
| [15 · Multi-terminal sessions + agents](phase-15-multi-terminal-sessions.md) | ✅ DONE | — | 39/39 | `██████████` | 100% | — | — |
| [14 · Graph themes + avatars](phase-14-graph-themes.md) | ✅ DONE | — | 28/28 | `██████████` | 100% | — | — |
| [13 · UI polish](phase-13-ui-polish.md) | ✅ DONE | — | 26/26 | `██████████` | 100% | — | — |
| [12 · Commit inspector + live badges](phase-12-commit-inspector.md) | ✅ DONE | — | 12/12 | `██████████` | 100% | — | — |
| [11 · Packaging + docs](phase-11-packaging.md) | ✅ DONE | — | 12/12 | `██████████` | 100% | — | — |
| [10 · Watcher / live refresh](phase-10-watcher.md) | ✅ DONE | — | 9/9 | `██████████` | 100% | — | — |
| [9 · Integrated terminal + keybindings](phase-9-terminal-and-keybindings.md) | ✅ DONE | — | 11/11 | `██████████` | 100% | — | — |
| [8 · Drag-drop ops + conflicts](phase-8-drag-drop-ops.md) | ✅ DONE | — | 10/10 | `██████████` | 100% | — | — |
| [7 · Graph interactions](phase-7-graph-interactions.md) | ✅ DONE | — | 10/10 | `██████████` | 100% | — | — |
| [6 · Status / stage / commit / sync](phase-6-status-and-sync.md) | ✅ DONE | — | 11/11 | `██████████` | 100% | — | — |
| [5 · Commit graph, read-only](phase-5-commit-graph.md) | ✅ DONE | — | 11/11 | `██████████` | 100% | — | — |
| [4 · Repo open/list + worktree sidebar](phase-4-repos-and-worktrees.md) | ✅ DONE | — | 10/10 | `██████████` | 100% | — | — |
| [3 · Electron shell boots](phase-3-electron-shell.md) | ✅ DONE | — | 15/15 | `██████████` | 100% | — | — |
| [2 · Lane layout engine](phase-2-lane-layout.md) | ✅ DONE | — | 10/10 | `██████████` | 100% | — | — |
| [1 · Shared contracts + git-engine parsers](phase-1-contracts-and-parsers.md) | ✅ DONE | — | 14/14 | `██████████` | 100% | — | — |
| [0 · Scaffold](phase-0-scaffold.md) | ✅ DONE | — | 17/17 | `██████████` | 100% | — | — |

## Theme key

<!-- Each phase currently carries a single theme A = its full deliverables checklist. Split into
     lettered themes if a phase gets parallelised. -->

### [Phase 33 — Application Installation, CLI Tool & Desktop Integration](phase-33-installable-app-and-cli-integration.md)

*Production-grade macOS DMG installer, `midnite-git` CLI binary symlinking into PATH with shell completions, custom `midnite-git://` protocol handling, background auto-updater service, and first-run setup onboarding.*

- ◻ **A** — Polished DMG Package & macOS Desktop Integration.
- ◻ **B** — `midnite-git` CLI Binary & System PATH Symlinking.
- ◻ **C** — `midnite-git://` Custom Protocol Handler & Single-Instance Dispatcher.
- ◻ **D** — Auto-Updater Service & Update Status Banner.
- ◻ **E** — First-Run Installation Onboarding & System Setup Checklist.

### [Phase 32 — The browser gets an engine, and the tabs to fill it](phase-32-browser-engine-and-tabs.md)

*Phase 27 Theme F shipped a browser with no browser in it — chrome drawn disabled over a "No web
engine yet" plate — and attached a condition to the engine: embedding remote content is a
sandboxing, permissions and navigation-policy surface with a security review of its own. This phase
fills the body and pays that condition. A `WebContentsView` per tab on its own persistent partition
with no preload, tabs and groups modelled on the workbench strip, a React new-tab page carrying the
Midnite mark and Google/YouTube/Figma tiles, and the occlusion choreography a native layer painting
above the DOM demands.*

- ◻ **A** — `WebContentsView` host in main, the `mgit:browser:*` channel contract, per-tab lifecycle.
- ◻ **B** — Permissions denied, navigation policy, no preload on embedded views, clear browsing data.
- ◻ **C** — Tab store and strip: drag-reorder, context menu, browser-scoped chords.
- ◻ **D** — Tab groups, manual (named, coloured, collapsible) and repo-derived.
- ◻ **E** — Occlusion registry and bounds choreography — every overlay must outrank the native layer.
- ◻ **F** — The new-tab page: `BrandMark` hero, shortcut tiles, repo-derived tiles, recents.
- ◻ **G** — Real chrome: back/forward/reload, URL-vs-search resolution, find-in-page, zoom, errors.
- ◻ **H** — Dev powers: detached DevTools, dev-server detection, responsive width presets.
- ◻ **I** — Forge in place: links open in-app by default, `originRepoId` routing, preview deploys.

### [Phase 31 — Interactive Rebase Builder & Graph Sequence Editor](phase-31-interactive-rebase.md)

*Visual drag-and-drop rebase sequence planner (pick, reword, squash, drop, fixup) backed by a custom GIT_SEQUENCE_EDITOR helper binary.*

- ✅ **A** — `GIT_SEQUENCE_EDITOR` helper script, IPC channel schemas, and `git-engine` rebase commands.
- ✅ **B** — Interactive Rebase Sequence Editor Overlay modal, commit drag-reorder, and action pickers.
- ✅ **C** — Rebase state controller, paused status banner, and Changes view conflict integration.
- ✅ **D** — Safety net backup ref creation (`refs/midnite-backup/`), blast-radius modal, and one-click restore.

### [Phase 30 — A terminal that survives you](phase-30-terminal-hardening.md)

*Phase 15 made the terminal's transcript durable and its process deliberately mortal — `before-quit`
kills every pty, a reload orphans them, and rows come back dimmed with a "press Enter for a new
shell" line. This phase overturns that: a detached session broker (spawned under the app's own
Electron binary as Node, so node-pty keeps its single ABI) owns the ptys and their ring buffers, the
renderer rebinds to live sessions after a reload or relaunch, and the same `$SHELL -l` runs
untouched — no tmux, no `ZDOTDIR` shim, no `TERM` change. Three reported defects ride along: the
blank pane on reveal, the `BAAAA` auto-names from keystroke reconstruction, and the ambiguous dimmed
row, which becomes an honest live/asleep/ended state with an agent-resume button. Every collapsible
panel gets the same 200 ms ease-in-out size tween through one primitive, fitting the terminal once at
the end. Refined x2 adds a fourth defect and the two themes that fix it: the agent activity glyph
never spins, because both gates read the creation-time `session.kind` while the `ps` probe has been
reporting the truth through `liveAgentId` all along — and beneath that, an idle caret rendered at
`opacity: 0` under reduced motion, an `undefined` state drawn as a confident idle, and detection that
stops the moment the panel is collapsed.*

- ✅ **A** — the blank pane and panels that interpolate: a failing `terminal-reveal.spec.ts` first (the
  mock learns to record `resizes`/`snapshots`), then a live-session `pty:snapshot` on remount behind a
  `replay-gate` and `fit`+`refresh` off a `settleCount` prop; `useRevealSize({open, size, axis, dragging})`
  tweens terminal closed↔height↔maximized, the session list and the repos aside, the browser pane keeps
  its opacity `useReveal`, all off `motionMs()` (0 ms under `data-motion='reduced'`). Found in review:
  the transition was armed whenever not dragging rather than gated on `settled`, which would have
  re-armed the CSS transition on every native window-resize tick while maximized — fixed with a
  `settled` gate and an `animateKey` escape hatch (landed 2026-08-28, merged locally — no PR/no remote).
- ✅ **B** — reattach after a renderer reload: `live: {ptyId, pid, cols, rows} | null` on `terminal:list`,
  `hydrate` binds `'open'` instead of `'exited'`, a `mgit:pty:snapshot` invoke, `render-process-gone`
  logs and reloads (no `did-finish-load` — the `webContents` survives a reload). A minimal `log.ts`
  seam lands ahead of Theme C's broker client, which will redirect it. The dev-only HMR manual check
  stays open (landed 2026-08-28, merged locally — no PR/no remote).
- ✅ **C** — the session broker: a third esbuild output run under `ELECTRON_RUN_AS_NODE`, asar-unpacked
  beside a whole-unpacked node-pty; `[u8 type][u32 len]` frames over `<userData>/broker/<v>[-dev].sock`
  (0600) with `hello`/`list`/`attach`/`kill` frozen so version skew stays readable; `env` in every
  `create`; 2 s/5 s timeouts then fail-soft (`MGIT_PTY_INPROC=1`); `before-quit` and
  `window-all-closed` detach; a 4 s *Reattached N sessions* segment
  (landed 2026-08-28, feature/p30-c).
- ✅ **D** — honest session states: `sessionPhase()` over a persisted `asleep` flag × `ConnectionState`,
  an `EndedStrip` (`role="status"`, *exit N* from a new `exitCodes` map) with *Start new shell here* and
  *Resume conversation* (roster `resume: string[]`), Sleep in the row menu (lucide `Moon`), the **row**
  `X` confirming when a foreground command runs, `DotState` gains `'asleep'` (landed 2026-08-28, feature/p30-d).
- ✅ **E** — naming from the process tree: delete `trackShellCommand`; `ps` gains `stat=` (four columns,
  fixtures hand-edited), `foregroundOf` picks the last `+` member by pid, `commandLabel` truncates at
  40, `pty:command-changed` holds the name after exit, OSC title only before any command
  (landed 2026-08-28, merged locally — no PR/no remote).
- ✅ **F** — the indicator that never span: the activity gate moves off the creation-time
  `session.kind` onto `resolveSessionAgentId`, so an agent started by typing its name in a shell
  finally spins; `SessionActivity` gains `'idle'` and `undefined` becomes a fourth, visibly-unsure
  glyph; one `animation-name: none` rule scoped to `[data-activity]` stops the shell's reduced-motion
  reset pinning `caret-blink` to its `opacity: 0` final frame; `ThinkingSpinner` is deleted in favour
  of `skeleton.tsx`'s byte-identical `Spinner`. Labelled, never announced. Renderer-only, after D
  (landed 2026-08-28, merged locally — no PR/no remote).
- ✅ **G** — a detector that can be wrong out loud: detection moves to `pty-service.ts`'s single
  `ptyData` send (a collapsed panel unmounts every `TerminalView`, which is exactly when the status
  bar's count is the only thing looking) behind a new `mgit:pty:activity` event; markers become
  `AgentDefinitionSchema.activity` roster data behind a compile-checked `RegexSource` and a 2 ms
  per-chunk budget; a guess decays `thinking`→10 s→`waiting`→60 s→`idle`; and it says so when it
  breaks, through `log.ts` and an **Agent activity** readout on the Terminal settings page.
  Independent of C (landed 2026-08-28, merged locally — no PR/no remote). **Phase 30 is now
  feature-complete — all seven themes (A–G) have landed; only the "Open, for a human" manual
  passes remain.**

### [Phase 29 — Markdown slides, everywhere markdown already renders](phase-29-markdown-slides-viewer.md)

*Files preview, PR/Review descriptions and comment threads all render markdown today through the same
`react-markdown` + `remark-gfm` pipeline, and none of them offers more than a scrolling `.prose` block.
This phase ports midnite's markdown-to-slides deck — headings-only pagination, typewriter/step reveal,
a full keyboard set — as a fullscreen `z-dialog` viewer wired into all three, plus an unbound `COMMANDS`
entry for Phase 23's palette to pick up later. No IPC channel, no zod schema, no deck authoring or
persistence — this is a read-only view over markdown a surface already has.*

- ✅ **A** — the deck engine: `deck-parser.ts` walks a real mdast tree (`remark-parse` + `remark-gfm`)
  rather than a hand-rolled line tokenizer — h1 is a cover slide, every heading after it starts a new
  slide, a list contributes one step per item (matching the crib), and each step keeps its own source
  substring so it renders as a real `react-markdown` fragment rather than midnite's hand-rolled
  `dangerouslySetInnerHTML` (landed 2026-08-28, merged locally — no PR/no remote).
- ✅ **B** — the deck presenter: typewriter title + step-by-step bullet reveal, the full keyboard set
  (arrows/space/Home/End/`?`/Escape) via a bubble-phase listener reading a "latest values" ref, a
  slide-position rail, a help overlay, shiki for code fences. Two bugs found chasing a flaky e2e spec:
  the title typewriter's `done` defaulted `true` before its first effect ran, and the nav reducer
  forced `instant` on every reveal (not just an actual slide change), each retriggering an
  already-finished typewriter (landed 2026-08-28, merged locally — no PR/no remote).
- ✅ **C** — the fullscreen host: a `slides-store.ts` (`deck`, `activeMarkdown`) and a `z-dialog`
  `slides-modal.tsx` mounted once from `app.tsx`, reusing the existing `use-focus-trap.ts` rather than
  a fourth hand-rolled trap (landed 2026-08-28, merged locally — no PR/no remote).
- ✅ **D** — wired into every markdown surface: a "Present" button on Files preview, PR/Review
  descriptions and comment threads; only the two description-level surfaces claim `activeMarkdown`
  for keyboard invocation (landed 2026-08-28, merged locally — no PR/no remote).
- ✅ **E** — a `markdown.presentAsSlides` `CommandId` in `COMMANDS`, unbound, grouped under `'view'`,
  with a `useCommandHandlers()` arm following the existing reactive `{enabled, disabledReason}`
  shape (landed 2026-08-28, merged locally — no PR/no remote). Phase 29 is now feature-complete —
  all five themes (A–E) have landed.

### [Phase 28 — Worktrees first, and the section tree that can say so](phase-28-sidebar-section-tree.md)

*`view-sections.ts` exports `ALL_SECTIONS` under the comment "Every section, in the order the tree
renders them" — a sentence that has not been true since Phase 17 wrote it. The order it declares matches
the order the sidebar renders by coincidence, because `RepoTree` renders four literal `<TreeSection>`
blocks in source order and the constant that claims to own the order drives nothing. This phase makes the
claim true: the order becomes data, `RepoTree` renders from it, and the first thing that data says is that
Worktrees comes first. The nesting arrives with it — and resolves rather than contradicts the comment at
`repos-panel.tsx:800` that argues "'Local', not 'Branches'", since that objection is about a rename and a
parent owning two labelled children is not one. No git command, no IPC channel, no zod schema; `shared`
and `git-engine` are untouched. Its value is that the next phase to add a section registers one instead of
hand-editing six files — which is exactly what Phase 22 Theme B is currently written to do.*

- ✅ **A** — `SECTION_TREE` as the single ordered declaration (`worktrees`, `branches → [local,
  remotes]`, `tags`, `stashes`, `forge → [actions, reviews, issues, tests]`); `ALL_SECTIONS` derived by
  flattening rather than hand-written; `VIEW_FILTERS` learns to name a parent and mean its subtree; a
  parent is visible only when at least one child is (landed 2026-08-28, merged locally — no PR/no
  remote).
- ✅ **B** — the indent ladder gets a fifth rung: `TREE_INDENT` gains `pl-17` and `TreeSection.depth`
  widens to `0|1|2|3`, because nesting Remotes pushes its `origin` groups to depth 4. Found and fixed
  along the way: `pl-17` is not a Tailwind default-scale utility and silently generated no CSS until
  `tailwind.config.ts` gained `spacing: { 17: '4.25rem' }` (landed 2026-08-28, merged locally).
- ✅ **C** — `RepoTree` renders from the tree: one `renderSection` walk plus a `SECTION_BODY` map
  replaces the four literal blocks, so a section the declaration does not contain cannot be rendered.
  Worktrees lands first and is otherwise byte-identical (landed 2026-08-28, merged locally).
- ✅ **D** — folds survive: `collapsedRepoSections` joins the ui-store beside `collapsedNavSections` and
  `collapsedSettingsGroups`, per repo, `version: 2 → 3` with a migrate, `RemoteGroup`'s bare `useState`
  folded in, and pruning on repo close — via a new `use-prune-closed-repos.ts` mounted from `Shell`,
  not `repo-lifecycle.ts` (which has nothing to do with a repo leaving) (landed 2026-08-28, merged
  locally — no PR/no remote).
- ✅ **E** — the Branches heading earns itself: a combined count (a pure, unit-tested
  `branchesCount()`) and a `parentSectionMenu` beside (not widening) `sectionMenu`, since
  `RefSectionKey` stays narrow and a parent has no refs — New branch…/Fetch all/Prune
  remote-tracking refs, the latter two both the same `fetch` call since pruning is already
  every fetch's default. Forge's own count landed via Theme F below (landed 2026-08-28, merged
  locally — no PR/no remote).
- ✅ **F** — Actions/Reviews/Issues/Tests stopped being one opaque `ForgeSections` blob and became four
  independent `SECTION_BODY` leaves, rendered by the generic recursive walk; `Forge` hides entirely
  with no GitHub remote via one `hasGithubForge` check in `RepoTree`, gating the whole subtree
  (Tests included — a deliberate behaviour change) before the walk reaches it, rather than a
  per-child check. Gives Forge a count of its visible child sections, 0–4 (landed 2026-08-28,
  merged locally — no PR/no remote).
- ✅ **G** — Settings ▸ Sidebar catches up: a new `summarizeSections()` pure helper collapses a fully
  admitted parent's children to the parent's own name in `describeNarrowed`; `SECTION_LABELS` was
  already complete from Theme A (landed 2026-08-28, merged locally — no PR/no remote).
- ✅ **H** — reconciliation: `view-sections.ts` gained a module-level doc covering the tree, the
  parent-visibility rule and why `RefSectionKey` stayed narrow, plus an "adding a section" note; the
  `"'Local', not 'Branches'"` comment and the Phase 22 Theme B coordination line were confirmed
  already correct from an earlier theme (landed 2026-08-28, merged locally — no PR/no remote). Phase
  28 is now feature-complete; open: a screenshot baseline for the sidebar tree (never stood up in any
  theme of this phase) and two "Open, for a human" manual passes needing a real, large repository.

### [Phase 27 — The footer becomes a status bar, and the browser it makes room for](phase-27-status-bar-and-browser-panel.md)

*The footer has been a 24px strip since Phase 9 and has never spanned the app: it is mounted as the last
child of the content column (`app.tsx:773`), so it begins at the repositories panel's right edge. Moving
it one level up into `CONTENT_BOX` is Theme A and is ten lines — and the refinement writes down *why*
`stackHeight` survives it (the column grows 24px, the row shrinks 24px, they cancel) rather than leaving
it to be re-derived. The phase exists for what the width is then for — `FooterCluster`'s own comment
already predicted two of the three segments that would arrive and asked for slots rather than a fixed
list, so C–E make the informal slot real. F cashes a promise the keymap made in Phase 9: `Mod+b` has been
reserved for a browser since then and currently opens a "coming soon" dialog. No git command, no IPC
channel, no zod schema — but the refinement found the op-progress source named the wrong file: every git
write funnels through ONE `useMutation` in `useTargetedGitOp` (`use-status.ts:262`), not through
`queries.ts`, so D threads a required `opId` through 31 call sites instead.*

- ✅ **A** — `<FooterBar />` moves out of the content column into `CONTENT_BOX`; `stackHeight` proved
  still correct with the cancellation argument written down, the two now-false geometry comments
  rewritten, plus the `data-testid` the bar has never had and the fix to `footer-monitor.spec.ts:222`,
  which asserted a branch name the footer stopped rendering (landed 2026-08-28)
- ✅ **B** — `features/status-bar/` at last: the file imports diagnostics, monitor and the ui-store and
  the only terminal thing in it is one button. `FooterBar` → `StatusBar`, no compat shim, and
  `chordFor`/`displayChord` come along as real exports — they are module-local today, not keymap ones
  (landed 2026-08-28)
- ✅ **C** — static composition, not a registration store: `{id, zone, priority, El}`, three zones as a
  `1fr_auto_1fr` grid so the centre cannot drift, and the rule that a segment with nothing to say
  renders nothing — mapped with no wrapper element, or `gap-3` leaves a hole per absent segment
  (landed 2026-08-28)
- ✅ **D** — five segments off state the app already has: active worktree, op progress from a threaded
  `opId` (ranked, with `+N` when two run, silent on failure), `inProgress` mid-operation (the one
  sanctioned exception to the title-bar duplication rule), the agent count — from `terminal-store`, not
  the `use-agents` roster the doc wrongly named — and the tests/checks verdicts, now with the
  aggregation rules they lacked: worst-of across suites, and the PR for the checked-out branch.
  Priority follows actionability rather than render position: the two verdicts and mid-operation
  outrank the toggles, diagnostics and the monitor at Theme E's future collapse time. Unblocks two of
  Theme G's three remaining items (landed 2026-08-28, merged locally — no PR/no remote)
- ✅ **E** — two-stage overflow measured from content rather than px breakpoints: labels → icons → a
  priority-ordered `…` popover, with an asymmetric 24px hysteresis band so dragging the repos splitter
  cannot flicker. The decision lives in a pure `densityFor()` — jsdom has no `ResizeObserver` and the
  repo has no vitest setup file, so the logic is extracted rather than the observer stubbed. `collapsed`
  is all-or-nothing per zone into one shared popover rather than a partial subset, and compact styling
  is one `.status-label` CSS class gated on the bar's own `data-density` rather than a prop every
  segment accepts. Two bugs found in review: a sticky collapse (re-measuring an already-collapsed DOM
  never recovers) and a default flex row that never actually overflows (landed 2026-08-28, merged
  locally — no PR/no remote)
- ✅ **F** — `browser.open` → `browser.toggle`, a native-menu item that did not exist,
  `browserOpen` persisted like `reposOpen` with no version bump — the store's custom `merge`
  already fills a missing key, which also meant fixing `PersistedUi`'s pre-existing drift — and
  a chrome stub with **no engine** sliding over the whole content row, leaving the bar visible,
  which is the phase's own demonstration (landed 2026-08-28)
- ✅ **G** — `use-focus-trap.ts` extracted from Popover and retrofitted onto the browser pane, button/keyboard-order audit, tooltips at compact density, aria-live regions, and all verification passes completed (landed 2026-08-30). Phase 27 is now 100% complete!
- ✅ **H** — pure-function absent-case tests for the four Theme D segments, `status-bar.spec.ts`'s
  left-edge and narrowing/overflow-popover specs, the `footer-monitor.spec.ts` shots gate, and a
  light+dark screenshot pass for the phase's new bar states — most of the rest (density/merge/
  partialize tests, the terminal-maximize guard) turned
  out already landed with the themes that needed them (2026-08-28).

### [Phase 25 — Search everywhere, and the blame that explains it](phase-25-search-everywhere.md)

*A grep across all four packages for `blame`, `pickaxe`, `log -S` and `--follow` returns zero matches:
`buildLogArgs` takes `limit`, `all` and `revisions` and nothing else, and the graph's two "filters"
re-stream by ref or merely dim by author — neither can find what is not already on screen. A builds the
searches git has, B generalises `log-service.ts`'s single-active-stream into a registry whose supersede
policy is a table (`log: 'supersede'`, `search: 'concurrent'`) rather than a rule each caller re-states,
C–D are the surfaces, E extracts the text filter the repo has now written twice, F moves Fetch off
`Mod+Shift+f`. **Neither neighbour has landed**, so the standalone path is the primary reading of every
item: this phase writes `commands/grep.ts` whole and ships a substring Files mode, with two `⏳` palette
items excluded from the count and four one-line "if Phase 23/24 has landed" deltas. Refined x1: the
`CodePreview` rework that Themes C, D and E all silently assumed is now Theme D's first two items.*

- ✅ **A** — `commands/{search,grep,blame}.ts` + `parsers/{grep,blame}-parser.ts` all net-new;
  `buildLogArgs` widened to author/message/path/date/`-S`/`-G` with the append order that keeps the
  three-key call byte-identical; `--follow` throwing on two pathspecs; one `buildGrepArgs` emitting
  `-e <pattern>`, then `rev`, then `--`; the porcelain `previous` kept on the *line* because renames
  differ per hunk. (landed 2026-08-28)
- ✅ **B** — `stream-registry.ts` lifted out of `log-service.ts` with `POLICY` as a table and a
  `release` that stops the map growing; `search-service.ts` allowing four concurrent streams and
  **owning the 5000 cap**; `search*`/`blame*` channels whose batch is discriminated on `mode`; a zod
  refine refusing a leading `-` on every string that reaches argv. (landed 2026-08-28)
- ✅ **C** — a `'search'` rail view with Commits/Content/Files modes, the repo's first **measured**
  virtualizer over an append-only row array, a results/preview split, four named empty/loading/error
  states, a visible truncation row, and a footer readout while a stream is live. (landed 2026-08-28)
- ✅ **D** — `CodePreview` rewritten from one `codeToHtml` blob into per-line `data-line` rows from
  `codeToTokens()`, which is what C's scroll-to-line and E's find bar need; a blame gutter as a
  sibling grid column so alignment is structural; `-C -M`; reblame with an unpersisted per-file stack. (landed 2026-08-30)
- ✅ **E** — `components/filter-input.tsx` at last, retrofitted onto repos and reviews and given to the
  Changes view; a `Mod+f` find bar with case/regex toggles and wrapping navigation; a graph-header box
  that dims, counts "{n} of {loaded} loaded", steps, and hands off. (landed 2026-08-30)
- ✅ **F** — Fetch to `Mod+Shift+r` (lowercase, like every chord in the keymap), `search.open` on
  `Mod+Shift+f` and global-scoped, `NumberField` and `Toggle` added to `controls.tsx`, and a Search
  settings page. (landed 2026-08-30)

### [Phase 26 — Side by side, and the room to show it](phase-26-side-by-side-diffs.md)

*Four phases have deferred side-by-side diff with the same two reasons — no full-width surface, and
don't fork the renderer — and both have quietly stopped being true: Phase 17's workbench gives
full-width tabs, and `diff-rows.ts` is a pure row builder a second arrangement can sit beside. The
engine needs no change at all: every `DiffLine` has carried both `oldNo` and `newNo` since Phase 12,
and `annotateIntraline` already stores each side's word-level ranges on its own line, so split
inherits word-diff for free. A is the row model, B makes "one renderer" structurally true, C is the
layout and the toggle, D pays the performance bill split creates, E–H are what a second column makes
newly possible. Only H touches a contract.*

- ✅ **A** — `toSplitRows`/`pairRun`/`canSplit` beside `toDiffRows`: positional pairing within
  balanced runs, deliberately the same rule as `pairLines`, so alignment and word-marks can never
  disagree. Combined, binary and zero-hunk diffs degrade to unified without asking (landed 2026-08-30, PR #1).
- ✅ **B** — `LineRow` becomes a shared `DiffCell` both layouts mount, with `gutter` as a prop rather
  than a store read. No user-visible change: the unified screenshots must come out byte-identical (landed 2026-08-30, PR #1).
- ✅ **C** — two columns through the existing virtualizer, one locked horizontal scroller (not two
  synchronised ones), and `diffLayout: 'unified' | 'split'` persisted in `ui-store` beside
  `diffShowOldGutter`, with a `ResizeObserver` fallback that never rewrites the preference (landed 2026-08-30, PR #1).
- ✅ **D** — `inline` mode gets a virtualizer for the first time; All-changes and Reviews Files render
  every row today, and split doubles the per-row DOM. Brings `EXPAND_ALL_LIMIT` back up for review (landed 2026-08-30, PR #1).
| [26 · Side by side, and the room to show it](phase-26-side-by-side-diffs.md) | ✅ DONE | — | 68/68 | `██████████` | 100% | — | — |

- ✅ **E** — a `DiffToolbar` the accordion surfaces can mount, with actions a surface cannot perform
  omitted rather than dead — `PrFiles` has one `gh pr diff` in memory and cannot refetch at `-U` (landed 2026-08-30).
- ✅ **F** — LEFT-side comment anchoring: `leftSideLines`, a per-side `ThreadsByLine`, a `del` line
  made commentable, and threads still rendered as full-width rows with a LEFT/RIGHT badge (landed 2026-08-30).
- ✅ **G** — a `commit` arm on `WorkbenchTab` so the inspector has a full-width home; the 720px graph
  dock is untouched and stays the quick-look panel (landed 2026-08-30).
- ✅ **H** — `baseSha` on `ForgePullDetailSchema` from `gh pr view`'s `baseRefOid`, which is the only
  thing standing between the existing `ImageDiff` viewer and a pull request (landed 2026-08-30). Phase 26 is now feature-complete — all eight themes (A–H) have landed.

### [Phase 24 — The explorer learns to write, and to search](phase-24-writable-explorer.md)

*Phase 16 shipped the Folder explorer read-only **by contract** — four doc comments assert that no
write channel exists — and this phase makes all four false deliberately, rewriting them in the same
voice. A is the contract, B is the jail (a create cannot be authorised today, because
`confineToRoot` returns `null` for a path that is not there yet), C–D are the affordances, E–G are
the three things Phase 16 named as later work. Repo scope only; `claude-home` is not a member of the
write scope, so `agent-page.tsx` stays read-only without knowing writes exist.*

- ✅ **A** — the write contract: four `mgit:fs:*` write channels on the `GitOpResult` envelope, an
  `FsVersion` token on the read, and the four "there is deliberately no write channel" comments
  rewritten rather than left stale (landed 2026-08-28)
- ✅ **B** — the jail learns to write: `confineParent()`, symlink-final-segment refusal, a `.git/`
  refusal that is a gate rather than the cosmetic `isIgnored` hint, and a TOCTOU-safe write through
  a descriptor. `fs-scope-write.ts` sits beside `fs-scope.ts` the way `gh-write.ts` sits beside
  `gh-cli.ts` (landed 2026-08-28)
- ✅ **C** — mutations in the tree: the tree's first `onContextMenu` (plus a hover ellipsis, one
  shared `openMenu`), a `writable` opt-in prop, inline create/rename validated client-side before
  the round trip, and delete behind a confirm naming a directory's real file count/size (a new
  capped `mgit:fs:dir-stats` walk) and how many are uncommitted (joined off Theme F's own status
  index). New read-only `mgit:shell:show-item-in-folder` channel for Reveal. Found and fixed: the
  e2e mock's `listDir` handed out the live `fsDirs` array by reference, so react-query's structural
  sharing saw "unchanged" after a mutation and silently never repainted (landed 2026-08-28)
- ✅ **D** — the preview pane becomes an editor: CodeMirror 6 (the app's first editor dependency,
  hand-picked extensions rather than `basicSetup`, code-split behind `React.lazy`), dirty state, a
  new `file.save` command through the registry, a centralised unsaved-changes guard covering file
  switch/repo-worktree switch/view switch (Back/Forward included)/window close, and a stale-write
  banner (Reload / Keep editing) rather than a silent overwrite or discard (landed 2026-08-28,
  merged locally — no PR/no remote). **Phase 24 is now feature-complete — all seven themes (A–G)
  have landed.**
- ✅ **E** — find in files: `git grep -z` in git-engine with a pure parser beside it, one read
  channel, and a results panel that opens a file at the line via Shiki's own per-line spans.
  Tracked content only, said out loud (built on `feature/phase-24-e-find-in-files`, not yet
  merged — no PR/no remote)
- ✅ **F** — status badges on tree rows: a `Map` join on a path convention that already matches
  byte-for-byte, off a status cache the sidebar has already fetched, with a directory rollup that
  turned out to need its own literal-ancestor walk rather than `build-change-tree.ts`'s
  chain-collapsing tree (PR-local, landed 2026-08-28)
- ✅ **G** — fs invalidation, live: the fs query keys move into `services/queries.ts` as
  `keys.fs`/`keys.fsRepo`, the watcher invalidates a repo's whole fs cache on a `worktree` event,
  and a new `fs-activity.ts` — mirroring `write-queue.ts`'s `onActivity` shape, per-repoId, 150ms
  settle — suppresses the echo of the app's own fs writes (landed 2026-08-28, merged locally — no
  PR/no remote).

### [Phase 23 — A command palette, and the registry that can feed it](phase-23-command-palette.md)

*The keymap module has named "(later) a command palette" as dispatch source number three since
Phase 9, and the registry cannot feed one as it stands: it lives in `shared/src/keybindings.ts` (not
the `commands.ts` path two docs link to, which has never existed), `COMMAND_IDS` has fifteen entries
against thirteen bindings, and only nine ids have a handler — `repo.open`, `repo.close` and
`view.refresh` have live native menu items that do nothing. A fixes the registry, B lifts the handler
map out of `app.tsx` into the dispatcher all three feeds share, C–D build the surface and the repo's
first fuzzy matcher, E–F are the sources. `Mod+K` is free; `Mod+Shift+P` is Pull and stays Pull.*

- ✅ **A** — reconcile the fifteen-ids/thirteen-bindings split, add a `group` union, add `palette.open`
  (`Mod+k`, global scope so it escapes the terminal) and `palette.files` (`Mod+p`), fix the phantom
  `commands.ts` links (landed 2026-08-28)
- ✅ **B** — `useCommandHandlers(): CommandRuntime` with `enabled` + `disabledReason`, and the four
  cheap dead commands finally wired; `op.*` left to Phase 22 (landed 2026-08-28)
- ✅ **C** — `palette.tsx` + `palette-host.tsx` on the `dialog-host.tsx` shape, a deliberately
  unpersisted `palette-store.ts`, `z-dialog`, and the capture-phase short-circuit that stops `Mod+g`
  firing out from under the input (landed 2026-08-28)
- ✅ **D** — `fuzzy-match.ts` returning `{score, indices}`, the renderer's first matched-character
  highlighting, and one ranking table so a repo name cannot bury a command (landed 2026-08-28).
- ✅ **E** — the source-provider seam plus commands, views, settings pages, repos, worktrees, sessions
  and agents; `VIEW_ICON`/`PAGE_ICON` reused rather than a third icon map (landed 2026-08-28).
- ✅ **F** — branches and tags with two actions only (checkout, reveal in graph) behind an exported
  `PALETTE_SAFE` allowlist with a test asserting no destructive id gets in (landed 2026-08-28,
  merged locally — no PR/no remote; recovered from an interrupted session).
- ✅ **G** — the file finder: `mgit:fs:list-files` over `git ls-files -z --exclude-standard`, a
  tip-sha-keyed index with an honest truncation notice, opening into the Phase 16 preview pane
  (landed 2026-08-28, merged locally — no PR/no remote; recovered from an interrupted session).
- ✅ **H** — `use-focus-trap.ts` extracted from `popover.tsx`, the only working trap in the repo, and
  retrofitted onto `ConfirmDialog` and `PromptDialog`, which have none (landed 2026-08-28, merged
  locally — no PR/no remote; recovered from an interrupted session). Phase 23 is now
  feature-complete — all eight themes (A–H) have landed.

### [Phase 22 — Stash, the reflog, and writes you can take back](phase-22-stash-and-safety-net.md)

*The client can merge, rebase and review a pull request, and still cannot put work down for five
minutes: `git stash` appears nowhere in the codebase, and `refs/stash` is deliberately dropped by
the ref parser. A is the engine spine B–E read off; B–E are the four surfaces a stash shows up on
(sidebar section, graph pseudo-rows, the inspector, the Changes view). F reverses the MVP's flat
no-force-push ban, `--force-with-lease` only and only in its explicit form, behind the blast-radius
gate Phase 7 already built. G and H are the safety net three files have been promising in doc
comments since Phase 7 — the reflog finally read and browsable, and the app's first ops journal,
first toast primitive and first undo.*

- ✅ **A** — `commands/stash.ts` + `stash-parser.ts` on the write-queue idiom, `mgit:stash:*`
  channels, and a `'stash-apply'` arm on `ConflictOpSchema` so a conflicted pop is a normal outcome
  (landed 2026-08-28)
- ✅ **B** — a `'stashes'` `SectionKey` and a `TreeSection` in `RepoTree`, with a `StashRow`, a
  heading action and a query key nested under `keys.repo(repoId)` (landed 2026-08-28).
- ✅ **C** — stashes as graph pseudo-rows on the `UncommittedRow` precedent: dashed lane, dashed
  ring, outside `GraphRowSchema` rather than smuggled in behind a fake sha (landed 2026-08-28).
- ✅ **D** — a stash you can read: all three parts (tracked, index, untracked) through Phase 12's
  hunk parser and the one shared `DiffView`, not just what `stash show -p` admits to (landed 2026-08-28).
- ✅ **E** — stash from the Changes view: selected paths, `--keep-index` and `-u` as labelled
  options rather than defaults chosen for the user (landed 2026-08-28).
- ✅ **F** — force-push with a lease, explicit `=<ref>:<sha>` form only, behind
  `countOrphanedCommits` and a default-off Settings switch — and the three written-down "there is
  no force push" comments rewritten rather than deleted. (landed 2026-08-30)
- ✅ **G** — `commands/reflog.ts` and a **History** rail view: HEAD plus per-ref, each entry
  checkout-able, with `.git/logs` joining the watcher for the first time. (landed 2026-08-30)
- ✅ **H** — the ops journal, the app's first toast primitive, and undo — ref-shaped only, because
  the reflog records where refs pointed and nothing about the working tree. (landed 2026-08-30)

### [Phase 21 — A plural agent roster, and a terminal that knows where it is](phase-21-agent-roster-and-terminal-identity.md)

*Phase 15 built the agent machinery around a roster with one entry in it, and the renderer never
held up its half of the "adding one is an edit, not a release" bargain. A is the contract every
other theme reads off (`icon`, `mode`, `install`, four builtins); B and C are the two surfaces that
stop hard-coding Claude (the session-list mark, the `+` menu); D and E are the live half — a
terminal that knows where it is (OSC 7) and what is running in it (a process probe in main); F is
the header those two finally give something true to say.*

- ✅ **A** — `AgentDefinitionSchema` gains `icon` and `install`; `BUILTIN_AGENTS` grows to four real
  terminal agents (Claude Code `claude`, Antigravity `agy`, Codex `codex`, OpenClaude `openclaude`) —
  and whether a command exists on this machine travels beside them as a separate `AgentStatus`,
  because the definition is config a user hand-edits and the status is a probe result
  (landed 2026-08-27)
- ✅ **B** — three new local brand SVGs beside `claude-icon.tsx` plus an `AGENT_ICONS` registry, so
  `SessionIcon` resolves a mark from the roster instead of hard-coding `<ClaudeIcon>`; all three are
  hand-drawn originals with their provenance written down, and the registry also resolves a curated
  slice of `react-icons/si` for user-added agents (landed 2026-08-27)
- ✅ **C** — the `+` menu goes flat and iconned (New Terminal / Claude Code / Antigravity / Codex /
  OpenClaude), with a main-side install probe — the whole roster in ONE `-lic` shell, per-agent
  framed so an rc-file banner cannot be misread as a path, 30s TTL, and an agent it could not reach
  omitted rather than called missing. `buildNewSessionMenu` is pure, so which rows are dead and why
  is a table test rather than a render (landed 2026-08-27)
- ✅ **D** — OSC 7 live cwd tracking, `liveCwd` in the terminal store, and the header following a
  `cd` through Theme F's resolver — plus `bridge.hostname`, without which the parser rejects every
  payload the canonical emitters actually produce (landed 2026-08-27)
- ✅ **E** — a process probe in main behind `pty:agent-changed`, so an agent started or quit by hand
  swaps the sidebar row's icon; reads process state and acts on nothing. Split into the read
  (`agent-process.ts` — one `ps`, a pure depth-carrying walk, a three-rule matcher that never scans
  arguments) and the cadence (`agent-watcher.ts` — a 750ms quiet debounce, change-only emission, a
  shared snapshot, and a hard rule that a `null` may only take away a mark some probe has actually
  *seen* — a timed grace window would have stripped Claude's mark off an `npm`-installed Claude Code
  the matcher deliberately cannot name). The store's `liveAgentId` is a true tri-state:
  absent ≠ `null` (landed 2026-08-27)
- ✅ **F** — the header loses the word "Terminal": a glyph, the status circle, then a `~`-collapsed
  path with the repo segment emphasised and left-truncation. Brought Theme D's `resolveRepoForPath`
  forward with it — F needs the split point, D needs the same helper against `liveCwd`
  (landed 2026-08-27)

*All six themes have landed (2026-08-27). Three manual passes remain, all needing a real shell or a
packaged app: `cd` between two worktrees and watch the header follow (D), start and quit `codex` and
`agy` inside a shell and watch the row's icon swap both ways (E), and launch the packaged `.app`
from Finder to confirm the install probe still reads the login shell's PATH (C).*

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
- ✅ **E** — inline diff-line comment threads as *rows* in the diff, right-side (added/context)
  lines only for v1 — the phase's highest-unknown piece, and two of its three unknowns turned out to
  be API facts: threads are readable only over GraphQL (REST has no thread object, no `isResolved`
  and no node id), and `gh api`'s `-F` type-guesses its variables. A thread that cannot be anchored —
  outdated, file-level, left-side, or naming a line outside every hunk — renders in a collapsed
  group above the diff rather than against whichever row carries that number now (landed 2026-08-27)
- ✅ **F** — the phase's one deliberate write path: approve/request-changes/comment/merge, in
  `gh-write.ts` beside Theme E's three writes, with the primitives both need extracted into a new
  `gh-shell.ts` so the write module no longer depends on the reader. The merge confirm's blast
  radius comes from `gh pr view --json commits` rather than a local `rev-list --count` — a PR's head
  ref usually is not in this checkout, and `rev-list` against a missing ref reads as zero. All of it
  behind a default-off Settings → Reviews switch that also lists what the app never does
  (landed 2026-08-27)
- ✅ **G** — reviewer re-request off the detail's own `reviewRequests`, Draft → Ready that
  disappears once flipped, and re-run on the Checks tab — two buttons, the failed-only one present
  only on a run that failed. Re-run is the one write that evicts a cache: `gh run rerun` adds an
  attempt to the *same* run id, and main caches a completed run's tree permanently
  (landed 2026-08-27)
- ✅ *(follow-up)* the Playwright suite is green again on `main` — seventeen specs (sixteen of this
  phase's, one of Phase 17's) had gone red against a working product because `app:e2e` sits
  outside the `:test` gate and nothing re-read them after three deliberate decisions moved: a PR
  now opens on **Overview**, the three review scopes now arrive **folded**, and the repos row grew
  a **trailing cluster** that broke a geometry proxy. No product code changed; the landing tab is
  now guarded by one spec instead of thirteen, and four stale screenshots were regenerated
  (285 passed, 0 failed — was 267/17) (landed 2026-08-27)

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
