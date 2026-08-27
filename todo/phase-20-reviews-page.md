# Phase 20 — Reviews page & unified diff syntax highlighting

The nav rail's forge half has stayed shallow since Phase 17: the sidebar's **Reviews** section
lists open PRs and links out, and `ReviewView` in `forge-detail.tsx` shows PR metadata only — no
diff, no files, no comments. Phase 19 built the deeper half for Actions and Issues but explicitly
parked PR detail: *"diffs, review threads, checks. The PRs widget lists and links out; the Reviews
section stays as Phase 17 left it."* This phase is that parked work, plus the write path Phase 17
and 19 both deliberately excluded — you can now read, comment on, and act on a pull request without
leaving the app.

It also closes a second long-open item. `outstanding.md` has flagged syntax-highlighted diffs as
parked since Phase 12, but the hard part is already paid for: Phase 16 installed `shiki` and built
a theme-synced highlighter singleton for the Files preview pane
([`code-preview.tsx`](../packages/app/src/features/files/preview/code-preview.tsx)), and
[`languages.ts`](../packages/app/src/lib/languages.ts) already maps every extension to a grammar.
[`DiffView`](../packages/app/src/features/diff/diff-view.tsx) is one shared component used by the
Changes page, the Graph page's commit inspector, and — as of this phase — the new Reviews page, so
wiring highlighting into it once makes all three surfaces consistent by construction rather than by
discipline.

**Scope guardrails.** This phase is a deliberate, scoped reversal of the read-only-forge rule
[`gh-cli.ts`](../packages/desktop/src/main/forge/gh-cli.ts)'s own doc comment states: *"Strictly
reads... on purpose."* Every write call this phase adds lives in a **new, separate module**
(`gh-write.ts`) so that comment stays true of `gh-cli.ts` itself, and the write surface stays
limited to **PR review actions** — approve, request changes, comment (top-level and inline), merge,
reviewer re-request, draft→ready, re-run checks. Nothing here touches issues, labels, branch
protection, or PR creation. Diffs continue to render through the existing **unified** `DiffView`;
no side-by-side layout is built. Inline comments are scoped to **right-side (added/context) lines
only** for v1 — see Theme E. All new IPC channels take a `repoId` (and PR number), never a path,
per the existing rule in [`channels.ts`](../packages/shared/src/ipc/channels.ts).

Effort tags: **S** ≈ an hour or two · **M** ≈ half a day · **L** ≈ a day plus.

## Deliverables

### A — Reviews as a nav-rail view (S) ✅ DONE (2026-08-27)

- [x] `ViewId` in [`ui-store.ts`](../packages/app/src/store/ui-store.ts) grows to include
      `reviews`; `pathForView`/`viewForPath` follow for free
- [x] Nav rail gains a Reviews item using `FaCodePullRequest` from `react-icons/fa6` — a second
      react-icons glyph in the rail beside Tests' `FaCheckDouble` (Phase 19), not a new pattern
- [x] Reviews is hidden from the rail when the selected repo has no GitHub remote, reusing
      `pickForgeRemote` — the same guard Actions already uses (the two now share one
      `useForgeGateAvailable` hook, renamed from `useActionsAvailable`)
- [x] `SectionKey`'s existing `reviews` value (Phase 17, currently only a sidebar section) gets a
      `VIEW_FILTERS['reviews'] = { sections: ['reviews', 'worktrees'], dirtyOnly: false }` entry in
      [`view-sections.ts`](../packages/app/src/features/repos/view-sections.ts) — the exact
      mechanism Actions and Tests already use to narrow the sidebar to themselves plus Worktrees
- [x] The sidebar's Reviews section ([`forge-sections.tsx`](../packages/app/src/features/repos/forge-sections.tsx))
      opens the new Reviews view on click, replacing today's inline `ReviewView` tab as the
      destination
- [x] Switching to/from the Reviews view preserves the selected repo and worktree, per the Phase 19
      rule that the rail changes what you're looking at, never what you're looking at it for

### B — PR list, filterable across every state (M) ✅ DONE (2026-08-27)

- [x] `listPulls` in [`gh-cli.ts`](../packages/desktop/src/main/forge/gh-cli.ts) moves off the
      hardcoded `--state open` to `--state all`; `PULL_FIELDS` grows `mergedAt`/`closedAt` beside
      the already-fetched `isDraft`
