# Phase 48 — Apply Suggested-Change Blocks

[Phase 20](phase-20-reviews-page.md) shipped inline PR review-comment threads in full — reply,
resolve/reopen, outdated-thread collapse — all backed by `ForgeReviewComment.body`, which arrives
as **raw markdown, untouched**: `gh-graphql.ts` reads it as a bare `body: asString(row['body'])`,
no fence stripping anywhere between GitHub and the renderer. That matters because GitHub's own
review UI treats one fenced-code language specially: a ` ```suggestion ` block proposes literal
replacement text for the commented line range, with an Apply action. Nothing in this repo renders
that fence any differently from a plain code block today — `comment-thread.tsx`'s `CommentBody`
overrides only `a` in its `react-markdown` tree, not `code`/`pre` — so a suggestion arrives, and
sits, as inert text.

**This phase is not new UI in the abstract — it is one existing pattern, applied to markdown
instead of code.** [`slide-code.tsx`](../../../packages/app/src/features/slides/slide-code.tsx)
already special-cases a fenced block by its `language-(\w+)` className and routes it through shiki
(Phase 29); this phase does the equivalent for `language-suggestion` in the Reviews surface, then
adds the one thing GitHub's web UI can do that a desktop client cannot: **write straight to the
local working tree** rather than push a commit through GitHub's contents API. That is a genuine
local-first upgrade on the web experience, not a port of it, and it is why staleness detection
(Theme C) is this phase's real weight — the web UI never has to ask "does the file on disk still
say what this suggestion assumes?", and this one does.

**Builds on, and does not repeat.** [`fsWriteFile`](../../../packages/desktop/src/main/ipc/fs-write-handlers.ts)
(Phase 24) — a whole-file write gated on an `expectedVersion` mtime/size match, refusing with
`stale-write` on drift — stays exactly as it is; this phase computes new file content and calls it,
it does not add a second write primitive. `ForgeReviewThread`'s `line`/`originalLine`/`startLine`/
`side` fields (Phase 20) stay as they are too — `startLine` is schema-present but read by nothing
today (`comment-anchors.ts` keys everything off `line` alone), so this phase is the first consumer
of the range those two fields already describe.

**Scope guardrails.** **Apply never auto-stages or auto-commits.** [Phase 47](phase-47-conflict-resolution-studio.md)
already settled this shape for an AI-suggested code change landing on disk — *"AI suggestions are
advisory text only and are never auto-applied — accepting one still goes through the same accept
action a human clicks."* Here the suggestion is human-authored (a reviewer's, not an agent's), but
the posture is the same: Apply patches the working tree, and staging/committing that change stays
a separate, deliberate pass through the existing Status/Stage/Commit panel ([Phase 6](phase-6-status-and-sync.md)).
**No batch-apply** ("add to batch, commit all suggestions at once" is GitHub's own web-only
concept, tied to its commit-via-API model, not this app's). **No suggestion authoring** — this
phase renders and applies suggestions made on github.com; writing a new suggestion from this app is
future scope, not this one. **No LEFT-side apply** — see Theme B.

Effort tags: **S** ≈ an hour or two · **M** ≈ half a day · **L** ≈ a day plus.

## Deliverables

### A — Suggestion detection + parsing (S) ✅ DONE (2026-09-03, PR #51)

- [x] `extractSuggestion(body: string)` in `app/src/features/reviews/suggestion-block.ts`, walking
      the same mdast tree `deck-parser.ts` already builds (`remark-parse` + `remark-gfm`) for a
      fenced block whose language is exactly `suggestion`, depth-first in document order (so a
      fence nested in a blockquote or list item is found too). Returns the replacement text
      (the node's own de-fenced `value`), or `null`.
- [x] A comment body with prose before/after the fence parses correctly — only the fenced block's
      content comes back.
- [x] Any ` ```suggestion ` fence is treated as real, matching GitHub's own simplification.
- [x] Eight unit tests: bare fence, prose-wrapped, absent (plain text and a non-suggestion fence),
      two separate fences (first wins, documented), nested in a blockquote, nested in a list item,
      multi-line content with blank lines preserved exactly.

### B — Line-range resolution (S)

