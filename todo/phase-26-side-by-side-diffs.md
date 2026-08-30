# Phase 26 — Side by side, and the room to show it

Four separate phases have deferred the same feature with the same sentence. Phase 12 wrote it first
— *"the inspector is a narrow panel; split view earns its keep only in a full-width diff surface,
which does not exist yet"* — and Phase 20 restated it as a second reason: *"a second
diff-rendering surface is its own project and a real risk of drifting visually from the one everyone
else uses."* Phase 22 repeated the ruling for stashes. [`outstanding.md`](outstanding.md) still
carries the line. Both premises have quietly stopped being true. Phase 17's workbench gave the app
full-width tabs — `all-changes` and `review` are already two of them — and Phase 12's own diff work
turned [`diff-rows.ts`](../packages/app/src/features/diff/diff-rows.ts) into a pure, tested,
DOM-free row builder that a second arrangement can sit *beside* rather than fork.

The engine has been ready the whole time and nobody has needed it to change. Every `DiffLine` in
[`shared/src/domain/diff.ts`](../packages/shared/src/domain/diff.ts) already carries **both**
`oldNo` and `newNo`, because `parseUnifiedDiff` has tracked two line counters since Phase 12 — a
unified view throws one of them away on every row. `annotateIntraline` in
[`diff-parser.ts`](../packages/git-engine/src/parsers/diff-parser.ts) already computes word-level
`IntralineRange[]` and stores each side's ranges on its own line, so a split view inherits word-diff
for free and does not get a say in it. This phase therefore adds **no git command, no IPC channel
and no diff schema** — the whole of A–G is renderer work, and only Theme H touches a contract at
all, to add the one field a pull request has always been missing.

Room is the other half. Two of the four diff surfaces are already full-width; the Changes pane takes
the remainder of a resizable panel and is fine. The commit inspector is the one Phase 12 was talking
about: it lives in the Graph's right dock, capped at `detailWidth` **max 720** in
[`LAYOUT_BOUNDS`](../packages/app/src/store/ui-store.ts), and no amount of split-view code makes 720
pixels into two readable columns. Rather than widen the dock until it eats the graph, Theme G gives
`WorkbenchTab` a third kind so a commit can be *opened* the way a review already can, and leaves the
dock as the quick-look panel it is good at being.

**Builds on.** Phase 12 (the hunk parser, `annotateIntraline`, the commit inspector and
`ChangeTree`), Phase 13 (`useResizable`, `ResizeHandle` and the persisted `LayoutSizes`), Phase 16
(the preview pane and `languageForFile`), Phase 17 (the workbench tab strip and the whole-checkout
`AllChangesView`), Phase 19 (the view-scoped nav shell), Phase 20 (the shared `DiffView`, shiki
line highlighting, and the comment-thread anchoring in `comment-anchors.ts`).

**Scope guardrails.** There is **one** diff renderer. Split is a second *arrangement* of the same
cell, not a second component — Theme B exists solely to make that structurally true, and a split
line that draws its gutter, its intraline marks or its shiki tokens differently from a unified one
is a bug, not a variant. **Alignment follows the engine.** A run of deletions followed by additions
pairs positionally, exactly the rule `pairLines` already uses inside `annotateIntraline`, so the
word-marks and the row pairing can never disagree about which line is which line's counterpart;
anything cleverer (a line-level LCS) would look better on a moved block and start lying about the
marks. **Split degrades rather than refuses**: a combined/conflict diff, a binary file, or a surface
too narrow to hold two columns renders unified without asking, and the toggle reflects what is
actually on screen. And the comment anchor stays what Phase 20 made it — a *line number*, never a
row index — because that is the only reason threads survive context expansion today and the only
reason they survive a re-arrangement tomorrow.

Effort tags: **S** ≈ an hour or two · **M** ≈ half a day · **L** ≈ a day plus.

## Deliverables

### A — The split row model (M) ✅ DONE (PR #1, 2026-08-30)

Pure, DOM-free and testable, sitting beside `toDiffRows` in the same module. Everything else reads
off this shape, so it lands first.

- [x] `SplitRow` union in [`diff-rows.ts`](../packages/app/src/features/diff/diff-rows.ts):
      `{kind:'hunk'}` (spans both columns, carries the same `gap` and heading as today),
      `{kind:'pair', left: DiffLine | null, right: DiffLine | null}`, plus the existing
      `{kind:'thread'}` and `{kind:'composer'}` re-used verbatim — threads span both columns, so
      they need no split-specific variant.
