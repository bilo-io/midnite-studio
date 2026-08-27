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

### A — Reviews as a nav-rail view (S)

- [ ] `ViewId` in [`ui-store.ts`](../packages/app/src/store/ui-store.ts) grows to include
      `reviews`; `pathForView`/`viewForPath` follow for free
- [ ] Nav rail gains a Reviews item using `FaCodePullRequest` from `react-icons/fa6` — a second
      react-icons glyph in the rail beside Tests' `FaCheckDouble` (Phase 19), not a new pattern
- [ ] Reviews is hidden from the rail when the selected repo has no GitHub remote, reusing
      `pickForgeRemote` — the same guard Actions already uses
- [ ] `SectionKey`'s existing `reviews` value (Phase 17, currently only a sidebar section) gets a
      `VIEW_FILTERS['reviews'] = { sections: ['reviews', 'worktrees'], dirtyOnly: false }` entry in
      [`view-sections.ts`](../packages/app/src/features/repos/view-sections.ts) — the exact
      mechanism Actions and Tests already use to narrow the sidebar to themselves plus Worktrees
- [ ] The sidebar's Reviews section ([`forge-sections.tsx`](../packages/app/src/features/repos/forge-sections.tsx))
      opens the new Reviews view on click, replacing today's inline `ReviewView` tab as the
      destination
- [ ] Switching to/from the Reviews view preserves the selected repo and worktree, per the Phase 19
      rule that the rail changes what you're looking at, never what you're looking at it for

### B — PR list, filterable across every state (M)

- [ ] `listPulls` in [`gh-cli.ts`](../packages/desktop/src/main/forge/gh-cli.ts) moves off the
      hardcoded `--state open` to `--state all`; `PULL_FIELDS` grows `mergedAt`/`closedAt` beside
      the already-fetched `isDraft`
- [ ] `ForgePull` in [`forge.ts`](../packages/shared/src/domain/forge.ts) grows the new fields;
      `parsePullList` in [`gh-parse.ts`](../packages/desktop/src/main/forge/gh-parse.ts) updated to
      match
- [ ] New `features/reviews/reviews-list.tsx` — status tabs (All / Open / Draft / Merged / Closed,
      defaulting to Open), an author filter derived from the fetched list (no extra API call), and
      a title/branch search box
- [ ] List rows reuse the existing `ChecksVerdict` colour mapping
      ([`checks-verdict.ts`](../packages/app/src/features/repos/checks-verdict.ts)) and
      `reviewDecision` badge already computed for the sidebar's Reviews section
- [ ] Empty / loading / CLI-not-ready states match the existing Phase 17 forge-section affordances
      (gh missing or unauthenticated card)
- [ ] Refresh stays explicit, matching every other forge surface — no polling

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

### D — Syntax-highlighted diffs, unified across every surface (M)

- [ ] [`diff-rows.ts`](../packages/app/src/features/diff/diff-rows.ts) grows a per-row
      `codeToHtml` pass using the same lazy `getHighlighter()` singleton and `languageForFile()`
      grammar map [`code-preview.tsx`](../packages/app/src/features/files/preview/code-preview.tsx)
      / [`languages.ts`](../packages/app/src/lib/languages.ts) already built — reused, not
      reimplemented
- [ ] Highlighting composes with the existing word-level intraline segments (`toSegments` /
      `DiffSegment`) rather than replacing them — added/removed/context tinting is the outer layer,
      syntax colour the inner one
- [ ] Per-row highlight output is memoised on `(file, content-hash)` so scrolling an already-open
      diff doesn't re-highlight rows it's already rendered
- [ ] Applied to all three `DiffView` call sites: the Changes page
      ([`file-accordion.tsx`](../packages/app/src/features/changes/file-accordion.tsx),
      [`file-diff.tsx`](../packages/app/src/features/status/file-diff.tsx)), the Graph page's
      commit inspector
      ([`commit-detail.tsx`](../packages/app/src/features/commit/commit-detail.tsx)), and the new
      Reviews Files tab — one upgrade, three surfaces
- [ ] Verified against the virtualized scroll path specifically — this is the risk
      `outstanding.md` flagged when this was parked: "wiring `codeToHtml` into `<DiffView>`'s
      virtualised rows without regressing scroll performance"
- [ ] Light/dark theme sync verified — the highlighter is already built with both themes per
      `code-preview.tsx`'s existing pattern, so this is a check, not new work

### E — Inline diff-line comment threads (L)

- [ ] New `ForgeReviewThread` / `ForgeReviewComment` domain types in
      [`forge.ts`](../packages/shared/src/domain/forge.ts) — `path`, `line`, `side` (`'RIGHT'`
      only, per the scope decision below), `commitId`, `body`, `author`, `resolved`
- [ ] `mgit:forge:pull-comments` (Theme C) extended to also return inline threads, grouped by
      file + line, alongside the top-level conversation