- [x] `ForgePull` in [`forge.ts`](../packages/shared/src/domain/forge.ts) grows the new fields;
      `parsePullList` in [`gh-parse.ts`](../packages/desktop/src/main/forge/gh-parse.ts) updated to
      match
- [x] New `features/reviews/reviews-list.tsx` — status tabs (All / Open / Draft / Merged / Closed,
      defaulting to Open), an author filter derived from the fetched list (no extra API call), and
      a title/branch search box. Also grew a "Load more" button, since `gh pr list` has no cursor to
      page through — a second, wider fetch under its own query key, only paid when asked for
- [x] List rows reuse the existing `ChecksVerdict` colour mapping
      ([`checks-verdict.ts`](../packages/app/src/features/repos/checks-verdict.ts)) and
      `reviewDecision` badge already computed for the sidebar's Reviews section
- [x] Empty / loading / CLI-not-ready states match the existing Phase 17 forge-section affordances
      (gh missing or unauthenticated card)
- [x] Refresh stays explicit, matching every other forge surface — no polling

### C — PR detail: files, conversation, checks (M) — ✅ DONE (2026-08-27)

All six items landed; see [`done.md`](done.md) for the entry. Three notes for the themes that
build on this one:

- **The `--patch` flag in this theme's first bullet was wrong, and is not what shipped.**
  `gh pr diff <n> --patch` requests GitHub's `.patch` media type, which is `git format-patch`
  output: one mbox entry *per commit*, each with its own `From <sha>` header, subject, `---`
  separator and diffstat. On a two-commit PR touching one file twice that file appears twice,
  and every mbox header after the first is swallowed by the previous file's section as diff
  body. Verified against `cli/cli#14255`: `--patch` yields 16 `diff --git` sections for 14
  files; bare `gh pr diff` yields exactly 14. **Bare `gh pr diff` is the combined unified diff
  the parser wants** — Theme E should read the same way.

- **`mgit:forge:pull-detail` was added alongside** the two channels this theme specified. The
  PR's head sha lives on no listing field, and the Checks tab is built on matching it — so
  `gh pr view --json` became its own channel rather than a widening of `listPulls`, which
  Theme B is rewriting. It carries the body, base branch, line counts and `mergeable` too,
  which Themes F and G will want.
- **Checks resolves by head sha, not `statusCheckRollup`.** The rollup names checks, not runs;
  matching `ForgeRun.headSha` against the run listing the sidebar already caches finds the
  actual runs and costs no third subprocess. Matching the *branch* would be wrong after a
  force-push — the branch's newest run then describes a commit the PR no longer points at.

### D — Syntax-highlighted diffs, unified across every surface (M) ✅ DONE (2026-08-27)

- [x] [`diff-rows.ts`](../packages/app/src/features/diff/diff-rows.ts) grows a
      `mergeSegmentsWithTokens` pass; the actual highlight call lives in the new
      [`line-highlight.ts`](../packages/app/src/features/diff/line-highlight.ts), deferred per-row
      through `requestIdleCallback` rather than eagerly on `toDiffRows` — a design call made in the
      decisions section above. The shiki singleton itself moved out of `code-preview.tsx` into
      [`lib/highlighter.ts`](../packages/app/src/lib/highlighter.ts) so the Files preview pane and
      diff rows share one engine instance; `languageForFile()` in
      [`languages.ts`](../packages/app/src/lib/languages.ts) is reused unchanged
- [x] Highlighting composes with the existing word-level intraline segments (`toSegments` /
      `DiffSegment`) rather than replacing them — `mergeSegmentsWithTokens` intersects the two
      independent partitions of a line, added/removed/context tinting stays the outer layer,
      syntax colour the inner one
- [x] Per-row highlight output is memoised — module-level, keyed on `(path, line kind, line text)`
      rather than a hash of that text (the text already **is** the key; hashing it would only add
      SubtleCrypto latency for no extra safety) — so scrolling an already-open diff, or opening the
      same file again from a different surface, never re-highlights a row already drawn
- [x] Applied to both existing `DiffView` call sites: the Changes page
      ([`file-accordion.tsx`](../packages/app/src/features/changes/file-accordion.tsx),
      [`file-diff.tsx`](../packages/app/src/features/status/file-diff.tsx)) and the Graph page's
      commit inspector ([`commit-detail.tsx`](../packages/app/src/features/commit/commit-detail.tsx))
      — automatically, since all three share the one `LineRow`. Confirmed on the Reviews Files tab
      too now that Theme C has landed alongside this slice and renders each file through the same
      `DiffView` — no third surface needed updating by hand
