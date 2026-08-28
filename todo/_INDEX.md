# Midnite Git — Phase Index

**Headline:** **[28](phase-28-sidebar-section-tree.md)** is the newest frontier and is planned but unstarted — the phase that makes `view-sections.ts` tell the truth. It exports `ALL_SECTIONS` under the comment *"Every section, in the order the tree renders them"*, and that has not been true since Phase 17 wrote it: `RepoTree` renders four literal `<TreeSection>` blocks in source order, so the constant that claims to own the order drives nothing and happens to agree with it. Phase 28 makes the order data — a `SECTION_TREE` with parents, an `ALL_SECTIONS` derived by flattening it, and one recursive `renderSection` walk in place of the four blocks — and the first thing that data says is that **Worktrees comes first**, because which checkout you are looking at is the app's primary context in every view and `VIEW_FILTERS` already says so. The nesting arrives with it: `Local` and `Remotes` become children of a `Branches` parent, which *resolves* rather than contradicts the comment at `repos-panel.tsx:800` arguing *"'Local', not 'Branches'"* — that objection is about a rename, and a parent owning two still-labelled children is not one. It costs a fifth rung on `TREE_INDENT` and a `depth` prop widened to `0|1|2|3`, since Remotes' existing `origin` groups get pushed to depth 4. Folds stop being per-mount `useState` and join the ui-store beside the two collapse maps that already set the pattern. Actions/Reviews/Issues/Tests gain a `Forge` parent, and a `stashes` slot is reserved but renders nothing, so **[22](phase-22-stash-and-safety-net.md)** Theme B can register a section instead of hand-editing the six files it is currently written to edit. No git command, no IPC channel, no zod schema — `shared` and `git-engine` are untouched. User-reorderable sections, path-segmented branch folders and the stash engine itself are explicitly out. **[27](phase-27-status-bar-and-browser-panel.md)** is the previous frontier and is also planned but unstarted — the phase that notices the footer has never spanned the app. It is mounted as the last child of the right-hand content column, so it begins at the repositories panel's right edge and stops short of the window; nobody decided that, it is where the element landed when the terminal toggle needed a home in Phase 9, and everything since has inherited it. Moving it one level up into `CONTENT_BOX` is ten lines and is the whole of Theme A — the phase exists for what the width is then for. `FooterCluster` already asked for this in writing: *"a container that takes slots, not a fixed list of four metrics"*, naming the two segments that would arrive next, and two of the three have. C–E make the informal slot real — zones, priority, and a measured two-stage overflow with hysteresis — and D fills it with five readouts off state the app already has: the active worktree, `useIsMutating` op progress, `StatusResult.inProgress` as the single sanctioned exception to the footer's own no-duplication-with-the-title-bar rule, the agent count, and the test/checks verdict Phase 18 reserved a slot for and Phase 17 never filled. Theme F cashes a promise Phase 9's keymap made and then left standing: `Mod+b` has been bound to `browser.open` since then with a comment saying a browser will live there, and it currently opens a dialog reading "coming soon". It becomes a third panel toggle sliding a **chrome stub with no engine** over the entire content row — repositories panel included, status bar still visible beneath, which is the phase demonstrating its own premise. The file also finally leaves `features/terminal/`. No git command, no IPC channel and no zod schema: the only shared-package edit is renaming one command id. A real web engine, moving branch/ahead-behind down from the title bar, extracting `app.tsx`'s shell nesting, store-backed segment registration and determinate progress bars are all explicitly out. **[26](phase-26-side-by-side-diffs.md)** is the previous frontier and is also planned but unstarted — the phase that finally builds side-by-side diff, after four separate phases deferred it with the same two reasons. Both have quietly stopped being true: Phase 17's workbench gave the app full-width tabs (`all-changes` and `review` are already two), and Phase 12's own diff work left `diff-rows.ts` a pure, tested, DOM-free row builder that a second arrangement can sit *beside* rather than fork. The engine needs nothing at all — every `DiffLine` has carried both `oldNo` and `newNo` since Phase 12, and `annotateIntraline` already stores each side's word-level ranges on its own line, so a split view inherits word-diff for free and the phase adds no git command, no IPC channel and no diff schema. Alignment follows the engine rather than out-thinking it: a run pairs positionally, exactly as `pairLines` does, so the row pairing and the word-marks can never disagree about which line is which line's counterpart. `LineRow` becomes a shared `DiffCell` so there stays exactly one diff renderer; `inline` mode gets its first virtualizer, because All-changes and Reviews Files render every row today and split doubles the per-row DOM; the commit inspector gets a full-width home as a new `commit` workbench tab rather than a 720px dock stretched past usefulness; comments learn a left side, which Phase 20 deferred on purpose; and one new `baseSha` field lets the existing image viewer finally work on a pull request. Per-hunk staging, soft wrap, LCS alignment, a Settings ▸ Diff page and CodeMirror's merge view are explicitly out, and blame belongs to Phase 25. **[25](phase-25-search-everywhere.md)** is the previous frontier and is also planned but unstarted — the phase that answers *when did this line get here* and *which commit deleted that function*, neither of which the app can answer today: a grep across all four packages for `blame`, `pickaxe`, `log -S` and `--follow` returns zero matches, `buildLogArgs` accepts `limit`, `all` and `revisions` and nothing else, and the graph's two so-called filters either re-stream by ref or merely dim by author, so neither can find anything not already on screen. Phase 25 builds the pickaxe over history, `git blame` with `-C -M` and a real reblame stack, and grep at any revision — behind a new Search rail view, a `Mod+F` find bar and a graph-header box that hands off. To carry them it lifts `log-service.ts`'s single module-level `active` stream into a `requestId`-keyed registry allowing concurrent, genuinely cancellable reads. It is the largest read-only phase in the repo: nothing writes, nothing touches the write queue. It also finally extracts `components/filter-input.tsx`, a pattern the repo has now hand-written twice, and moves Fetch to `Mod+Shift+R` to free the conventional `Mod+Shift+F`. It deliberately rebuilds neither neighbour: quick-open and the palette are Phase 23's and are consumed, `git grep` is Phase 24's and is extended. **[24](phase-24-writable-explorer.md)** is the previous frontier and is also planned but unstarted — the phase that ends the Folder explorer's read-only era. Phase 16 made read-only a property of the IPC contract rather than of the UI and said so in four doc comments; Phase 24 makes all four false on purpose and rewrites them, the way Phase 20 handled `gh-cli.ts`'s "strictly reads" when it added `gh-write.ts` beside it. Four write channels behind a jail that has to learn three things the read path never needed — confining a *parent* so a create can be authorised at all, refusing a symlink as the final segment, and closing the TOCTOU window by writing through a descriptor it never re-resolves by name — then a context menu on tree rows with Trash-backed delete behind a blast-radius confirm, the app's first real text editor (CodeMirror 6, beside shiki rather than replacing it), `git grep` as find-in-files, per-row git status badges off a cache read that costs no subprocess, and the fs query keys finally registered so the watcher can invalidate a tree it has never been able to see. Writes are repo scope only — `claude-home` cannot be expressed in the schema — and the shared tree stays read-only at its Settings ▸ Agent call site. Editing `~/.claude`, untracked-file search, drag-to-move and multi-file operations are explicitly out. **[23](phase-23-command-palette.md)** is also planned but unstarted — the palette the keymap module has named as its third dispatch source since Phase 9, and the registry surgery it needs first. Today `shared/src/keybindings.ts` holds fifteen command ids against thirteen chords, only nine of them have a handler at all, and `repo.open`, `repo.close` and `view.refresh` ship as live native menu items that do nothing — so Phase 23 reconciles the registry, lifts the handler literal out of `app.tsx` into a `useCommandHandlers()` runtime the keyboard, the native menu and the palette all read, then builds one `Mod+K` surface with a sigil grammar over commands, views, settings pages, repos, worktrees, sessions, agents, refs and files. It brings the workspace its first fuzzy matcher and its first matched-character highlighting, both hand-rolled, and extracts the repo's only working focus trap out of `popover.tsx` to retrofit two modal dialogs that have none. `Mod+Shift+P` is Pull and stays Pull. Destructive writes, user-editable keybindings, commit search and the Phase 22 journal source are explicitly out. **[22](phase-22-stash-and-safety-net.md)** is also planned but unstarted — the largest phase in the repo, and the one that closes the two gaps every earlier phase wrote into its margins. `git stash` appears nowhere in the codebase today and `refs/stash` is deliberately dropped by the ref parser; Phase 22 gives it an engine, a sidebar section, graph pseudo-rows, a readable diff and a verb in the Changes view. Then it builds the safety net three files have been promising in doc comments since Phase 7: the reflog read and browsable as a **History** rail view, an ops journal, the app's first toast primitive, and an undo that is honest about being ref-shaped — because the reflog records where refs pointed and nothing about the working tree. On the strength of that it reverses the MVP's flat no-force-push ban, `--force-with-lease` only and only in its explicit `=<ref>:<sha>` form, behind the blast-radius gate Phase 7 already built and a default-off switch. Interactive rebase, a command palette and undo for the sequencer's ops are explicitly out. **[21](phase-21-agent-roster-and-terminal-identity.md)** is the previous frontier and is now feature-complete: the terminal's one-entry agent roster has grown to four — Claude Code, Antigravity (`agy`), Codex and OpenClaude — each with its own brand mark resolved from roster data rather than a hard-coded component, behind a flat, iconned `+` menu that disables what is not installed and says why — the probe behind that resolving against the *login shell's* PATH, since `claude` and `agy` live where only an rc file puts them. **Its live half has landed too, which completes the phase:** OSC 7 cwd tracking and a process probe in main mean a terminal finally knows where it is and what is running in it, so the session list's icon and a rebuilt header — a glyph, the status circle, a `~`-collapsed path with the repo segment emphasised — follow a `cd` or an agent quit instead of reporting whichever menu item opened the session. The probe reads `ps` and acts on nothing, matches argv by three deliberately narrow rules rather than scanning for a name anywhere, and never lets a `null` take away a mark it has not actually seen; three manual passes remain, all needing a real shell or a packaged app. Per-agent activity detection and a writable Settings ▸ Agents page are explicitly out, as are launcher-style "Open in <IDE>" entries. **[20](phase-20-reviews-page.md)** is the previous frontier and is now feature-complete:
a Reviews page joins the nav rail — a PR list filterable by state/author/search, beside a tabbed PR
detail (Files/Conversation/Checks) — diffs across the whole app are syntax-highlighted through the
one shared `DiffView`, inline comment threads hang off the diff's own lines, and the phase's
deliberate reversal of the Phase 17/19 read-only-forge rule has landed: you can approve, request
changes, comment (inline or top-level), merge behind a real blast-radius confirm, re-request a
reviewer, take a PR out of draft and re-run checks without leaving the app — all of it behind one
default-off Settings → Reviews switch that also lists what the app will never touch. Nine write
channels, all served by `gh-write.ts`, with the primitives it shares with the reader extracted into
`gh-shell.ts`. Two human passes remain, both needing a real remote. **[19](phase-19-dashboard-actions-tests.md)** is the previous *landed*
frontier — the nav rail stops being three views and becomes the app's table of contents. Its forge half is now deep enough to triage from — issues in the sidebar, and a job tree under each failed run — and the **Dashboard has landed**: a `react-grid-layout` board of widgets over one repo's history, contributors, PRs, issues and runs, all scoped together by one author filter; an **Actions** view with job trees and logs; and a **Tests** view that discovers each repo's suites and — trusted per suite, riding the same runner 18's diagnostics generalised into `process-runner.ts` — runs them, with a live output stream and parsed pass/fail counts. Three manual passes remain, all needing a packaged app or a large real repository. **[18](phase-18-footer-monitor-diagnostics.md)** has landed both halves — the footer bar's empty right half is now a live system monitor (CPU/RAM/GPU/disk as dot, percentage and sparkline, opening into area-chart timelines over the app's first real popover primitive), and beside it per-repo lint counts gated behind an explicit per-repository trust prompt, because running a repo's own linter is the first arbitrary code execution this app does. Three human passes remain. **[17](phase-17-repos-workbench.md)** turns the repositories sidebar into a workbench — per-worktree change counts, menus on everything, a whole-checkout diff in a tab strip, and the app's first forge integration (Actions + Reviews through the user's own `gh`). The MVP (phases 0–11) is landed — the app packages, installs and runs from /Applications. **[12](phase-12-commit-inspector.md)** has landed **all six themes** — the commit graph is now a place you can read and act in: the inspector, real diffs, the remote model, ref badges that act, and rows that read at two densities; only two manual passes remain, both needing a packaged app or a real remote. Still open: **[14](phase-14-graph-themes.md)** makes the graph itself configurable, and **[15](phase-15-multi-terminal-sessions.md)** turns the single terminal into several — shells and coding agents, persisted across restarts. **[16](phase-16-explorer-and-settings-pages.md)** is **done** — a read-only Folder explorer with a preview pane, and Settings split into pages (including an Agent page into `~/.claude`), with both real-app manual passes signed off; a follow-up has since made that settings sidebar grouped and collapsible, and given Appearance the side-navigation control that reaches the rail's third mode. Post-MVP scope lives in [`outstanding.md`](outstanding.md).

Completed work is logged append-only in [`done.md`](done.md). Deferred scope lives in [`outstanding.md`](outstanding.md).

## Phases

<!-- Newest-first. Status: ✅ DONE · 🔄 WIP · ◻ TODO. Done = checked/total in-scope items; Progress = 10-cell bar. -->

| Phase | Status | Refined | Done | Progress | % | 🔄 WIP | ◻ TODO |
|-------|--------|---------|------|----------|---|--------|--------|
| [28 · Worktrees first, and the section tree that can say so](phase-28-sidebar-section-tree.md) | 🔄 WIP | 22/60 | `████░░░░░░` | 37% | D | E–H |
| [27 · The footer becomes a status bar, and the browser it makes room for](phase-27-status-bar-and-browser-panel.md) | 🔄 WIP | x1 | 59/90 | `███████░░░` | 66% | G, H | — |
| [26 · Side by side, and the room to show it](phase-26-side-by-side-diffs.md) | ◻ TODO | — | 0/68 | `░░░░░░░░░░` | 0% | — | A–H |
| [25 · Search everywhere, and the blame that explains it](phase-25-search-everywhere.md) | ◻ TODO | x1 | 0/101 | `░░░░░░░░░░` | 0% | — | A–F |
| [24 · The explorer learns to write, and to search](phase-24-writable-explorer.md) | 🔄 WIP | — | 18/54 | `███░░░░░░░` | 33% | C | D, E, G |
| [23 · A command palette, and the registry that can feed it](phase-23-command-palette.md) | 🔄 WIP | — | 11/55 | `██░░░░░░░░` | 20% | — | C–H |
| [22 · Stash, the reflog, and writes you can take back](phase-22-stash-and-safety-net.md) | 🔄 WIP | — | 10/70 | `█░░░░░░░░░` | 14% | — | B–H |
| [21 · Agent roster + terminal identity](phase-21-agent-roster-and-terminal-identity.md) | 🔄 WIP | — | 43/46 | `█████████░` | 93% | — | 3 manual checks |
| [20 · Reviews page & unified diff syntax highlighting](phase-20-reviews-page.md) | 🔄 WIP | — | 43/45 | `██████████` | 96% | — | 2 manual checks |
| [19 · Dashboard, Actions and Tests as views](phase-19-dashboard-actions-tests.md) | 🔄 WIP | — | 73/76 | `██████████` | 96% | — | 3 manual checks |
| [18 · Footer system monitor + repo diagnostics](phase-18-footer-monitor-diagnostics.md) | 🔄 WIP | — | 51/54 | `█████████░` | 94% | — | 3 manual checks |
| [17 · Repositories workbench + forge](phase-17-repos-workbench.md) | 🔄 WIP | — | 46/48 | `█████████░` | 96% | — | 2 manual checks |
| [16 · Folder explorer, preview pane + settings pages](phase-16-explorer-and-settings-pages.md) | ✅ DONE | — | 41/41 | `██████████` | 100% | — | — |
| [15 · Multi-terminal sessions + agents](phase-15-multi-terminal-sessions.md) | 🔄 WIP | — | 38/39 | `█████████░` | 97% | — | manual relaunch check |
| [14 · Graph themes + avatars](phase-14-graph-themes.md) | ✅ DONE | — | 28/28 | `██████████` | 100% | — | — |
| [13 · UI polish](phase-13-ui-polish.md) | ✅ DONE | — | 26/26 | `██████████` | 100% | — | — |
| [12 · Commit inspector + live badges](phase-12-commit-inspector.md) | 🔄 WIP | — | 10/12 | `████████░░` | 83% | — | 2 manual checks |
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
- ◻ **D** — folds survive: `collapsedRepoSections` joins the ui-store beside `collapsedNavSections` and
  `collapsedSettingsGroups`, per repo, `version: 2 → 3` with a migrate, `RemoteGroup`'s bare `useState`
  folded in, and pruning on repo close.
- ◻ **E** — the Branches heading earns itself: a combined count and a `parentSectionMenu` beside (not
  widening) `sectionMenu`, since `RefSectionKey` stays narrow and a parent has no refs. Forge gets a
  count and deliberately no menu.
- ◻ **F** — Actions/Reviews/Issues/Tests nest under a Forge parent, which hides entirely on a repo with
  no forge remote — the parent rule doing its job rather than a new check.
- ◻ **G** — Settings ▸ Sidebar catches up: `SECTION_LABELS` is a `Record<SectionKey, string>`, so the
  new keys are a compile error until done, and `describeFilter` reads the nesting.
- ◻ **H** — reconciliation: rewrite the now-false `"'Local', not 'Branches'"` comment, document the
  three exhaustive `Record`s an adder must fill, and record that Phase 22 Theme B now registers against
  the reserved `stashes` slot. Phase 22's own doc is not edited here.

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
- 🔄 **G** — `use-focus-trap.ts` extracted from Popover and retrofitted onto the browser pane, plus
  the button/keyboard-order audit of today's five segments — all landed and none of it needed D or
  E (2026-08-28). Still open: `Tooltip` at `compact` density and naming the `…` overflow button —
  both unblocked now that D and E have landed. Phase 23's Theme H shrinks to the retrofit, updated
  there.
- ◻ **H** — pure-function unit tests (the repo has zero rendered-component tests), a `merge` rather than
  `migrate` persistence test, a `status-bar.spec.ts` asserting the left edge that would have failed
  before Theme A, a browser-pane spec, and the terminal-maximize regression guard the existing
  height-only assertion never was.

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

- ◻ **A** — `commands/{search,grep,blame}.ts` + `parsers/{grep,blame}-parser.ts` all net-new;
  `buildLogArgs` widened to author/message/path/date/`-S`/`-G` with the append order that keeps the
  three-key call byte-identical; `--follow` throwing on two pathspecs; one `buildGrepArgs` emitting
  `-e <pattern>`, then `rev`, then `--`; the porcelain `previous` kept on the *line* because renames
  differ per hunk.
- ◻ **B** — `stream-registry.ts` lifted out of `log-service.ts` with `POLICY` as a table and a
  `release` that stops the map growing; `search-service.ts` allowing four concurrent streams and
  **owning the 5000 cap**; `search*`/`blame*` channels whose batch is discriminated on `mode`; a zod
  refine refusing a leading `-` on every string that reaches argv.
- ◻ **C** — a `'search'` rail view with Commits/Content/Files modes, the repo's first **measured**
  virtualizer over an append-only row array, a results/preview split, four named empty/loading/error
  states, a visible truncation row, and a footer readout while a stream is live.
- ◻ **D** — `CodePreview` rewritten from one `codeToHtml` blob into per-line `data-line` rows from
  `codeToTokens()`, which is what C's scroll-to-line and E's find bar need; a blame gutter as a
  sibling grid column so alignment is structural; `-C -M`; reblame with an unpersisted per-file stack.
- ◻ **E** — `components/filter-input.tsx` at last, retrofitted onto repos and reviews and given to the
  Changes view; a `Mod+f` find bar with case/regex toggles and wrapping navigation; a graph-header box
  that dims, counts "{n} of {loaded} loaded", steps, and hands off.
- ◻ **F** — Fetch to `Mod+Shift+r` (lowercase, like every chord in the keymap), `search.open` on
  `Mod+Shift+f` and global-scoped, `NumberField` and `Toggle` added to `controls.tsx`, and a Search
  settings page.

### [Phase 26 — Side by side, and the room to show it](phase-26-side-by-side-diffs.md)

*Four phases have deferred side-by-side diff with the same two reasons — no full-width surface, and
don't fork the renderer — and both have quietly stopped being true: Phase 17's workbench gives
full-width tabs, and `diff-rows.ts` is a pure row builder a second arrangement can sit beside. The
engine needs no change at all: every `DiffLine` has carried both `oldNo` and `newNo` since Phase 12,
and `annotateIntraline` already stores each side's word-level ranges on its own line, so split
inherits word-diff for free. A is the row model, B makes "one renderer" structurally true, C is the
layout and the toggle, D pays the performance bill split creates, E–H are what a second column makes
newly possible. Only H touches a contract.*

- ◻ **A** — `toSplitRows`/`pairRun`/`canSplit` beside `toDiffRows`: positional pairing within
  balanced runs, deliberately the same rule as `pairLines`, so alignment and word-marks can never
  disagree. Combined, binary and zero-hunk diffs degrade to unified without asking.
- ◻ **B** — `LineRow` becomes a shared `DiffCell` both layouts mount, with `gutter` as a prop rather
  than a store read. No user-visible change: the unified screenshots must come out byte-identical.
- ◻ **C** — two columns through the existing virtualizer, one locked horizontal scroller (not two
  synchronised ones), and `diffLayout: 'unified' | 'split'` persisted in `ui-store` beside
  `diffShowOldGutter`, with a `ResizeObserver` fallback that never rewrites the preference.
- ◻ **D** — `inline` mode gets a virtualizer for the first time; All-changes and Reviews Files render
  every row today, and split doubles the per-row DOM. Brings `EXPAND_ALL_LIMIT` back up for review.
- ◻ **E** — a `DiffToolbar` the accordion surfaces can mount, with actions a surface cannot perform
  omitted rather than dead — `PrFiles` has one `gh pr diff` in memory and cannot refetch at `-U`.
- ◻ **F** — LEFT-side comment anchoring: `leftSideLines`, a per-side `ThreadsByLine`, a `del` line
  made commentable, and threads still rendered as full-width rows with a LEFT/RIGHT badge.
- ◻ **G** — a `commit` arm on `WorkbenchTab` so the inspector has a full-width home; the 720px graph
  dock is untouched and stays the quick-look panel.
- ◻ **H** — `baseSha` on `ForgePullDetailSchema` from `gh pr view`'s `baseRefOid`, which is the only
  thing standing between the existing `ImageDiff` viewer and a pull request. Fork PRs get an
  explicit "fetch to compare" rather than implicit network.

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
- ◻ **C** — mutations in the tree: the tree's first `onContextMenu`, a `writable` opt-in prop,
  inline rename, and `shell.trashItem()` delete behind a confirm that counts the uncommitted work
  it is about to bin.
- ◻ **D** — the preview pane becomes an editor: CodeMirror 6 (the app's first editor dependency),
  dirty state, `Cmd+S` through the command registry, an unsaved guard, and a stale-write refusal
  that offers to reload rather than picking a side.
- ◻ **E** — find in files: `git grep -z` in git-engine with a pure parser beside it, one read
  channel, and a results panel that opens a file at the line. Tracked content only, said out loud.
- ✅ **F** — status badges on tree rows: a `Map` join on a path convention that already matches
  byte-for-byte, off a status cache the sidebar has already fetched, with a directory rollup that
  turned out to need its own literal-ancestor walk rather than `build-change-tree.ts`'s
  chain-collapsing tree (PR-local, landed 2026-08-28)
- ◻ **G** — fs invalidation, live: the fs query keys move into `services/queries.ts` where they were
  never registered, the watcher learns `['fs', …]`, and a write's own echo is suppressed so a save
  does not invalidate the buffer under the cursor.

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
- ◻ **C** — `palette.tsx` + `palette-host.tsx` on the `dialog-host.tsx` shape, a deliberately
  unpersisted `palette-store.ts`, `z-dialog`, and the capture-phase short-circuit that stops `Mod+g`
  firing out from under the input.
- ◻ **D** — `fuzzy-match.ts` returning `{score, indices}`, the renderer's first matched-character
  highlighting, and one ranking table so a repo name cannot bury a command.
- ◻ **E** — the source-provider seam plus commands, views, settings pages, repos, worktrees, sessions
  and agents; `VIEW_ICON`/`PAGE_ICON` reused rather than a third icon map.
- ◻ **F** — branches and tags with two actions only (checkout, reveal in graph) behind an exported
  `PALETTE_SAFE` allowlist with a test asserting no destructive id gets in.
- ◻ **G** — the file finder: `mgit:fs:list-files` over `git ls-files -z --exclude-standard`, a
  tip-sha-keyed index with an honest truncation notice, opening into the Phase 16 preview pane. Lands
  last.
- ◻ **H** — `use-focus-trap.ts` extracted from `popover.tsx`, the only working trap in the repo, and
  retrofitted onto `ConfirmDialog` and `PromptDialog`, which have none.

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
- ◻ **B** — a `'stashes'` `SectionKey` and a `TreeSection` in `RepoTree`, with a `StashRow`, a
  heading action and a query key nested under `keys.repo(repoId)`.
- ◻ **C** — stashes as graph pseudo-rows on the `UncommittedRow` precedent: dashed lane, dashed
  ring, outside `GraphRowSchema` rather than smuggled in behind a fake sha.
- ◻ **D** — a stash you can read: all three parts (tracked, index, untracked) through Phase 12's
  hunk parser and the one shared `DiffView`, not just what `stash show -p` admits to.
- ◻ **E** — stash from the Changes view: selected paths, `--keep-index` and `-u` as labelled
  options rather than defaults chosen for the user.
- ◻ **F** — force-push with a lease, explicit `=<ref>:<sha>` form only, behind
  `countOrphanedCommits` and a default-off Settings switch — and the three written-down "there is
  no force push" comments rewritten rather than deleted.
- ◻ **G** — `commands/reflog.ts` and a **History** rail view: HEAD plus per-ref, each entry
  checkout-able, with `.git/logs` joining the watcher for the first time.
- ◻ **H** — the ops journal, the app's first toast primitive, and undo — ref-shaped only, because
  the reflog records where refs pointed and nothing about the working tree.

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