- [ ] `DiffView` / `diff-rows.ts` gain a per-row comment affordance — a hoverable "add comment"
      gutter icon, and where threads exist, an inline expandable thread panel between rows
- [ ] Thread UI: reply and resolve (resolve calls the write module, Theme F) — no edit/delete of
      others' comments, matching GitHub's own permission model
- [ ] Scoped to right-side (added/context) lines only for v1 — left-side (deleted-line) comments
      need a second diff-position mapping GitHub's API distinguishes by `side`, deferred (see
      Decisions)
- [ ] Highest-unknown theme in the phase — spike the diff-position mapping (new-file line number →
      what `gh api` expects) before committing to the thread UI

### F — Review write actions: approve, request changes, comment, merge (L)

- [ ] New `packages/desktop/src/main/forge/gh-write.ts` — the phase's one write module, kept
      separate from `gh-cli.ts` so that file's "strictly reads" doc comment stays literally true.
      Exports `reviewPull(forge, number, event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT', body)`,
      `commentPull(forge, number, body)`, `mergePull(forge, number, method: 'merge' | 'squash' | 'rebase')`
- [ ] [`channels.ts`](../packages/shared/src/ipc/channels.ts)'s read-only-forge comment block is
      updated to document this one deliberate exception, rather than silently going stale
- [ ] PR detail action bar: Approve / Request changes / Comment, each opening a review-body
      composer (required for Request changes, per GitHub's own rule)
- [ ] Merge gated behind a confirm dialog showing the blast radius (`rev-list --count` of commits
      being merged in, mirroring the existing reset/rebase confirm pattern) and a
      squash/merge/rebase picker
- [ ] Every write action invalidates the relevant list/detail query on success, and surfaces
      `gh`'s own failure text on error via the existing `describeFailure` pattern — never a generic
      toast
- [ ] Unit tests over `gh-write.ts`'s command construction (`shellQuote`, flags) without a real
      subprocess, matching `gh-cli.ts`'s existing test shape

### G — Reviewer re-request, draft→ready, re-run checks (S)

- [ ] `gh-write.ts` grows `requestReview(forge, number, reviewers: string[])`,
      `markReady(forge, number)`, `rerunChecks(forge, runId)`
- [ ] Reviewer picker sourced from `gh pr view --json reviewRequests` / repo collaborators where
      `gh` exposes it cheaply; falls back to a free-text GitHub-username field otherwise
- [ ] Draft → Ready shows only on a PR whose `isDraft` is true, and disappears once flipped rather
      than staying as a dead toggle
- [ ] Re-run checks lives on the Reviews Checks tab; same `gh-write.ts` call the Actions view could
      later reuse for its own re-run affordance, not a second implementation

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

- [ ] `moon run :typecheck :lint :test` green
- [ ] Boundary lint still passes: `git-engine` stays electron-free; `packages/app` reaches
      `gh-write.ts` only through `mgit:forge:*` IPC, never directly
- [ ] `mock-bridge.ts` grows the new forge read/write handlers and `MockFixtures` for pull files,
      comments, threads and review submission
- [ ] Playwright: Reviews nav item hidden for a non-GitHub repo; the Reviews view narrows the
      sidebar to Reviews + Worktrees with the "show all sections" escape hatch intact; PR list
      filters by status and author; PR detail's three tabs render; syntax highlighting renders
      identically in Reviews, Changes and Graph diffs of the same file
- [ ] Playwright: approve / request-changes / comment flow against a mocked `gh-write`; merge
      confirm dialog shows the correct commit count and requires an explicit merge-method choice
      before the Merge button enables
- [ ] Unit tests: `gh-write.ts` command construction, PR-diff hunk parsing reusing
      `diff-parser.ts`'s existing fixtures, inline-thread grouping by file + line
- [ ] **Open, for a human:** a real `gh pr review` / `gh pr merge` against a disposable test PR —
      the write paths cannot be safely exercised against a mock alone
- [ ] **Open, for a human:** syntax-highlighted diff scroll performance on a real PR with 100+
      changed files

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
- **Open — diff-position mapping for inline comments.** Recommendation: map by
  `(file path, new-file line number)` directly to GitHub's `line` / `side: RIGHT` fields, sidestepping
  the legacy diff-offset `position` field entirely — modern `gh api` accepts the line-based form.
- **Open — review-body composer UX**, one box for all three actions vs. three separate forms.
  Recommendation: one composer, the event chosen by which button submits it — matches GitHub's own
  single-composer model and is less UI to build and keep in sync.
- **Open — whether `commentPull` supports editing or deleting your own prior comment.**
  Recommendation: no — matches the "no edit/delete of others'" scope decision in Theme E, and keeps
  the write surface to net-new actions only rather than a second CRUD surface.
- **Open — whether Theme G's `rerunChecks` should also grow an entry point from the Phase 19
  Actions view.** Recommendation: not this phase — Actions has no re-run affordance today, and
  adding one there is a scope decision for whoever picks that up, not a reason to block Theme G.