- [x] Verified against the virtualized scroll path specifically — this is the risk
      `outstanding.md` flagged when this was parked: "wiring `codeToHtml` into `<DiffView>`'s
      virtualised rows without regressing scroll performance". Covered functionally by
      `diff-view.spec.ts`'s new highlighting test (scrolls a highlighted diff and asserts it keeps
      rendering); a scripted frame-timing assertion was considered and rejected as CI-flaky —
      see the decisions section
- [x] Light/dark theme sync verified — the highlighter is already built with both themes per
      `code-preview.tsx`'s existing pattern, confirmed via `useTheme()` in `DiffView`

### E — Inline diff-line comment threads (L) ✅ DONE (2026-08-27)

- [x] New `ForgeReviewThread` / `ForgeReviewComment` domain types in
      [`forge.ts`](../packages/shared/src/domain/forge.ts), plus `ForgeThreadSide` and the
      `ForgeWriteResult` envelope every write answers with. The thread carries **three** position
      fields, not one — `line`, `originalLine`, `startLine` — because a thread can lose its
      anchor, and collapsing them is how a comment gets pinned to code its author never saw
- [x] **Read through GraphQL, on its own channel** — both departures from this theme's original
      bullet, and both forced:
      - REST `pulls/{n}/comments` returns a flat list with no thread object, **no `isResolved`**
        and no thread node id. Resolution is a property of `PullRequestReviewThread`, a type REST
        does not expose, and its node id is the only handle `resolveReviewThread` takes. So the
        source is `repository.pullRequest.reviewThreads`, in a new
        [`gh-graphql.ts`](../packages/desktop/src/main/forge/gh-graphql.ts) — the app's one
        GraphQL read, kept out of `gh-cli.ts` so that file stays "one `gh` subcommand per function"
      - a new `mgit:forge:pull-threads` channel rather than widening `pull-comments`: the
        conversation is the Conversation tab's payload and the threads are the Files tab's, so one
        channel would make each tab fetch the other's. Same split Theme C made for `pull-detail`
- [x] `DiffView` / `diff-rows.ts` gain the affordance and the panel: `withCommentRows` splices
      `thread` and `composer` rows into the flattened row list, and the gutter `+` **replaces the
      `+`/`−` marker cell on hover** rather than adding a column — a gutter that appears would
      reflow every line of the diff sideways under the cursor
- [x] Thread UI: reply and resolve, no edit/delete of others' comments. Replies target the last
      comment's **REST `databaseId`**, because the endpoint is
      `pulls/{n}/comments/{id}/replies` and GraphQL has no equivalent mutation — which is why
      `ForgeReviewComment` carries both ids
- [x] Scoped to right-side (added/context) lines only for v1. A `del` row has no `newNo`, so it
      carries neither a thread nor the affordance — `isCommentableLine` is the one gate, and
      `withCommentRows` refuses to splice onto one even if asked
- [x] The diff-position mapping, spiked first as this bullet asked. Verified against
      `cli/cli#14200`: `line`/`originalLine`/`startLine` and `diffSide` live on the **thread**,
      `databaseId` on the **comment**, and `diffSide` does not exist on
      `PullRequestReviewComment` at all — the first thing the spike got wrong

*Landed alongside, and worth naming:*

- **`gh-write.ts` exists as of this theme** rather than waiting for F, carrying only E's three
  calls (`addReviewComment`, `replyToReviewComment`, `setThreadResolved`) in a clearly-marked
  section, plus `describeApiFailure`. `channels.ts`'s read-only-forge comment block now documents
  the exception and its three bounds instead of going stale.
- **The write body goes over stdin as JSON** (`printf %s '…' | gh api --input -`), never as `-f`
  or `-F` flags: `-f line=42` posts the *string* `"42"` and is rejected, and `-F` would coerce a
  body of `"true"` into a boolean. It also means no user-authored text reaches a command line.
- **The composer closes on success, never on submit.** Found by the refused-write spec: closing on
  submit lost the reader's paragraph whenever `gh` refused. `onComment`/`onReply` now resolve a
  boolean and the box stays mounted with its text and `gh`'s own sentence under it.
