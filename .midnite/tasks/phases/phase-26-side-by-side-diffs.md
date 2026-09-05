# Phase 26 — Side by side, and the room to show it

**Refined: x1** · 2026-09-05 · file-map precision, testing & verification, per-item acceptance criteria, out-of-scope tightening, opens

Four separate phases have deferred the same feature with the same sentence. Phase 12 wrote it first
— *"the inspector is a narrow panel; split view earns its keep only in a full-width diff surface,
which does not exist yet"* — and Phase 20 restated it as a second reason: *"a second
diff-rendering surface is its own project and a real risk of drifting visually from the one everyone
else uses."* Phase 22 repeated the ruling for stashes. [`outstanding.md`](../outstanding.md) still
carries the line. Both premises have quietly stopped being true. Phase 17's workbench gave the app
full-width tabs — `all-changes` and `review` are already two of them — and Phase 12's own diff work
turned [`diff-rows.ts`](../../../packages/app/src/features/diff/diff-rows.ts) into a pure, tested,
DOM-free row builder that a second arrangement can sit *beside* rather than fork.

The engine has been ready the whole time and nobody has needed it to change. Every `DiffLine` in
[`shared/src/domain/diff.ts`](../../../packages/shared/src/domain/diff.ts) already carries **both**
`oldNo` and `newNo`, because `parseUnifiedDiff` has tracked two line counters since Phase 12 — a
unified view throws one of them away on every row. `annotateIntraline` in
[`diff-parser.ts`](../../../packages/git-engine/src/parsers/diff-parser.ts) already computes word-level
`IntralineRange[]` and stores each side's ranges on its own line, so a split view inherits word-diff
for free and does not get a say in it. This phase therefore adds **no git command and no IPC
channel** — the whole of A–G is renderer work, and only Theme H touches a *forge* contract, to add
the one field a pull request has always been missing.

*(Corrected at refinement x1: the doc originally also claimed "no diff schema", and that turned out
not to survive the build. `SplitCellSchema` and `SplitDiffRowSchema` were added to
[`shared/src/domain/diff.ts`](../../../packages/shared/src/domain/diff.ts) at lines 42–61, so the
split row type is a zod-derived shared type rather than a renderer-local one. Nothing crosses IPC in
it — no channel carries a `SplitDiffRow` — but it is a schema addition and the doc should say so.)*

Room is the other half. Two of the four diff surfaces are already full-width; the Changes pane takes
the remainder of a resizable panel and is fine. The commit inspector is the one Phase 12 was talking
about: it lives in the Graph's right dock, capped at `detailWidth` **max 720** in
[`LAYOUT_BOUNDS`](../../../packages/app/src/store/ui-store.ts), and no amount of split-view code makes 720
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
is a bug, not a variant. **Alignment — reversed during the build, and the reversal is recorded
here rather than left to be rediscovered.** The plan said a run of deletions followed by additions
pairs *positionally*, "exactly the rule `pairLines` already uses inside `annotateIntraline`". Two
things turned out to be wrong with that. `pairLines` in
[`diff-parser.ts:451`](../../../packages/git-engine/src/parsers/diff-parser.ts) is
`function pairLines(del: DiffLine, add: DiffLine): void` — a **private, two-argument** annotator
that word-marks *one* already-chosen del/add couple. It has never had an opinion about how a run is
split into couples, so there was never a rule there to follow. And what shipped is not positional:
`alignRuns(dels, adds)` in
[`split-diff-rows.ts:83`](../../../packages/app/src/features/diff/split-diff-rows.ts) pairs by
similarity, using the module-private `levenshteinDistance` at line 171. The standing rule is
therefore the *opposite* of the one written above — the renderer does get a second opinion about
pairing — and any future change to `alignRuns` must keep
[`split-diff-rows.test.ts:83`](../../../packages/app/src/features/diff/split-diff-rows.test.ts)
(`aligns del and add lines via sequence matching`) green rather than restoring positional pairing.
**Split degrades rather than refuses**: a combined/conflict diff, a binary file, or a surface
too narrow to hold two columns renders unified without asking, and the toggle reflects what is
actually on screen. And the comment anchor stays what Phase 20 made it — a *line number*, never a
row index — because that is the only reason threads survive context expansion today and the only
reason they survive a re-arrangement tomorrow.

Effort tags: **S** ≈ an hour or two · **M** ≈ half a day · **L** ≈ a day plus.

## Deliverables

**Audit correction (2026-09-05, refinement x1).** All eight themes were marked `✅ DONE` on
2026-08-30, and seven of them are. A line-by-line re-audit against the tree found **four ticked
items that never shipped** — reverted to `- [ ]` below, each rewritten to say what is actually
missing — and a set of symbol names the doc uses that exist nowhere in the repo. The renames are
corrected in place; the file table now lists the files that really exist. Nothing here is new
scope: it is the same phase, described accurately.

- **The split model is not in `diff-rows.ts`.** It is
  [`split-diff-rows.ts`](../../../packages/app/src/features/diff/split-diff-rows.ts), which
  `diff-rows.ts:6` re-exports verbatim (`export { canSplit, toSplitRows } from './split-diff-rows';`).
  The row type is **`SplitDiffRow`**, declared in
  [`shared/src/domain/diff.ts:48`](../../../packages/shared/src/domain/diff.ts) beside `SplitCell`.
  **`SplitRow` and `pairRun` do not exist anywhere in the repo** — `grep` returns nothing for
  either — so every item naming them was unexecutable as written.
- **`DiffCell` and `DiffToolbar` got their own files**, not a home inside `diff-view.tsx`:
  [`diff-cell.tsx:16`](../../../packages/app/src/features/diff/diff-cell.tsx) and
  [`diff-toolbar.tsx:9`](../../../packages/app/src/features/diff/diff-toolbar.tsx). **`SplitBody`
  was never built and is not needed**: split rows render inline in `DiffView`'s own virtualizer
  (`diff-view.tsx:240–259`, `row.kind === 'split-line'` → two `w-1/2 min-w-0` `DiffCell`s inside one
  `flex divide-x`), which is a smaller change than the doc planned and the right one to keep.
- **`ui-store` never got a Phase 26 migration.** The store is at `version: 9`
  (`ui-store.ts:1744`) and **none of its nine `migrate` arms mentions `diffLayout`** — v9 belongs to
  Phase 64 Theme C's five `editor*` keys. `diffLayout` was added to `DIFF_PREF_DEFAULTS`
  (`ui-store.ts:81`, `'unified'`), to `partialize` (`ui-store.ts:1754`) and to
  [`persisted-keys.ts:62`](../../../packages/app/src/store/persisted-keys.ts) with no version bump,
  which is correct for a purely additive key with a default — a returning user simply gets
  `'unified'`. The doc's `version: 3` claim is stale in both halves.
