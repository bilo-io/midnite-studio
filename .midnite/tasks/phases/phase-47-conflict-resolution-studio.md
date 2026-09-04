# Phase 47 — Conflict Resolution Studio

[Phase 8](phase-8-drag-drop-ops.md) gave drag-triggered merge/rebase/cherry-pick a conflict
outcome the UI renders rather than an exception the app throws, and that promise is kept exactly
once: `ConflictBanner` ([`features/status/conflict-banner.tsx`](../../../packages/app/src/features/status/conflict-banner.tsx))
names the op, lists the conflicted paths, and offers Continue/Abort. It does not let you resolve
anything — resolving a conflict today means leaving the app for an editor or a terminal, then
coming back to click Continue once every path is staged.

[Phase 26](phase-26-side-by-side-diffs.md) is the reason this gap was left alone rather than
patched in passing. Its own `canSplit()` returns `false` for a `combined` diff, with the comment
*"a conflict diff has three sides and no honest two-column reading"* — and its "Not in this phase"
list named the actual prerequisite this phase builds: *"Per-hunk or per-line staging… it is a
write path through the index with its own conflict semantics, and hanging it off a layout change
is how a rendering phase becomes a data-loss phase."* This phase is that write path, scoped to
exactly what a git client needs for it and nothing past that: see the three sides, choose a
resolution per region or per hunk, and stage the result — not become a text editor.

**Builds on, and does not repeat.** [`GitOpResult`](../../../packages/shared/src/domain/result.ts)'s
conflict arm (`{ok:false, kind:'conflict', files, op}`), [`sequencer.ts`](../../../packages/git-engine/src/commands/sequencer.ts)'s
whole-operation `abort`/`continueOp`, and [`stage.ts`](../../../packages/git-engine/src/commands/stage.ts)'s
whole-file `stagePaths`/`unstagePaths`/`discardPaths` all stay exactly as they are — this phase adds
a resolution layer underneath Continue, it does not replace the banner or the abort/continue
contract. [Phase 34](phase-34-agent-councils.md)'s council-run IPC
(`mstudio:council:run:start`, `{councilId, prompt: string}`) also stays untouched; Theme E reuses
it by sending it a conflict's text, not by extending it.

**Scope guardrails.** **No manual free-text editing of the merged output.** The Studio lets you
*choose* a side per region or per hunk — accept ours, accept theirs, accept both — it does not
grow into a text editor; a user who wants to hand-write the resolution still leaves the app for
that, exactly as today. **No `rerere` integration.** **No binary-file or Git-LFS conflict UI** —
those conflicts stay banner-only, same as now. **No submodule conflict resolution.** **AI
suggestions are advisory text only and are never auto-applied** — accepting one still goes through
the same accept-ours/theirs/both action a human clicks for any other resolution.

Effort tags: **S** ≈ an hour or two · **M** ≈ half a day · **L** ≈ a day plus.

## Deliverables

### A — The conflict data model + parser (M) — ✅ DONE (PR #63, 2026-09-03)

Nothing past this theme can render or act on anything; it turns opaque marker text into structure.

- [x] `ConflictRegionSchema` / `ConflictedHunkSchema` in a new
      [`shared/src/domain/conflict.ts`](../../../packages/shared/src/domain/conflict.ts) — zod only,
      no other workspace import, per the package boundary rule. A hunk is a discriminated sequence
      of segments: `context` (identical on both sides), and a `conflict` segment carrying `ours`,
      `theirs`, and an optional `base` (present only under `diff3` conflict style).
- [x] A new [`git-engine/src/parsers/conflict-parser.ts`](../../../packages/git-engine/src/parsers/conflict-parser.ts)
      that takes the raw marker-delimited text `readFileDiff` already returns for a combined diff
      (confirmed today by
      [`diff-conflicts.integration.test.ts`](../../../packages/git-engine/src/commands/diff-conflicts.integration.test.ts):
      `<<<<<<<`/`=======`/`>>>>>>>` land as literal, unparsed line text in `hunks[].lines[].text`)
      and splits it into `ConflictRegion`s. Detect `|||||||` to support **both** conflict styles —
      the default 2-way marker set and `merge.conflictStyle = diff3`'s 3-way one — since that's a
      user's global git config, not something the app controls or should assume.
