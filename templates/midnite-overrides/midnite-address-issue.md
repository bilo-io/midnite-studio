# midnite-address-issue

In this repo the skill scans two named boards (the engineering backlog and the public apps board). In
an onboarded repo the boards are `issueRepos` in `.midnite/skills.json` (default: the repo alone), so
the names become placeholders, and the Studio-specific architecture notes (git-engine, IPC, Playwright
paths, moon tasks) become the project's own.

<<<<
description: Triage the Midnite Studio issue board,
====
description: Triage the repo's issue board,
>>>>

<<<<
Two boards, two audiences — this skill now scans and writes to both:

- **`bilo-io/midnite-studio` (this repo) — the internal engineering backlog.** Issues and code
  live in the same repo here, so a bare `gh issue`/`gh pr` call hits the right repo with no `-R`,
  and `Fixes #N` in a PR body **auto-closes** the issue on merge.
- **`bilo-io/midnite-apps` (public) — the user-facing board.** Real bug/feature reports filed by
  the in-app "Report a bug"/"Request a feature" composer land *here*, not in this repo. Every `gh`
  call against it needs an explicit **`-R bilo-io/midnite-apps`** — nothing defaults to it the
  way a same-repo call does — and the closing keyword is the cross-repo form,
  **`Fixes bilo-io/midnite-apps#<N>`**. That auto-closes on merge only because both repos share
  the `bilo-io` owner and the PR author has write access to both — true today; if that ever stops
  holding, fall back to a manual `gh issue close -R bilo-io/midnite-apps <N>` plus the Stage 12
  wrap-up comment instead of relying on the keyword.
====
The boards are `issueRepos` in `.midnite/skills.json` (see [`docs/TRACKER.md`](../../../docs/TRACKER.md));
with none configured, the board is this repo alone.

- **This repo — the engineering backlog.** Issues and code live in the same repo, so a bare
  `gh issue`/`gh pr` call hits the right repo with no `-R`, and `Fixes #N` in a PR body
  **auto-closes** the issue on merge.
- **Any other board (`<owner/repo>`), e.g. a public user-facing tracker.** Every `gh` call against it
  needs an explicit **`-R <owner/repo>`** — nothing defaults to it the way a same-repo call does —
  and the closing keyword is the cross-repo form, **`Fixes <owner/repo>#<N>`**. That auto-closes on
  merge only when the PR author has write access to both repos; otherwise fall back to a manual
  `gh issue close -R <owner/repo> <N>` plus the Stage 12 wrap-up comment.
>>>>