- [ ] A pure function, e.g. `suggestionLineRange(thread: ForgeReviewThread)`, returning
      `{ start: number; end: number }` as `(thread.startLine ?? thread.line)` through `thread.line`
      — the first consumer of `startLine`, which every existing thread renderer
      ([`comment-anchors.ts`](../../../packages/app/src/features/reviews/comment-anchors.ts),
      `comment-thread.tsx`) currently ignores in favor of `line` alone.
- [ ] **Restricted to `side === 'RIGHT'`.** A suggestion proposes a replacement for the PR's own
      incoming lines; a `LEFT`-side (deleted/base) thread anchors to content the current working
      tree doesn't carry in the same position, and applying there has no honest target. Apply is
      simply **not offered** on a `LEFT`-side thread, regardless of whether its body happens to
      contain a suggestion fence.
- [ ] Unit tests: single-line thread (`startLine` absent → range is one line), multi-line thread,
      and a `LEFT`-side thread with a suggestion fence correctly reporting "not applicable."

### C — Local-file divergence detection, the phase's real weight (M)

> Confirmed as unsolved today: `outdated-threads.tsx` only detects a thread whose anchor no longer
> exists in the **PR's own diff** (a force-push on GitHub's side). Nothing anywhere compares the
> **locally checked-out file** against what the suggestion assumes.