- **Outdated / file-level / left-side threads render in a collapsed group above the file's diff**,
  stating the original line as prose. The alternative — anchoring to whatever row carries that
  number now — is the one failure mode here that looks completely normal.

*Found reviewing the slice before it landed, and both worth naming:*

- **A fourth kind belongs in that collapsed group, and did not start there.** `isAnchored` cannot
  see it: a reviewer who expands context on github.com can comment far outside any hunk, and the
  thread comes back live, right-side and unresolved with a perfectly real `line` — while
  `gh pr diff` fetches three lines of context. Keyed into `byLine` it matched no row and rendered
  **nowhere**, which is the same harm as pinning one to the wrong line and rather harder to notice.
  `threadsForFile` now takes the `FileDiff` and checks against `rightSideLines(diff)` — a `Set`
  rather than a range test, because a diff is hunks *with gaps*: line 50 falling between rendered
  hunks 10-12 and 90-92 does not make it renderable.
- **`gh api graphql -F` type-guesses its variables** — the exact trap `gh-write.ts`'s `apiPost`
  documents for REST bodies, which `gh-graphql.ts` then walked into: `-F name=2048` sends the
  *integer* 2048 for a `String!` variable and GitHub refuses the whole query, for a repo name that
  is neither unusual nor invalid. The `String!`/`ID!` variables take `-f`; `-F` is right only for
  `number`, which really is an `Int!`.

### F — Review write actions: approve, request changes, comment, merge (L) ✅ DONE (2026-08-27)

- [x] New `packages/desktop/src/main/forge/gh-write.ts` — the phase's one write module, kept
      separate from `gh-cli.ts` so that file's "strictly reads" doc comment stays literally true.
      Exports `reviewPull(forge, number, event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT', body)`,
      `commentPull(forge, number, body)`, `mergePull(forge, number, method: 'merge' | 'squash' | 'rebase')`
- [x] [`channels.ts`](../packages/shared/src/ipc/channels.ts)'s read-only-forge comment block is
      updated to document this one deliberate exception, rather than silently going stale