- [x] Unit tests: a `diff3`-style fixture and a default-style fixture, each round-tripping through
      the parser into the same logical regions modulo the presence of `base`. A file with **no**
      conflict markers (e.g. binary, or an already-resolved file the caller queried too late) parses
      to zero regions rather than throwing — the caller decides what an empty result means. Also
      round-tripped against **real git output** (`conflict-parser.integration.test.ts`) for both
      conflict styles — the fixture tests prove the grammar, this proves git actually emits it.
- [x] `FileDiffSchema.combined` ([`diff.ts:120`](../../../packages/shared/src/domain/diff.ts)) stays
      exactly as it is — it is the flag that tells the caller *whether* to route through this new
      parser at all, not something this theme changes. Untouched.

### B — Whole-file resolution actions (M) — ✅ DONE (PR #64, 2026-09-03)

The safe baseline: accept one side for an entire file, no partial state.

- [x] `resolveConflictWholeFile(worktreePath, path, side: 'ours' | 'theirs' | 'base')` in
      [`git-engine/src/commands/conflict-resolve.ts`](../../../packages/git-engine/src/commands/conflict-resolve.ts),
      alongside `stage.ts` and `sequencer.ts` rather than inside either. Reads the requested side's
      blob off the matching index stage (`:1:`/`:2:`/`:3:` for base/ours/theirs) through the
      **existing** `readBlob` — a binary-safe `Buffer` read off `cat-file blob`, not a
      string-decoding `git show`, which would silently mangle bytes outside dugite's assumed
      encoding — then writes it to the worktree and stages it through the **existing**
      `stagePaths`. No new staging primitive for the whole-file case.
- [x] **Ours/theirs inversion across ops is the theme's one real hazard, and it must be tested, not
      assumed.** `ConflictOpSchema` names four ops — `merge`, `rebase`, `cherry-pick`, `revert` (plus
      `stash-apply`) — and git's own documented behavior flips "ours"/"theirs" for `rebase`: the
      commit being replayed is `theirs`, the branch being rebased *onto* is `ours`, which reads
      backwards to anyone used to merge's convention. Integration tests cover **both merge and
      rebase** against real fixture repos (`conflict-resolve.integration.test.ts`), asserting the
      resolved content matches the side the *user* would call "mine" for merge, and separately
      proving the rebase inversion by name rather than assuming the naive reading. The function
      itself does not correct for the inversion — it passes git's own `:2:`/`:3:` convention
      through unmodified, and the tests are what prove that's still the right answer.
- [x] A new IPC channel `mstudio:op:conflict-resolve-whole-file` in
      [`shared/src/ipc/schemas.ts`](../../../packages/shared/src/ipc/schemas.ts), handled by a new
      [`packages/desktop/src/main/ipc/conflict-handlers.ts`](../../../packages/desktop/src/main/ipc/conflict-handlers.ts) —
      thin, delegates straight to the git-engine function, no logic of its own (matches every other
      write-path handler's shape).

### C — Hunk-level patch application, the phase's biggest risk (L) — ✅ DONE (PR #103, 2026-09-03)

> This is exactly the "write path through the index with its own conflict semantics" Phase 26
> flagged and deliberately did not build. Nothing here is precedented anywhere in the repo —
> grepping `git-engine` for `--ours`, `--theirs`, `apply --cached`, or `rerere` returns zero hits.

- [x] `applyConflictHunk(worktreePath, path, regionIndex, region, side: 'ours' | 'theirs' | 'both')`
      — synthesizes a single-hunk unified-diff patch from a freshly re-read `ConflictRegion` (Theme
      A) and applies it.
  - **Corrected, found spiking it against real git before writing any code**: `git apply --index`
    (or `--cached`) cannot work against an unmerged path — there is no stage-0 entry to patch
    (`ls-files -u` shows only stages 1/2/3), and both flags fail outright with "does not exist in
    index". There is also no such thing as a *partial* index for a conflicted path — staging is
    whole-file-or-nothing. So "the worktree file and the index agree on resolution progress" can
    only mean "don't touch the index while regions remain," which leaving the pre-existing 1/2/3
    stages alone already guarantees; the patch applies to the **worktree only**, and the path is
    staged (collapsing to one resolved stage-0 entry) the moment a fresh read shows zero markers
    left — the one point where "agree" genuinely bites.
  - **Widened from the doc's own signature**: takes a `regionIndex` (0-based, document order) too,
    not just `region`'s content. Content alone can't address a specific occurrence when two
    conflicts in the same file happen to hold identical text; the index is what a renderer walking
    the file top-to-bottom already has for free, and `region` still does its job — a stale-content
    check against what the engine finds at that index on a fresh read.
- [x] A file with N conflicted regions is resolved incrementally: after each accepted hunk, the file
      still reads as `conflicted` in `StatusResult` until every region is resolved, and re-locating
      a region re-scans the file's **current** state (`locateConflictRegion`, new in
      `conflict-parser.ts`) rather than the original conflict.