- [ ] Before Apply is offered as enabled (not just present), read the local file's current content
      at the resolved line range (Theme B) and compare it against the expected original text — the
      right-side content at those lines as the PR's own diff/thread data describes it. A mismatch
      disables Apply with an explicit reason ("this file has changed since the suggestion was
      written"), never a silent no-op and never a best-effort patch.
- [ ] This is **stricter than, and separate from**, `fsWriteFile`'s own `expectedVersion` check
      (Theme D) — that guard only catches "changed since *this app* last read the file," not
      "diverged from the commit the PR thread is anchored to." Both checks run; either can refuse.
- [ ] Also disabled, for the same "unsafe to assume" reason: any thread already marked `outdated`
      (Phase 20's existing flag) or where the file itself is untracked/deleted locally.
- [ ] Unit tests: exact match → enabled; local edit at the target lines → disabled with the
      divergence reason; file deleted locally → disabled; `outdated: true` → disabled regardless of
      content match.

### D — Suggestion rendering, and the write (M)

- [ ] `comment-thread.tsx`'s `CommentBody` gains a `code`/`pre` override on its `react-markdown`
      tree (it currently overrides only `a`), detecting `language-suggestion` the same way
      `slide-code.tsx` detects any fenced language — rendering the block as a small removed/added
      preview (original line(s) struck through, suggested line(s) added) styled off the same tokens
      `DiffCell` already uses, rather than inventing a second red/green vocabulary.
- [ ] An **Apply** button beside the existing Resolve/Reply actions, enabled only per Theme C's
      check. Clicking it computes the new file content (splice the suggested text over the resolved
      line range in the file's current content) and calls the **existing** `fsWriteFile` IPC
      (Phase 24, [`fs-write-handlers.ts`](../../../packages/desktop/src/main/ipc/fs-write-handlers.ts))
      with the just-read `expectedVersion` — no new write channel.
- [ ] Applying does **not** mark the thread resolved. That stays the existing, separate Resolve
      click — an applied suggestion and a resolved thread are two different facts, and conflating
      them would make Resolve lie about the reviewer's own sign-off.
- [ ] A failed write (Theme C's check passed, but `fsWriteFile` still rejects — a race between the
      check and the click) surfaces the same `stale-write` reason `fsWriteFile` already returns,
      not a generic error.

### E — Wiring + verification (S)

- [ ] `moon run :typecheck :lint :test` green.
- [ ] Integration test covering the full path: a fixture comment body with a suggestion fence,
      resolved line range, matching local file → Apply → file content updated on disk exactly as
      GitHub's own suggestion preview would show it, working tree still unstaged.
- [ ] Integration test for each Theme C refusal path (divergent content, outdated thread, deleted
      file) asserting Apply stays disabled with the specific reason shown, not just "disabled."
- [ ] A repo-scope containment test — the target path stays inside the repo the thread belongs to,
      reusing `fs-scope-write.ts`'s existing `confineParent()` rather than trusting the PR payload's
      path string.
- [ ] **Open, for a human:** apply a real suggestion from an actual github.com PR review against a
      locally checked-out clone, confirming line endings and encoding survive the round trip — no
      fixture proves this against GitHub's actual API response shape.

## Files this phase touches

| Area | Path |
|---|---|
| New | `app/src/features/reviews/suggestion-block.ts` (parser + line-range resolver + divergence check, kept pure and separately testable from the rendering component) |
| Edited | [`features/reviews/comment-thread.tsx`](../../../packages/app/src/features/reviews/comment-thread.tsx) (`code`/`pre` override on `CommentBody`, the Apply button) |
| Precedent, unchanged | [`features/slides/slide-code.tsx`](../../../packages/app/src/features/slides/slide-code.tsx) (the `language-(\w+)` className pattern this phase copies for `language-suggestion`) |
| Reused, unchanged | [`main/ipc/fs-write-handlers.ts`](../../../packages/desktop/src/main/ipc/fs-write-handlers.ts) (`fsWriteFile`, called with computed content — no new write channel), [`fs-scope-write.ts`](../../../packages/desktop/src/main/fs-scope-write.ts) (`confineParent()`), [`features/reviews/comment-anchors.ts`](../../../packages/app/src/features/reviews/comment-anchors.ts) (read for existing single-line anchoring; not modified — Theme B's range resolver is a sibling function, not a rewrite of it) |
| Unchanged, cited as precedent | [`phase-47-conflict-resolution-studio.md`](phase-47-conflict-resolution-studio.md) (the advisory-only / human-clicks-Apply posture this phase copies) |

## Verification

*(See Theme E — the assertions are listed there rather than duplicated.)*

## Not in this phase

- **Batch-apply / "add to batch, commit all suggestions."** GitHub's own version of this is tied to
  its commit-via-contents-API model; this app never auto-commits, so the underlying premise (one
  commit for N suggestions) doesn't transfer. Each suggestion is applied one click at a time.
- **Authoring a new suggestion from this app.** This phase renders and applies suggestions made on
  github.com; writing one from the Reviews page is a future phase's scope, not this one's.
- **Applying a `LEFT`-side suggestion.** Not offered — see Theme B.
- **Auto-resolving a thread on Apply.** Two separate facts, two separate clicks — see Theme D.
- **A generic "apply any code block, not just `suggestion`-tagged ones" affordance.** Scope is
  exactly GitHub's own suggestion syntax; a plain code block someone pastes into a comment is not a
  proposed replacement and should not carry an Apply button that implies it is.

## Decisions / open questions

- **Settled — Apply never auto-stages or auto-commits.** Matches [Phase 47](phase-47-conflict-resolution-studio.md)'s
  settled posture for the nearest analogous feature (an externally-suggested code change landing on
  disk); staging/committing stays the user's own, separate action.
- **Settled — Apply is `RIGHT`-side only.** A `LEFT`-side thread has no honest local target for a
  replacement; see Theme B.
- **Settled — divergence detection is its own check, not reused from `fsWriteFile`'s
  `expectedVersion`.** The two questions are different ("has *this app* seen a newer version" vs.
  "does the file still match what the *suggestion* assumes") and conflating them would let a stale
  suggestion apply cleanly just because nothing else had touched the file since launch.
- **Open — should a multi-line suggestion that only partially matches (e.g. the first line matches,
  the second has been reformatted by a linter) be treated as a full mismatch, or should the phase
  attempt a partial/fuzzy apply?** *Recommendation:* full mismatch, fail closed. A fuzzy apply is
  exactly the kind of "best-effort patch" the framing above rules out, and a reviewer's suggestion
  is precise text by construction — there's no honest partial answer.
- **Open — does the removed/added preview (Theme D) need real diff-algorithm output (an actual
  line-level diff between original and suggested text), or is "all original lines struck through,
  all suggested lines added" sufficient?** *Recommendation:* the simple all-removed/all-added
  rendering. GitHub's own suggestion preview does exactly this (it does not word-diff a suggestion
  against the original) — matching that convention is more honest to what "suggestion" means than
  inventing a finer-grained visualization the source data doesn't ask for.