- [x] PR detail action bar: Approve / Request changes / Comment, each opening a review-body
      composer (required for Request changes, per GitHub's own rule)
- [x] Merge gated behind a confirm dialog showing the blast radius and a squash/merge/rebase
      picker — **but the count comes from `gh pr view --json commits`, not `rev-list --count`.**
      A PR's head ref usually is not in this checkout at all, and `rev-list` against a missing ref
      reads as zero, which is the one number a blast radius must never be wrong about. The dialog
      is its own component rather than the shared `ConfirmDialog`: that one asks a single question
      whose answer is one click, and a merge asks two, the second changing what the first means
- [x] Every write action invalidates the relevant list/detail query on success, and surfaces
      `gh`'s own failure text on error via the existing `describeFailure` pattern — never a generic
      toast
- [x] Unit tests over `gh-write.ts`'s command construction (`shellQuote`, flags) without a real
      subprocess, matching `gh-cli.ts`'s existing test shape

### G — Reviewer re-request, draft→ready, re-run checks (S) ✅ DONE (2026-08-27)

- [x] `gh-write.ts` grows `requestReview(forge, number, reviewers: string[])`,
      `markReady(forge, number)`, `rerunChecks(forge, runId)`
- [x] Reviewer picker sourced from `gh pr view --json reviewRequests` / repo collaborators where
      `gh` exposes it cheaply; falls back to a free-text GitHub-username field otherwise
- [x] Draft → Ready shows only on a PR whose `isDraft` is true, and disappears once flipped rather
      than staying as a dead toggle
- [x] Re-run checks lives on the Reviews Checks tab — two buttons, with "Re-run failed jobs"
      present only on a run that failed, because GitHub's API refuses `--failed` otherwise. Same
      `gh-write.ts` call the Actions view could later reuse; no entry point added there, per the
      open decision below. It is also the one write that evicts a cache: `gh run rerun` adds an
      attempt to the *same* run id, and main caches a completed run's tree permanently — see
      `forgetRun`

## Files this phase touches

| Area | Files |
|------|-------|
| Contract | [`shared/src/domain/forge.ts`](../packages/shared/src/domain/forge.ts), [`ipc/channels.ts`](../packages/shared/src/ipc/channels.ts), [`ipc/schemas.ts`](../packages/shared/src/ipc/schemas.ts), [`ipc/bridge.ts`](../packages/shared/src/ipc/bridge.ts) |
| Main — forge | [`forge/gh-cli.ts`](../packages/desktop/src/main/forge/gh-cli.ts), [`forge/gh-parse.ts`](../packages/desktop/src/main/forge/gh-parse.ts), new `forge/gh-write.ts` + tests, [`ipc/forge-handlers.ts`](../packages/desktop/src/main/ipc/forge-handlers.ts) |
| git-engine | [`parsers/diff-parser.ts`](../packages/git-engine/src/parsers/diff-parser.ts) (reused, not modified, for PR-diff parsing) |
| Renderer — shell | [`app.tsx`](../packages/app/src/app.tsx), [`store/ui-store.ts`](../packages/app/src/store/ui-store.ts), [`features/repos/view-sections.ts`](../packages/app/src/features/repos/view-sections.ts), [`features/repos/forge-sections.tsx`](../packages/app/src/features/repos/forge-sections.tsx) |
| Renderer — reviews | new `app/src/features/reviews/{reviews-view,reviews-list,pr-detail,review-action-bar,merge-dialog,comment-thread,use-forge-pulls,use-pull-detail}.*`, [`features/forge/forge-detail.tsx`](../packages/app/src/features/forge/forge-detail.tsx) |
| Renderer — diff | [`features/diff/diff-view.tsx`](../packages/app/src/features/diff/diff-view.tsx), [`features/diff/diff-rows.ts`](../packages/app/src/features/diff/diff-rows.ts), [`features/diff/use-file-diff.ts`](../packages/app/src/features/diff/use-file-diff.ts), [`features/files/preview/code-preview.tsx`](../packages/app/src/features/files/preview/code-preview.tsx) (highlighter reused), [`lib/languages.ts`](../packages/app/src/lib/languages.ts) (grammar map reused) |
| Renderer — consumers | [`features/changes/file-accordion.tsx`](../packages/app/src/features/changes/file-accordion.tsx), [`features/status/file-diff.tsx`](../packages/app/src/features/status/file-diff.tsx), [`features/commit/commit-detail.tsx`](../packages/app/src/features/commit/commit-detail.tsx) |
| Tests | [`e2e/mock-bridge.ts`](../packages/app/e2e/mock-bridge.ts), new `e2e/reviews.spec.ts` |

## Verification

- [x] `moon run :typecheck :lint :test` green (Theme E)
- [x] Boundary lint still passes: `git-engine` stays electron-free; `packages/app` reaches
      `gh-write.ts` only through `mgit:forge:*` IPC, never directly
- [x] `mock-bridge.ts` grows `pullThreads` and `writeError` fixtures plus the three write
      handlers — and the writes **mutate the seeded threads** rather than stubbing, so an
      `ok: true` that changed nothing cannot pass. Every call is recorded on `window.__mgitWrites`
      so a spec can assert the *anchor* a comment was sent with, which the rendered result hides
- [x] Playwright (Themes A–D): Reviews nav item hidden for a non-GitHub repo; the Reviews view
      narrows the sidebar; PR list filters by status and author; PR detail's three tabs render;
      highlighting renders identically across surfaces
- [x] Playwright (Theme E, `e2e/review-threads.spec.ts`, 10 specs): a thread renders on its own
      line; a resolved thread arrives collapsed; the gutter opens a composer for the clicked line
      and the posted comment comes back; a deleted line offers no affordance; reply and resolve
      round-trip; a refused write shows `gh`'s sentence and keeps the text; outdated and
      file-level threads group above the diff; **and the Changes page diff grows no comment
      gutter** — the assertion that the opt-in gate holds on the shared component
- [x] Playwright (`e2e/diff-scroll-perf.spec.ts`): the virtualized path after `measureElement`.
      A 4000-row diff mounts under 400 rows and stays under 400 through a 60-frame scripted
      scroll — exact, and the assertion that would catch windowing breaking outright. A median
      frame-gap ceiling rides behind it at a deliberately loose 100ms. **This reverses Theme D's
      "no frame-timing assertion" call on purpose**: D's risk was `requestIdleCallback` work
      landing between frames, which a threshold can only measure the machine for; E's risk is
      structural (a measurement loop, or a virtualizer that stops windowing), which is exactly
      what a row count catches
- [x] Playwright: approve / request-changes / comment flow against a mocked `gh-write`; merge
      confirm dialog shows the correct commit count and requires an explicit merge-method choice
      before the Merge button enables *(Theme F)*
- [x] Unit tests: `gh-write.ts` command construction (15 specs, no subprocess — including that
      the anchor retry fires only on an anchor rejection, and that an owner out of a
      `.git/config` is quoted); `gh-graphql.ts` thread parsing (17 specs against payloads shaped
      like the real response); `comment-anchors.ts` grouping and the legacy `position` mapping
      (19 specs); `withCommentRows` splicing (7 specs)
- [ ] **Open, for a human:** a real `gh pr review` / `gh pr merge` against a disposable test PR —
      the write paths cannot be safely exercised against a mock alone. For Theme E specifically:
      one real inline comment, one reply and one resolve
- [ ] **Open, for a human:** syntax-highlighted diff scroll performance on a real PR with 100+
      changed files
- [x] *(follow-up, 2026-08-27)* **The Playwright suite is green again on `main`.** Sixteen of this
      phase's specs plus one of Phase 17's had gone red against a product that was working, and
      nothing caught it because `app:e2e` sits outside the `:test` gate by design (a chromium
      download is a poor thing to make the gate depend on). Three stale assumptions, all of them
      decisions this phase or its neighbours made deliberately and never went back to re-read the
      specs for:
      - **A PR opens on Overview, not on Files.** Thirteen specs asserted the old default
        implicitly, by looking for diff text as soon as the detail region appeared. The two
        helpers now click through to Files, and the landing tab is guarded by **one** new spec
        that names the decision — so the next flip of that `useState` fails a test about the
        default rather than every test that happened to depend on it. The header test loses its
        description assertion in the same move: the description is Overview's whole content now.
      - **The three review scopes arrive folded** (`a62c23c`), so the view lists nothing until a
        group is opened and `review-threads-shots.spec.ts`'s "the view selects it on arrival" was
        no longer reachable. It opens All Pull Requests first, scoped through the
        `reviews-groups` testid that exists for exactly this collision with the sidebar's copy of
        the same three headings.
      - **`repos-workbench.spec.ts`'s folded-row geometry** measured "trailing edge" against the
        *row*, which has since grown a trailing cluster (skill, git-actions,
        install/build/test/launch) to the right of the sync control. Re-anchored to the name
        button the pill actually lives in, where the numbers are exact rather than approximate.
      Four screenshots regenerated with it — the committed images predated the scopes, the
      Overview tab and the footer's Repos button. Suite: **285 passed, 0 failed** (was 267 passed,
      17 failed).

