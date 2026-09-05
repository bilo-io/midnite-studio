# Phase 23 — A command palette, and the registry that can finally feed it

**Refined: x1** · 2026-09-05 · data model & registry, file-map precision, testing & verification, per-item acceptance criteria, opens

> **Read this before the prose below it (refinement x1, 2026-09-05).** The four paragraphs that open
> this phase are a *historical* account of the tree in August 2026 and every number in them is now
> wrong. [`shared/src/keybindings.ts`](../../../packages/shared/src/keybindings.ts) is **394 lines**
> holding **57 commands, 42 of them chorded** — not "89 lines", "fifteen ids" and "thirteen
> bindings" — and **all 57 have a `CommandEntry`** in
> [`use-command-handlers.ts`](../../../packages/app/src/services/keybindings/use-command-handlers.ts),
> so "only nine of the fifteen ids have one" describes a problem this phase's own Theme B fixed.
> The chords moved too: **`Mod+r`/`Mod+Shift+r` are `app.reload`/`app.hardReload`**, and
> `view.refresh` and `sync.fetch` — the two commands this doc binds them to — are now **chord-free**.
> `Mod+l` is `fab.toggle` and `Mod+Shift+l` is `app.lock`. Nothing in the prose is safe to act on;
> the Deliverables below are corrected in place and are.

Twenty-two phases in, Midnite Studio has fifteen named commands, thirteen keyboard chords, a native
menu that dispatches by command id, and no way to reach any of it by typing. The keymap module's own
doc comment has been promising the missing surface since Phase 9 — it names "(later) a command
palette" as dispatch source number three, beside the window keydown listener and the native menu —
and [`outstanding.md`](../outstanding.md) has carried the same note ever since. This phase builds
source number three.