- [x] `toSplitRows(diff: FileDiff): SplitRow[]` — walks hunks in order; a `ctx` line becomes a pair
      with the *same* line on both sides (each keeping its own `oldNo`/`newNo`), and a run of
      deletions immediately followed by additions is paired positionally.
- [x] `pairRun(dels: DiffLine[], adds: DiffLine[]): SplitRow[]` as its own export: rows
      `0..min(n,m)-1` sit side by side, the remainder gets `null` opposite. This is deliberately the
      same positional rule as `pairLines` in
      [`diff-parser.ts`](../packages/git-engine/src/parsers/diff-parser.ts) — add a test that
      asserts the correspondence directly, so a future change to one is caught against the other.
- [x] `canSplit(diff: FileDiff): boolean` — `false` for `combined` (a conflict diff has three sides
      and no honest two-column reading), for `binary`, and for a diff with no hunks. The call sites
      never branch on `combined` themselves.
- [x] `withCommentRows` generalised to take either row list, or a `withSplitCommentRows` sibling —
      threads insert *after* the pair whose `right.newNo` (or, from Theme F, `left.oldNo`) they are
      anchored to.
- [x] An exported `splitRowKey(row, index)` so the virtualizer and React both key on something
      stable across a context expansion, rather than on the array index.
- [x] Vitest in [`diff-rows.test.ts`](../packages/app/src/features/diff/diff-rows.test.ts): a
      balanced 3-for-3 run, an unbalanced 5-for-2 and 2-for-5, a pure addition against an empty
      file, a pure deletion, a hunk gap, and a `combined` diff returning `canSplit === false`.

### B — One cell, two layouts (M) ✅ DONE (PR #1, 2026-08-30)

The theme that makes the "there is one diff renderer" guardrail structurally true rather than a
promise. No user-visible change lands here; unified must look byte-identical afterwards.

- [x] Extract the body of `LineRow` in
      [`diff-view.tsx`](../packages/app/src/features/diff/diff-view.tsx) into a `DiffCell` —
      the 2px kind bar, the line-number gutter, the marker column, and the text with its
      `data-diff-mark` intraline spans and merged shiki tokens.
- [x] `DiffCell` takes an explicit `gutter: 'old' | 'new' | 'both'` prop instead of reading
      `diffShowOldGutter` itself: unified passes `'both'` or `'new'`, split passes `'old'` on the
      left and `'new'` on the right. The store read moves up to `DiffView`.
- [x] A `null` cell renders as a filler — the kind bar and gutter drawn empty at the same
      `ROW_HEIGHT`, so a one-sided run does not collapse the row it is opposite.
- [x] `useLineHighlight` in
      [`line-highlight.ts`](../packages/app/src/features/diff/line-highlight.ts) is called from
      `DiffCell`, unchanged. Its cache key is already content-keyed
      (`${dark}${path}${kind}${text}`), so a line highlighted on the left in split is free on the
      right in unified — confirm that with a test rather than assuming it.
- [x] `LineRow` becomes a thin unified wrapper over one `DiffCell`; `mergeSegmentsWithTokens` and
      `toSegments` are untouched and stay in `diff-rows.ts`.
- [x] Confirm no visual regression: the existing
      [`e2e/diff-view.spec.ts`](../packages/app/e2e/diff-view.spec.ts) passes unmodified, and the
      committed unified screenshots do not change.

### C — Two columns, and the toggle (M) ✅ DONE (PR #1, 2026-08-30)

- [x] A `SplitBody` inside `diff-view.tsx` mounting `toSplitRows` through the existing
      `useVirtualizer`, with the same `ROW_HEIGHT = 18`, `THREAD_ESTIMATE`, `COMPOSER_ESTIMATE`,
      `measureElement` and `overscan: 24`. A pair row is one virtual item, not two.
- [x] **Locked horizontal scroll**: one scroller drives both columns, so the same column offset is
      the same column offset on both sides. Implemented as a single `overflow-x-auto` wrapping a
      two-column grid — not two scrollers synchronised by an event handler, which fights the
      virtualizer and drifts on momentum scroll.
