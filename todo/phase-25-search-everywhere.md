# Phase 25 — Search everywhere, and the blame that explains it

Twenty-four phases in, Midnite Git can stream a hundred thousand commits, highlight every diff in
the app with shiki, browse a repo's files in a preview pane and review a pull request without
leaving the window — and it cannot answer *when did this line get here*, or *which commit deleted
that function*. A grep across all four packages for `blame`, `pickaxe`, `log -S`, `--pickaxe` and
`--follow` returns **zero matches**. Not one. `buildLogArgs(options)` in
[`commands/log.ts`](../packages/git-engine/src/commands/log.ts) accepts exactly three keys —
`limit`, `all`, `revisions` — so the log stream that feeds the graph cannot be narrowed by author,
by message, by path, or by content, and there is no `commands/grep.ts` or `commands/blame.ts` for it
to fall back to. The two things the app calls "filters" today are not search: the ref filter in
[`ref-filter.tsx`](../packages/app/src/features/graph/ref-filter.tsx) becomes `revisions` on
`logStart` and re-streams, and the author filter in
[`author-filter.tsx`](../packages/app/src/features/graph/author-filter.tsx) is *dimming only*,
computed client-side from rows already loaded, because removing rows would break lane topology.
Neither can find anything that is not already on screen.

This phase gives the app the three searches git actually has — the pickaxe over history, `git grep`
over content at any revision, and `git blame` over a file — and one place to type them into. It is
the largest **read-only** phase in the repo: nothing here writes to a repository, nothing goes
through the write queue, and the destructive-op confirms of Phase 7 are not involved at any point.
What it does have to build is the thing three phases have worked around — a **cancellable, batched
read**. [`log-service.ts`](../packages/desktop/src/main/log-service.ts) holds a single
module-level `let active: ActiveStream | null` per window, and `execGit` has no cancellation
mechanism at all. A `git grep` over a large repository can emit millions of lines and the user must
be able to stop it, so the log service's private machinery gets lifted into something a second
consumer can use without stealing the graph's stream out from under it.

It arrives with two planned-but-unlanded neighbours worth naming up front, because between them they
already own three of the pieces a naive reading of this phase would build twice.
[Phase 23](phase-23-command-palette.md) builds the workspace's first fuzzy matcher, its first overlay
surface, its extracted focus trap, and — in its Theme G — the file finder on `Mod+P`. **This phase
builds none of those again.** Quick-open is Phase 23's, and Phase 23's own out-of-scope list defers
commit search to exactly here.

[Phase 24](phase-24-writable-explorer.md) is the sharper overlap: its Theme E, *Find in files*, lands
`commands/grep.ts`, `parsers/grep-parser.ts`, an `mgit:fs:search` channel and a search panel above the
explorer tree. So `git grep` gets its first home there, one buffered invoke at a time, scoped to the
working tree and to tracked content. This phase does not re-land it — it **extends** it: the same
command grows a revision argument, context lines and a streaming, cancellable variant, and the
explorer's panel gets a full view to hand off to. If the two phases are worked in the other order,
Theme A's grep items become net-new rather than additive and nothing else changes.