It also has to fix the registry first, because the registry cannot feed a palette as it stands.
Start with the link: both [`outstanding.md`](../outstanding.md) and
[Phase 22's out-of-scope list](phase-22-stash-and-safety-net.md) point at
`packages/app/src/services/keybindings/commands.ts`, and **that file does not exist**. The registry
is [`shared/src/keybindings.ts`](../../../packages/shared/src/keybindings.ts), 89 lines of zod-free plain
data, and it is deliberately in `shared` because the native menu in
[`menu.ts`](../../../packages/desktop/src/main/menu.ts) dispatches the same `CommandId` values across the
IPC boundary. Then start with the shape: `COMMAND_IDS` has **fifteen** entries and `DEFAULT_KEYMAP`
has **thirteen** — `op.abort` and `op.continue` are declared ids with no binding at all, so a
palette iterating the keymap silently omits them, while a palette iterating the ids gets no label.
Neither list alone is a sufficient data source. And most of all, start with the handlers: they live
in a single inline object literal in [`app.tsx`](../../../packages/app/src/app.tsx), passed straight to
`useKeybindings({...})`, never exported, and **only nine of the fifteen ids have one**. `repo.open`,
`repo.close` and `view.refresh` have keymap entries *and live native menu items* and do nothing when
you use them. A palette is the surface that makes that visible — it would render six dead rows — so
the honest move is to fix it rather than filter it.

The last thing the recon settled is the chord. `Mod+K` is free. **`Mod+Shift+P` is not** — it is
`sync.pull`, sitting in a deliberate `Shift+F` / `Shift+P` / `Shift+U` fetch-pull-push triad that
reads as a set, and taking it would break the set to buy a convention. Bare `Mod+P` is free, is the
conventional file-finder binding anyway, and pairs with `Mod+K` without moving anything.

**Builds on.** Phase 9 (the `CommandId` registry, `chordFromEvent`, the capture-phase listener and
the `GLOBAL_CHORDS` terminal escape), Phase 4 and 17 (the repos and worktrees the palette navigates
to), Phase 13 (`useRefs` and the sidebar ref tree behind the refs source), Phase 16 (the read-only
`fs` contract, its path jail, and the preview pane a found file opens into), Phase 19 (the
view-scoped nav shell, `VIEW_ICON` and `SETTINGS_PAGES` — both already labelled, one already
grouped), Phase 21 (the agent roster and its structurally-typed brand marks).

**Scope guardrails.** The registry stays **data-only**. `shared` is zod-only and imports no
workspace package, so no `handler`, no `run`, no `icon` field goes into `KeyBinding` — a `group`
string union is fine, a React component type is not, and command icons live in an `app`-side map
keyed by `CommandId` exactly as [`nav-icons.ts`](../../../packages/app/src/components/nav-icons.ts)
already does for `ViewId`. The palette performs **safe writes only**: checkout, fetch, pull, stage,
open-the-commit-box, and nothing whose inverse is a reset. Destructive ops stay in the graph where
the Phase 7 blast radius is in front of you — a palette is a surface optimised for typing fast, and
that is the wrong place to be one keystroke from orphaning commits. Every palette layer uses the
`zIndex` tokens in [`tailwind.config.ts`](../../../packages/app/tailwind.config.ts) and never a literal;
`z-50` renders *under* `@bilo-io/shell`'s title bar and that bug has already been shipped twice. And
the palette owns no dispatch machinery of its own: it is a third caller into the same
`CommandId → handler` map the keyboard and the menu already use.

Effort tags: **S** ≈ an hour or two · **M** ≈ half a day · **L** ≈ a day plus.

## Deliverables

### A — The registry becomes palette-shaped (S) ✅ DONE (landed 2026-08-28)

Lands first; every other theme reads off it.

- [x] Reconcile the fifteen-ids / thirteen-bindings split in
      [`shared/src/keybindings.ts`](../../../packages/shared/src/keybindings.ts). One list becomes the
      source of truth and the other is derived: every `CommandId` gets a `label` and an optional
      `chord`, so an unbound command (`op.abort`, `op.continue`) is a first-class palette row with
      no shortcut rather than an entry that vanishes. Keep `GLOBAL_CHORDS` derived from
      `scope === 'global'` — it is what lets a chord escape xterm and it must not become hand-listed.
- [x] Add `group` to the command record as a plain string literal union, with a comment recording
      that the alternative — deriving the group from the `id` prefix before the dot — was rejected
      because those prefixes are consistent by habit, not by contract, and a palette that regroups
      itself when someone renames an id is a palette with a trap in it.
      - The union shipped with the seven this doc listed and has since grown to **ten**:
        `'repository' | 'view' | 'sync' | 'terminal' | 'status' | 'graph' | 'operation' | 'palette' |
        'files' | 'window'` (`CommandGroup`, [`keybindings.ts:23`](../../../packages/shared/src/keybindings.ts)).
        All ten are in use; `view` alone carries 32 of the 57 commands.
      - `CommandDescriptorInput` (`keybindings.ts:43`, deliberately **not** exported) is the shape
        the guardrail protects: `{ id: string; label: string; group: CommandGroup; chord?: string;
        scope?: CommandScope }`. No icon, no `run`. It held.
- [x] Add `palette.open` (`Mod+k`) and `palette.files` (`Mod+p`) to `COMMAND_IDS` and the keymap.
      `palette.open` is **`scope: 'global'`** (`keybindings.ts:231`), because a palette you cannot
      open while a shell has focus is half a palette.
      - **Correction:** it is not "the second chord that escapes the terminal" — there are **four**
        `scope: 'global'` commands today: `terminal.toggle` (`:77`),
        `terminal.toggleHalfMaximized` (`:90`), `search.open` (`:219`, Phase 25) and
        `palette.open` (`:231`). `GLOBAL_CHORDS` (`:309`) is still derived from
        `scope === 'global'` and must stay derived.
      - `scope` is one of **two** escape mechanisms and they are not the same thing. `scope:
        'global'` says a chord reaches the app from inside a focused root; `YIELD_ROOTS`
        (`keybindings.ts:328`, Phase 64 Theme D) says the opposite — which app chords *fall through*
        to a focused root. `TERMINAL_YIELD_COMMANDS` (`:390`) is now a **derived alias** for the
        `.xterm` root's list, and a second root, `.monaco-editor`, has its own set. Never hand-list
        either.
- [x] Fix the phantom `commands.ts` link in [`outstanding.md`](../outstanding.md) and in
      [`phase-22`](phase-22-stash-and-safety-net.md)'s "Not in this phase" list — both point at a
      path that has never existed. Note the real location in
      [`CLAUDE.md`](../../../CLAUDE.md)'s keybindings bullet while we are there.
- [x] Extend [`keybindings.test.ts`](../../../packages/app/src/services/keybindings/keybindings.test.ts):
      every `CommandId` has a label; no two bindings share a chord; `Mod+Shift+p` still resolves to
      `sync.pull`; `palette.open` is in `GLOBAL_CHORDS` and `palette.files` is not.

### B — `useCommandHandlers()` — one dispatcher, three feeds (M) ✅ DONE (landed 2026-08-28)

The keymap's doc comment describes this hook; it just was never written.

- [x] New `packages/app/src/services/keybindings/use-command-handlers.ts` exporting
      `useCommandHandlers(): CommandRuntime`, where `CommandRuntime` is
      `Record<CommandId, { run: () => void; enabled: boolean; disabledReason?: string }>`. Move the
      inline handler literal out of [`app.tsx`](../../../packages/app/src/app.tsx) verbatim first, then
      extend it — the object is deliberately rebuilt every render so it closes over current state,
      and that property has to survive the move.
- [x] Wire `repo.open` and `repo.close`. Both have keymap entries (`Mod+o`, `Mod+w`) **and** live
      native menu items and currently do nothing; `useRepos` and the repos panel already hold
      everything the handlers need.
- [x] Wire `view.refresh` onto the react-query invalidation the watcher already drives through
      [`watch-invalidation.ts`](../../../packages/app/src/services/watch-invalidation.ts), so the
      manual refresh and the automatic one cannot drift apart.
      - **`view.refresh` no longer has `Mod+r`, or any chord.** `Mod+r`/`Mod+Shift+r` became
        `app.reload`/`app.hardReload` — reload the window, and reload it bypassing the HTTP cache,
        exactly as a browser reads them — and `view.refresh` and `sync.fetch` were left deliberately
        chord-free rather than re-homed. That is why the palette matters more here than the doc
        assumed: for these two commands it is now the *only* keyboard route.
      - A chord-free command's menu and palette label must come from `COMMANDS`, never from
        `DEFAULT_KEYMAP` — the keymap is derived by filtering `chord !== undefined` (`:302`) and
        drops them, so a label read from it renders as the raw id.
- [x] Wire `status.commit` (`Mod+Enter`) to focus-and-submit the commit box, matching what the
      Changes view does on click rather than reaching past it. Threaded through a new
      `commit-box-store.ts` — the one imperative seam between the global command and `StatusPanel`'s
      own local commit-box state, which stays where it was rather than lifting into the store.
- [x] Give every entry `enabled` + `disabledReason`, following
      [`icon-button.tsx`](../../../packages/app/src/components/icon-button.tsx)'s habit of appending the
      reason to the tooltip: with no repo open, `sync.*` and `status.*` are present-but-unavailable
      and say why, instead of being absent (a command that disappears teaches nothing) or failing
      silently (which is what happens today).
- [x] `app.tsx` ends the theme thinner than it started: `useKeybindings(runtime)`,
      `bridge()?.menu.onCommand` and the palette all read the one runtime, and `op.abort` /
      `op.continue` remain deliberately unwired with a comment pointing at
      [Phase 22](phase-22-stash-and-safety-net.md), which owns operation state.

### C — The surface (M) ◐ PARTIAL (landed 2026-08-28; the native menu item reopened at x1)

- [x] New `packages/app/src/store/palette-store.ts` on the house zustand shape — `create<T>()(…)`,
      colocated test, pure helpers exported for testing — and **deliberately not persisted**, with
      the justification comment this repo expects on a new store: palette state is ephemeral per
      open, and a query string that survives a restart is a bug wearing a feature's clothes.
      Frecency was left out of this theme rather than built (see the open question) — sorting is
      group/label order only for now.
- [x] New `packages/app/src/components/palette.tsx`: a centred modal surface at `z-dialog`, a
      single search input, a virtualised-if-it-needs-to-be result list with group headings, the
      resolved chord rendered on the right of each command row, and `animate-fade-in` plus the
      standard item fade-and-rise — all of it inert under `html[data-motion='reduced']`. Filtering
      was a naive case-insensitive substring match for this theme only; Theme D replaced it with
      real fuzzy scoring and matched-character highlighting.
      - **Two consequences a reader will otherwise trip over.** `matchesQuery`, `filterCommands` and
        `groupCommands` still sit in
        [`palette-store.ts:83`](../../../packages/app/src/store/palette-store.ts) but are **dead
        code — referenced only by their own tests**; nothing in `palette.tsx` calls them. And only
        `journal` still renders the `MODE_PLACEHOLDER` one-liner (`palette.tsx:33`) — `refs`,
        `views` and `files` all have live sources from Themes E–G.
- [x] New `packages/app/src/components/palette-host.tsx` shaped after
      [`dialog-host.tsx`](../../../packages/app/src/components/dialog-host.tsx): mounted once in
      `app.tsx`, owning open/closed state, exposing an imperative `usePalette(): PaletteApi`
      (`open(mode?)`, `close()`). Unlike `DialogHost`, the open/closed bit itself lives in
      `palette-store.ts` (zustand), not local `useState` behind a Context — `use-keybindings.ts`
      has to read it from outside the render cycle entirely. It is the same pattern
      [Phase 22 Theme H](phase-22-stash-and-safety-net.md) plans for `toast-host.tsx`; whichever
      lands first sets the precedent for the third global surface.
- [x] A palette-open short-circuit in `onKeyDown` in
      [`use-keybindings.ts`](../../../packages/app/src/services/keybindings/use-keybindings.ts) —
      **not** at the top, as this item originally said. It sits at `use-keybindings.ts:60-70`,
      *after* the three-way `Mod+w`/`Mod+t` browser/terminal resolution (Phase 32) and after
      `yieldsToRoot` (`:104-113`, Phase 64 Theme D). Both of those must run first, so do not "fix"
      the ordering. The
      listener is on the **capture** phase with `stopPropagation()` — deliberately, so terminal-aimed
      keystrokes are seen — which means that without this guard, typing `Mod+g` or `Mod+r` into the
      palette input fires those commands out from under it. While the palette is open only
      `palette.*` and `Escape` resolve.
- [x] Pure `parsePaletteQuery(input): { mode, needle }` with its own test: a leading `>` narrows to
      commands, `@` to refs, `:` to views and settings pages, `#` reserved-and-documented for a
      future journal source, and a bare string searches everything. `palette.files` pins `mode:
      'files'` via `open('files')` rather than a query sigil — there is no fifth sigil character in
      the grammar, the finder is reached by chord, not by typing one — and that pin stays sticky
      while a non-sigil query fills in around it, reverting to `'all'` only once the query is cleared.
- [x] Escape ordering, written down rather than left informal. **Superseded by Phase 62, and this
      is the current rule:** `palette.tsx:246` calls
      `useDismiss(true, close, { layer: 'dialog' })` and the app-wide dismissal stack decides who
      hears an Escape. The comment there records that the old hand-rolled `stopPropagation()` "was
      inert". The half of the original rule that survives is the refusal — the palette still will
      not open while a modal dialog is up (`palette-store.test.ts:82`,
      `refuses to open while a modal dialog is up`; `:94` proves a *context menu* does not count).
- [ ] **The `View ▸ Command Palette` native menu item was never added.**
      [`menu.ts`](../../../packages/desktop/src/main/menu.ts)'s View submenu is, at `:120-141`,
      `app.reload, app.hardReload, view.refresh, ─, repos.toggle, terminal.toggle, browser.toggle,
      fab.toggle, activity.toggle, workflow.run, view.video` — `grep -n palette menu.ts` finds only
      a doc comment at `:11`. Add one item dispatching `palette.open`, in the separator group with
      the other toggles, labelled `Command Palette…`.
      - Give it **no** `accelerator`. An Electron accelerator fires whenever the window is focused,
        xterm included, and `palette.open` already reaches the app from inside a shell by being
        `scope: 'global'` — an OS-level binding would take the keystroke away from the dispatcher
        that knows about `YIELD_ROOTS`.
      - This is what makes the phase's third "Open, for a human" check able to pass; today it
        cannot.

### D — `fuzzy-match.ts` (S/M) ◐ PARTIAL (landed 2026-08-28; the frecency nudge reopened at x1)

There is **no fuzzy library anywhere in the workspace** and no character-level match highlighting
in the renderer. Both are net-new, and both are small.

- [x] New `packages/app/src/services/palette/fuzzy-match.ts` — `fuzzyMatch(needle, haystack):
      { score: number; indices: number[] } | null`. Subsequence matching with bonuses for a match at
      a word boundary, at the start of the string, and for consecutive runs; case-insensitive with a
      tie-break favouring an exact-case hit. Roughly sixty lines, hand-rolled on the same reasoning
      as [`lane-colors.ts`](../../../packages/app/src/features/graph/lane-colors.ts) and Phase 18's
      hand-drawn chart: a dependency here buys less than it costs, and returning `indices` is what
      makes highlighting fall out for free.
- [x] Matched-character highlighting in the result row, driven by those `indices`. The first `<mark>`
      in the renderer — the only existing "highlight" is Shiki in
      [`line-highlight.ts`](../../../packages/app/src/features/diff/line-highlight.ts) — so it gets a
      theme token, not a browser default.
- [x] A `keywords?: string` field on the palette item, following the precedent already sitting in
      [`multi-select-menu.tsx`](../../../packages/app/src/components/multi-select-menu.tsx), whose
      `MultiSelectOption` has had exactly this field for exactly this reason. It is how `Mod+Shift+u`
      is findable by typing "push" and how the Actions view is findable by typing "CI".
- [x] Ranking across sources: score within a source, then a per-source weight so a repo name cannot
      bury the command you were reaching for. The weights live in one exported table with a comment,
      not scattered through the sources — `SOURCE_WEIGHTS` in
      [`services/palette/source.tsx`](../../../packages/app/src/services/palette/source.tsx),
      applied by `scorePaletteItem(item, needle, sourceKey)`, which scores `label`, then `keywords`
      at ×0.9, then `detail` at ×0.7.
- [ ] **The frecency nudge never landed** — `grep -rn 'frecency\|lastAt\|recentCommands' packages/app/src`
      returns zero hits. It was the third clause of the item above and is the one part of Theme D's
      ranking that is still owed.
      - Build it as its own tiny persisted slice, **not** a field on `ui-store` and **not** on
        `palette-store.ts` (which is deliberately unpersisted): `Record<CommandId | string, { count:
        number; lastAt: number }>`, capped at **50** keys, evicting the lowest
        `count * recencyDecay` first.
      - Apply it as a *nudge*, after `SOURCE_WEIGHTS`: a bounded multiplier (≤1.25) on the final
        score, never a re-sort. A palette whose top row moves because of yesterday is worse than one
        that is merely alphabetical.
      - Test it in `palette-store.test.ts` alongside the existing suites: a run bumps the item, the
        cap evicts, and a never-run item's ordering is unchanged relative to its peers.
- [x] `fuzzy-match.test.ts`: acronym matches (`gsp` → "Graph: sync push"), consecutive-run scoring
      beating scattered, a non-match returning `null`, and `indices` always ascending and in range —
      the invariant the highlighter depends on.

### E — Navigation providers (M) ◐ PARTIAL (landed 2026-08-28; command grouping reopened at x1)

- [x] The interface every source implements: `{ id, label, group, icon?: IconComponent, keywords?,
      detail?, chord?, run(): void }` plus a `PaletteSource = { key, items(): PaletteItem[] }`. This
      is the seam that keeps the palette independent of
      [Phase 22](phase-22-stash-and-safety-net.md): a `journalSource` drops in later with no change
      to the palette itself — and the seam has since proved itself four times over
      (Phase 40's project boards, Phase 43's `workflow.run`, Phase 55's per-window scoping, Phase
      64's `theme.select`/`theme.import`).
      - **It is `source.tsx`, not `source.ts`** —
        [`services/palette/source.tsx`](../../../packages/app/src/services/palette/source.tsx) — because
        `highlightMatches(text, indices)` returns JSX. It also holds `SOURCE_WEIGHTS` and
        `scorePaletteItem`.
      - **There is no `services/palette/sources/` directory.** All seven providers collapsed into
        one file, [`services/palette/providers.ts`](../../../packages/app/src/services/palette/providers.ts):
        `createCommandSource`, `createViewsSource`, `createProjectBoardsSource`, `createReposSource`,
        `createTerminalSource`, `createRefsSource`, `createFilesSource`. Add the eighth beside them;
        do not start the directory the doc imagined.
- [x] The command source, over Theme B's runtime — every `CommandId`, its label, its chord, and its
      `disabledReason` when unavailable.
- [ ] **`CommandGroup` reaches the palette and is then thrown away.** Theme A added `group` to the
      registry *specifically* so the palette could group commands, and
      [`providers.ts:88`](../../../packages/app/src/services/palette/providers.ts) hard-codes every
      command's display group to the single string `'Commands'`. With 57 commands in one flat
      heading, the grouping the phase paid a `shared` contract field for does not exist on screen.
      - `buildFlatRows()` (`palette.tsx:41`) groups on the provider-supplied **display string**
        (`'Views'`, `'Repositories'`, `'Local Branches'`, `'Files'`, `'Agents'`, …). Map
        `CommandGroup` → a display label there (`repository` → `'Repository'`, `sync` → `'Sync'`,
        `operation` → `'Operations'`, …) and let `createCommandSource` emit it per item.
      - Keep the flat list when a needle is present: grouping is for the **unfiltered** open, where
        57 undifferentiated rows is the actual complaint. Once fuzzy scoring is ranking across
        sources, re-grouping by command family fights the ranking.
      - This is also what makes `groupCommands` in `palette-store.ts:83` live code again rather than
        test-only.
- [x] The views and settings source. Reuse `VIEW_ICON` and `PAGE_ICON` from
      [`nav-icons.ts`](../../../packages/app/src/components/nav-icons.ts) — **do not build a third map**;
      that file's comment warns that duplicating it lets surfaces drift, and "the same view wearing
      two different icons is worse than either icon". `SETTINGS_PAGES` in
      [`ui-store.ts`](../../../packages/app/src/store/ui-store.ts) already carries `{id, label, group}`,
      so the settings half is nearly free.
- [x] The repos and worktrees source, off `useRepos` / `useWorktrees` in
      [`queries.ts`](../../../packages/app/src/services/queries.ts) — both already react-query cached, so
      no IPC. A worktree row shows its checked-out branch as `detail` and its status pill count if
      Phase 17's counts are already loaded, and never fetches to fill a palette row.
- [x] The terminal sessions and agent roster source, off
      [`terminal-store.ts`](../../../packages/app/src/features/terminal/terminal-store.ts) and
      [`use-agents.ts`](../../../packages/app/src/features/terminal/use-agents.ts): switch to a session by
      name, or start a new agent session. Agent items carry their roster accent through
      `IconComponent`'s `style` prop — which is precisely why that type is declared structurally in
      [`icon-button.tsx`](../../../packages/app/src/components/icon-button.tsx) rather than importing one
      family's icon type. [`agent-commands.ts`](../../../packages/app/src/features/agent/agent-commands.ts)
      already has `{id, label, icon, hint}` and is the shape to mirror.
- [x] Command icons: a new `app`-side `Record<CommandId, IconComponent>` in the palette folder,
      react-icons per-set imports (`react-icons/lu`, never the root barrel), following
      [`CLAUDE.md`](../../../CLAUDE.md)'s rule that new icons come from react-icons while `lucide-react`
      stays where it already is.

### F — The refs source, and the safe-writes line (M) ✅ DONE (landed 2026-08-28)

- [x] The branches-and-tags source off `useRefs(repoId)`, grouped local / remote / tag, with the
      upstream relationship as `detail` where Phase 12's remote model already knows it.
- [x] Two actions per ref, and only two: **check out** (through the existing repo actions, which go
      through the per-repo write queue like every other write) and **reveal in graph** (scroll and
      select the row, reusing what the sidebar ref tree already does). Delete, rename, reset and
      merge are reachable from the ref badge menu in the graph and are deliberately not here.
- [x] An explicit exported `PALETTE_SAFE: readonly CommandId[]` allowlist — not a denylist. A new
      destructive command added in a later phase is absent from the palette by default, which is the
      failure mode you want; a denylist makes the same mistake the other way round and does it
      silently.
- [x] `palette-safety.test.ts` asserting the allowlist contains no command whose id is in the
      operation or reset families, in the string-shape style
      [`gh-write.test.ts`](../../../packages/desktop/src/main/forge/gh-write.test.ts) uses to assert
      `--undo` never appears. The test is the guardrail; the comment above the list explains it to
      whoever is tempted to extend it.
- [x] Honest empty states: with no repo open the palette still opens and still lists views, settings
      and `repo.open`, with the repo-scoped sources absent rather than rendered empty.

### G — The file finder (L) ✅ DONE (landed 2026-08-28)

**Land last, after A–F are green.** This is the only theme that crosses all four packages, and the
one that can slip without costing the phase its point.

- [x] `mstudio:fs:list-files` in [`channels.ts`](../../../packages/shared/src/ipc/channels.ts), with request
      and response schemas beside the existing `FsListDirRequest` in
      [`schemas.ts`](../../../packages/shared/src/ipc/schemas.ts) and an entry in
      [`bridge.ts`](../../../packages/shared/src/ipc/bridge.ts). It takes `{ repoId }` and returns
      repo-relative paths plus a `truncated` flag — the renderer never sends or receives an absolute
      path, which is a property of the fs contract and not a habit.
- [x] New `packages/git-engine/src/commands/list-files.ts` over `git ls-files -z --cached --others
      --exclude-standard`. NUL-delimited per the project-wide rule, and `.gitignore` respected for
      free by `--exclude-standard` — which is the actual reason to use `ls-files` rather than walking
      the tree with `fs`. `ls-files` already has two internal callers
      ([`diff.ts`](../../../packages/git-engine/src/commands/diff.ts),
      [`status-counts.ts`](../../../packages/git-engine/src/commands/status-counts.ts)); this is the first
      one with a channel.
- [x] Main handler beside the existing fs handlers, and the preload passthrough in
      [`preload/index.ts`](../../../packages/desktop/src/preload/index.ts).
- [x] The renderer file source: one index per repo, fetched on first file-mode open and cached under
      a key that includes the repo tip sha, so a commit or checkout invalidates it without a watcher
      subscription. A hard cap (**20 000 paths**) with the `truncated` flag surfaced in the palette
      footer — a finder that silently stops finding is worse than one that says it stopped.
- [x] Selecting a file opens it in the Phase 16 preview pane and reveals it in the folder explorer,
      expanding the ancestors the way clicking through would.
- [x] Scoring tuned for paths: the basename weighted above the directory segments, and a `/` in the
      needle switching to a path-aware match, so `src/pal/pal` finds what you meant.

### H — The focus trap, retrofitted (S) ✅ DONE (landed 2026-08-28)

**Shrunk, not dropped: the extraction landed under Phase 27 Theme G**, whose browser pane needed
`use-focus-trap.ts` before this phase existed to build it. `popover.tsx`'s inline trap — a
`FOCUSABLE` selector, a wrapping Tab cycle, and focus restored to the trigger on Escape — is now
[`components/use-focus-trap.ts`](../../../packages/app/src/components/use-focus-trap.ts), with no
behaviour change to `Popover` itself. `ConfirmDialog` and `PromptDialog` had none; they `autoFocus`
one control and let Tab walk out into the app behind them, which is what this theme existed to fix.

**Since landed, and superseded twice — do not re-derive any of it.** All three consumers are
retrofitted. Phase 68 Themes A/B then moved focus *restoration* inside `useFocusTrap` itself and
**deleted `palette.tsx`'s bespoke restore block**, which had three named bugs; `use-focus-trap.test.ts`
now carries twelve tests including `restores on unmount` and
`does not restore to a trigger that left the DOM`. A future change here belongs in the hook, never
in a consumer.

- [x] Extract `packages/app/src/components/use-focus-trap.ts` from `popover.tsx` with no behaviour
      change. ✅ landed as Phase 27 Theme G (2026-08-28) — `Popover` and the browser pane both
      consume it; `footer-monitor.spec.ts`'s existing flyout keyboard assertions are the regression
      guard, plus a dedicated `use-focus-trap.test.ts` covering both Tab directions.
- [x] `palette.tsx` consumes it rather than growing a third copy.
- [x] Retrofit [`confirm-dialog.tsx`](../../../packages/app/src/components/confirm-dialog.tsx) and
      [`prompt-dialog.tsx`](../../../packages/app/src/components/prompt-dialog.tsx). Both are modal and
      both are load-bearing — Phase 7's blast-radius gate is a `ConfirmDialog` — so the retrofit is
      last in the theme and each keeps its existing `autoFocus` target as the trap's initial focus.

*All eight themes A–H landed. Recovered from an interrupted session: F/G/H sat built but
uncommitted in the `feature/p23-fgh` worktree while three other loops landed on `main`; the
pre-push gate (`moon run :typecheck :lint :test`) is green on `main` post-merge.*

***Refinement x1 (2026-09-05) re-audited the phase against the tree and found three things still
owed**, each now an open item above rather than a claim: the **`View ▸ Command Palette` native menu
item** (Theme C) — `menu.ts`'s View submenu has no palette entry, which is why the third "Open, for
a human" check cannot pass; the **frecency nudge** (Theme D) — the third clause of the ranking item,
zero hits in the tree; and the **command grouping** (Theme E) — `providers.ts:88` hard-codes every
one of the 57 commands to a single `'Commands'` heading, so the `CommandGroup` field Theme A put
into `shared` never reaches the screen. Everything else in A–H is genuinely built and verified. The
Verification block below now names the specs that already cover each item, so what is left is one
missing NUL-path integration case, the screenshot pass, and the three human checks.*

## Files this phase touches

Reconciled against the tree at refinement x1 (2026-09-05). `(**unchanged**)` = load-bearing and
deliberately not edited; `(**named but never built**)` = the doc claimed it and it does not exist.

| Area | Files |
|------|-------|
| Contract | [`shared/src/keybindings.ts`](../../../packages/shared/src/keybindings.ts) — the registry, still data-only and importing nothing; now 394 lines / 57 commands / 42 chords, with `CommandGroup` (L23), `CommandScope` (L41), `COMMANDS` (L64), `COMMAND_IDS` (L287), `DEFAULT_KEYMAP` (L302), `GLOBAL_CHORDS` (L309), `YIELD_ROOTS` (L328) and `TERMINAL_YIELD_COMMANDS` (L390, a derived alias) · [`ipc/channels.ts`](../../../packages/shared/src/ipc/channels.ts), [`ipc/schemas.ts`](../../../packages/shared/src/ipc/schemas.ts), [`ipc/bridge.ts`](../../../packages/shared/src/ipc/bridge.ts) (Theme G only) |
| git-engine | [`commands/list-files.ts`](../../../packages/git-engine/src/commands/list-files.ts), [`commands/index.ts`](../../../packages/git-engine/src/commands/index.ts) |
| Main | the fs handler beside the existing `mstudio:fs:*` handlers · [`preload/index.ts`](../../../packages/desktop/src/preload/index.ts) · [`main/menu.ts`](../../../packages/desktop/src/main/menu.ts) — **the View ▸ Command Palette item is still missing**; the View submenu at L120-141 has no palette entry |
| Renderer — dispatch | [`services/keybindings/use-command-handlers.ts`](../../../packages/app/src/services/keybindings/use-command-handlers.ts) (`CommandEntry`, `CommandRuntime = Record<CommandId, CommandEntry>`, `useCommandHandlers()`; all 57 ids, rebuilt every render) · [`services/keybindings/use-keybindings.ts`](../../../packages/app/src/services/keybindings/use-keybindings.ts) (`useKeybindings(runtime)` L21, `shouldEscapeTerminal` L126, `yieldsToRoot` L104) · [`services/keybindings/chord.ts`](../../../packages/app/src/services/keybindings/chord.ts) (**unchanged**; load-bearing) · [`app.tsx`](../../../packages/app/src/app.tsx) (L555 `useKeybindings(useCommandHandlers())`, L1595 mounts `PaletteHost`) |
| Renderer — palette | [`services/palette/source.tsx`](../../../packages/app/src/services/palette/source.tsx) (**`.tsx`, not `.ts`** — `highlightMatches` returns JSX; also `SOURCE_WEIGHTS`, `scorePaletteItem`) · [`services/palette/providers.ts`](../../../packages/app/src/services/palette/providers.ts) (**all seven sources in one file**; there is no `services/palette/sources/` directory) · [`services/palette/fuzzy-match.ts`](../../../packages/app/src/services/palette/fuzzy-match.ts) (`fuzzyMatch`, `fuzzyMatchPath`) · [`features/palette/command-icons.ts`](../../../packages/app/src/features/palette/command-icons.ts) (**`features/`, not `services/`**) · [`components/palette.tsx`](../../../packages/app/src/components/palette.tsx) (`Palette()` L65; `buildFlatRows` L41; `MODE_PLACEHOLDER` L33; `useDismiss(…, {layer:'dialog'})` L246) · [`components/palette-host.tsx`](../../../packages/app/src/components/palette-host.tsx) (`PaletteHost`, `usePalette(): PaletteApi`) · [`store/palette-store.ts`](../../../packages/app/src/store/palette-store.ts) (`parsePaletteQuery` L38-52; `matchesQuery`/`filterCommands`/`groupCommands` L83 are **dead code today**) · [`features/status-bar/palette-toggle.tsx`](../../../packages/app/src/features/status-bar/palette-toggle.tsx) (the mouse affordance — on the **status-bar rail**, moved out of the title bar by Phase 39 Theme C) |
| Renderer — shared | [`components/use-focus-trap.ts`](../../../packages/app/src/components/use-focus-trap.ts) (now owns focus restoration too, per Phase 68) · [`components/popover.tsx`](../../../packages/app/src/components/popover.tsx), [`components/confirm-dialog.tsx`](../../../packages/app/src/components/confirm-dialog.tsx), [`components/prompt-dialog.tsx`](../../../packages/app/src/components/prompt-dialog.tsx) (all three retrofitted) · [`components/dialog-host.tsx`](../../../packages/app/src/components/dialog-host.tsx) (the shape the host copies) · [`components/nav-icons.ts`](../../../packages/app/src/components/nav-icons.ts) (reused, not extended) · [`components/icon-button.tsx`](../../../packages/app/src/components/icon-button.tsx) (`IconComponent`, **unchanged** — structurally typed on purpose) |
| Renderer — sources read | [`services/queries.ts`](../../../packages/app/src/services/queries.ts) · [`store/ui-store.ts`](../../../packages/app/src/store/ui-store.ts) (`SETTINGS_PAGES`, L206) · [`features/terminal/terminal-store.ts`](../../../packages/app/src/features/terminal/terminal-store.ts) · [`features/terminal/use-agents.ts`](../../../packages/app/src/features/terminal/use-agents.ts) · [`features/files/files-store.ts`](../../../packages/app/src/features/files/files-store.ts) · [`features/graph/graph-store.ts`](../../../packages/app/src/features/graph/graph-store.ts) |
| Docs | [`CLAUDE.md`](../../../CLAUDE.md) (the registry's real path and the chord table — kept current; note it describes the `.xterm` yield transitively now that `YIELD_ROOTS` owns the selector) · [`docs/INITIAL_PLAN.md`](../../../docs/INITIAL_PLAN.md) · [`outstanding.md`](../outstanding.md) |
| Tests | [`services/keybindings/keybindings.test.ts`](../../../packages/app/src/services/keybindings/keybindings.test.ts) (`the registry is palette-shaped`) · [`services/keybindings/use-keybindings.test.ts`](../../../packages/app/src/services/keybindings/use-keybindings.test.ts) · [`services/keybindings/use-command-handlers.test.ts`](../../../packages/app/src/services/keybindings/use-command-handlers.test.ts) · [`services/palette/fuzzy-match.test.ts`](../../../packages/app/src/services/palette/fuzzy-match.test.ts) · [`services/palette/providers.test.ts`](../../../packages/app/src/services/palette/providers.test.ts) · [`store/palette-store.test.ts`](../../../packages/app/src/store/palette-store.test.ts) (**this is where `parsePaletteQuery` is tested** — there is no `palette-query.test.ts`) · [`features/palette/palette-safety.test.ts`](../../../packages/app/src/features/palette/palette-safety.test.ts) · [`components/use-focus-trap.test.ts`](../../../packages/app/src/components/use-focus-trap.test.ts) · [`features/status-bar/palette-toggle.test.tsx`](../../../packages/app/src/features/status-bar/palette-toggle.test.tsx) · [`shared/src/ipc/ipc.test.ts`](../../../packages/shared/src/ipc/ipc.test.ts) (L985/L1005 pin the yield sets) · [`commands/list-files.integration.test.ts`](../../../packages/git-engine/src/commands/list-files.integration.test.ts) · [`e2e/palette.spec.ts`](../../../packages/app/e2e/palette.spec.ts) (14 tests) · [`e2e/mock-bridge.ts`](../../../packages/app/e2e/mock-bridge.ts) |

## Verification

Re-checked line by line at refinement x1. Where a test already covers an item, the item names it and
stays open only as the run-it-and-see gate; where nothing covers it, the item says what to write.

- [ ] `moon run :typecheck :lint :test` green.
- [ ] Boundary lint clean, and asserted deliberately for this phase — **already true**:
      `shared/src/keybindings.ts` has **zero `import` statements** and no function-typed field; the
      palette and every provider live entirely in `app` and reach main only through
      `window.midniteStudio`; `commands/list-files.ts` is plain Node in git-engine and imports no
      `electron`.
- [ ] Vitest (A) — **already covered** by `keybindings.test.ts`'s `the registry is palette-shaped`
      describe: `gives every CommandId a label and a group` (L133),
      `lists op.abort and op.continue with no chord, not silently dropped` (L140),
      `never binds two commands to the same chord outside the browser.*/terminal.* carve-outs`
      (L147), `keeps Mod+Shift+p as sync.pull` (L173), and
      `lets palette.open escape the terminal, and keeps palette.files from doing so` (L179).
      Alongside them, L187 pins the reload pair — the chords that displaced `view.refresh` and
      `sync.fetch`.
- [ ] Vitest (B) — **already covered** by `use-command-handlers.test.ts` `— no repo open` (L75
      disables `repo.close`/`view.refresh`/`status.commit`/the sync family with a reason, L117 does
      the same for `op.*`, L127 keeps the palette commands enabled).
- [ ] Vitest (C) — **already covered** by `palette-store.test.ts`'s `parsePaletteQuery` describe
      (L11/L18/L23) and the store's own suite (L82 refuses over a modal dialog, L94 does not refuse
      over a context menu, L106 sigil, L111 sticky pinned mode, L117 reset on clear). It lives in
      `palette-store.test.ts`, not the `palette-query.test.ts` the Files table used to promise.
- [ ] Vitest (D) — **already covered** by `fuzzy-match.test.ts` (L16 acronyms + word-boundary
      bonuses, L24 consecutive beats scattered, L32
      `produces strictly ascending indices within haystack range` — the highlighter's invariant —
      L50 exact-case, and `fuzzyMatchPath` at L58/L66). **Not covered:** the frecency nudge, because
      it does not exist; that assertion belongs with Theme D's reverted item.
- [ ] Vitest (E) — the command source emits a real `CommandGroup`-derived display group rather than
      the hard-coded `'Commands'`. Assert in
      [`providers.test.ts`](../../../packages/app/src/services/palette/providers.test.ts) beside its existing
      L21 case: two commands from different `CommandGroup`s produce two distinct `group` strings,
      and every value of the ten-member union maps to a non-empty label.
- [ ] Vitest (F) — **already covered** by `palette-safety.test.ts` L14
      (`contains no destructive or reset/operation family commands`, matched by family regex, not by
      enumeration) and L27 (every entry is a real `CommandId`). Note for anyone adding a command:
      `PALETTE_SAFE` is a **separate gate** from `COMMANDS`, and Phase 43 Theme I found it the hard
      way — a new palette-reachable command must be registered in all four places (`COMMANDS`,
      `PALETTE_SAFE`, `COMMAND_ICONS`, the `CommandRuntime` record).
- [ ] Vitest integration (G) — **partial**.
      [`list-files.integration.test.ts`](../../../packages/git-engine/src/commands/list-files.integration.test.ts)
      has only two tests: L36 (an ignored file absent, an untracked-but-not-ignored file present)
      and L49 (the cap producing `truncated: true`). **Add the two NUL cases the project-wide
      parsing rule exists for**: a tracked path containing a space, and one containing a literal
      newline, both surviving the `-z` split intact. Those are the only assertions that would catch
      a regression to whitespace splitting.
- [ ] Playwright — **already covered, and then some**.
      [`e2e/palette.spec.ts`](../../../packages/app/e2e/palette.spec.ts) has 14 tests including all seven this
      item named: L48 `Mod+K` opens over the graph and Escape closes, L95 typing narrows across
      groups, L111 `↓`+`Enter` runs and closes, L166 a disabled command shows its reason and does
      not run, L180 `Mod+g` typed into the palette does not toggle the repos panel, L194 `Mod+K`
      opens while the terminal has focus, and L82 focus returns to the trigger.
      - **Platform trap for any spec added here:** press `ControlOrMeta`, never a hard-coded
        `Meta+k`. Nine specs in this exact file once did, which does nothing on Linux CI and cost
        three 60s retries each — the shard looked hung at 22 minutes
        ([`outstanding.md`](../outstanding.md)).
- [ ] Screenshot, per the visual-phase convention — **none exist for this surface.** There is no
      palette shots spec; `theme-palette-shots.spec.ts` is Phase 64's *colour* palette, not this
      one. Add `e2e/palette-shots.spec.ts`: the palette empty, mid-query with matched characters
      highlighted across three groups, in file mode, and showing a disabled command with its
      reason — all in both themes.
- [ ] **Open, for a human:** open the palette from inside a running agent session and confirm
      `Mod+K` reaches the app rather than the shell, then confirm every other chord still reaches
      the shell — **except** the six in the `.xterm` yield set (`app.reload`, `app.hardReload`,
      `panel.back`, `panel.forward`, `fab.toggle`, `window.detachActive`), which are supposed to
      reach the app.
- [ ] **Open, for a human:** the file finder against a genuinely large repository (>20 000 tracked
      files) — confirm the first open is not perceptibly slow, that the truncation notice appears,
      and that typing stays responsive.
- [ ] **Open, for a human:** with the app packaged, confirm `repo.open` / `repo.close` /
      `view.refresh` are no longer inert from the native menu. The **View ▸ Command Palette** half of
      this check cannot pass until Theme C's reverted item adds the menu entry.

## Not in this phase

- **User-editable keybindings.** `DEFAULT_KEYMAP` stays the only keymap; there is no rebinding UI
  and no persisted user overrides. The palette makes every command reachable without a chord, which
  is most of what a rebinding UI is wanted for, and a Settings ▸ Keyboard page over a persisted
  override map is its own phase with its own conflict-detection problem.
- **`op.abort` and `op.continue`.** Declared, unbound, and left that way.
  [Phase 22](phase-22-stash-and-safety-net.md) rebuilds operation state across Themes A–D and
  reaching into it from here would collide with the larger phase for two rows.
- **The ops-journal source.** Phase 22 Theme H's journal is the obvious second data source and
  Theme E's provider interface is shaped so it drops in with no palette change — but Phase 22 is
  unstarted, Theme H is flagged there as the one that can stall the rest, and a palette that waits
  on it ships never.
- **Commit search.** The graph rows are already in memory, which makes fuzzy search over commit
  subjects look free, and it is not: the store holds up to fifty thousand laid-out rows and scoring
  all of them on every keystroke belongs in a worker, not in a keydown handler. It wants the same
  treatment `layoutGraph` got — measurement first.
- **Destructive git writes from the palette**, and any change to the `Shift+F` / `Shift+P` /
  `Shift+U` sync triad. Both are guardrails, stated here so a later phase has to argue with them
  rather than drift past them.
- **A second palette component for files.** One surface, one component, a mode. Two components that
  look identical is how they stop looking identical.
- **Non-macOS shapes.** `chordFromEvent` already normalises `Mod` to Ctrl off darwin and should
  port, but Phase 23 is verified on darwin like every phase before it.

## Decisions / open questions

- **Resolved — `Mod+K`, and `Mod+Shift+P` stays Pull.** The VS Code convention was considered and
  rejected: `Mod+Shift+p` is `sync.pull` inside a fetch-pull-push triad that reads as a set, and
  bare `Mod+P` is both free and the conventional file-finder binding. It held —
  `keybindings.test.ts:173` still pins it, through eleven later phases of chord churn.
- **Resolved — one surface with a sigil grammar**, not two bindings with two default modes and not
  a single always-mixed list. Shipped exactly as specified, in
  [`palette-store.ts:38-52`](../../../packages/app/src/store/palette-store.ts):
  `SIGIL_MODE = { '>': 'commands', '@': 'refs', ':': 'views', '#': 'journal' }`, with
  `parsePaletteQuery` falling through to `{ mode: 'all', needle: input }`. `#` is still the reserved
  journal sigil and still the only mode rendering `MODE_PLACEHOLDER`.
- **Resolved — safe writes only, as an allowlist.** `PALETTE_SAFE` shipped and has since been
  load-bearing in a way the doc did not foresee: Phase 43 Theme I discovered it is a **separate
  fourth gate** a new command must be registered in, alongside `COMMANDS`, `COMMAND_ICONS` and the
  `CommandRuntime` record. That is the allowlist working — a command added in three places out of
  four is absent from the palette, which is the failure direction we chose.
- **Resolved — the four cheap dead commands got wired here**, and the problem has stayed fixed:
  all 57 `CommandId`s have a `CommandEntry` today, not nine of fifteen. `op.abort`/`op.continue`
  remain deliberately declared-and-disabled (`use-command-handlers.ts:303-304`,
  `disabledReason: 'Coming in Phase 22'` — **that reason string is now stale**: Phase 22 landed, and
  the two ids stay unwired by choice, so the string should say why rather than name a phase that
  is done).
- **Resolved — the file finder stayed in the phase and landed last.** It did, and it is the one
  theme whose verification is still short a case (the two NUL-path assertions).
- **Resolved — the focus trap is extracted and retrofitted**, and has since been improved twice:
  Phase 27 Theme G extracted it, this phase's Theme H retrofitted the two dialogs, and Phase 68
  moved restoration inside the hook and deleted the palette's own copy. Three consumers, one
  implementation — which is what the decision was for.
- **Resolved — the palette stayed independent of Phase 22**, and the seam earned its keep far past
  the journal: Phases 40, 43, 55 and 64 all added sources or commands with no change to `palette.tsx`.
- **Resolved — `group` is an explicit field in `shared`, not derived from the `id` prefix.** The
  union is now ten members and the prefixes have kept multiplying (`window.`, `browser.`,
  `theme.`, `workflow.`, `panel.`, `activity.`, `fab.`, `app.`), which is exactly the drift the
  derivation would have made silent. *But note the field is currently unused by the surface it was
  added for* — see Theme E's open item. The decision is right; the wiring is missing.
- **Resolved in shape, still unbuilt — where frecency lives.** Its own small persisted slice,
  `Record<string, { count, lastAt }>` capped at ~50 keys, *not* a field on `ui-store` and *not* on
  the deliberately-unpersisted `palette-store`. Recorded as resolved because the shape is settled
  and the reasoning has not changed; the work is Theme D's open item, and the nudge must be a
  bounded multiplier on the final score rather than a re-sort.
- **Resolved — the file index invalidates on palette open, keyed on the repo tip sha**, rather than
  subscribing to the Phase 10 watcher. The watcher route is more correct and costs a `WatchKind`
  fan-out plus an invalidation-map entry for a list only ever read when a human has just pressed a
  key. Revisit only if a stale index is actually observed after an external checkout.
- **Resolved — hand-rolled `fuzzyMatch`.** Shipped as
  [`services/palette/fuzzy-match.ts`](../../../packages/app/src/services/palette/fuzzy-match.ts), 201
  lines, exporting `fuzzyMatch(needle, haystack)` and `fuzzyMatchPath(needle, path)`. Theme G's path
  scoring did want its own function, and it got one *in the same module* rather than a dependency —
  which is the outcome the decision predicted. No fuzzy library is in the workspace and none is
  needed.
- **Resolved — agent *commands* stay out.**
  [`agent-commands.ts`](../../../packages/app/src/features/agent/agent-commands.ts) is still well-shaped
  for it and still writes into a live pty, which is a different kind of action from anything else in
  the list. `createTerminalSource` lists sessions and agents; it does not type into them.
- **Resolved, then moved — the palette has a mouse affordance, on the status-bar rail.** The
  decision was "one entry point in the title bar beside the breadcrumbs, showing `⌘K`", and that is
  where it first landed. **Phase 39 Theme C moved it out of the title bar** to
  [`features/status-bar/palette-toggle.tsx`](../../../packages/app/src/features/status-bar/palette-toggle.tsx),
  paired with a go-to-file toggle, with `chordFor`/`displayChord` from `chord-hint.ts` rendering the
  hint. The reasoning survives the move — discoverability was worth the pixels — so the doc records
  the new home rather than the old argument.
- **Open — should the palette's own commands be scoped per window?** Phase 55 detached pages and
  scoped the dispatcher and the palette into every popout, so a palette opened in a detached window
  lists commands whose handlers may target the main window. *Recommendation:* leave as shipped and
  do not invent a scoping field here; if a real mis-target is observed, the fix belongs in
  `use-command-handlers.ts`'s per-window runtime, not in the `shared` registry — which must stay
  data-only.