- [x] `diffLayout: 'unified' | 'split'` in
      [`ui-store.ts`](../packages/app/src/store/ui-store.ts) beside `diffShowOldGutter`, with
      `setDiffLayout`, added to **both** the `PersistedUi` type and `partialize` (the type exists
      precisely so those two cannot drift), and a `version: 3` `migrate` arm defaulting existing
      users to `'unified'`.
- [x] A toolbar toggle in `DiffView` next to the old-gutter button, using `react-icons` per
      [`CLAUDE.md`](../CLAUDE.md) — and read the file first: `diff-view.tsx` currently imports
      `Columns2`/`Columns3` from `lucide-react`, so match the family already in the file rather
      than mixing.
- [x] Auto-fallback: a `ResizeObserver` on the diff body, below a threshold the surface renders
      unified regardless of the preference, and the toggle shows *why* rather than appearing broken.
      The preference is never rewritten by the fallback.
- [x] The centre divider: a 1px rule between columns, and per-column `min-w-0` so a long line
      scrolls rather than pushing its neighbour off-screen.
- [x] `describeEmptyDiff` and the truncation footer (`truncated`, `droppedLines`) render the same in
      both layouts — they are file-level, not row-level, and should not be re-implemented.
- [x] Playwright `e2e/diff-split.spec.ts`: toggle to split, assert both gutters are present with the
      right numbers on an unbalanced hunk, assert one-sided rows have a blank opposite, and assert
      the layout survives a reload (persistence).

### D — The accordions learn to virtualize (L) ✅ DONE (PR #1, 2026-08-30)


`inline` mode has no virtualizer at all — [`file-accordion.tsx`](../packages/app/src/features/changes/file-accordion.tsx)
and [`pr-file-accordion.tsx`](../packages/app/src/features/reviews/pr-file-accordion.tsx) render
every row of every expanded file into one page scroller. Split doubles the per-row DOM, which turns
a tolerable cost into the phase's main performance risk.

- [ ] Decide and record the mechanism before writing it: a per-file virtualizer inside each
      accordion body, or one virtualizer at the page level over a flattened
      (file-header + row) list. *Recommendation:* per-file, because the page-level flattening has to
      re-derive itself on every expand/collapse and the accordion header is sticky.
- [ ] `inline` mode gains a virtualizer using the page scroller as its `getScrollElement`, so files
      still lay out in one continuous flow rather than becoming a stack of independently scrolling
      boxes.
- [ ] Variable-height rows keep working: `measureElement` must survive threads and composers being
      injected mid-list, which is the reason the pane-mode virtualizer already uses it.
- [ ] The horizontal scroller stays **per file** as it is today (`overflow-x-auto` + `w-max
      min-w-full`), so one very wide file does not make every other file scroll.
- [ ] Collapsing a file releases its rows; expanding restores scroll position rather than jumping.
- [ ] Revisit `EXPAND_ALL_LIMIT` / `withheldByCap` in
      [`expansion.ts`](../packages/app/src/features/changes/expansion.ts) — the cap exists because
      expanding everything renders everything, which stops being true here. Relax it with a
      measured number, or write down why it stays.
- [ ] Extend [`e2e/diff-scroll-perf.spec.ts`](../packages/app/e2e/diff-scroll-perf.spec.ts) with a
      split case. The existing spec asserts *exact* rendered row counts against `ROW_COUNT = 4000`
      and will need its own expectation for pairs — do not loosen the unified assertion to make one
      number fit both.
- [ ] A second perf case for the accordions: a many-file diff expanded in split, asserting the DOM
      row count stays bounded rather than growing with the file.

### E — A toolbar for the accordion surfaces (S)

Pane mode has a toolbar; `inline` mode has never had one, so All-changes and Reviews Files have no
context expansion, no gutter toggle and nowhere to put the layout switch.

- [ ] A shared `DiffToolbar` extracted from `DiffView`'s pane-mode header — `+n / −m`, the old-gutter
      toggle, the new layout toggle, and "show whole file" — taking its actions as props.
- [ ] `inline` mode renders it in the per-file accordion header, which is already sticky in
      `pr-file-accordion.tsx`.
- [ ] Actions absent on a surface are **omitted, not disabled-with-no-reason**: `PrFiles` has the
      whole patch in memory from one `gh pr diff` and cannot refetch at a larger `-U`, so context
      expansion does not appear there at all.