- **The four items that did not ship** are Theme C's `ResizeObserver` width fallback, Theme C's
  `e2e/diff-split.spec.ts`, Theme H's "fetch to compare" affordance, and Theme H's
  [`outstanding.md`](../outstanding.md) cleanup. Counts move from 54/68 to **50/68**.

### A — The split row model (M) ✅ DONE (PR #1, 2026-08-30)

Pure, DOM-free and testable. The doc planned it "beside `toDiffRows` in the same module"; it
shipped as its own module, [`split-diff-rows.ts`](../../../packages/app/src/features/diff/split-diff-rows.ts),
re-exported through `diff-rows.ts:6` so no call site had to learn a second import path. Everything
else reads off this shape, so it lands first.

- [x] `SplitDiffRowSchema` in
      [`shared/src/domain/diff.ts:48`](../../../packages/shared/src/domain/diff.ts) — a
      `z.discriminatedUnion('kind', …)` of exactly **two** arms:
      `{kind:'hunk', hunkIndex: number, heading: string, gap: number | null}` and
      `{kind:'split-line', left: SplitCell, right: SplitCell}`, where
      `SplitCellSchema` (line 42) is `{line: DiffLine | null, type: 'ctx'|'add'|'del'|'empty'}`.
      - **Deviation from the plan, and keep it.** The doc specified a `{kind:'pair', left: DiffLine
        | null, right: DiffLine | null}` arm plus re-used `{kind:'thread'}`/`{kind:'composer'}`
        arms. What shipped wraps each side in a `SplitCell` so the *filler* case carries its own
        `type: 'empty'` rather than being inferred from `line === null` at every render site, and
        drops the thread/composer arms entirely — threads are spliced in by
        `withCommentRows` over the **unified** row list, and a split diff with an open thread falls
        back through the same path. A future item that wants threads inside split rows adds the arm
        then, not now.
- [x] `export function toSplitRows(diff: FileDiff): SplitDiffRow[]`
      ([`split-diff-rows.ts:17`](../../../packages/app/src/features/diff/split-diff-rows.ts)) —
      walks hunks in order; a `ctx` line becomes a `split-line` with the *same* line on both sides
      (each cell keeping its own `oldNo`/`newNo`), and a run of deletions immediately followed by
      additions goes through `alignRuns`.
- [x] The run pairer, which is **private and similarity-based, not exported and not positional**:
      `function pairHunkLines(lines: readonly DiffLine[]): SplitDiffRow[]`
      (`split-diff-rows.ts:42`) collects the del/add runs, and
      `function alignRuns(dels: readonly DiffLine[], adds: readonly DiffLine[]): SplitDiffRow[]`
      (`split-diff-rows.ts:83`) pairs them by `levenshteinDistance` (`split-diff-rows.ts:171`),
      leaving a `{type:'empty'}` cell opposite an unmatched line.
      - **This is the reversal recorded in the scope guardrails above**, and it is now the rule.
        There is no `pairRun` export and no correspondence test against `pairLines`, because
        `pairLines` is a two-argument word-marker and never described a run rule.
      - Neither helper is exported, so both are tested **through** `toSplitRows`. Do not export them
        to make a test easier — the module's public surface is deliberately two functions.
- [x] `export function canSplit(diff: FileDiff): boolean`
      (`split-diff-rows.ts:10`) — the shipped body is exactly
      `return !diff.binary && !diff.combined;`. A conflict diff has three sides and no honest
      two-column reading; a binary diff has no lines. Call sites never branch on `combined`
      themselves — the single reader is
      `const effectiveLayout = diff && canSplit(diff) ? diffLayoutPref : 'unified';`
      (`diff-view.tsx:144`), mirrored in `diff-toolbar.tsx:23`.
      - **Correction:** the doc also claimed `false` "for a diff with no hunks". It does not — a
        zero-hunk `FileDiff` returns `true` and renders as an empty split body, which is harmless
        because `describeEmptyDiff` (see Theme C) is what actually paints that case. The
        Verification line that asserted the zero-hunk arm has been rewritten to match.
- [x] Threads reach split rows through the **existing** `withCommentRows` over the unified row list;
      no `withSplitCommentRows` sibling was written and none is needed
      (`grep withSplitCommentRows` → no hits).
- [x] No `splitRowKey` export: the virtualizer keys `split-line` rows on the virtual item index and
      re-measures on expansion, the same as unified (`grep splitRowKey` → no hits). Left as shipped —
      an extra key export with no observed mis-keying would be a guess dressed as a guard.
- [x] Vitest in
      [`split-diff-rows.test.ts`](../../../packages/app/src/features/diff/split-diff-rows.test.ts) —
      **three** tests today: `canSplit returns false for binary or combined diffs` (line 7),
      `pairs context lines identically on left and right` (line 45), and
      `aligns del and add lines via sequence matching` (line 83). The balanced/unbalanced matrix the
      doc asked for is **not** there; it is now a named, open Verification item rather than a claim.

### B — One cell, two layouts (M) ✅ DONE (PR #1, 2026-08-30)

The theme that makes the "there is one diff renderer" guardrail structurally true rather than a
promise. No user-visible change lands here; unified must look byte-identical afterwards.

- [x] Extract the body of `LineRow` in
      [`diff-view.tsx`](../../../packages/app/src/features/diff/diff-view.tsx) into a `DiffCell` —
      the 2px kind bar, the line-number gutter, the marker column, and the text with its
      `data-diff-mark` intraline spans and merged shiki tokens.
- [x] `DiffCell` takes its gutter configuration as props instead of reading `diffShowOldGutter`
      itself; the store read moves up to `DiffView`. **The shipped signature is not the doc's
      `gutter: 'old' | 'new' | 'both'`** — it is, at
      [`diff-cell.tsx:16`](../../../packages/app/src/features/diff/diff-cell.tsx):
      ```ts
      export function DiffCell({ cell, side, showGutter = true, secondaryLineNo, path, dark, onComment }: {
        cell: SplitCell;
        side: 'left' | 'right';
        showGutter?: boolean;
        secondaryLineNo?: number | null;
        path: string;
        dark: boolean;
        onComment?: (…) => void;
      })
      ```
      `side` carries what the doc's `gutter` enum was carrying (which number the primary gutter
      shows), and `secondaryLineNo` is the extra gutter the *unified* view needs for its "Show
      original line numbers" toggle — split has no use for it, because the old side is a whole
      second `DiffCell`. `undefined` renders nothing extra; `null` or a number renders it.
      - **Known wart, deliberately left as shipped and named here so it is not rediscovered as a
        bug:** in split, `diff-view.tsx:247` still passes `showGutter={showOldGutter}` to the
        **left** cell while the right cell gets a hard `showGutter`. So the toolbar toggle that
        Theme C hides in split mode is still silently controlling the left column's gutter, and a
        user who turned it off in unified gets a numberless left column in split. The fix is one
        character (`showGutter` on both); it is listed under Verification rather than done here
        because it is a behaviour change, not a rename.
