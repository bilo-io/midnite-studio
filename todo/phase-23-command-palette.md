# Phase 23 — A command palette, and the registry that can finally feed it

Twenty-two phases in, Midnite Git has fifteen named commands, thirteen keyboard chords, a native
menu that dispatches by command id, and no way to reach any of it by typing. The keymap module's own
doc comment has been promising the missing surface since Phase 9 — it names "(later) a command
palette" as dispatch source number three, beside the window keydown listener and the native menu —
and [`outstanding.md`](outstanding.md) has carried the same note ever since. This phase builds
source number three.

It also has to fix the registry first, because the registry cannot feed a palette as it stands.
Start with the link: both [`outstanding.md`](outstanding.md) and
[Phase 22's out-of-scope list](phase-22-stash-and-safety-net.md) point at
`packages/app/src/services/keybindings/commands.ts`, and **that file does not exist**. The registry
is [`shared/src/keybindings.ts`](../packages/shared/src/keybindings.ts), 89 lines of zod-free plain
data, and it is deliberately in `shared` because the native menu in
[`menu.ts`](../packages/desktop/src/main/menu.ts) dispatches the same `CommandId` values across the
IPC boundary. Then start with the shape: `COMMAND_IDS` has **fifteen** entries and `DEFAULT_KEYMAP`
has **thirteen** — `op.abort` and `op.continue` are declared ids with no binding at all, so a
palette iterating the keymap silently omits them, while a palette iterating the ids gets no label.
Neither list alone is a sufficient data source. And most of all, start with the handlers: they live
in a single inline object literal in [`app.tsx`](../packages/app/src/app.tsx), passed straight to
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
keyed by `CommandId` exactly as [`nav-icons.ts`](../packages/app/src/components/nav-icons.ts)
already does for `ViewId`. The palette performs **safe writes only**: checkout, fetch, pull, stage,
open-the-commit-box, and nothing whose inverse is a reset. Destructive ops stay in the graph where
the Phase 7 blast radius is in front of you — a palette is a surface optimised for typing fast, and
that is the wrong place to be one keystroke from orphaning commits. Every palette layer uses the
`zIndex` tokens in [`tailwind.config.ts`](../packages/app/tailwind.config.ts) and never a literal;
`z-50` renders *under* `@bilo-io/shell`'s title bar and that bug has already been shipped twice. And
the palette owns no dispatch machinery of its own: it is a third caller into the same
`CommandId → handler` map the keyboard and the menu already use.

Effort tags: **S** ≈ an hour or two · **M** ≈ half a day · **L** ≈ a day plus.

## Deliverables

### A — The registry becomes palette-shaped (S) ✅ DONE (landed 2026-08-28)

Lands first; every other theme reads off it.

- [x] Reconcile the fifteen-ids / thirteen-bindings split in
      [`shared/src/keybindings.ts`](../packages/shared/src/keybindings.ts). One list becomes the
      source of truth and the other is derived: every `CommandId` gets a `label` and an optional
      `chord`, so an unbound command (`op.abort`, `op.continue`) is a first-class palette row with
      no shortcut rather than an entry that vanishes. Keep `GLOBAL_CHORDS` derived from
      `scope === 'global'` — it is what lets a chord escape xterm and it must not become hand-listed.
- [x] Add `group` to the command record as a plain string literal union (`'repository' | 'view' |
      'sync' | 'terminal' | 'status' | 'graph' | 'operation'`), with a comment recording that the
      alternative — deriving the group from the `id` prefix before the dot — was rejected because
      those prefixes are consistent by habit, not by contract, and a palette that regroups itself
      when someone renames an id is a palette with a trap in it.
- [x] Add `palette.open` (`Mod+k`) and `palette.files` (`Mod+p`) to `COMMAND_IDS` and the keymap.
      `palette.open` is **`scope: 'global'`** — it joins `Ctrl+\`` as the second chord that escapes
      the terminal, because a palette you cannot open while a shell has focus is half a palette.
- [x] Fix the phantom `commands.ts` link in [`outstanding.md`](outstanding.md) and in
      [`phase-22`](phase-22-stash-and-safety-net.md)'s "Not in this phase" list — both point at a
      path that has never existed. Note the real location in
      [`CLAUDE.md`](../CLAUDE.md)'s keybindings bullet while we are there.
- [x] Extend [`keybindings.test.ts`](../packages/app/src/services/keybindings/keybindings.test.ts):
      every `CommandId` has a label; no two bindings share a chord; `Mod+Shift+p` still resolves to
      `sync.pull`; `palette.open` is in `GLOBAL_CHORDS` and `palette.files` is not.

### B — `useCommandHandlers()` — one dispatcher, three feeds (M) ✅ DONE (landed 2026-08-28)

The keymap's doc comment describes this hook; it just was never written.

- [x] New `packages/app/src/services/keybindings/use-command-handlers.ts` exporting
      `useCommandHandlers(): CommandRuntime`, where `CommandRuntime` is
      `Record<CommandId, { run: () => void; enabled: boolean; disabledReason?: string }>`. Move the
      inline handler literal out of [`app.tsx`](../packages/app/src/app.tsx) verbatim first, then
      extend it — the object is deliberately rebuilt every render so it closes over current state,
      and that property has to survive the move.
- [x] Wire `repo.open` and `repo.close`. Both have keymap entries (`Mod+o`, `Mod+w`) **and** live
      native menu items and currently do nothing; `useRepos` and the repos panel already hold
      everything the handlers need.
- [x] Wire `view.refresh` (`Mod+r`) onto the react-query invalidation the watcher already drives
      through [`watch-invalidation.ts`](../packages/app/src/services/watch-invalidation.ts), so the
      manual refresh and the automatic one cannot drift apart.
- [x] Wire `status.commit` (`Mod+Enter`) to focus-and-submit the commit box, matching what the
      Changes view does on click rather than reaching past it. Threaded through a new
      `commit-box-store.ts` — the one imperative seam between the global command and `StatusPanel`'s
      own local commit-box state, which stays where it was rather than lifting into the store.
- [x] Give every entry `enabled` + `disabledReason`, following
      [`icon-button.tsx`](../packages/app/src/components/icon-button.tsx)'s habit of appending the
      reason to the tooltip: with no repo open, `sync.*` and `status.*` are present-but-unavailable
      and say why, instead of being absent (a command that disappears teaches nothing) or failing
      silently (which is what happens today).
- [x] `app.tsx` ends the theme thinner than it started: `useKeybindings(runtime)`,
      `bridge()?.menu.onCommand` and the palette all read the one runtime, and `op.abort` /
      `op.continue` remain deliberately unwired with a comment pointing at
      [Phase 22](phase-22-stash-and-safety-net.md), which owns operation state.

### C — The surface (M) ✅ DONE (landed 2026-08-28)

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
      is a naive case-insensitive substring match for this theme; Theme D replaces it with real
      fuzzy scoring and matched-character highlighting. Every mode besides `commands`/`all` (`refs`,
      `views`, `files`, `journal`) renders a one-line "arrives in Theme X" placeholder — one
      component, no second one invented ahead of its source landing.
- [x] New `packages/app/src/components/palette-host.tsx` shaped after
      [`dialog-host.tsx`](../packages/app/src/components/dialog-host.tsx): mounted once in
      `app.tsx`, owning open/closed state, exposing an imperative `usePalette(): PaletteApi`
      (`open(mode?)`, `close()`). Unlike `DialogHost`, the open/closed bit itself lives in
      `palette-store.ts` (zustand), not local `useState` behind a Context — `use-keybindings.ts`
      has to read it from outside the render cycle entirely. It is the same pattern
      [Phase 22 Theme H](phase-22-stash-and-safety-net.md) plans for `toast-host.tsx`; whichever
      lands first sets the precedent for the third global surface.
- [x] A palette-open short-circuit at the top of `onKeyDown` in
      [`use-keybindings.ts`](../packages/app/src/services/keybindings/use-keybindings.ts). The
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
- [x] Escape ordering, written down rather than left informal: `Popover` calls `stopPropagation()` on
      its Escape and the two dialogs do not, so a palette opened over a dialog needs a stated rule.
      The palette closes on Escape and stops propagation; it refuses to open while a modal dialog is
      up, which is one line and removes the whole nesting question.

### D — `fuzzy-match.ts` (S/M)

There is **no fuzzy library anywhere in the workspace** and no character-level match highlighting
in the renderer. Both are net-new, and both are small.

- [ ] New `packages/app/src/services/palette/fuzzy-match.ts` — `fuzzyMatch(needle, haystack):
      { score: number; indices: number[] } | null`. Subsequence matching with bonuses for a match at
      a word boundary, at the start of the string, and for consecutive runs; case-insensitive with a
      tie-break favouring an exact-case hit. Roughly sixty lines, hand-rolled on the same reasoning
      as [`lane-colors.ts`](../packages/git-engine/src/layout/lane-colors.ts) and Phase 18's
      hand-drawn chart: a dependency here buys less than it costs, and returning `indices` is what
      makes highlighting fall out for free.
- [ ] Matched-character highlighting in the result row, driven by those `indices`. The first `<mark>`
      in the renderer — the only existing "highlight" is Shiki in
      [`line-highlight.ts`](../packages/app/src/features/diff/line-highlight.ts) — so it gets a
      theme token, not a browser default.
- [ ] A `keywords?: string` field on the palette item, following the precedent already sitting in
      [`multi-select-menu.tsx`](../packages/app/src/components/multi-select-menu.tsx), whose
      `MultiSelectOption` has had exactly this field for exactly this reason. It is how `Mod+Shift+u`
      is findable by typing "push" and how the Actions view is findable by typing "CI".
- [ ] Ranking across sources: score within a source, then a per-source weight so a repo name cannot
      bury the command you were reaching for, then a frecency nudge for recently-run items. The
      weights live in one exported table with a comment, not scattered through the sources.
- [ ] `fuzzy-match.test.ts`: acronym matches (`gsp` → "Graph: sync push"), consecutive-run scoring
      beating scattered, a non-match returning `null`, and `indices` always ascending and in range —
      the invariant the highlighter depends on.

### E — Navigation providers (M)

- [ ] New `packages/app/src/services/palette/source.ts` — the interface every source implements:
      `{ id, label, group, icon?: IconComponent, keywords?, detail?, chord?, run(): void }` plus a
      `PaletteSource = { key, items(): PaletteItem[] }`. This is the seam that keeps the palette
      independent of [Phase 22](phase-22-stash-and-safety-net.md): a `journalSource` drops in later
      with no change to the palette itself.
- [ ] The command source, over Theme B's runtime — every `CommandId`, its label, its group, its
      chord, and its `disabledReason` when unavailable.
- [ ] The views and settings source. Reuse `VIEW_ICON` and `PAGE_ICON` from
      [`nav-icons.ts`](../packages/app/src/components/nav-icons.ts) — **do not build a third map**;
      that file's comment warns that duplicating it lets surfaces drift, and "the same view wearing
      two different icons is worse than either icon". `SETTINGS_PAGES` in
      [`ui-store.ts`](../packages/app/src/store/ui-store.ts) already carries `{id, label, group}`,
      so the settings half is nearly free.
- [ ] The repos and worktrees source, off `useRepos` / `useWorktrees` in
      [`queries.ts`](../packages/app/src/services/queries.ts) — both already react-query cached, so
      no IPC. A worktree row shows its checked-out branch as `detail` and its status pill count if
      Phase 17's counts are already loaded, and never fetches to fill a palette row.
- [ ] The terminal sessions and agent roster source, off
      [`terminal-store.ts`](../packages/app/src/features/terminal/terminal-store.ts) and
      [`use-agents.ts`](../packages/app/src/features/terminal/use-agents.ts): switch to a session by
      name, or start a new agent session. Agent items carry their roster accent through
      `IconComponent`'s `style` prop — which is precisely why that type is declared structurally in
      [`icon-button.tsx`](../packages/app/src/components/icon-button.tsx) rather than importing one
      family's icon type. [`agent-commands.ts`](../packages/app/src/features/agent/agent-commands.ts)
      already has `{id, label, icon, hint}` and is the shape to mirror.
- [ ] Command icons: a new `app`-side `Record<CommandId, IconComponent>` in the palette folder,
      react-icons per-set imports (`react-icons/lu`, never the root barrel), following
      [`CLAUDE.md`](../CLAUDE.md)'s rule that new icons come from react-icons while `lucide-react`
      stays where it already is.

### F — The refs source, and the safe-writes line (M)

- [ ] The branches-and-tags source off `useRefs(repoId)`, grouped local / remote / tag, with the
      upstream relationship as `detail` where Phase 12's remote model already knows it.
- [ ] Two actions per ref, and only two: **check out** (through the existing repo actions, which go
      through the per-repo write queue like every other write) and **reveal in graph** (scroll and
      select the row, reusing what the sidebar ref tree already does). Delete, rename, reset and
      merge are reachable from the ref badge menu in the graph and are deliberately not here.
- [ ] An explicit exported `PALETTE_SAFE: readonly CommandId[]` allowlist — not a denylist. A new
      destructive command added in a later phase is absent from the palette by default, which is the
      failure mode you want; a denylist makes the same mistake the other way round and does it
      silently.
- [ ] `palette-safety.test.ts` asserting the allowlist contains no command whose id is in the
      operation or reset families, in the string-shape style
      [`gh-write.test.ts`](../packages/desktop/src/main/forge/gh-write.test.ts) uses to assert
      `--undo` never appears. The test is the guardrail; the comment above the list explains it to
      whoever is tempted to extend it.
- [ ] Honest empty states: with no repo open the palette still opens and still lists views, settings
      and `repo.open`, with the repo-scoped sources absent rather than rendered empty.

### G — The file finder (L)

**Land last, after A–F are green.** This is the only theme that crosses all four packages, and the
one that can slip without costing the phase its point.

- [ ] `mgit:fs:list-files` in [`channels.ts`](../packages/shared/src/ipc/channels.ts), with request
      and response schemas beside the existing `FsListDirRequest` in
      [`schemas.ts`](../packages/shared/src/ipc/schemas.ts) and an entry in
      [`bridge.ts`](../packages/shared/src/ipc/bridge.ts). It takes `{ repoId }` and returns
      repo-relative paths plus a `truncated` flag — the renderer never sends or receives an absolute
      path, which is a property of the fs contract and not a habit.
- [ ] New `packages/git-engine/src/commands/list-files.ts` over `git ls-files -z --cached --others
      --exclude-standard`. NUL-delimited per the project-wide rule, and `.gitignore` respected for
      free by `--exclude-standard` — which is the actual reason to use `ls-files` rather than walking
      the tree with `fs`. `ls-files` already has two internal callers
      ([`diff.ts`](../packages/git-engine/src/commands/diff.ts),
      [`status-counts.ts`](../packages/git-engine/src/commands/status-counts.ts)); this is the first
      one with a channel.
- [ ] Main handler beside the existing fs handlers, and the preload passthrough in
      [`preload/index.ts`](../packages/desktop/src/preload/index.ts).
- [ ] The renderer file source: one index per repo, fetched on first file-mode open and cached under
      a key that includes the repo tip sha, so a commit or checkout invalidates it without a watcher
      subscription. A hard cap (**20 000 paths**) with the `truncated` flag surfaced in the palette
      footer — a finder that silently stops finding is worse than one that says it stopped.
- [ ] Selecting a file opens it in the Phase 16 preview pane and reveals it in the folder explorer,
      expanding the ancestors the way clicking through would.
- [ ] Scoring tuned for paths: the basename weighted above the directory segments, and a `/` in the
      needle switching to a path-aware match, so `src/pal/pal` finds what you meant.

### H — The focus trap, retrofitted (S)

**Shrunk, not dropped: the extraction landed under Phase 27 Theme G**, whose browser pane needed
`use-focus-trap.ts` before this phase existed to build it. `popover.tsx`'s inline trap — a
`FOCUSABLE` selector, a wrapping Tab cycle, and focus restored to the trigger on Escape — is now
[`components/use-focus-trap.ts`](../packages/app/src/components/use-focus-trap.ts), with no
behaviour change to `Popover` itself. `ConfirmDialog` and `PromptDialog` still have none; they
`autoFocus` one control and let Tab walk out into the app behind them, which is what this theme
now exists to fix.

- [x] Extract `packages/app/src/components/use-focus-trap.ts` from `popover.tsx` with no behaviour
      change. ✅ landed as Phase 27 Theme G (2026-08-28) — `Popover` and the browser pane both
      consume it; `footer-monitor.spec.ts`'s existing flyout keyboard assertions are the regression
      guard. A dedicated `use-focus-trap.test.ts` covering both Tab directions is still open.
- [ ] `palette.tsx` consumes it rather than growing a third copy.
- [ ] Retrofit [`confirm-dialog.tsx`](../packages/app/src/components/confirm-dialog.tsx) and
      [`prompt-dialog.tsx`](../packages/app/src/components/prompt-dialog.tsx). Both are modal and
      both are load-bearing — Phase 7's blast-radius gate is a `ConfirmDialog` — so the retrofit is
      last in the theme and each keeps its existing `autoFocus` target as the trap's initial focus.

## Files this phase touches

| Area | Files |
|------|-------|
| Contract | [`shared/src/keybindings.ts`](../packages/shared/src/keybindings.ts) (the registry — reconciled, `group` added, still data-only), [`ipc/channels.ts`](../packages/shared/src/ipc/channels.ts), [`ipc/schemas.ts`](../packages/shared/src/ipc/schemas.ts), [`ipc/bridge.ts`](../packages/shared/src/ipc/bridge.ts) (all three for Theme G only) |
| git-engine | new `commands/list-files.ts`, [`commands/index.ts`](../packages/git-engine/src/commands/index.ts) |
| Main | new fs handler beside the existing `mgit:fs:*` handlers, [`preload/index.ts`](../packages/desktop/src/preload/index.ts), [`main/menu.ts`](../packages/desktop/src/main/menu.ts) (a View ▸ Command Palette item on the new command id) |
| Renderer — dispatch | new [`services/keybindings/use-command-handlers.ts`](../packages/app/src/services/keybindings/use-command-handlers.ts), [`services/keybindings/use-keybindings.ts`](../packages/app/src/services/keybindings/use-keybindings.ts), [`services/keybindings/chord.ts`](../packages/app/src/services/keybindings/chord.ts) (unchanged; load-bearing), [`app.tsx`](../packages/app/src/app.tsx) (ends thinner than it started) |
| Renderer — palette | new `services/palette/source.ts`, new `services/palette/fuzzy-match.ts`, new `services/palette/command-icons.ts`, new `services/palette/sources/` (commands, views, repos, refs, sessions, files), new [`components/palette.tsx`](../packages/app/src/components/palette.tsx), new `components/palette-host.tsx`, new [`store/palette-store.ts`](../packages/app/src/store/palette-store.ts) |
| Renderer — shared | new [`components/use-focus-trap.ts`](../packages/app/src/components/use-focus-trap.ts), [`components/popover.tsx`](../packages/app/src/components/popover.tsx), [`components/confirm-dialog.tsx`](../packages/app/src/components/confirm-dialog.tsx), [`components/prompt-dialog.tsx`](../packages/app/src/components/prompt-dialog.tsx), [`components/dialog-host.tsx`](../packages/app/src/components/dialog-host.tsx) (the shape the host copies), [`components/nav-icons.ts`](../packages/app/src/components/nav-icons.ts) (reused, not extended), [`components/icon-button.tsx`](../packages/app/src/components/icon-button.tsx) (`IconComponent`, unchanged) |
| Renderer — sources read | [`services/queries.ts`](../packages/app/src/services/queries.ts), [`store/ui-store.ts`](../packages/app/src/store/ui-store.ts), [`features/terminal/terminal-store.ts`](../packages/app/src/features/terminal/terminal-store.ts), [`features/terminal/use-agents.ts`](../packages/app/src/features/terminal/use-agents.ts), [`features/files/files-store.ts`](../packages/app/src/features/files/files-store.ts), [`features/graph/graph-store.ts`](../packages/app/src/features/graph/graph-store.ts) |
| Docs | [`CLAUDE.md`](../CLAUDE.md) (the registry's real path, and `Mod+K` beside the `Ctrl+\`` note), [`docs/INITIAL_PLAN.md`](../docs/INITIAL_PLAN.md), [`todo/outstanding.md`](outstanding.md) (the palette comes off the list; the phantom link is fixed), [`phase-22`](phase-22-stash-and-safety-net.md) (same link) |
| Tests | [`keybindings.test.ts`](../packages/app/src/services/keybindings/keybindings.test.ts), new `fuzzy-match.test.ts`, new `palette-store.test.ts`, new `palette-query.test.ts`, new `palette-safety.test.ts`, new `use-focus-trap.test.ts`, new `list-files.integration.test.ts`, new `e2e/palette.spec.ts`, [`e2e/mock-bridge.ts`](../packages/app/e2e/mock-bridge.ts) |

## Verification

- [ ] `moon run :typecheck :lint :test` green.
- [ ] Boundary lint clean, and asserted deliberately for this phase: `shared/src/keybindings.ts`
      still imports nothing and holds no function-typed field; the palette and every source live
      entirely in `app` and reach main only through `window.midniteGit`; `list-files` is plain Node
      in git-engine and imports no `electron`.
- [ ] Vitest (A): every `CommandId` resolves to a label and a group; chords are unique;
      `Mod+Shift+p` is still `sync.pull`; `palette.open` escapes the terminal and `palette.files`
      does not.
- [ ] Vitest (B): the runtime reports `enabled: false` with a reason for `sync.*` and `status.*`
      when no repo is open, and every id the palette lists has a `run`.
- [ ] Vitest (C): `parsePaletteQuery` over each sigil, a sigil with no needle, a bare needle, and a
      `>` appearing mid-string (which is a needle character, not a mode switch).
- [ ] Vitest (D): the ranking cases above, plus `indices` ascending and in range for every match —
      the highlighter's invariant.
- [ ] Vitest (F): `PALETTE_SAFE` contains no destructive command id, asserted by family rather than
      by enumeration so a future addition fails the test instead of sliding in.
- [ ] Vitest integration (G): `listFiles` against a scratch repo — an ignored file absent, an
      untracked-but-not-ignored file present, a path containing a space and one containing a newline
      surviving the NUL split, and the cap producing `truncated: true`.
- [ ] Playwright (`e2e/palette.spec.ts`): `Mod+K` opens over the graph; typing narrows across
      groups; `↑`/`↓`/`Enter` select; `Escape` closes and returns focus to where it was; a disabled
      command shows its reason and does not run; `Mod+K` opens while the terminal has focus; and
      `Mod+g` typed into the palette does **not** toggle the repos panel.
- [ ] Screenshot, per the visual-phase convention: the palette empty, mid-query with matched
      characters highlighted across three groups, in file mode, and showing a disabled command with
      its reason — all in both themes.
- [ ] **Open, for a human:** open the palette from inside a running agent session and confirm
      `Mod+K` reaches the app rather than the shell, then confirm every other chord still reaches the
      shell.
- [ ] **Open, for a human:** the file finder against a genuinely large repository (>20 000 tracked
      files) — confirm the first open is not perceptibly slow, that the truncation notice appears,
      and that typing stays responsive.
- [ ] **Open, for a human:** with the app packaged, confirm the new View ▸ Command Palette menu item
      works and that `repo.open` / `repo.close` / `view.refresh` are no longer inert from the native
      menu.

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
  bare `Mod+P` is both free and the conventional file-finder binding. Nothing moves.
- **Resolved — one surface with a sigil grammar**, not two bindings with two default modes and not a
  single always-mixed list. `>` commands, `@` refs, `:` views and settings, bare text everything;
  `Mod+P` is `Mod+K` with the file sigil pre-filled. One component to build, test, screenshot and
  document.
- **Resolved — safe writes only, as an allowlist.** Checkout, fetch, pull, stage and
  open-the-commit-box are reachable; anything whose inverse is a reset is not. An allowlist rather
  than a denylist so the default for a future command is *absent*.
- **Resolved — the four cheap dead commands get wired here.** `repo.open`, `repo.close`,
  `view.refresh` and `status.commit` have keymap entries and menu items and do nothing; the palette
  would have made that visible, so it fixes it instead of filtering it. `op.*` stays with Phase 22.
- **Resolved — the file finder stays in the phase and lands last.** It is a four-package change and
  the only theme that can slip; A–F ship a useful palette without it.
- **Resolved — the focus trap is extracted and retrofitted.** Two existing modal dialogs have no
  trap today. Extracting `Popover`'s working implementation and using it in three places costs a few
  lines more than copying it into the palette and fixes a real accessibility gap in the confirm gate.
- **Resolved — the palette stays independent of Phase 22.** The provider interface is the seam. Said
  out loud here so neither phase blocks on the other.
- **Open — does `group` belong in `shared`, or should it be derived from the `id` prefix?**
  *Recommendation:* the explicit field. The nine prefixes (`terminal.`, `repo.`, `sync.`, `op.`,
  `status.`, `graph.`, `view.`, `repos.`, `browser.`) are genuinely consistent, which is exactly what
  makes deriving from them tempting and wrong — they are a naming habit, not a contract, and a
  rename would silently regroup the palette. A string union in `shared` is boundary-safe and costs
  one field. The counter-argument, that it is data duplicated from the id, is real but cheap.
- **Open — where does frecency live, given `palette-store.ts` is not persisted?**
  *Recommendation:* a small persisted map (`Record<string, { count, lastAt }>`, capped at ~50 keys)
  as its own tiny slice rather than a field on `ui-store`, so the palette's persistence story stays
  in one place and the ephemeral store stays ephemeral. A palette that has forgotten by tomorrow
  what you run every day is measurably worse, and this is the cheapest thing in the phase that
  makes it feel fast.
- **Open — when does the file index invalidate?** *Recommendation:* on palette open, with the cache
  key including the repo tip sha, rather than subscribing to the Phase 10 watcher. The watcher route
  is more correct and costs a `WatchKind` fan-out plus an invalidation-map entry for a list that is
  only ever read when a human has just pressed a key. Revisit if a stale index is actually observed
  after an external checkout.
- **Open — hand-rolled `fuzzyMatch`, or a dependency?** *Recommendation:* hand-rolled. Nothing in
  the workspace does fuzzy matching today, `fzf`-grade scoring is not needed for lists of hundreds,
  and returning `indices` for highlighting is the part most libraries make awkward. It also matches
  how this repo has handled every other small algorithm. If path scoring in Theme G turns out to
  want real Smith-Waterman, that is the moment to reconsider — not before.
- **Open — should the palette list agent *commands* as well as agents?**
  *Recommendation:* not in this phase.
  [`agent-commands.ts`](../packages/app/src/features/agent/agent-commands.ts) is well-shaped for it,
  but those four entries write into a live pty, which is a different kind of action from anything
  else in the list and deserves its own thinking about confirmation.
- **Open — does the palette get a mouse affordance, or is it keyboard-only?**
  *Recommendation:* one entry point in the title bar beside the breadcrumbs, showing `⌘K`. A surface
  reachable only by a shortcut nobody has been told about is a surface that does not exist; the
  discoverability is worth more than the pixels.