## Not in this phase

- **Side-by-side diff layout.** Reuses the existing unified `DiffView`; a second diff-rendering
  surface is its own project and a real risk of drifting visually from the one everyone else uses
- **Left-side (deleted-line) inline comments.** v1 scopes to right-side/added lines only — see
  Theme E and the open decision below
- **Label/milestone editing, branch-protection or required-reviewer configuration**
- **Creating new PRs from the app**
- **Non-GitHub forges.** GitLab and Bitbucket are `pickForgeRemote` cases with entirely different
  CLIs — same gap Phase 19 left open
- **Notifications** on review or comment activity. Needs polling, which — as in Phase 19 — this
  phase deliberately does not do

## Decisions / open questions

- **Resolved — merge is in scope**, gated by a blast-radius confirm (`rev-list --count`) and a
  squash/merge/rebase picker, mirroring the existing reset/rebase confirm pattern rather than
  inventing a new one.
- **Resolved — inline diff-line comments are in scope**, right-side lines only for v1.
- **Resolved — syntax highlighting lands in this phase**, wired into `DiffView` once and shared by
  Reviews, Changes and Graph by construction.
- **Resolved — write calls live in a new `gh-write.ts`**, not inside `gh-cli.ts`, so that file's
  "strictly reads" doc comment remains literally true and the write surface stays easy to audit in
  one place.