- [x] A `null` cell renders as a filler — the kind bar and gutter drawn empty at the same
      `ROW_HEIGHT`, so a one-sided run does not collapse the row it is opposite.
- [x] `useLineHighlight` in
      [`line-highlight.ts`](../../../packages/app/src/features/diff/line-highlight.ts) is called from
      `DiffCell`, unchanged. Its cache key is already content-keyed
      (`${dark}${path}${kind}${text}`), so a line highlighted on the left in split is free on the
      right in unified — confirm that with a test rather than assuming it.
- [x] `LineRow` becomes a thin unified wrapper over one `DiffCell`; `mergeSegmentsWithTokens` and
      `toSegments` are untouched and stay in `diff-rows.ts`.
- [x] Confirm no visual regression: the existing
      [`e2e/diff-view.spec.ts`](../../../packages/app/e2e/diff-view.spec.ts) passes unmodified, and the
      committed unified screenshots do not change.

### C — Two columns, and the toggle (M) ✅ DONE (PR #1, 2026-08-30)

- [x] Split rows go through the existing `useVirtualizer` in `DiffView` with the same
      `ROW_HEIGHT`, `measureElement` and overscan as unified; a `split-line` row is **one** virtual
      item, not two. **No `SplitBody` component was written** — the branch is inline in the
      virtualizer's row map at `diff-view.tsx:240–259`:
      `row.kind === 'split-line'` renders one `<div className="flex w-full divide-x divide-border">`
      holding two `<div className="w-1/2 min-w-0">` wrappers, each with a `DiffCell`. Keep it that
      way: a component whose whole body is two cells in a flex row buys an indirection and nothing
      else.
- [x] **Locked horizontal scroll**: one scroller drives both columns, so the same column offset is
      the same column offset on both sides. Implemented as a single `overflow-x-auto` wrapping a
      two-column grid — not two scrollers synchronised by an event handler, which fights the
      virtualizer and drifts on momentum scroll.
- [x] `diffLayout: 'unified' | 'split'` in
      [`ui-store.ts`](../../../packages/app/src/store/ui-store.ts) beside `diffShowOldGutter`, with
      `setDiffLayout`, in `DIFF_PREF_DEFAULTS` (`ui-store.ts:81`, defaulting to `'unified'`), in
      `partialize` (`ui-store.ts:1754`, adjacent to `diffShowOldGutter`) and in
      [`persisted-keys.ts:62`](../../../packages/app/src/store/persisted-keys.ts).
      - **No `migrate` arm, and none is wanted.** The doc said `version: 3`; the store is at
        `version: 9` (`ui-store.ts:1744`) and no arm mentions `diffLayout`. That is correct for a
        purely additive key that has a default — an old persisted blob simply lacks it and picks up
        `'unified'`. Do **not** add a migration for it later; the version bumps in this store are
        for keys whose *meaning* changed.
- [x] A toolbar toggle beside the old-gutter button, now in its own
      [`diff-toolbar.tsx`](../../../packages/app/src/features/diff/diff-toolbar.tsx). Its
      accessible names are the literal strings **`'Switch to side-by-side diff'`** and
      **`'Switch to unified diff'`** — every Playwright locator for this control must use those, and
      a `/split/i` name filter matches **neither** (see Verification; one existing spec has this
      bug).
      - The doc's note about matching `lucide-react` is now inverted by
        [`CLAUDE.md`](../../../CLAUDE.md): Phase 36 Theme D moved all 54 importers onto
        `react-icons/lu` and eslint blocks a fresh `lucide-react` import. `diff-toolbar.tsx` imports
        `LuColumns2`/`LuColumns3` from `react-icons/lu`.
- [x] The gutter toggle is **hidden**, not disabled, while split is effective —
      `diff-toolbar.tsx:51` wraps it in `{!isSplit ? … : null}`, where
      `const isSplit = (canSplit(diff) ? diffLayoutPref : 'unified') === 'split'`
      (`diff-toolbar.tsx:23-24`). In split each column has its own number gutter by construction, so
      the control has nothing left to do.
- [ ] **Not built — the width fallback does not exist.** `grep -rn 'ResizeObserver\|clientWidth\|offsetWidth\|matchMedia' packages/app/src/features/{diff,changes,reviews,commit}`
      returns **zero hits**. The only fallback that shipped is content-based
      (`canSplit(diff)` at `diff-view.tsx:144`), so a 320px-wide Changes pane renders two
      unreadable columns if the preference says split.
      - Build it as a `ResizeObserver` on the diff **body** element, not the window: three of the
        four surfaces sit inside resizable panels, so window width does not describe them.
      - The threshold is **720px of body width** — two 80-column cells at the diff's own
        `text-xs`/`font-mono` metrics plus two gutters is what stops fitting below that, and 720 is
        already the number `LAYOUT_BOUNDS.detailWidth` caps the graph dock at, so the dock is the
        boundary case by construction rather than by coincidence.
      - Below it, `effectiveLayout` becomes `'unified'` and the toolbar button renders
        `aria-pressed={false}` with the tooltip `'Too narrow for side-by-side'`, so the toggle
        explains itself instead of looking broken. **The stored preference is never rewritten** —
        widening the panel must restore split with no second click.
- [x] The centre divider: a 1px rule between columns, and per-column `min-w-0` so a long line
      scrolls rather than pushing its neighbour off-screen.
- [x] `describeEmptyDiff` and the truncation footer (`truncated`, `droppedLines`) render the same in
      both layouts — they are file-level, not row-level, and should not be re-implemented.
- [ ] **Not built — `packages/app/e2e/diff-split.spec.ts` does not exist.** The only split coverage
      in the whole e2e suite is one test inside
      [`e2e/diff-view.spec.ts:81`](../../../packages/app/e2e/diff-view.spec.ts),
      `toggling side-by-side diff switches rendering layout`, which asserts three things — the
      button flips to `'Switch to unified diff'`, `lines(page, 'add')` has count 4, and
      `getByTestId('diff-cell-left-empty')` has count 3. It does **not** assert gutter numbers and
      does **not** assert persistence.
      - Write `e2e/diff-split.spec.ts` with the three uncovered assertions: on an unbalanced hunk
        (a 5-for-2 run in the `mock-bridge` fixture) the left gutter reads the `oldNo` sequence and
        the right the `newNo` sequence; a one-sided row renders `diff-cell-left-empty` /
        `diff-cell-right-empty` opposite a real cell; and after `page.reload()` the toolbar still
        reads `'Switch to unified diff'`.
      - Press the toggle by its exact accessible name (`'Switch to side-by-side diff'`), never by a
        `/split/i` filter, and use `ControlOrMeta` for any chord — a hard-coded `Meta+…` is a
        no-op on Linux CI, which is what cost the suite nine silent failures once already
        ([`outstanding.md`](../outstanding.md)).