- [x] `side: 'both'` (accept ours-then-theirs concatenated, in that order) — covered against a
      fixture where it's the objectively correct answer (two branches each adding their own import).
- [x] Integration tests (`conflict-hunk.integration.test.ts`, real git via `TempRepo`): applying one
      hunk in a multi-hunk file leaves the **sibling** hunks still conflicted and still parseable;
      incremental resolution finalizes staging only once zero markers remain; a stale region (changed
      on disk, or an index past the last region) fails as the existing `GitOpResult` `code:
      'stale-write'` rather than a thrown exception or a corrupted file; resolved content that
      legitimately contains the literal marker substring still finalizes correctly (self-review
      caught a whole-string `includes` check that would have false-positived on that case).
- [x] A new IPC channel — `mstudio:op:conflict-apply-hunk`, not the doc's originally-sketched
      `mstudio:conflicts:applyHunk` (naming now matches every other op channel's `mstudio:op:*`
      convention, Theme B's included) — same thin-handler shape as Theme B: schema, channel, bridge
      type, preload call, main handler. No renderer consumer yet — that's Theme D.
- **Not done**: the no-trailing-newline case. A conflict region touching a file's very last line,
  when that file has no trailing `\n`, fails to apply — the patch never emits a `\ No newline at end
  of file` marker. Left open rather than guessed at; every fixture this batch's tests touch ends in
  `\n`, and Theme D's real-file testing is what will show whether it matters in practice.

### D — The Conflict Resolution Studio UI (L) — ✅ DONE (PR #107, 2026-09-04)

- [x] A new component,
      [`app/src/features/conflicts/conflict-resolution-studio.tsx`](../../../packages/app/src/features/conflicts/conflict-resolution-studio.tsx),
      opened when a conflicted path is clicked in `ConflictBanner` — replacing the inert `<li>` list
      entry with a real button. **Not** built on `diff-view.tsx`'s `SplitRow`/`toSplitRows` data
      model — Phase 26 excluded combined diffs from that model on purpose (three sides, no honest
      two-column reading).
  - **Narrowed from the doc's plan**: reuses none of `DiffCell`'s virtualization, gutter rendering
    or shiki highlighting — a plain monospace rendering instead. Stretching a two-column cell
    component to a three-sided region cost more than a new one; the actual risk in this theme is
    the per-region accept flow and stale-write recovery, not the row's paint. Left for a follow-up
    pass rather than guessed at.
  - **A new read-side IPC was needed and added**, `mstudio:conflict:regions`: Themes A–C's
    `parseConflictedFile`/`readFileDiff` had only ever run main-process-side, feeding
    `applyConflictHunk`'s own patch synthesis — nothing exposed parsed regions to the renderer at
    all until this theme needed to display them. Response carries a `truncated` flag (self-review
    catch): `readFileDiff` caps at `DIFF_LINE_CAP`, and a conflicted file past that cutoff was
    silently missing trailing regions with no signal; the Studio now shows a warning banner instead.
- [x] Per-region controls: **Accept mine / Accept theirs / Accept both**, each calling Theme C's
      `applyConflictHunk` IPC; a file-level **Accept all mine / Accept all theirs** shortcut calling
      Theme B's whole-file action when the user wants to skip region-by-region review entirely.
- [x] A resolved region renders as resolved (no more markers, shown as plain context) without
      leaving the Studio — no full-file re-fetch-and-remount per accepted hunk. Not a local append:
      `useConflictRegions` is nested under the same `keys.status(...)` React Query prefix every
      write op's `onSettled` already invalidates, and the file watcher invalidates it again the
      moment `applyConflictHunk`'s worktree write lands — the existing "server state authoritative
      but not synchronous" reconciliation, reused rather than rebuilt.
- [x] `ConflictBanner` changes minimally: the path list is now clickable (`onOpenConflict` prop),
      opening the Studio in the graph's existing side-panel slot (`GraphSelection` widened with a
      `'conflict'` kind, beside `commit`/`stash`) — **Continue stays gated exactly as it was** and
      **Abort is untouched**.
  - **A real bug caught mid-build**: the mutation hooks first read the checkout to target off the
    *globally selected* worktree (`useGitOp`) rather than the Studio's own `worktreePath` prop —
    invisible until a test asserting the exact op payload caught the mismatch. Fixed with
    `useTargetedGitOp` and an explicit target, matching `use-repo-actions.ts`'s own precedent for
    exactly this shape of problem.