- **Resolved — the Reviews list fetches every PR state** (open/draft/merged/closed), not just open.
- **Resolved — reuse the existing unified `DiffView`** rather than building a side-by-side layout.
- **Resolved — reviewer re-request, draft→ready, and re-run-checks are in scope** (Theme G).
- **Resolved (Theme E, 2026-08-27) — both mappings ship, tried in order.** The modern
  `line` + `side: RIGHT` form goes first, mapped straight off `DiffLine.newNo`. The legacy
  `position` (a count of lines down from the file's first `@@`, with later `@@` headers and
  deleted lines both counting) rides along as a fallback, computed in the renderer because that
  is where the parsed hunks are. Main retries with it **only** when the failure text names an
  anchor field — retrying every 422 would re-post on a rejection a different anchor cannot fix
  (an empty body, a stale sha) and spend two writes against the user's rate limit.
- **Resolved (F, 2026-08-27) — one composer**, the event chosen by which button submits it, and
  the verb restated on the Submit button so it is never ambiguous what pressing it publishes.
  Discuss is a fourth arm rather than a fourth event: `gh pr comment` and `gh pr review --comment`
  land in different collections.
- **Resolved (Theme E, 2026-08-27) — inline threads come from GraphQL, on their own channel.**
  Both against this theme's own bullet, and both forced by the API: REST carries no thread object,
  no resolved state and no thread node id, and the Files/Conversation tabs fetch independently.
- **Resolved (Theme E, 2026-08-27) — a composer closes on success, never on submit.** Found by the
  refused-write spec rather than by review. `onComment`/`onReply` resolve a boolean so the box that
  holds the text decides whether to close.
- **Resolved (Theme E, 2026-08-27) — write bodies go over stdin as JSON, not as `gh -f`/`-F`.**
  `-f` stringifies every value (`line` becomes `"42"` and is rejected) and `-F` type-guesses (a
  body of `"true"` becomes a boolean). It also keeps user-authored text off the command line.
- **Resolved (F, 2026-08-27) — no editing or deleting any comment**, yours included. Matches
  Theme E's scope decision and keeps the write surface to net-new actions rather than a second CRUD
  surface. Stated on the Settings → Reviews page, in the list of what the app never does.
- **Resolved (G, 2026-08-27) — no Actions-view entry point this phase.** The `gh-write.ts` call is
  there for it to reuse; adding the affordance is a scope decision for whoever picks that up.
- **Resolved (F, 2026-08-27) — the writes are gated behind one machine-wide Settings switch**,
  off by default, on a new Settings → Reviews page. Not in the original theme text, and
  deliberately **not** Phase 18's per-repository trust prompt: that consent is per-repo because
  running a repo's own linter executes arbitrary code that repository chose, and consent for one
  says nothing about another. Nothing here executes anyone's code — it calls the user's own
  already-authenticated `gh`, against a repository they opened. So one switch is the honest weight:
  a guard against the accidental Merge click and one screen listing what the app may and may not
  change, and the page says so rather than implying a protection it does not give. The gate is at
  the controls, not inside the mutations — a disabled button whose tooltip names the setting is
  somewhere to go.

- **Resolved (F, 2026-08-27) — `gh-shell.ts` holds the primitives both forge modules need.**
  Theme E's `gh-write.ts` imported its spawn, quoting and probe from `gh-cli.ts`, which made the
  reader a dependency of the writer. They now live in a third module imported by all three: two
  probe caches would let the read path and the write path disagree about whether `gh` holds a
  credential.

- **Resolved (F, 2026-08-27) — `APPROVE` is the only bodiless review verb.** GitHub documents
  `body` as required for `COMMENT` as well as `REQUEST_CHANGES` and refuses either without one, so
  the theme's own bullet ("required for Request changes") was half the rule. The contract, the
  Submit button and the composer's "(required)" hint all encode the full one.

- **Resolved (A+B+D slice, 2026-08-27) — highlight timing is deferred, not eager.** Each row's
  syntax highlight is scheduled through `requestIdleCallback` the first time it renders, not
  computed for the whole diff up front — directly answering the scroll-blocking risk this theme's
  own bullet above names.
- **Resolved — the highlight cache is module-level**, keyed by `(path, line kind, line text)`, not
  per-`DiffView`-instance — so the same file highlighted in Changes and then opened again in Graph
  reuses the cached tokens rather than recomputing them.
- **Resolved — B's "load more" re-asks for a wider page** rather than true pagination — `gh pr
  list` has no cursor to page through, so widening `limit` and refetching is the honest shape.
- **Resolved — an unmapped file extension falls back to plain diff rendering, silently** — matching
  `code-preview.tsx`'s existing degrade-gracefully rule for the Files preview pane.