### D — The accordions learn to virtualize (L) ✅ DONE (PR #1, 2026-08-30)


`inline` mode has no virtualizer at all — [`file-accordion.tsx`](../../../packages/app/src/features/changes/file-accordion.tsx)
and [`pr-file-accordion.tsx`](../../../packages/app/src/features/reviews/pr-file-accordion.tsx) render
every row of every expanded file into one page scroller. Split doubles the per-row DOM, which turns
a tolerable cost into the phase's main performance risk.

- [x] Decide and record the mechanism before writing it: a per-file virtualizer inside each
      accordion body, or one virtualizer at the page level over a flattened
      (file-header + row) list. *Recommendation:* per-file, because the page-level flattening has to
      re-derive itself on every expand/collapse and the accordion header is sticky.
- [x] `inline` mode gains a virtualizer using the page scroller as its `getScrollElement`, so files
      still lay out in one continuous flow rather than becoming a stack of independently scrolling
      boxes.
- [x] Variable-height rows keep working: `measureElement` must survive threads and composers being
      injected mid-list, which is the reason the pane-mode virtualizer already uses it.
- [x] The horizontal scroller stays **per file** as it is today (`overflow-x-auto` + `w-max
      min-w-full`), so one very wide file does not make every other file scroll.
- [x] Collapsing a file releases its rows; expanding restores scroll position rather than jumping.
- [x] Revisit `EXPAND_ALL_LIMIT` / `withheldByCap` in
      [`expansion.ts`](../../../packages/app/src/features/changes/expansion.ts) — the cap exists because
      expanding everything renders everything, which stops being true here. Relax it with a
      measured number, or write down why it stays.
- [x] Extend [`e2e/diff-scroll-perf.spec.ts`](../../../packages/app/e2e/diff-scroll-perf.spec.ts) with a
      split case. The existing spec asserts *exact* rendered row counts against `ROW_COUNT = 4000`
      and will need its own expectation for pairs — do not loosen the unified assertion to make one
      number fit both.
- [x] A second perf case for the accordions: a many-file diff expanded in split, asserting the DOM
      row count stays bounded rather than growing with the file.

### E — A toolbar for the accordion surfaces (S) ✅ DONE (2026-08-30)


Pane mode has a toolbar; `inline` mode has never had one, so All-changes and Reviews Files have no
context expansion, no gutter toggle and nowhere to put the layout switch.

- [x] A shared `DiffToolbar` extracted from `DiffView`'s pane-mode header — `+n / −m`, the old-gutter
      toggle, the new layout toggle, and "show whole file" — taking its actions as props.
- [x] `inline` mode renders it in the per-file accordion header, which is already sticky in
      `pr-file-accordion.tsx`.
- [x] Actions absent on a surface are **omitted, not disabled-with-no-reason**: `PrFiles` has the
      whole patch in memory from one `gh pr diff` and cannot refetch at a larger `-U`, so context
      expansion does not appear there at all.
- [x] The layout toggle in a file header flips the global preference, matching every other diff
      control — it is not a per-file override.
- [x] Pane mode keeps its current header exactly; this is an extraction, and a diff of the rendered
      pane-mode toolbar should be empty.

### F — Comments on the left side (L) ✅ DONE (2026-08-30)

Phase 20 shipped right-side-only on purpose (`isCommentableLine` requires `newNo !== null`), and
said so. Split view makes the deleted side a first-class column, at which point "you cannot comment
on the thing you are looking at" reads as a bug.

- [x] `leftSideLines(diff): Set<number>` in
      [`comment-anchors.ts`](../../../packages/app/src/features/diff/comment-anchors.ts), the `oldNo`
      mirror of `rightSideLines`.
- [x] `isAnchored` widened to accept `side === 'LEFT'`, and `threadsForFile` returning threads
      keyed by side — a `ThreadsByLine` per side rather than one map, because line 40 on the left
      and line 40 on the right are different anchors.
- [x] `isCommentableLine` widened: a `del` line with a non-null `oldNo` is commentable on the LEFT.
      A `ctx` line has both numbers and must resolve to exactly one side — pick RIGHT, and test it.
- [x] `positionForLine` gains a `side` argument for the legacy diff-offset fallback, which is only
      sent when GitHub refuses `line`+`side`.
- [x] The composer opens against `{path, line, side}`; the write path through
      `forgeReviewComment` already carries `side` in `ForgeThreadSideSchema` — confirm `gh-write.ts`
      sends it rather than defaulting.
- [x] A thread renders as a **full-width row below its pair**, spanning both columns and pushing the
      row down, exactly as `withCommentRows` does in unified today. Its header shows a LEFT/RIGHT
      badge and the old-or-new line number, so the anchor is never ambiguous once the row no longer
      sits under one column.
- [x] Left-side threads that were previously bucketed into
      [`outdated-threads.tsx`](../../../packages/app/src/features/reviews/outdated-threads.tsx)'s
      above-the-diff list now anchor inline where they can. `outdated` and `fileLevel` threads stay
      in that list — those are genuinely unanchorable, not merely left-side.
- [x] Vitest in
      [`comment-anchors.test.ts`](../../../packages/app/src/features/diff/comment-anchors.test.ts): a
      LEFT thread on a deleted line, a LEFT thread whose line has since been removed from the diff
      (falls through to unanchored), a `ctx` line resolving RIGHT, and both maps built from one
      mixed thread list.

### G — A commit is a workbench tab (M) ✅ DONE (2026-08-30)

- [x] A `commit` arm on the `WorkbenchTab` union in
      [`workbench-store.ts`](../../../packages/app/src/store/workbench-store.ts), beside
      `all-changes | run | review`, carrying `{repoId, sha, worktreePath?}`.
- [x] `CommitDetail` in
      [`commit-detail.tsx`](../../../packages/app/src/features/commit/commit-detail.tsx) rendered at
      full width in the tab, reusing `ChangeTree` and the same `DiffView` — the panel and the tab
      are two mounts of one component, not two components.
- [x] The tab title is the abbreviated sha plus the subject, truncated the way the review tab
      already truncates.
- [x] An "Open in tab" verb: on the inspector header, and in the graph row context menu built by
      [`use-graph-actions.ts`](../../../packages/app/src/features/graph/use-graph-actions.ts).