### E — Agent-assisted resolution suggestion (S) — ✅ DONE (PR #133, 2026-09-04)

- [x] Reuses [Phase 34](phase-34-agent-councils.md)'s existing `mstudio:council:run:start`
      (`{councilId, prompt}`, [`schemas.ts:1075-1076`](../../../packages/shared/src/ipc/schemas.ts))
      and [`council-runner.ts`](../../../packages/desktop/src/main/council-runner.ts)'s `startRun` —
      **unchanged**. A "Suggest a resolution" button per region composes a prompt
      (`compose-suggestion-prompt.ts`) from that region's ours/base/theirs text plus up to 8 lines of
      surrounding context on each side, and runs it through the existing council mechanism.
- [x] The response renders as advisory text in a side panel next to the region — **never** as a
      pre-selected or auto-applied choice. Accepting a suggestion still routes through the same
      Accept-mine/theirs/both action Theme D built, completely unaffected. **Scope trim from the
      doc's draft:** the button does not parse the free-text response into a specific recommended
      side to pre-fill/highlight — the response is arbitrary prose from whichever council ran it,
      and turning that reliably into a structured `mine`/`theirs`/`both` pick would need a second,
      constrained run (or a parser fragile to phrasing) for a benefit the advisory text itself
      already delivers by being read before any click. Purely advisory, full stop — matches the
      phase's own settled decision ("AI suggestions are advisory-only, never auto-applied").
- [x] Uses the existing council/member picker UI conventions — a "Suggestions from" `<select>`
      defaults to whichever council the Councils view was last on, falling back to the first
      council that exists, freely overridable; renders nothing when no council exists yet. No new
      orchestration, no new IPC channel.

### F — Wiring, safety net, verification (S) — ◐ PARTIAL (PR #111, 2026-09-04)