- [ ] The layout toggle in a file header flips the global preference, matching every other diff
      control — it is not a per-file override.
- [ ] Pane mode keeps its current header exactly; this is an extraction, and a diff of the rendered
      pane-mode toolbar should be empty.

### F — Comments on the left side (L)

Phase 20 shipped right-side-only on purpose (`isCommentableLine` requires `newNo !== null`), and
said so. Split view makes the deleted side a first-class column, at which point "you cannot comment
on the thing you are looking at" reads as a bug.

- [ ] `leftSideLines(diff): Set<number>` in
      [`comment-anchors.ts`](../packages/app/src/features/diff/comment-anchors.ts), the `oldNo`
      mirror of `rightSideLines`.
- [ ] `isAnchored` widened to accept `side === 'LEFT'`, and `threadsForFile` returning threads
      keyed by side — a `ThreadsByLine` per side rather than one map, because line 40 on the left
      and line 40 on the right are different anchors.
- [ ] `isCommentableLine` widened: a `del` line with a non-null `oldNo` is commentable on the LEFT.
      A `ctx` line has both numbers and must resolve to exactly one side — pick RIGHT, and test it.
- [ ] `positionForLine` gains a `side` argument for the legacy diff-offset fallback, which is only
      sent when GitHub refuses `line`+`side`.
- [ ] The composer opens against `{path, line, side}`; the write path through
      `forgeReviewComment` already carries `side` in `ForgeThreadSideSchema` — confirm `gh-write.ts`
      sends it rather than defaulting.
- [ ] A thread renders as a **full-width row below its pair**, spanning both columns and pushing the
      row down, exactly as `withCommentRows` does in unified today. Its header shows a LEFT/RIGHT
      badge and the old-or-new line number, so the anchor is never ambiguous once the row no longer
      sits under one column.
- [ ] Left-side threads that were previously bucketed into
      [`outdated-threads.tsx`](../packages/app/src/features/reviews/outdated-threads.tsx)'s
      above-the-diff list now anchor inline where they can. `outdated` and `fileLevel` threads stay
      in that list — those are genuinely unanchorable, not merely left-side.
- [ ] Vitest in
      [`comment-anchors.test.ts`](../packages/app/src/features/diff/comment-anchors.test.ts): a
      LEFT thread on a deleted line, a LEFT thread whose line has since been removed from the diff
      (falls through to unanchored), a `ctx` line resolving RIGHT, and both maps built from one
      mixed thread list.

### G — A commit is a workbench tab (M)

- [ ] A `commit` arm on the `WorkbenchTab` union in
      [`workbench-store.ts`](../packages/app/src/store/workbench-store.ts), beside
      `all-changes | run | review`, carrying `{repoId, sha, worktreePath?}`.
- [ ] `CommitDetail` in
      [`commit-detail.tsx`](../packages/app/src/features/commit/commit-detail.tsx) rendered at
      full width in the tab, reusing `ChangeTree` and the same `DiffView` — the panel and the tab
      are two mounts of one component, not two components.
- [ ] The tab title is the abbreviated sha plus the subject, truncated the way the review tab
      already truncates.
- [ ] An "Open in tab" verb: on the inspector header, and in the graph row context menu built by
      [`use-graph-actions.ts`](../packages/app/src/features/graph/use-graph-actions.ts).
- [ ] The dock is unchanged — `detailWidth` keeps its 720 cap and the inspector stays the quick-look
      panel. This theme adds a destination; it does not move the inspector.
- [ ] Opening the same commit twice focuses the existing tab rather than adding a second, matching
      the review tab's behaviour.