**Builds on.** Phase 1 (`LOG_FORMAT`, `parseLogRecord` and the NUL-delimited parsing rule),
Phase 5 (`spawnGit`, `chunkRecords` and the batched log stream this phase generalises), Phase 12
(the commit inspector a result row opens into), Phase 13 (`useResizable` and the persisted panel
widths a results/preview split needs), Phase 16 (the read-only `fs` contract, its path jail, the
preview pane, `getHighlighter()` and `languageForFile`), Phase 17 and 20 (the two copy-pasted text
filters this phase finally extracts), Phase 19 (the view-scoped nav shell a new rail view costs
almost nothing in), Phase 23 (the palette, its fuzzy matcher, its focus trap and its file finder), Phase 24 (`commands/grep.ts`,
`parsers/grep-parser.ts` and the explorer's find-in-files panel).

**Scope guardrails.** Every search is a **read**. No `write: true`, no `writeQueue`, no ref moves —
the most a result row may do is navigate. Long reads go through `spawnGit` with a real `cancel()`,
never through buffered `execGit`, because a search you cannot stop is a search that hangs the app;
the one exception is blame on a single file, which is bounded by the file. Results are **capped and
say so** — a truncated result set renders an explicit marker, never a silent cut, because a search
that quietly stops at 5000 hits teaches the user to trust an answer that is wrong. Parsers own their
format strings, as [`log-parser.ts`](../packages/git-engine/src/parsers/log-parser.ts) established,
and every one of them splits on `\x00`. And neither neighbour's work is rebuilt: the palette gains a source rather
than a sibling, and `git grep` gains arguments rather than a second command. If Phase 23 has not
landed, Theme F's palette item waits; if Phase 24 has not, Theme A's grep items grow rather than
shrink. Nothing else in this phase blocks on either.

Effort tags: **S** ≈ an hour or two · **M** ≈ half a day · **L** ≈ a day plus.

## Deliverables

### A — Search in the engine (L)

The spine. B–F all read off these three commands, so it lands first, and it lands with integration
tests against `TempRepo` because the only honest way to pin a git output format is to make git emit
it.

- [ ] Widen `buildLogArgs` in [`commands/log.ts`](../packages/git-engine/src/commands/log.ts) from
      `{ limit, all, revisions }` to also carry `grep`, `author`, `since`, `until`, `paths`,
      `pickaxeString` (`-S`), `pickaxeRegex` (`-G`), `regexp` and `ignoreCase`. Every new key is
      optional and the existing three-key call sites must produce byte-identical argv — assert that
      in a unit test before touching anything downstream, because this function feeds the graph.
- [ ] `--follow` support for path-scoped history, with its two real constraints written into the
      type rather than discovered later: git accepts `--follow` for **exactly one** pathspec, and it
      does not combine dependably with `--all`. Model it as `follow: true` being legal only when
      `paths.length === 1`, and have the arg builder drop `--all` when it is set.
- [ ] `streamCommitSearch(repoPath, options)` in a new
      `packages/git-engine/src/commands/search.ts`, returning the existing `LogStream` shape
      (`{ done: Promise<{total, error?}>, cancel(): void }`) so B has one contract to serve. It is
      `streamLog` with a wider arg builder and a cap, and it reuses `LOG_FORMAT`, `chunkRecords`
      and `parseLogRecord` unchanged — a commit search result **is** a `GraphRow`'s commit half,
      and inventing a second commit shape here would fork the inspector.
- [ ] Extend Phase 24's `packages/git-engine/src/parsers/grep-parser.ts` to carry **context lines**.
      Its `parseGrep(payload)` handles `git grep -z -n -I --no-color` match lines; `-C<n>` adds
      context lines, which git separates differently from matches (`:` vs `-` in the non-`-z` form),
      so the parsed shape grows to `{ path, line, kind: 'match' | 'context', text }` and every
      existing call site keeps working because `kind` defaults to `'match'`. If Phase 24 has not
      landed, write the parser whole — the integration test pins the real bytes either way, rather
      than trusting this sentence.
- [ ] `streamGrep(repoPath, { pattern, rev?, paths?, ignoreCase, regexp, wordMatch, contextLines })`
      alongside Phase 24's buffered grep in
      [`commands/grep.ts`](../packages/git-engine/src/commands/grep.ts) — same argv builder, on
      `spawnGit` with a `cancel()`, emitting parsed hits in batches. Factor the argv out of the
      buffered call rather than writing it twice; the buffered version stays, because the explorer
      panel does not need a stream and should not pay for one.
- [ ] **Grep at any revision**, which is the one genuinely new git capability in this theme: `rev` is
      placed before the `--` pathspec separator. It is a change to argv order, not a new command —
      and it is what lets a content search answer a question about code that no longer exists.
- [ ] `packages/git-engine/src/parsers/blame-parser.ts` for `git blame --porcelain`: the
      `<sha> <origLine> <finalLine> [<numLines>]` header, the key/value block that follows it, and
      the `\t`-prefixed content line. The format's defining trick is that a commit's metadata block
      appears **once** and later hunks from the same commit carry the header alone — so the parser
      keeps a commit table and the test that matters is a three-hunk file where the second and third
      hunks share a commit with the first.
- [ ] `readBlame(worktreePath, { relPath, rev?, followRenames })` in a new
      `packages/git-engine/src/commands/blame.ts`. `followRenames` emits `-C -M`; it is off by
      default because it is materially slower on large files, and the setting in Theme F is what
      turns it on. Buffered `execGit` is correct here — blame is bounded by one file — and that is
      the deliberate exception to this phase's streaming rule.
- [ ] The porcelain `previous <sha> <filename>` field is parsed and kept, not dropped. It is the
      only thing that makes **reblame** possible in Theme D, and it also carries the pre-rename path,
      which is the answer whenever `-C -M` has actually done something.
- [ ] `SearchHitSchema`, `GrepHitSchema` and `BlameLineSchema` / `BlameResultSchema` in
      [`shared/src/domain/`](../packages/shared/src/domain/), exported through `domain/index.ts`.
      `BlameResult` carries the commit table once and lines reference it by sha — mirroring the
      porcelain format rather than flattening it, because a 5000-line file blamed to 40 commits
      should not send 5000 copies of an author name across the IPC boundary.
- [ ] Export the new commands and parsers from
      [`commands/index.ts`](../packages/git-engine/src/commands/index.ts) and
      [`parsers/index.ts`](../packages/git-engine/src/parsers/index.ts).
- [ ] `grep-parser.test.ts` and `blame-parser.test.ts` on hand-written fixtures, in the house style
      of [`status-parser.test.ts`](../packages/git-engine/src/parsers/status-parser.test.ts) with a
      local NUL-joining helper; plus `search.integration.test.ts`, `grep.integration.test.ts` and
      `blame.integration.test.ts` driving real git through `TempRepo`.

### B — The stream registry, and the search contract (M)

The refactor half of this theme touches the working graph stream, so it lands as its own commit with
its own green gate before the search channels arrive on top of it.

- [ ] Lift the private machinery of [`log-service.ts`](../packages/desktop/src/main/log-service.ts)
      into a new `packages/desktop/src/main/stream-registry.ts` — a `requestId`-keyed
      `Map<string, { cancel(): void }>` scoped per `BrowserWindow`, with `register`, `cancel(id)`,
      `cancelAll(win)` and window-teardown cleanup. `BATCH_SIZE = 500` and the `requestId` tagging
      that lets the renderer drop late batches from a superseded stream both move with it.
- [ ] `log-service.ts` becomes a consumer and keeps its **single-active-log** semantics: starting a
      log still supersedes the previous log. A search must never cancel the graph's stream and vice
      versa, so supersede-on-start is a per-kind policy the registry takes as an argument, not a
      global rule it enforces.
- [ ] `packages/desktop/src/main/search-service.ts` on the registry — `startCommitSearch`,
      `startGrep`, `cancelSearch(requestId?)`. Unlike log, **concurrent searches are allowed** (the
      Search view can run a commits query and a content query from one submit), so its policy is
      cancel-by-id, with a per-window ceiling so a held-down key cannot spawn processes without
      bound.
- [ ] New channels in [`ipc/channels.ts`](../packages/shared/src/ipc/channels.ts) under the
      `mgit:` namespace: `searchStart`, `searchCancel`, `blameRead` (invoke) and `searchBatch`,
      `searchDone` (`EVENT_CHANNELS`). One `searchStart` carrying a discriminated `mode` rather than
      two near-identical channels — the batch payload is `{ requestId, mode, hits }` and the
      renderer routes on `requestId` exactly as
      [`graph-store.ts`](../packages/app/src/features/graph/graph-store.ts) already does.
- [ ] `SearchStartRequest` / `SearchStartResponse`, `SearchCancelRequest`, `BlameReadRequest` /
      `BlameReadResponse` in [`ipc/schemas.ts`](../packages/shared/src/ipc/schemas.ts), extending the
      shared `RepoId` base like every other request; `search` and `blame` groups on
      `MidniteGitBridge` in [`ipc/bridge.ts`](../packages/shared/src/ipc/bridge.ts) with
      `search: { start, cancel, onBatch, onDone }` mirroring the `log` group exactly.
- [ ] `packages/desktop/src/main/ipc/search-handlers.ts` with `registerSearchHandlers(win)`, using
      `handle()` from [`ipc/handle.ts`](../packages/desktop/src/main/ipc/handle.ts) so an invalid
      payload resolves with a fallback rather than rejecting; registered in the
      `registerFooHandlers()` block in [`main/index.ts`](../packages/desktop/src/main/index.ts).
- [ ] Wire both groups into the preload `Pick<MidniteGitBridge, …>` in
      [`preload/index.ts`](../packages/desktop/src/preload/index.ts) — naming the groups there is
      what makes an unimplemented method a compile error rather than a runtime `undefined`.
- [ ] A `search*` / `blame*` block in [`ipc.test.ts`](../packages/shared/src/ipc/ipc.test.ts). The
      existing coverage tests are exhaustive per channel-name prefix
      (`expect(channelKeys.sort()).toEqual(Object.keys(expected).sort())`) and a new prefix is not
      covered by any of them, so this is a new block, not an added line.
- [ ] `search` and `blame` on [`e2e/mock-bridge.ts`](../packages/app/e2e/mock-bridge.ts), with
      `MockFixtures` gaining seedable hit lists and a blame table — every e2e spec breaks without it,
      and Theme C's spec is written against it.
- [ ] `stream-registry.test.ts`: two concurrent registrations cancel independently, `cancelAll`
      empties the map on window teardown, and a cancelled stream's late batch is not forwarded.

### C — The Search view (L)

- [ ] `'search'` added to the `ViewId` union, `VIEW_IDS`, `pathForView` and `viewForPath` in
      [`store/ui-store.ts`](../packages/app/src/store/ui-store.ts), plus every per-view `Record`
      keyed by `ViewId` in that file — the type errors are the checklist.
- [ ] `SEARCH` in `VIEW_ICON` in [`components/nav-icons.ts`](../packages/app/src/components/nav-icons.ts)
      and an entry in `NAV_ITEMS` in [`app.tsx`](../packages/app/src/app.tsx), placed directly under
      Files since content search and the explorer answer adjacent questions. It is **not** added to
      `FORGE_GATED_VIEWS`: search needs no `gh` and must stay reachable when the forge is absent.
- [ ] `packages/app/src/features/search/search-view.tsx` rendered from the `activeView === …` chain
      in `app.tsx`, replacing the `<Placeholder>` fallthrough for the new id.
- [ ] `packages/app/src/features/search/search-store.ts` — zustand on the house
      `create<T>()(persist(…))` shape for the *query shape* (mode, flags, last query) and plain
      `create<T>()` for the *results*, which are stream state and must not be rehydrated from disk
      on relaunch as though they were still true.
- [ ] A query bar with mode tabs — **Commits · Content · Files** — where the third delegates to the
      Phase 23 file source rather than shipping a second file index. Modifier toggles (regex, case,
      whole word) live beside the input; the commits mode adds author, path and date-range fields
      drawn with the existing `MultiSelectMenu` from
      [`components/multi-select-menu.tsx`](../packages/app/src/components/multi-select-menu.tsx),
      which already has a search box, an outside-click dismiss and the empty-means-everything
      convention.
- [ ] Debounced submit with **explicit cancellation of the in-flight `requestId`** on every new
      query. This is the single place this phase can leak processes, and it is worth writing the
      cancel first and the query second.
- [ ] A virtualised results list on `useVirtualizer` from `@tanstack/react-virtual`, the house
      virtualiser, grouped by file for content hits and flat for commit hits. Content hit lines are
      highlighted through the existing `getHighlighter()` in
      [`lib/highlighter.ts`](../packages/app/src/lib/highlighter.ts) with the language resolved by
      `languageForFile` from [`lib/languages.ts`](../packages/app/src/lib/languages.ts) — grammars
      are already lazy-loaded per language, so this costs a call, not a bundle.
- [ ] Matched-range emphasis on each hit, reusing Phase 23's `fuzzyMatch` **only** for the files
      mode; commit and content hits are literal or regex matches and their ranges come from the
      query, not from a fuzzy score. Two different match models, one visual treatment.
- [ ] A results/preview split on `useResizable` with its width persisted in the `layout` slice of
      `ui-store.ts`, alongside `filesTreeWidth`. Selecting a content hit opens the file in the Phase 16
      preview scrolled to the line; selecting a commit hit opens the Phase 12 inspector.
- [ ] The truncation marker: when a stream hits its cap, the list ends in an explicit "stopped at
      N results — narrow the query" row with the cap's current value in it. A silent cut is the one
      failure mode of this view that produces a confidently wrong answer.
- [ ] An empty state that distinguishes *no query yet*, *searching*, *no matches*, and *the search
      failed* — the last carrying git's own stderr, because an invalid regex is the most common way
      this view will fail and git already explains it well.
- [ ] `e2e/search-view.spec.ts` against the mock bridge: each mode returns and renders, a second
      query cancels the first, the truncation marker appears at the cap, and an invalid pattern shows
      the error state rather than an empty list.

### D — Blame (L)

- [ ] A blame gutter in [`file-preview.tsx`](../packages/app/src/features/files/preview/file-preview.tsx),
      toggled per file and off by default. Each line shows a short sha, the author and a relative
      date; runs from the same commit are visually grouped so a file blamed to six commits reads as
      six bands rather than five hundred rows.
- [ ] The gutter shares the preview's existing scroll and line metrics rather than being a second
      scroller — [`code-preview.tsx`](../packages/app/src/features/files/preview/code-preview.tsx)
      renders highlighted lines already, and a blame column that can drift out of alignment with the
      code beside it is worse than no blame column.
- [ ] Blame degrades honestly above `HIGHLIGHT_CAP_BYTES` (200 KB) the way highlighting already
      does: the gutter still renders, the code beside it goes plain, and the user is told which.
- [ ] Clicking a blame line opens that commit in the Phase 12 inspector, with the file preselected —
      the same navigation a commit hit in Theme C performs, extracted so both call it.
- [ ] **Reblame:** a per-line action that re-runs blame at the parent of that line's commit,
      answering *what was here before*. It reads the `previous <sha> <filename>` field parsed in
      Theme A, so it follows renames correctly for free rather than guessing the path.
- [ ] A reblame navigation stack in the store with back/forward, showing the current revision in the
      preview header. Without the stack, reblame is a one-way door out of the file you were reading.
- [ ] A rename-following toggle (`-C -M`) exposed on the gutter as well as in Settings, because it is
      a per-investigation decision as often as a preference, and the cost is visible enough that a
      user should be able to turn it on for one file.
- [ ] `services/watch-invalidation.ts` invalidates the blame query for a file when the watcher sees
      that file change — a blame gutter that still describes the previous save is a quietly wrong
      answer, which is the failure mode this phase is least willing to ship.
- [ ] `blame-store.test.ts`: the reblame stack pushes, pops and truncates on a new branch of history;
      and `blame-lines.test.ts` over the run-grouping that turns per-line records into bands.

### E — Inline entry points, and the filter input the repo keeps rewriting (M)

- [ ] `packages/app/src/components/filter-input.tsx` — the shared text filter that does not exist
      today. The pattern is already written twice, in
      [`repos-panel.tsx`](../packages/app/src/features/repos/repos-panel.tsx) (`matchesRepoQuery`,
      whitespace-split AND terms, lowercased) and
      [`reviews-list.tsx`](../packages/app/src/features/reviews/reviews-list.tsx); extract the
      better of the two, keep the AND-terms matcher as an exported pure function, and give it a
      clear button and an `Escape`-to-clear.
- [ ] Retrofit both call sites onto it, and add the third the Changes view has never had:
      [`all-changes-view.tsx`](../packages/app/src/features/changes/all-changes-view.tsx) has no
      text filter at all, which is the most obviously missing one in the app.
- [ ] A find bar in the file preview on `Mod+F` — find-in-this-file, with match count, next/previous,
      and highlighted ranges over the shiki output. It is scoped to the open file and explicitly
      *not* a second search surface; its overflow action is "search the whole repo", which hands the
      query to Theme C.
- [ ] A search box in [`graph-header.tsx`](../packages/app/src/features/graph/graph-header.tsx)
      beside the existing ref and author filters. Typing filters the loaded rows by dimming, matching
      what `AuthorFilter` already does and for the same reason — dropping rows breaks lane topology —
      and submitting hands off to the Search view in commits mode with the query prefilled.
- [ ] The hand-off is one function, not three: a `openSearch(query, mode, scope)` helper in
      `features/search/` that the find bar, the graph box and the palette source all call, so there
      is exactly one definition of what "search this" means.
- [ ] `filter-input.test.ts` over the AND-terms matcher, including the case-folding and the
      empty-query-matches-everything convention both existing call sites rely on.

### F — Chords, the palette source, and Settings (S/M)

- [ ] **Fetch moves off `Mod+Shift+F`.** `sync.fetch` becomes `Mod+Shift+R` in `DEFAULT_KEYMAP` in
      [`shared/src/keybindings.ts`](../packages/shared/src/keybindings.ts), and `Mod+Shift+F` becomes
      `search.open`. The fetch-pull-push triad loses its shape — `Shift+R` / `Shift+P` / `Shift+U` —
      and that is the accepted cost of taking the conventional find-in-files chord.
- [ ] Update the native menu in [`menu.ts`](../packages/desktop/src/main/menu.ts) so the Fetch item's
      displayed accelerator matches, and the sync chips' tooltips with it. A stale accelerator in a
      native menu is the kind of wrong that survives for six phases.
- [ ] Add `search.open` (`Mod+Shift+F`) and `search.findInFile` (`Mod+F`) to `COMMAND_IDS` and
      `DEFAULT_KEYMAP`, with handlers in the dispatcher. If Phase 23 has landed, that is
      `useCommandHandlers()`; if it has not, it is the handler literal in `app.tsx` and Phase 23
      lifts it later — either way this theme adds a handler, not a dispatch mechanism.
- [ ] `search.open` is `scope: 'global'` so it escapes the terminal via `GLOBAL_CHORDS`, the way
      `terminal.toggle` does; `search.findInFile` stays `'app'`, since `Mod+F` inside a shell belongs
      to the shell.
- [ ] Extend the keymap test in
      [`keybindings.test.ts`](../packages/app/src/services/keybindings/keybindings.test.ts): no two
      bindings share a chord (which is what catches the fetch move if it is done by addition rather
      than by edit), every `CommandId` has a label, and `Mod+Shift+R` resolves to `sync.fetch`.
- [ ] A **search source** registered with Phase 23's provider seam in `services/palette/sources/`:
      typing into the palette offers "Search commits for …" / "Search content for …" as actions that
      call `openSearch`. It is a hand-off, not a result provider — the palette does not run git.
- [ ] A **Search** settings page: `'search'` added to `SettingsPageId` and `SETTINGS_PAGES` (group
      `general`) in `ui-store.ts`, `SETTINGS_PAGE_ICON` in `nav-icons.ts`, a new
      `settings-pages/search-page.tsx` built from `settings-pages/controls.tsx`, and an entry in
      `PAGE_CONTENT` in [`settings-view.tsx`](../packages/app/src/features/settings/settings-view.tsx).
- [ ] The page's controls: default regex/case/whole-word, the result cap (with its cost stated),
      whether grep includes untracked files, blame rename-following on by default, and the context
      line count for content hits.
- [ ] Update [`e2e/settings-pages.spec.ts`](../packages/app/e2e/settings-pages.spec.ts), which
      enumerates the pages and will fail on the new one until it does.

## Files this phase touches

| Area | Files |
|------|-------|
| Contract | new `shared/src/domain/search.ts`, new `shared/src/domain/blame.ts`, [`domain/index.ts`](../packages/shared/src/domain/index.ts), [`ipc/channels.ts`](../packages/shared/src/ipc/channels.ts), [`ipc/schemas.ts`](../packages/shared/src/ipc/schemas.ts), [`ipc/bridge.ts`](../packages/shared/src/ipc/bridge.ts), [`shared/src/keybindings.ts`](../packages/shared/src/keybindings.ts) |
| git-engine | new [`commands/search.ts`](../packages/git-engine/src/commands/search.ts), new `commands/blame.ts`, new `parsers/blame-parser.ts`, [`commands/grep.ts`](../packages/git-engine/src/commands/grep.ts) and `parsers/grep-parser.ts` (**extended** from Phase 24 — `rev`, context lines, `streamGrep`), [`commands/log.ts`](../packages/git-engine/src/commands/log.ts) (`buildLogArgs`, `--follow`), [`commands/index.ts`](../packages/git-engine/src/commands/index.ts), [`parsers/index.ts`](../packages/git-engine/src/parsers/index.ts), [`exec/git-exec.ts`](../packages/git-engine/src/exec/git-exec.ts) (unchanged; `spawnGit` is the seam) |
| Main | new [`stream-registry.ts`](../packages/desktop/src/main/stream-registry.ts), new `search-service.ts`, [`log-service.ts`](../packages/desktop/src/main/log-service.ts) (becomes a consumer), new `ipc/search-handlers.ts`, [`main/index.ts`](../packages/desktop/src/main/index.ts), [`preload/index.ts`](../packages/desktop/src/preload/index.ts), [`menu.ts`](../packages/desktop/src/main/menu.ts) |
| Renderer — search | new `features/search/search-view.tsx`, new `features/search/search-store.ts`, new `features/search/query-bar.tsx`, new `features/search/result-list.tsx`, new `features/search/open-search.ts` |
| Renderer — blame | new `features/files/preview/blame-gutter.tsx`, new `features/files/preview/blame-store.ts`, [`preview/file-preview.tsx`](../packages/app/src/features/files/preview/file-preview.tsx), [`preview/code-preview.tsx`](../packages/app/src/features/files/preview/code-preview.tsx) |
| Renderer — shell | [`app.tsx`](../packages/app/src/app.tsx) (`NAV_ITEMS`, the render chain, handlers), [`store/ui-store.ts`](../packages/app/src/store/ui-store.ts) (`ViewId`, `SettingsPageId`, `layout`), [`components/nav-icons.ts`](../packages/app/src/components/nav-icons.ts), [`services/watch-invalidation.ts`](../packages/app/src/services/watch-invalidation.ts) |
| Renderer — shared | new [`components/filter-input.tsx`](../packages/app/src/components/filter-input.tsx), [`features/repos/repos-panel.tsx`](../packages/app/src/features/repos/repos-panel.tsx), [`features/reviews/reviews-list.tsx`](../packages/app/src/features/reviews/reviews-list.tsx), [`features/changes/all-changes-view.tsx`](../packages/app/src/features/changes/all-changes-view.tsx), [`features/graph/graph-header.tsx`](../packages/app/src/features/graph/graph-header.tsx) |
| Neighbour seams | Phase 23: `services/palette/fuzzy-match.ts` (consumed), `services/palette/sources/` (one new source), `use-focus-trap.ts` (consumed by the find bar). Phase 24: `commands/grep.ts` + `parsers/grep-parser.ts` (extended), `features/files/file-search.tsx` and the `mgit:fs:search` channel (hand off to the Search view) — all **read or extended, none rewritten** |
| Settings | new `features/settings/settings-pages/search-page.tsx`, [`features/settings/settings-view.tsx`](../packages/app/src/features/settings/settings-view.tsx) |
| Docs | [`CLAUDE.md`](../CLAUDE.md) (the new chords, and Fetch's move), [`docs/INITIAL_PLAN.md`](../docs/INITIAL_PLAN.md), [`todo/outstanding.md`](outstanding.md) (search and blame come off the list) |
| Tests | `grep-parser.test.ts` and `grep.integration.test.ts` (extended from Phase 24), new `blame-parser.test.ts`, new `search.integration.test.ts`, new `blame.integration.test.ts`, new `stream-registry.test.ts`, new `filter-input.test.ts`, new `blame-store.test.ts`, new `blame-lines.test.ts`, [`ipc.test.ts`](../packages/shared/src/ipc/ipc.test.ts), [`keybindings.test.ts`](../packages/app/src/services/keybindings/keybindings.test.ts), new `e2e/search-view.spec.ts`, new `e2e/blame.spec.ts`, [`e2e/settings-pages.spec.ts`](../packages/app/e2e/settings-pages.spec.ts), [`e2e/mock-bridge.ts`](../packages/app/e2e/mock-bridge.ts) |

## Verification

- [ ] `moon run :typecheck :lint :test` green.
- [ ] Boundary lint clean: `search.ts`, `grep.ts` and `blame.ts` are plain Node in git-engine and
      import no `electron`; the Search view reaches main only through `window.midniteGit`.
- [ ] Phase 24's `mgit:fs:search` path still works unchanged after `commands/grep.ts` grows a
      streaming sibling — the buffered explorer panel is a regression surface for this theme.
- [ ] Vitest (A): `buildLogArgs` with only the original three keys emits **byte-identical** argv to
      before this phase — the regression that would silently change the graph.
- [ ] Vitest (A): `--follow` is rejected with more than one pathspec, and drops `--all` when set.
- [ ] Vitest (A): the blame parser over a three-hunk file where hunks two and three reuse hunk one's
      commit, asserting the metadata is resolved from the commit table and not dropped; plus a
      `previous` line surviving into the parsed result.
- [ ] Vitest integration (A): a scratch repo where a string is added in one commit and removed in
      another, asserting `-S` finds exactly those two; a `git grep` at an older rev returning content
      that no longer exists in the working tree; and a blamed file after a rename, with and without
      `-C -M`.
- [ ] Vitest (B): two concurrent searches cancel independently, and starting a log does **not**
      cancel a running search — the specific regression the registry refactor could introduce.
- [ ] Vitest (E): the AND-terms matcher, including the empty-query-matches-everything convention
      both existing call sites depend on.
- [ ] Vitest (F): no two keybindings share a chord, and `Mod+Shift+R` resolves to `sync.fetch` while
      `Mod+Shift+F` resolves to `search.open`.
- [ ] Playwright (`e2e/search-view.spec.ts`): each mode renders, a second query cancels the first,
      the truncation marker appears at the cap, an invalid regex surfaces git's error, and a commit
      hit opens the inspector.
- [ ] Playwright (`e2e/blame.spec.ts`): the gutter aligns with the code at three scroll positions,
      reblame pushes a stack entry and back returns, and the rename toggle re-queries.
- [ ] Screenshot, per the visual-phase convention: the Search view in each of its three modes, the
      blame gutter, and the find bar — all in both themes.
- [ ] **Open, for a human:** `git grep` for a single common character in a repository with 100k+
      files, and confirm the cancel button actually stops the child process — checked in Activity
      Monitor, not inferred from the UI going quiet.
- [ ] **Open, for a human:** blame a 5000-line file with `-C -M` on and off, and confirm the slower
      path is worth the toggle it was given.
- [ ] **Open, for a human:** run a commit search, a content search and a graph refresh at the same
      time in a real repository and confirm none of the three cancels either of the others.
- [ ] **Open, for a human:** in a packaged `.app`, confirm `Mod+Shift+F` reaches the app rather than
      the shell, and that Fetch on `Mod+Shift+R` is not shadowed by `Mod+R` view.refresh under a
      fast double-press.

## Not in this phase

- **Quick-open / the file finder.** It is [Phase 23's Theme G](phase-23-command-palette.md) on
  `Mod+P`, over `git ls-files -z --exclude-standard` with a tip-sha-keyed index. This phase's Files
  mode delegates to it; building a second one would fork the index and the matcher.
- **The explorer's find-in-files panel.** It is
  [Phase 24's Theme E](phase-24-writable-explorer.md), it stays where it is, and it keeps its
  buffered `mgit:fs:search` channel. This phase gives it somewhere to hand off to and gives its grep
  command more arguments; it does not absorb the panel.
- **Searching ignored or untracked content.** `git grep` covers tracked content, as Phase 24 already
  decided and said so in its empty state. That decision holds here.
- **The command palette itself.** Also Phase 23. This phase adds one source to it and no machinery.
- **Replace-in-files.** Every search here is a read, and a repo-wide write driven by a regex is a
  different phase with a different confirm story — and one that wants Phase 22's undo underneath it.
- **Search across multiple repositories.** The whole contract is `RepoId`-scoped, as every other
  read is. Cross-repo search is a different data model, not a wider query.
- **A search index.** No trigram store, no cache warming, no non-git backend. `git grep` is fast
  enough on real repositories and an index that can be stale is worse than a search that is slow.
- **Persisted search history or saved searches.** The store keeps the last query shape so the view
  reopens where you left it; a history list is a surface of its own.
- **Blame for uncommitted lines** beyond git's own `0000000` "Not Committed Yet" rendering, and
  **blame in the diff view** — the gutter belongs to the preview pane this phase, not to `DiffView`.
- **Submodules**, deferred wholesale in [`outstanding.md`](outstanding.md), and consequently
  `git grep --recurse-submodules`.

## Decisions / open questions

- **Resolved — all four brainstormed capabilities ship, but two of them were already spoken for.**
  The brainstorm scoped commit search, content grep, blame and quick-open. Recon then found
  [Phase 23](phase-23-command-palette.md) owns quick-open end-to-end — `Mod+P`, `list-files`,
  `fuzzy-match.ts`, the overlay and the focus trap — and defers commit search to here by name; and
  [Phase 24](phase-24-writable-explorer.md) lands `commands/grep.ts`, `parsers/grep-parser.ts` and
  an explorer search panel in its Theme E. Rather than build either twice, this phase consumes the
  palette primitives and extends the grep command. What is left as genuinely net-new is the part
  neither neighbour has: the pickaxe over history, blame, grep at a revision, cancellable streaming,
  and one view to type all of it into.
- **Resolved — this phase extends `git grep`, it does not own it.** The alternative was to claim grep
  here and have Phase 24 depend on Phase 25, which would block a small self-contained explorer phase
  behind a large one. Phase 24 ships the buffered, working-tree, tracked-content case that its panel
  needs; Phase 25 adds `rev`, context lines and `streamGrep` on the same argv builder. Both orderings
  work; only the direction of the "new file" versus "changed file" flips.
- **Resolved — Fetch moves to `Mod+Shift+R` and search takes `Mod+Shift+F`.** The alternative was
  leaving Fetch alone and putting the Search view on `Mod+3` beside the existing view chords. The
  conventional chord won. The known cost is twofold: the `Shift+F`/`Shift+P`/`Shift+U` triad stops
  reading as a set, and `Mod+Shift+R` now sits one modifier from `Mod+R` `view.refresh`. Both are
  accepted; the second is worth revisiting if the manual pass finds it easy to hit by accident.
- **Resolved — the log service is generalised rather than copied.** A sibling `search-service.ts`
  duplicating the single-active-stream pattern would have been the lower-risk commit, but it would
  be the third copy of it (log, pty, metrics all hand-roll the same shape) and the first one that
  needed *concurrent* streams. The refactor lands as its own commit with its own green gate,
  precisely because it touches the working graph stream.
- **Resolved — commit search renders as a flat list on the Search view, and dims when driven from the
  graph header.** The graph cannot remove rows without breaking lane topology, which is why the Phase
  14 author filter dims; that constraint is real and stays. The Search view has no lanes and no such
  constraint, so it shows only matches.
- **Resolved — results are capped and the cap is visible.** Default 5000, configurable in Settings,
  with an explicit truncation row. A silent cut is the only failure mode of this phase that produces
  a confidently wrong answer.
- **Resolved — blame is buffered, everything else streams.** Blame is bounded by one file, so
  `execGit` is correct and the cancellation machinery is unnecessary. Grep and commit search are
  unbounded and go through `spawnGit` with a real `cancel()`.
- **Open — should the Search view's Content mode default to the working tree or to `HEAD`?**
  *Recommendation:* the working tree. It is what the user is looking at, it includes uncommitted
  edits, and the rev picker is one control away. `HEAD` is the more reproducible answer and the less
  useful one.
- **Open — how far does the find bar go before it is just a worse Search view?** *Recommendation:*
  find-in-open-file only, with an explicit "search the whole repo" hand-off. The moment it grows a
  file list it has become Theme C in a smaller box.
- **Open — where does the reblame stack live when the user navigates away and back?**
  *Recommendation:* in the unpersisted half of the blame store, keyed by file, cleared on repo
  switch. Persisting a revision stack across relaunch would restore the user to a historical view of
  a file with no memory of why.
- **Open — should the graph header's search box run a real `--grep` query rather than dimming loaded
  rows?** *Recommendation:* no, not in this phase. Dimming matches the author filter's established
  behaviour and costs nothing; a header input that silently re-streams the graph is a surprising
  amount of work to happen behind a text box. The hand-off to Theme C is the escape hatch.