- [x] `moon run :typecheck :lint :test` green.
- [x] End-to-end: a real merge conflict fixture, resolved with a mix of one whole-file action
      (Theme B) and one region-by-region session (Theme C) in the same repo, ending with
      `conflictedPaths()` empty (the exact condition `ConflictBanner`'s Continue button gates on)
      and `continueOp` completing a real two-parent merge commit
      (`conflict-flow.integration.test.ts`, real git via `TempRepo`).
  - **No pre-existing "real git behind the UI" harness to reuse** — checked first: every Playwright
    spec in `packages/app/e2e/` drives the renderer against a mocked bridge, and no spec anywhere
    combines that with a `TempRepo`. Read as intended new coverage rather than a gap to route around:
    this landed as a git-engine integration test exercising the real production functions
    (`merge`/`resolveConflictWholeFile`/`applyConflictHunk`/`continueOp`) together, at the layer that
    actually owns "does the merge complete" — a UI-level Electron-in-the-loop harness would be new
    infrastructure disproportionate to an `S`-sized theme, and correctness here has nothing to do
    with rendering.
- [x] The rebase-inversion assertion from Theme B (ours/theirs flip) exercised where a
      per-theme-isolated test couldn't: `conflict-flow.integration.test.ts`'s rebase case proves
      Theme B's whole-file accept and Theme C's hunk accept agree with EACH OTHER about which side
      is "ours" inside the same rebase (both write paths, one repo) — the risk each theme's own
      suite could only ever prove against itself. And at the UI level, new RTL coverage
      (`conflict-resolution-studio.test.tsx`) pins the button→`side` mapping directly: "Accept
      theirs"/"Accept both"/"Accept all theirs" each had **no** payload-asserting test before this
      theme — only "Accept mine"/"Accept all mine" did — so a swapped `onClick` on any of the
      untested three was a silent regression a git-engine test could never see (nothing there
      renders a button).
- [ ] **Open, for a human:** a real conflict against `merge.conflictStyle = diff3` set locally (most
      users don't set it, so CI fixtures alone won't exercise the `base` region path in practice).

## Files this phase touches

| Area | Path |
|---|---|
| Contract *(new)* | [`shared/src/domain/conflict.ts`](../../../packages/shared/src/domain/conflict.ts), new channels in [`shared/src/ipc/schemas.ts`](../../../packages/shared/src/ipc/schemas.ts) |
| git-engine *(new)* | [`git-engine/src/parsers/conflict-parser.ts`](../../../packages/git-engine/src/parsers/conflict-parser.ts), `git-engine/src/commands/conflict-resolve.ts` |
| Main *(new)* | `desktop/src/main/conflict-handlers.ts` |
| App *(new)* | `app/src/features/conflicts/conflict-resolution-studio.tsx` + a conflict-row model beside it |
| Edited | [`features/status/conflict-banner.tsx`](../../../packages/app/src/features/status/conflict-banner.tsx) (clickable paths, opens the Studio) |
| Reused, unchanged | [`git-engine/src/commands/sequencer.ts`](../../../packages/git-engine/src/commands/sequencer.ts) (abort/continueOp), [`git-engine/src/commands/stage.ts`](../../../packages/git-engine/src/commands/stage.ts) (`stagePaths`, called by Theme B), [`desktop/src/main/council-runner.ts`](../../../packages/desktop/src/main/council-runner.ts) and its IPC (Theme E), `app/src/features/diff/diff-view.tsx`'s `DiffCell` (styling/virtualization reused, not its `SplitRow` data model) |

## Verification

*(See Theme F — the assertions are listed there rather than duplicated.)*

## Not in this phase

- **Manual free-text editing of the merged output.** The Studio picks a side per region/hunk; it
  does not become a text editor. The escape hatch stays the same as today — leave the app, edit,
  come back to Continue.
- **`rerere` integration.** A real feature, and a separate phase's worth of state to persist and
  surface; nothing here precludes adding it later.
- **Binary-file or Git-LFS conflict resolution.** Those stay banner-only.
- **Submodule conflict resolution.**
- **Auto-applying an AI-suggested resolution.** Theme E's suggestions are advisory text; applying
  one is still a deliberate click on the same action a human would take unassisted.

## Decisions / open questions

- **Settled — whole-file resolution (Theme B) ships before hunk-level (Theme C).** Theme C is the
  phase's real risk — a net-new write path through the index — and Theme B alone already closes
  most of the gap between "leave the app" and "resolve in place."
- **Settled — the Studio does not reuse `SplitRow`/`toSplitRows`.** Phase 26 excluded combined diffs
  from that model deliberately (`canSplit()` returns false, with the comment *"three sides, no
  honest two-column reading"*); this phase respects that boundary and reuses `DiffCell`'s lower-level
  rendering primitives instead.
- **Settled — AI suggestions (Theme E) are advisory-only, never auto-applied.** Matches the app's
  standing posture elsewhere (agent actions are typed-not-sent by default) even though councils
  already carry an explicit auto-send exception for their own prompts — that exception was granted
  because council members never touch a repo; a conflict resolution literally does, so it does not
  inherit the exception.
- **Open — does `checkout`/`show`-based ours/theirs resolution need per-op handling for all four
  `ConflictOpSchema` values, or just merge vs. rebase?** *Recommendation:* test merge and rebase
  explicitly (the two with opposite, documented ours/theirs conventions) and treat cherry-pick and
  revert as merge-shaped unless a fixture proves otherwise — don't guess past what's tested.
- **Open — should `applyConflictHunk` use `git apply --index` or stage-only (`--cached`) with a
  separate worktree write?** *Recommendation:* `--index`, so the worktree file and the index never
  disagree about how far resolution has progressed on a partially-resolved file.
- **Open — is a `diff3`-style (`base` present) region rendered as three columns or two-plus-context?**
  *Recommendation:* three columns when `base` is present, two when it isn't — don't force a
  synthetic base onto the 2-way case just to keep one layout, since a fabricated base is worse than
  an honestly absent one.