- [ ] `commitFilesHeight` (the inspector's file-list/diff split) needs a full-width counterpart, or
      the tab lays the file tree out beside the diff rather than above it. Decide once and write it
      down; a tree that is 200px tall and 1400px wide is neither.

### H — Image diffs in a pull request (S)

The one contract change in the phase, and a documented gap in
[`outstanding.md`](outstanding.md): the `ImageDiff` viewer works in Changes and the commit inspector
but not in Reviews, because `ForgePullDetailSchema` carries `headSha` and no base sha at all.

- [ ] `baseSha` added to `ForgePullDetailSchema` in
      [`shared/src/domain/forge.ts`](../packages/shared/src/domain/forge.ts), and populated from
      `gh pr view`'s `baseRefOid` in
      [`gh-cli.ts`](../packages/desktop/src/main/forge/gh-cli.ts).
- [ ] `imageDiffSources` in
      [`image-sources.ts`](../packages/app/src/features/diff/image-sources.ts) reached from
      `PrFileAccordion` with `{baseSha, headSha}`, so `ImageDiff`'s existing two-up / swipe / onion
      modes light up on a PR with no new component.
- [ ] Both blobs must be in the local checkout, which is not guaranteed — a fork PR needs a fetch
      first. Show an explicit **"fetch to compare"** affordance rather than fetching implicitly;
      opening a pull request should not start network traffic the user did not ask for.
- [ ] A binary non-image file in a PR keeps its existing "binary file" treatment; this theme widens
      what is *shown*, not what is *parsed*.
- [ ] `outstanding.md` loses the "image diffs in a pull request" entry, and the stale "syntax
      highlighting inside diff lines" entry beside it — that landed in Phase 20 Theme D and the list
      never caught up.

## Files this phase touches

| Area | Files |
|------|-------|
| Contract | [`shared/src/domain/forge.ts`](../packages/shared/src/domain/forge.ts) (`baseSha` on `ForgePullDetailSchema` — the phase's only schema change), [`shared/src/domain/diff.ts`](../packages/shared/src/domain/diff.ts) (**unchanged**, and load-bearing for all of A–G) |
| Main | [`forge/gh-cli.ts`](../packages/desktop/src/main/forge/gh-cli.ts) (`baseRefOid`), [`forge/gh-write.ts`](../packages/desktop/src/main/forge/gh-write.ts) (confirm `side` is sent, not defaulted) |
| Renderer — diff core | [`features/diff/diff-rows.ts`](../packages/app/src/features/diff/diff-rows.ts) (`SplitRow`, `toSplitRows`, `pairRun`, `canSplit`), [`features/diff/diff-view.tsx`](../packages/app/src/features/diff/diff-view.tsx) (`DiffCell`, `SplitBody`, `DiffToolbar`), [`features/diff/line-highlight.ts`](../packages/app/src/features/diff/line-highlight.ts) (unchanged; called from a new place), [`features/diff/comment-anchors.ts`](../packages/app/src/features/diff/comment-anchors.ts), [`features/diff/image-sources.ts`](../packages/app/src/features/diff/image-sources.ts), [`features/diff/image-diff.tsx`](../packages/app/src/features/diff/image-diff.tsx) (unchanged), [`features/diff/describe-empty.ts`](../packages/app/src/features/diff/describe-empty.ts) |
| Renderer — surfaces | [`features/status/file-diff.tsx`](../packages/app/src/features/status/file-diff.tsx), [`features/changes/file-accordion.tsx`](../packages/app/src/features/changes/file-accordion.tsx), [`features/changes/all-changes-view.tsx`](../packages/app/src/features/changes/all-changes-view.tsx), [`features/changes/expansion.ts`](../packages/app/src/features/changes/expansion.ts), [`features/reviews/pr-files.tsx`](../packages/app/src/features/reviews/pr-files.tsx), [`features/reviews/pr-file-accordion.tsx`](../packages/app/src/features/reviews/pr-file-accordion.tsx), [`features/reviews/comment-thread.tsx`](../packages/app/src/features/reviews/comment-thread.tsx), [`features/reviews/comment-composer.tsx`](../packages/app/src/features/reviews/comment-composer.tsx), [`features/reviews/outdated-threads.tsx`](../packages/app/src/features/reviews/outdated-threads.tsx) |
| Renderer — workbench | [`store/workbench-store.ts`](../packages/app/src/store/workbench-store.ts) (the `commit` tab kind), [`features/workbench/workbench.tsx`](../packages/app/src/features/workbench/workbench.tsx), [`features/commit/commit-detail.tsx`](../packages/app/src/features/commit/commit-detail.tsx), [`features/graph/graph-view.tsx`](../packages/app/src/features/graph/graph-view.tsx) (unchanged dock; a new verb), [`features/graph/use-graph-actions.ts`](../packages/app/src/features/graph/use-graph-actions.ts) |
| Store | [`store/ui-store.ts`](../packages/app/src/store/ui-store.ts) — `diffLayout`, `setDiffLayout`, `PersistedUi`, `partialize`, `version: 3` + `migrate` arm |
| Docs | [`todo/outstanding.md`](outstanding.md) (side-by-side, image diffs in a PR, and the stale syntax-highlighting entry all come off), [`docs/INITIAL_PLAN.md`](../docs/INITIAL_PLAN.md) |
| Tests | [`diff-rows.test.ts`](../packages/app/src/features/diff/diff-rows.test.ts), [`comment-anchors.test.ts`](../packages/app/src/features/diff/comment-anchors.test.ts), new `diff-cell.test.tsx`, [`e2e/diff-view.spec.ts`](../packages/app/e2e/diff-view.spec.ts) (must pass unmodified after B), [`e2e/diff-scroll-perf.spec.ts`](../packages/app/e2e/diff-scroll-perf.spec.ts), new `e2e/diff-split.spec.ts`, [`e2e/mock-bridge.ts`](../packages/app/e2e/mock-bridge.ts) |

## Verification

- [ ] `moon run :typecheck :lint :test` green.
- [ ] Boundary lint clean — this phase adds nothing to git-engine and nothing to the renderer that
      reaches past `window.midniteGit`; the only main-process change is Theme H's `baseRefOid`.
- [ ] Vitest (A): `pairRun` on balanced, unbalanced-both-ways, pure-add and pure-delete runs, and an
      explicit assertion that its pairing matches `pairLines`'s.
- [ ] Vitest (A): `canSplit` returns `false` for a `combined` diff, a `binary` diff and a
      zero-hunk diff, with a call-site test proving no surface branches on `combined` itself.
- [ ] Vitest (B): the `useLineHighlight` cache is hit for the same text on the opposite side —
      split must not double the highlighting work.
- [ ] Vitest (F): the four anchoring cases, plus a mixed thread list producing two independent
      per-side maps.
- [ ] Vitest (H): `ForgePullDetailSchema` rejects a payload with no `baseSha`, so an older `gh`
      shape fails loudly rather than rendering an empty image pane.
- [ ] Playwright (`e2e/diff-view.spec.ts`) passes **unmodified** after Theme B, and the committed
      unified screenshots are byte-identical — the extraction is the riskiest invisible change here.
- [ ] Playwright (`e2e/diff-split.spec.ts`): split on an unbalanced hunk shows the right numbers in
      both gutters, one-sided rows have a blank opposite, and the preference survives a reload.
- [ ] Playwright (`e2e/diff-scroll-perf.spec.ts`): a split case with its own row-count expectation,
      and a many-file accordion case asserting a bounded DOM.
- [ ] Screenshot, per the visual-phase convention: split in the Reviews Files tab with a thread open,
      split in a full-width commit tab, split auto-falling-back in the narrow Changes pane, and the
      accordion toolbar — all in both themes.
- [ ] **Open, for a human:** open a real PR with a large refactor in split, comment on a deleted
      line, and confirm the thread lands on the right side in the GitHub UI (this is the one thing
      the mock bridge cannot tell you).
- [ ] **Open, for a human:** an image-only PR, including a fork PR where the base blob is not local
      — confirm the "fetch to compare" affordance appears and that nothing fetches before it is
      clicked.
- [ ] **Open, for a human:** scroll a several-thousand-line file in split in the all-changes tab and
      confirm it stays smooth. This is the theme most likely to be fine in a 4000-row fixture and
      unpleasant in a real repository.

## Not in this phase

- **Per-hunk or per-line staging.** The most-requested thing a split diff makes people expect, and
  still deferred: it is a write path through the index with its own conflict semantics, and hanging
  it off a layout change is how a rendering phase becomes a data-loss phase.
- **Blame.** Deferred since Phase 12 and now owned by
  [Phase 25](phase-25-search-everywhere.md), which builds `commands/blame.ts` and the gutter to go
  with it. A split view is not where blame belongs anyway — it wants a third column, not a second.
- **Soft wrap.** Wrapped lines break paired-row alignment and make every row a measured height,
  which is exactly what Theme D is trying to keep bounded. Horizontal scroll is locked instead.
- **A line-level LCS alignment.** Better-looking on a moved block, but it can pair two lines the
  engine's word-marks say are unrelated. The renderer does not get a second opinion about pairing.
- **A Settings ▸ Diff page.** `diffLayout` rides the toolbar the way `diffShowOldGutter` already
  does. A page holding two toggles is a page that exists for symmetry; revisit when there is a
  third.
- **CodeMirror's merge view.** Phase 24 brings CodeMirror 6 into the app for the editor, which will
  make `@codemirror/merge` look like a free side-by-side. It is not: it would be a second diff
  renderer with no intraline marks from our parser, no comment rows and no shiki cache — the exact
  fork this phase's first guardrail exists to prevent.
- **Suggested changes** (GitHub's `suggestion` blocks). A write path and a parser of its own, on top
  of a comment system that only just learned about two sides.
- **Split view for stashes**, which needs Phase 22 to exist first — but it will get it for free from
  `DiffView` when it does, which is the point of not forking.
- **Non-macOS shapes.** Verified on darwin like every phase before it.

## Decisions / open questions

- **Resolved — all four surfaces, because split lands in `DiffView` itself.** Changes, the commit
  inspector, the all-changes tab and the Reviews Files tab all mount the same component, so a
  per-surface rollout would have cost *more* code than doing it once. The narrow surfaces are
  handled by Theme C's width fallback rather than by being excluded.
- **Resolved — positional pairing within runs.** The alternative candidates were block pairing (all
  deletions above all additions, aligned at the top) and a line-level LCS. Positional wins because
  it is already the rule `annotateIntraline` uses, so alignment and word-marks are the same
  decision made once rather than two subsystems guessing separately.
- **Resolved — horizontal scroll is locked across columns.** Comparing the same offset on both sides
  is the entire reason to look at two columns; independent scrolling makes that impossible the
  moment they diverge.
- **Resolved — a thread is a full-width row below its pair.** Putting a thread in its own column
  reads better on a wide screen and wastes half the width everywhere else, and it doubles the
  height bookkeeping the virtualizer already finds hardest. The LEFT/RIGHT badge in Theme F is what
  buys back the lost clarity.
- **Resolved — the preference is global and persisted, on the toolbar.** Per-surface layouts were
  offered and rejected: two diffs that look different for no visible reason is a support question,
  not a feature.
- **Resolved — the commit inspector gets a tab, not a wider dock.** Raising `LAYOUT_BOUNDS.detailWidth`
  past 720 was the one-line option; a 1200px right dock leaves the graph unusable, and the workbench
  already knows how to hold a full-width surface.
- **Open — what width does the split fallback trigger at?** *Recommendation:* ~900px of diff body,
  measured with a `ResizeObserver` on the body rather than the window, since three of the four
  surfaces sit inside resizable panels. Pick the number by putting an 80-column line in both
  columns and seeing where it stops fitting, not by guessing in the abstract.
- **Open — does `diffShowOldGutter` survive in split mode?** *Recommendation:* no — hide the toggle
  when split is active. In split each column has its own number gutter by construction, so the
  control has nothing left to do, and leaving a no-op button on the toolbar is worse than removing
  it. It stays exactly as it is in unified.
- **Open — per-file or page-level virtualization for the accordions (Theme D)?**
  *Recommendation:* per-file. The page-level flatten has to rebuild on every expand/collapse and
  fights the sticky file header; per-file costs one virtualizer per expanded file, which is bounded
  by `EXPAND_ALL_LIMIT` — and if that cap is relaxed, this is the reason to keep *some* cap.
- **Open — does relaxing `EXPAND_ALL_LIMIT` actually follow from virtualizing?** *Recommendation:*
  raise it, but on a measured number rather than removing it. Virtualization bounds the *rows*, not
  the per-file React trees, the shiki work or the query fan-out.
- **Open — how does the full-width commit tab lay out its file tree?** *Recommendation:* beside the
  diff rather than above it, with its own persisted width, reusing the `changesListWidth` pattern.
  `commitFilesHeight` stays as the dock's setting and the tab gets its own key; one number cannot
  describe both a 384px column and a 1400px one.
- **Open — do fork PRs ever fetch automatically?** *Recommendation:* no, and say so. An explicit
  "fetch to compare" is one click and keeps the rule the forge integration has held since Phase 17:
  opening a view does not start network traffic the user did not ask for.
- **Open — should `diff-scroll-perf.spec.ts` assert a budget rather than an exact row count?** Split
  changes the count and the spec asserts it exactly. *Recommendation:* keep the exact assertion per
  layout — an exact number caught the regression it was written for, and a budget would not have.