<<<<
If `gh` says *"Could not resolve repository"*, the active account flipped: `gh auth switch --user bilo-io`.
====
If `gh` says *"Could not resolve repository"*, the active gh account is the wrong one: set `ghUser` in `.midnite/skills.json` (the scripts then use that account's token) or `gh auth switch` to it.
>>>>

<<<<
- `CLAUDE.md` = conventions (package boundaries — `shared ◀ git-engine ◀ desktop`, `shared ◀ app`; commit style; pre-push gate). `docs/INITIAL_PLAN.md` is the design source of truth. Re-read the relevant bits before coding.
- Parallel work → git worktrees in the repo-root **`.worktrees/<branch>/`** dir (git-ignored; **never** under `.git/` — that path gets pruned by parallel `git worktree` runs and Vite denies `.git/**`). Keep the primary checkout (`/Users/bilolwabona/Dev/midnite-studio`) as home base; all multi-file work happens in the worktree.
====
- `AGENTS.md` = conventions (package boundaries, commit style, pre-push gate) and the pointer to the project's design source of truth, if it has one. Re-read the relevant bits before coding.
- Parallel work → git worktrees in the repo-root **`.worktrees/<branch>/`** dir (git-ignored; **never** under `.git/` — that path gets pruned by parallel `git worktree` runs). Keep the primary checkout as home base; all multi-file work happens in the worktree.
>>>>

<<<<
gh issue list -R bilo-io/midnite-apps --label "app: midnite-studio" --state open --limit 50 \
  --json number,title,labels,createdAt,updatedAt,comments,author,url
```

The second call is scoped to `app: midnite-studio` — `midnite-apps` is shared across every app
in that portfolio, and an unfiltered list would pull in reports for apps this skill can't fix.
====
# once per other board in issueRepos, with its labelFilter when it has one:
gh issue list -R <owner/repo> [--label "<labelFilter>"] --state open --limit 50 \
  --json number,title,labels,createdAt,updatedAt,comments,author,url
```

A board's `labelFilter` scopes it when that board is shared with other projects, so an unfiltered
list would pull in reports this skill can't fix.
>>>>

<<<<
`gh issue view <n> -R bilo-io/midnite-apps --comments` for one from the apps
board
====
`gh issue view <n> -R <owner/repo> --comments` for one from another
board
>>>>

<<<<
signal · [studio|apps]`. A `midnite-apps` candidate carries different reporter-cost weight in
Stage 2's scoring: it's a stranger who filed through the in-app composer, not an internal note.
====
signal · [<board id>]`. A candidate from a public board carries different reporter-cost weight in
Stage 2's scoring: it's a stranger who filed it, not an internal note (the board's `boost`).
>>>>

<<<<
cd .worktrees/issue-<N>-<slug> && pnpm install
====
cd .worktrees/issue-<N>-<slug> && <the project's install command>
>>>>

<<<<
- Replay the reporter's environment: which panel/surface (graph, sidebar, status, terminal), packaged app vs `desktop:start`, and the shape of the repo that triggers it (huge history? worktrees? in-progress merge?). Build a minimal scratch repo that reproduces it where possible.
====
- Replay the reporter's environment: which surface, which version or build (dev vs packaged/released), and the shape of the data that triggers it. Build a minimal reproduction where possible.
>>>>

<<<<
- For a wrong-data bug, find where the value is *produced*, not where it's rendered — usually a `git-engine` parser or the lane layout, not the React row. Check the raw git output the parser saw before blaming the UI.
====
- For a wrong-data bug, find where the value is *produced*, not where it's rendered — usually a parser or a transform, not the view. Check the raw input before blaming the UI.
>>>>

<<<<
or when the fix touches a contract in `shared`.**
====
or when the fix touches a shared contract or public API.**
>>>>

<<<<
Then, as the task warrants: IPC contract change in `shared`, git-version sensitivity (dugite vs system git output), destructive-op safety (confirm gating), fallback/error UX.
====
Then, as the task warrants: a shared contract or API change, version or platform sensitivity, destructive-op safety (confirm gating), fallback/error UX.
>>>>

<<<<
- Layer it right: parser/layout/engine logic → Vitest in `git-engine` (fixture strings or temp repos) · `app` component → RTL · visual/flow change → extend the Playwright suite under `packages/app/e2e/`.
- Fix at the source per the agreed plan. Follow `CLAUDE.md` (shared = the IPC contract; zod-validate IPC payloads; `git-engine` stays electron-free; `app` never imports git-engine/electron).
====
- Layer it right: pure logic → a unit test beside it · a component → a component test · a visual or multi-step flow → the project's end-to-end suite, if it has one.
- Fix at the source per the agreed plan. Follow `AGENTS.md` (its package boundaries and conventions).
>>>>

<<<<
- **Visual change → before/after Playwright screenshots** against the Vite renderer (`moon run app:dev`, mocked bridge) or the real app via `moon run desktop:start`; `pnpm exec playwright install chromium` if the browser is missing. Read the PNGs so they render inline in this thread; the same shots go in the PR body.
- **Packaged-app-only bug → verify in a packaged build** (`desktop:install-local`), not just dev, or say plainly that you couldn't and what remains unverified.
====
- **Visual change → before/after screenshots** (Playwright or the project's own tool) of the running app. Read the PNGs so they render inline in this thread; the same shots go in the PR body.
- **Build-only bug → verify in a real build** (packaged, released or deployed), not just dev, or say plainly that you couldn't and what remains unverified.
>>>>

<<<<
  Focused vitest, `tsc --noEmit` per touched package and eslint on the changed files; never the workspace-wide moon gate, which exhausts RAM. The table it prints carries each step's exit code.
====
  Focused tests, a typecheck per touched package and the linter on the changed files (the script assumes a JS workspace with vitest, tsc and eslint; elsewhere run the equivalents by hand). The table it prints carries each step's exit code.
>>>>

<<<<
    merge. For a `midnite-apps` candidate, use the cross-repo keyword instead:
    **`Fixes bilo-io/midnite-apps#<N>`** — see "The boards" above for why that still auto-closes.
====
    merge. For a candidate from another board, use the cross-repo keyword instead:
    **`Fixes <owner/repo>#<N>`** — see "The boards" above for when that still auto-closes.
>>>>

<<<<
  `Fixes bilo-io/midnite-apps#<N>`) auto-closes the issue.
====
  `Fixes <owner/repo>#<N>`) auto-closes the issue.
>>>>

The remaining mentions of the second board, last so the specific blocks above match first.

<<<<
-R bilo-io/midnite-apps
====
-R <owner/repo>
>>>>

<<<<
For a `midnite-apps` candidate,
====
For a candidate from another board,
>>>>