- [x] The dock is unchanged — `detailWidth` keeps its 720 cap and the inspector stays the quick-look
      panel. This theme adds a destination; it does not move the inspector.
- [x] Opening the same commit twice focuses the existing tab rather than adding a second, matching
      the review tab's behaviour.
- [x] `commitFilesHeight` (the inspector's file-list/diff split) needs a full-width counterpart, or
      the tab lays the file tree out beside the diff rather than above it. Decide once and write it
      down; a tree that is 200px tall and 1400px wide is neither.

### H — Image diffs in a pull request (S) ✅ DONE (2026-08-30)

The one contract change in the phase, and a documented gap in
[`outstanding.md`](../outstanding.md): the `ImageDiff` viewer works in Changes and the commit inspector
but not in Reviews, because `ForgePullDetailSchema` carries `headSha` and no base sha at all.

- [x] `baseSha` added to `ForgePullDetailSchema` at
      [`shared/src/domain/forge.ts:569`](../../../packages/shared/src/domain/forge.ts) — the shipped
      declaration is `baseSha: z.string().nullable().default(null)`, i.e. **optional with a null
      default**, not required.
      - The mapping is **not** in `gh-cli.ts`, which only adds `baseRefOid` to the requested field
        list (`gh-cli.ts:93`). The field is assigned in
        [`gh-parse.ts:257`](../../../packages/desktop/src/main/forge/gh-parse.ts):
        `baseSha: asString(row['baseRefOid'])`. Correct the Files table accordingly.
- [x] `imageDiffSources` in
      [`image-sources.ts`](../../../packages/app/src/features/diff/image-sources.ts) reached from
      `PrFileAccordion` with `{baseSha, headSha}`, so `ImageDiff`'s existing two-up / swipe / onion
      modes light up on a PR with no new component.
- [ ] **Not built — there is no "fetch to compare" affordance.** `grep -n 'fetch\|fork'` over
      [`image-diff.tsx`](../../../packages/app/src/features/diff/image-diff.tsx) and
      [`image-sources.ts`](../../../packages/app/src/features/diff/image-sources.ts) returns one
      hit, the comment *"Nothing here fetches; the browser…"*. What shipped is a bare presence
      check at
      [`pr-file-accordion.tsx:157`](../../../packages/app/src/features/reviews/pr-file-accordion.tsx):
      `repoId && headSha && (baseSha || file.oldPath) ? imageDiffSources(…) : …`.
      - So a fork PR whose base blob is not in the local object store falls through to the plain
        binary treatment with **no explanation** — which is the failure mode this item existed to
        prevent.
      - Build it as: when `baseSha` is set but `git cat-file -e <baseSha>:<path>` fails, render a
        single button labelled **`Fetch to compare`** in the file's body. It calls the existing
        fetch op for the PR's base remote and nothing else. **Nothing fetches before the click** —
        that is the rule the forge integration has held since Phase 17 and the only reason this is
        a button rather than an effect.
- [x] A binary non-image file in a PR keeps its existing "binary file" treatment; this theme widens
      what is *shown*, not what is *parsed*.
- [ ] **Not done — [`outstanding.md`](../outstanding.md) still carries all three entries.** The
      `## Image diffs in a pull request` section is still at `outstanding.md:165`; the stale
      *"Syntax highlighting inside diff lines"* bullet is still at `outstanding.md:52`; and
      `outstanding.md:59-60` still reads *"**Side-by-side diff** — earns its keep only in a
      full-width diff surface, which does not exist yet"*, which this whole phase disproved.
      - Delete the first two outright. Rewrite the third as a one-line pointer to this phase rather
        than deleting it, so the four phases that deferred it have somewhere to land.
      - [`docs/INITIAL_PLAN.md`](../../../docs/INITIAL_PLAN.md) has **no** mention of split or
        side-by-side either, so the Files table's claim on it is also unmet; add the one sentence
        that says the shared `DiffView` now has two layouts.

## Files this phase touches

Reconciled against the tree at refinement x1 (2026-09-05). `(**unchanged**)` means the file is
load-bearing for this phase and deliberately not edited; `(**net-new, unbuilt**)` means the phase
named it and it does not exist.

| Area | Files |
|------|-------|
| Contract | [`shared/src/domain/diff.ts`](../../../packages/shared/src/domain/diff.ts) — **edited, not unchanged**: `SplitCellSchema` (L42) and `SplitDiffRowSchema` (L48) are this phase's own additions · [`shared/src/domain/forge.ts`](../../../packages/shared/src/domain/forge.ts) (`baseSha: z.string().nullable().default(null)`, L569) |
| Main | [`forge/gh-cli.ts`](../../../packages/desktop/src/main/forge/gh-cli.ts) (adds `baseRefOid` to the requested field list, L93) · [`forge/gh-parse.ts`](../../../packages/desktop/src/main/forge/gh-parse.ts) (**the actual mapping**, `baseSha: asString(row['baseRefOid'])`, L257) · [`forge/gh-write.ts`](../../../packages/desktop/src/main/forge/gh-write.ts) (confirm `side` is sent, not defaulted) |
| Renderer — diff core | [`features/diff/split-diff-rows.ts`](../../../packages/app/src/features/diff/split-diff-rows.ts) (**the split model**: `canSplit`, `toSplitRows`, private `pairHunkLines`/`alignRuns`/`levenshteinDistance`) · [`features/diff/diff-rows.ts`](../../../packages/app/src/features/diff/diff-rows.ts) (`toDiffRows`, `toSegments`, `mergeSegmentsWithTokens`, `withCommentRows`; re-exports the split pair at L6) · [`features/diff/diff-cell.tsx`](../../../packages/app/src/features/diff/diff-cell.tsx) (**own file**) · [`features/diff/diff-toolbar.tsx`](../../../packages/app/src/features/diff/diff-toolbar.tsx) (**own file**) · [`features/diff/diff-view.tsx`](../../../packages/app/src/features/diff/diff-view.tsx) (`DiffView`, `HunkHeader`, `InlineDiffBody`; the split branch is inline at L240–259 — there is no `SplitBody`) · [`features/diff/line-highlight.ts`](../../../packages/app/src/features/diff/line-highlight.ts) (**unchanged**; called from a new place) · [`features/diff/use-file-diff.ts`](../../../packages/app/src/features/diff/use-file-diff.ts) · [`features/diff/comment-anchors.ts`](../../../packages/app/src/features/diff/comment-anchors.ts) · [`features/diff/image-sources.ts`](../../../packages/app/src/features/diff/image-sources.ts) · [`features/diff/image-diff.tsx`](../../../packages/app/src/features/diff/image-diff.tsx) (**unchanged**) · [`features/diff/describe-empty.ts`](../../../packages/app/src/features/diff/describe-empty.ts) (`describeEmptyDiff`) |
| Renderer — surfaces | [`features/status/file-diff.tsx`](../../../packages/app/src/features/status/file-diff.tsx) · [`features/changes/file-accordion.tsx`](../../../packages/app/src/features/changes/file-accordion.tsx) · [`features/changes/changes-accordion.tsx`](../../../packages/app/src/features/changes/changes-accordion.tsx) (an `EXPAND_ALL_LIMIT` call site) · [`features/changes/all-changes-view.tsx`](../../../packages/app/src/features/changes/all-changes-view.tsx) · [`features/changes/expansion.ts`](../../../packages/app/src/features/changes/expansion.ts) (`export const EXPAND_ALL_LIMIT = 100`, L17) · [`features/commit/commit-all-changes.tsx`](../../../packages/app/src/features/commit/commit-all-changes.tsx) (the other call site) · [`features/reviews/pr-files.tsx`](../../../packages/app/src/features/reviews/pr-files.tsx) · [`features/reviews/pr-file-accordion.tsx`](../../../packages/app/src/features/reviews/pr-file-accordion.tsx) (the image-diff gate, L157) · [`features/reviews/comment-thread.tsx`](../../../packages/app/src/features/reviews/comment-thread.tsx) · [`features/reviews/comment-composer.tsx`](../../../packages/app/src/features/reviews/comment-composer.tsx) · [`features/reviews/outdated-threads.tsx`](../../../packages/app/src/features/reviews/outdated-threads.tsx) |
| Renderer — workbench | [`store/workbench-store.ts`](../../../packages/app/src/store/workbench-store.ts) (the `commit` tab kind) · [`features/workbench/workbench.tsx`](../../../packages/app/src/features/workbench/workbench.tsx) (L108–109 mounts `CommitDetailView`) · [`features/commit/commit-detail.tsx`](../../../packages/app/src/features/commit/commit-detail.tsx) (**the same component the narrow dock uses, unmodified** — see Theme G's resolved decision) · [`features/graph/graph-view.tsx`](../../../packages/app/src/features/graph/graph-view.tsx) (unchanged dock; a new verb) · [`features/graph/use-graph-actions.ts`](../../../packages/app/src/features/graph/use-graph-actions.ts) |
| Store | [`store/ui-store.ts`](../../../packages/app/src/store/ui-store.ts) — `diffLayout`/`setDiffLayout`, `DIFF_PREF_DEFAULTS` (L81), `partialize` (L1754), `LAYOUT_BOUNDS.commitFilesHeight` (L379). **No `migrate` arm and no version bump** · [`store/persisted-keys.ts`](../../../packages/app/src/store/persisted-keys.ts) (L62) |
| Docs | [`outstanding.md`](../outstanding.md) — **still unedited**: L52, L59-60 and L165 all outstanding · [`docs/INITIAL_PLAN.md`](../../../docs/INITIAL_PLAN.md) — **still unedited**, contains no mention of split |
| Tests | [`split-diff-rows.test.ts`](../../../packages/app/src/features/diff/split-diff-rows.test.ts) (3 tests) · [`diff-rows.test.ts`](../../../packages/app/src/features/diff/diff-rows.test.ts) (4 describes, **no split coverage**) · [`comment-anchors.test.ts`](../../../packages/app/src/features/diff/comment-anchors.test.ts) · [`line-highlight.test.ts`](../../../packages/app/src/features/diff/line-highlight.test.ts) · `features/diff/diff-cell.test.tsx` (**net-new, unbuilt**) · [`e2e/diff-view.spec.ts`](../../../packages/app/e2e/diff-view.spec.ts) (holds the one split test, L81) · [`e2e/diff-scroll-perf.spec.ts`](../../../packages/app/e2e/diff-scroll-perf.spec.ts) · [`e2e/diff-settings-shots.spec.ts`](../../../packages/app/e2e/diff-settings-shots.spec.ts) (where a split shot belongs) · `e2e/diff-split.spec.ts` (**net-new, unbuilt**) · [`e2e/mock-bridge.ts`](../../../packages/app/e2e/mock-bridge.ts) |

## Verification

Every line below was re-checked against the tree at refinement x1. An item that an existing test
already covers says which test and stays open only as the run-it-and-see gate; an item nothing
covers says exactly what to write and where.

- [ ] `moon run :typecheck :lint :test` green.
- [ ] Boundary lint clean — this phase adds nothing to git-engine and nothing to the renderer that
      reaches past `window.midniteStudio`; the only main-process change is Theme H's `baseRefOid`
      in `gh-cli.ts`/`gh-parse.ts`.
- [ ] Vitest (A) — the alignment matrix, which
      [`split-diff-rows.test.ts`](../../../packages/app/src/features/diff/split-diff-rows.test.ts)
      does **not** have today. Add to that file, driving `toSplitRows` (never the private helpers):
      a balanced 3-for-3 run, an unbalanced 5-for-2 and 2-for-5, a pure addition against an empty
      file, a pure deletion, and a hunk gap. Assert on the `SplitDiffRow[]` shape — for the
      unbalanced cases, that the surplus side's rows carry `{type:'empty'}` opposite and that no
      `split-line` row has `'empty'` on both sides.
      - Do **not** re-add an assertion that pairing matches `pairLines`. It never did (see the
        scope guardrails), and `pairLines` is private to `diff-parser.ts` anyway.
- [ ] Vitest (A) — `canSplit` returns `false` for a `combined` diff and a `binary` diff
      (**already covered**: `split-diff-rows.test.ts:7`,
      `canSplit returns false for binary or combined diffs`). The doc's third case, a zero-hunk
      diff, is **wrong**: the shipped body is `!diff.binary && !diff.combined`, so a zero-hunk diff
      splits and renders empty. Assert the true behaviour instead — a zero-hunk diff returns `true`
      and `toSplitRows` returns `[]`, and the empty body is `describeEmptyDiff`'s job.
- [ ] Vitest (B) — `useLineHighlight`'s cache is hit for the same text on the opposite side, so
      split does not double the highlighting work. The cache key is content-shaped
      (`${dark}${path}${kind}${text}`), which is why this holds; assert it in
      [`line-highlight.test.ts`](../../../packages/app/src/features/diff/line-highlight.test.ts)
      by highlighting the same `ctx` line as `side: 'left'` then `side: 'right'` and expecting one
      tokenizer call, not two.
- [ ] Vitest (B) — the left-gutter wart: `DiffCell` renders its number gutter on **both** sides in
      split regardless of `diffShowOldGutter`. Today `diff-view.tsx:247` passes
      `showGutter={showOldGutter}` to the left cell only. Fix it to a hard `showGutter`, and assert
      it: with `diffShowOldGutter: false` and `diffLayout: 'split'`, both columns still render line
      numbers.
- [ ] Vitest (F) — `leftSideLines` has **no test at all**. Its twin `rightSideLines` has a full
      describe at
      [`comment-anchors.test.ts:94`](../../../packages/app/src/features/diff/comment-anchors.test.ts);
      add the matching `describe('leftSideLines')` over the same fixture — a `del` line is in the
      set, an `add` line is not, a `ctx` line is (it has an `oldNo`), and an expanded-context line
      keeps its membership.
      - The per-side thread map and `isCommentableLine`'s four cases **are** already covered
        (`comment-anchors.test.ts:81`, `:158-169`, `:306-320`); this item is only the missing twin.
- [ ] Vitest (H) — **the doc's assertion as written can never pass.** `baseSha` is
      `.nullable().default(null)`, so a payload with no `baseSha` parses successfully; there is no
      rejection to assert, and `grep -rn baseSha` across every test file returns zero hits. Replace
      it with the two assertions that are actually load-bearing: `ForgePullDetailSchema.parse({…})`
      with `baseRefOid` absent yields `baseSha === null`, and `pr-file-accordion.tsx`'s gate
      (`baseSha || file.oldPath`) renders the plain binary treatment rather than an empty image pane
      when both are missing.
- [ ] Playwright — [`e2e/diff-view.spec.ts`](../../../packages/app/e2e/diff-view.spec.ts)
      passes unmodified after Theme B, and its `toggling side-by-side diff switches rendering
      layout` test (L81) stays green. **There are no committed unified screenshots** anywhere under
      `packages/app` (no `*-snapshots*` directory exists), so the doc's byte-identical-screenshot
      guard was never real; the RTL and e2e assertions are the whole guard.
- [ ] Playwright — write `e2e/diff-split.spec.ts` per Theme C's reverted item: gutter numbers on an
      unbalanced hunk, a blank opposite on one-sided rows, and the preference surviving
      `page.reload()`.
- [ ] Playwright — **fix the silently-passing split test** in
      [`e2e/diff-scroll-perf.spec.ts:102`](../../../packages/app/e2e/diff-scroll-perf.spec.ts),
      `a 4000-line diff in split mode stays windowed and bounded`. It guards its own toggle click
      behind `if (await splitToggle.isVisible())` with a `/split/i` name filter, and the control's
      real accessible name is `'Switch to side-by-side diff'` — which that regex does not match. The
      test therefore almost certainly measures **unified** and passes for the wrong reason. Change
      the locator to the exact name and drop the `isVisible()` guard so a missing toggle fails.
      - The row-count assertion itself is correct as a **range**
        (`expect(mounted).toBeGreaterThan(0); expect(mounted).toBeLessThan(400);` at L79-81 and
        L112-114 over `ROW_COUNT = 4000`) — leave it. The timing half of the old exact-count
        argument moved to `e2e/perf/diff-scroll.spec.ts` under `moon run app:perf`, reading
        `scripts/perf/budgets.json` (Phase 36 Theme H).
- [ ] Screenshot, per the visual-phase convention — **none exist**. Add split shots to the existing
      [`e2e/diff-settings-shots.spec.ts`](../../../packages/app/e2e/diff-settings-shots.spec.ts)
      rather than a new shots spec: split in the Reviews Files tab with a thread open, split in a
      full-width commit tab, and the accordion toolbar, in both themes. The narrow-pane fallback
      shot waits on Theme C's reverted item.
- [ ] **Open, for a human:** open a real PR with a large refactor in split, comment on a deleted
      line, and confirm the thread lands on the right side in the GitHub UI (this is the one thing
      the mock bridge cannot tell you).
- [ ] **Open, for a human:** an image-only PR, including a fork PR where the base blob is not local
      — today this shows the plain binary treatment with no explanation, so this pass is what
      confirms Theme H's reverted "fetch to compare" item once it is built.
- [ ] **Open, for a human:** scroll a several-thousand-line file in split in the all-changes tab and
      confirm it stays smooth. Virtualization is **per-file** (`InlineDiffBody`'s `useVirtualizer`
      at `diff-view.tsx:344`, scroll element found with `closest('.overflow-y-auto')`), bounded by
      `EXPAND_ALL_LIMIT = 100` — so the risk is many files open at once, not one long file.

## Not in this phase

- **Per-hunk or per-line staging.** The most-requested thing a split diff makes people expect, and
  still deferred: it is a write path through the index with its own conflict semantics, and hanging
  it off a layout change is how a rendering phase becomes a data-loss phase.
- **Blame.** Deferred since Phase 12 and now owned by
  [Phase 25](phase-25-search-everywhere.md), which builds `commands/blame.ts` and the gutter to go
  with it. A split view is not where blame belongs anyway — it wants a third column, not a second.
- **Soft wrap.** Wrapped lines break paired-row alignment and make every row a measured height,
  which is exactly what Theme D is trying to keep bounded. Horizontal scroll is locked instead.
- ~~**A line-level LCS alignment.**~~ **Reversed during the build — this is what shipped.**
  `alignRuns` in [`split-diff-rows.ts:83`](../../../packages/app/src/features/diff/split-diff-rows.ts)
  pairs a del/add run by `levenshteinDistance` similarity, not positionally. The guardrail's fear —
  that the renderer would pair two lines the parser's word-marks call unrelated — is real and
  unaddressed: `annotateIntraline` marks whatever pair the renderer hands it. **What stays out of
  scope is going further**: no move detection across hunks, no whitespace-insensitive alignment, no
  configurable algorithm. If the similarity pairing ever produces a visibly wrong couple, the fix is
  a threshold below which `alignRuns` stops pairing and emits two one-sided rows — not a third
  algorithm.
- **A Settings ▸ Diff page.** `diffLayout` rides the toolbar the way `diffShowOldGutter` already
  does. A page holding two toggles is a page that exists for symmetry; revisit when there is a
  third.
- **An editor library's merge view.** The doc named `@codemirror/merge`; the library that actually
  arrived is **Monaco** (Phase 64, `@monaco-editor/react` 4.7.0 + `monaco-editor` 0.56.0), whose
  `DiffEditor` looks equally free. [Phase 64 rules it out
  twice](phase-64-offline-monaco-and-themes.md) in its own words — *"Diff views stay on
  `diff-view.tsx`. Monaco's `DiffEditor` is not adopted"* — for this phase's reason plus one more:
  `diff-view.tsx` is virtualised, intraline-marked and perf-budgeted
  (`diffScrollMedianGapMs: 22`). Monaco's single mount site is
  [`file-preview.tsx:308`](../../../packages/app/src/features/files/preview/file-preview.tsx) and it
  stays there. The two systems only meet at theming: Phase 64 lists `diff-view.tsx:141` as one of
  the surfaces its resolved theme id must reach.
- **Suggested changes** (GitHub's `suggestion` blocks). A write path and a parser of its own, on top
  of a comment system that only just learned about two sides.
- ~~**Split view for stashes**, which needs Phase 22 to exist first.~~ **Already true, and for
  free.** [Phase 22](phase-22-stash-and-safety-net.md) landed the stash inspector on the shared
  `DiffView` ([`stash-inspector.tsx`](../../../packages/app/src/features/stash/stash-inspector.tsx)),
  so all three of its parts split with the toolbar toggle and no stash-specific code — which is the
  whole point of not forking the renderer. Nothing here to do; kept as the worked example.
- **Non-macOS shapes.** Verified on darwin like every phase before it.

## Decisions / open questions

- **Resolved — all four surfaces, because split lands in `DiffView` itself.** Changes, the commit
  inspector, the all-changes tab and the Reviews Files tab all mount the same component, so a
  per-surface rollout would have cost *more* code than doing it once. The narrow surfaces were to be
  handled by Theme C's width fallback — which did not ship, so today they are handled by nothing
  (see Theme C's reverted item).
- **Reversed — pairing is similarity-based, not positional.** The plan chose positional pairing on
  the reasoning that it was "already the rule `annotateIntraline` uses". That reasoning was wrong on
  the facts: `pairLines` is a private two-argument word-marker with no run rule in it. What shipped
  is `alignRuns` + `levenshteinDistance`. Recorded as a reversal rather than quietly re-worded,
  because the scope guardrails and the "Not in this phase" list both forbade exactly this and a
  future reader deserves to know which way the decision actually went.
- **Resolved — horizontal scroll is locked across columns.** Comparing the same offset on both sides
  is the entire reason to look at two columns; independent scrolling makes that impossible the
  moment they diverge. Shipped as one `overflow-x-auto` over a two-column flex row, not two
  scrollers synchronised by an event handler.
- **Resolved — a thread is a full-width row below its pair.** Putting a thread in its own column
  reads better on a wide screen and wastes half the width everywhere else. Note what this cost:
  `SplitDiffRowSchema` has **no** thread or composer arm, so threads are spliced into the *unified*
  row list by `withCommentRows` and a split diff with an open thread renders them full-width across
  both columns. That is the intended behaviour, not a gap.
- **Resolved — the preference is global and persisted, on the toolbar.** Per-surface layouts were
  offered and rejected: two diffs that look different for no visible reason is a support question,
  not a feature. `diffLayout` lives in `partialize` and `persisted-keys.ts`, with no migration.
- **Resolved — the commit inspector gets a tab, not a wider dock.** Raising
  `LAYOUT_BOUNDS.detailWidth` past 720 was the one-line option; a 1200px right dock leaves the graph
  unusable.
- **Resolved (by the build, against the doc's own recommendation) — the full-width commit tab reuses
  the narrow inspector unchanged, file tree ABOVE the diff.** The doc recommended putting the tree
  *beside* the diff with its own persisted width. What shipped is `workbench.tsx:108` mounting the
  same `CommitDetail` the dock uses, resizing on the same vertical `commitFilesHeight` key
  (`commit-detail.tsx:203-211`, `LAYOUT_BOUNDS.commitFilesHeight` `{min:80,max:720}`) — there is no
  `commitFilesWidth` anywhere in `LayoutSizes`. **Keep it.** One component with one layout is what
  makes "open this commit wider" a pure win rather than a second commit UI to keep in sync, and
  `stash-inspector.tsx:105` now shares the same key, so a width variant would have to be invented
  twice. Revisit only if a real 1400px commit tab proves the vertical split wasteful.
- **Resolved — `diffShowOldGutter` does not survive in split: the toggle is hidden.**
  `diff-toolbar.tsx:51` wraps it in `{!isSplit ? … : null}`. In split each column has its own gutter
  by construction. One wart survives and is now a Verification item: the pref is still *read* for
  the left cell (`diff-view.tsx:247`), so turning it off in unified silently strips the left
  column's numbers in split.
- **Resolved — per-file virtualization for the accordions.** Shipped as recommended: the
  `useVirtualizer` is inside `InlineDiffBody` (`diff-view.tsx:344`), finding its scroll element with
  `containerRef.current.closest('.overflow-y-auto')`. **No page-level list virtualizer exists** —
  none of `file-accordion.tsx`, `changes-accordion.tsx`, `all-changes-view.tsx` or
  `pr-file-accordion.tsx` calls `useVirtualizer`. The page-level flatten would have had to rebuild
  on every expand/collapse and fight the sticky file header.
- **Resolved — `EXPAND_ALL_LIMIT` stays at 100.** It was not raised, and the cap is exactly the
  reason the per-file virtualizer is safe: virtualization bounds the *rows*, not the per-file React
  trees, the shiki work or the query fan-out, so the cap is doing the other half of the job. It is
  declared once at [`expansion.ts:17`](../../../packages/app/src/features/changes/expansion.ts) and
  read from two call sites (`changes-accordion.tsx`, `commit-all-changes.tsx`). Raise it only with a
  measured number from `scripts/perf/`.
- **Resolved — `diff-scroll-perf.spec.ts` asserts a range, and that is right.** The exact-count
  argument was settled by splitting it: the mounted-row assertion is a bound
  (`> 0` and `< 400` over a 4000-row fixture) and the timing assertion moved to
  `e2e/perf/diff-scroll.spec.ts` under `moon run app:perf`, against `scripts/perf/budgets.json`
  (Phase 36 Theme H). A layout-dependent exact number would have to be re-derived every time a row
  gained a pixel.
- **Resolved at refinement x1 — fork PRs never fetch automatically, and the affordance is still
  owed.** No automatic fetch exists (good), but neither does the explicit alternative, so today a
  fork PR's image diff simply degrades to the binary treatment with no explanation. Theme H's
  reverted item specifies the button (`Fetch to compare`, gated on `git cat-file -e` failing for the
  base blob). *Decided without the human, at refinement x1: a button rather than an inline "this
  needs a fetch" note, because the note tells you the problem and leaves you in the wrong app to
  solve it.*
- **Open — the split→unified width threshold, now that the fallback is known not to exist.**
  *Recommendation, and what Theme C's item is written against:* **720px of diff body width**,
  observed with a `ResizeObserver` on the body element rather than the window, because three of the
  four surfaces sit inside resizable panels. 720 is not a guess — it is the width
  `LAYOUT_BOUNDS.detailWidth` already caps the graph dock at, so the one surface the phase's framing
  prose called too narrow is exactly the boundary case. Confirm it by putting an 80-column line in
  both columns before hard-coding it.
