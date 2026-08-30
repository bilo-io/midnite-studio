# Phase 19 — Dashboard, Actions and Tests as first-class views

The nav rail has held three items since Phase 3 — Files, Graph, Changes — with Settings pinned to
its footer. Everything the app knows about a repository beyond its file tree and its commits lives
inside a sidebar accordion or nowhere at all: Actions is a collapsed section you have to go find,
there is **no issues integration whatsoever**, and the app has never once looked at a repository's
tests. This phase turns the rail into the app's actual table of contents.

Three surfaces land. **Dashboard** sits above the workspace section with no group header of its
own — `NavConfig.pinned` in `@bilo-io/shell` is documented in its own type as *"Items rendered
above the sections (e.g. Dashboard), with no section header"*, so the slot this asks for is the
slot that already exists, and no shell change is needed. It is a
[`react-grid-layout`](https://github.com/react-grid-layout/react-grid-layout) board over one
repository: a commit calendar, contributor stats with an author filter, a recent-activity feed,
open PRs, issues, the latest workflow runs, and repo-health tiles. **Actions** and **Tests** join
the workspace section and each reshape the sidebar around themselves — in the Actions view a repo
shows Actions and Worktrees and nothing else, with a *show all sections* toggle as the escape
hatch.

**Half the forge plumbing already exists, and it is the good half.** Phase 17 built
[`gh-cli.ts`](../packages/desktop/src/main/forge/gh-cli.ts) — a `$SHELL -lic` wrapper with
`GH_PAGER=cat`, `shellQuote()`, a cached `ghStatus()` probe and short timeouts — plus
[`gh-parse.ts`](../packages/desktop/src/main/forge/gh-parse.ts)'s total parsers over `--json`
output, and the rule that [`forge-handlers.ts`](../packages/desktop/src/main/ipc/forge-handlers.ts)
resolves owner/repo from `.git/config` **in main** so the renderer only ever sends a `repoId`.
`listRuns` and `listPulls` are already there. What this phase adds — `gh issue list`,
`gh run view --json jobs`, `gh run view --log` — are three more functions in the same shape, not a
new integration.

**Scope guardrails.** Everything against GitHub stays **read-only**, extending the rule
[`channels.ts`](../packages/shared/src/ipc/channels.ts) already writes down: nothing merges,
approves, closes, comments or re-runs, and the app links out for any state change, so a stale cache
can never cause a write. Every new channel takes a **`repoId`, never a path**. All repository
statistics are computed in **git-engine**, which stays electron-free — `packages/app` may not
import it, so the calendar and contributor maths reach the renderer only through
`mgit:stats:*`. All log parsing is **NUL-delimited** (`-z` / `%x00`); author names and commit
subjects contain newlines and this phase reads a year of both. The dashboard is **one repository at
a time**, following the sidebar selection, exactly as the Phase 18 diagnostics segment does — there
is no cross-repo roll-up here. Executing a repository's own test runner (Theme G) is the same
arbitrary-code-execution problem as the linter, so it waited for Phase 18 Theme E's trust boundary
and rides its runner — generalised into `desktop/src/main/process-runner.ts` once diagnostics and
tests both needed it — rather than building a second one.

Effort tags: **S** ≈ an hour or two · **M** ≈ half a day · **L** ≈ a day plus.

## Deliverables

### A — The view-scoped navigation shell (M) — ✅ DONE (2026-08-26)

- [x] `ViewId` in [`ui-store.ts`](../packages/app/src/store/ui-store.ts) grows from
      `files | graph | changes | settings` to include `dashboard`, `actions` and `tests`.
      `pathForView`/`viewForPath` follow for free; the `Placeholder` fallback in
      [`app.tsx`](../packages/app/src/app.tsx) shrinks as each view lands
- [x] Dashboard renders through **`NavConfig.pinned`**, not as a fourth entry in the `workspace`
      section — an ungrouped item above the sections, per the shell's own doc comment. It keeps its
      active state through the same `href`/`activePath` comparison as everything else
- [x] Actions and Tests join `NAV_ITEMS` in the workspace section. Tests takes **`FaCheckDouble`**
      from `react-icons/fa` — a second icon set in the rail is the point of `react-icons`, per
      [`CLAUDE.md`](../CLAUDE.md), not a mistake to correct
- [x] Actions is **hidden from the rail when the selected repo has no GitHub remote**, reusing
      `pickForgeRemote` from [`remote.ts`](../packages/shared/src/domain/remote.ts). A rail item
      that can only ever say "not applicable" is worse than no rail item
- [x] A per-view **visible-section allowlist** in
      [`repos-panel.tsx`](../packages/app/src/features/repos/repos-panel.tsx): `SectionKey` gains
      `actions` and `tests`, and a `VISIBLE_SECTIONS: Record<ViewId, SectionKey[]>` map decides what
      renders. Actions view → `['actions', 'worktrees']`; Tests view → `['tests', 'worktrees']`;
      every other view → the full list
- [x] The view's own section renders **collapsed by default** (Actions costs a subprocess plus an
      API call to open — the reason Phase 17 closed it in the first place), Worktrees open
- [x] A **"Show all sections"** toggle in the sidebar header, visible only in a filtered view,
      persisted per-view in `ui-store` beside `collapsedNavSections`. The hard filter is the
      default; this is the escape hatch so wanting a branch mid-triage is not a reason to leave the
      view
- [x] The existing Changes-view filter
      ([`use-dirty-filter.ts`](../packages/app/src/features/repos/use-dirty-filter.ts)) is folded
      into the same mechanism rather than left as a parallel one-off — it is the first instance of
      exactly this idea
- [x] Switching views **preserves the selected repo and worktree**. The rail changes what you are
      looking at, never what you are looking at it for

*Landed with Theme A, and worth carrying forward: the sidebar's narrowing
toggle has never actually **looked** different when on. `--primary` is a
near-black in this theme (within a point of `--muted-foreground` on every
channel) and `bg-accent` / `bg-primary/10` both resolve to alpha ≈0.03, so the
`text-primary` Phase 17 shipped computes to rgb(93,93,100) against a resting
rgb(93,93,101). `aria-pressed` and the label carry the state correctly and are
asserted, but the visual cue belongs with the appearance tokens — not the nav
shell — and is left open.*

### B — Repository statistics in git-engine (L) — ✅ DONE (2026-08-26)

- [x] New `git-engine/src/stats/commit-history.ts` — one
      `git log --all --since=<window> -z --pretty=%H%x00%at%x00%aN%x00%aE%x00%s` pass feeding every
      history-derived widget. **One traversal, many aggregations**: the calendar, the contributor
      table and the activity feed must not each shell out
- [x] `stats/calendar.ts` — day-bucketed counts in the **user's local timezone**, not UTC. Git's
      `%at` is a UTC epoch and bucketing it as UTC silently shifts late-evening commits into the
      next day, which is exactly the cell a heatmap draws
- [x] `stats/contributors.ts` — aggregate by **email, display by most-recent name**. Identities
      change names; a leaderboard keyed on name splits one person into three. Optional
      `.mailmap` support if `git log --use-mailmap` is available, degrading silently if not
- [x] `stats/churn.ts` — hot files and per-author insert/delete totals from `--numstat`. Merge
      commits are skipped (`--no-merges`) or every merge double-counts its whole branch
- [x] `stats/health.ts` — stale-branch count from `for-each-ref --sort=committerdate`, repo size
      from `count-objects -vH`, ref counts, and the age of the oldest un-merged branch
- [x] A **hard row cap and a timing budget** on the history pass. A repo with 200k commits must
      degrade to "showing the last N" rather than blocking the write queue or the renderer
- [x] Results are **cached in main, keyed by `(repoId, HEAD sha, window)`** and invalidated through
      the existing Phase 10 watcher invalidation map. Recomputing a year of history on every
      sidebar click is not acceptable
- [x] New `shared/src/domain/stats.ts` — `CalendarDay`, `ContributorStat`, `ActivityEntry`,
      `RepoHealth`, and a `RepoStats` envelope. Every field zod-schema'd like the rest of the
      contract
- [x] New `mgit:stats:summary` channel taking `{ repoId, window }`, returning the envelope.
      A single fetch, not seven — the widgets slice one payload
- [x] Unit tests over fixture `git log` output: the timezone bucketing, the mailmap/email
      aggregation, `--numstat` parsing with renames and binary files (`-`/`-` counts), and the
      empty-repo case
- [x] The whole module imports **nothing from electron** and is exercised under bare vitest

### C — Forge: issues, run detail and logs (L) — ✅ DONE (2026-08-26)

- [x] `listIssues()` in [`gh-cli.ts`](../packages/desktop/src/main/forge/gh-cli.ts) —
      `gh issue list --json number,title,state,author,labels,assignees,updatedAt,url`. **`gh issue`
      fails on a repo with issues disabled**, and that is a normal outcome to render, not an error
      to surface as a crash
- [x] `runDetail()` — `gh run view <id> --json jobs,...` giving the job/step tree with per-step
      `conclusion` and timings. Run ids stay **strings** throughout, as `gh-parse.ts` already
      insists
- [x] `runLog()` — `gh run view <id> --log`. Capped output with an explicit
      **`truncated` flag** in the payload; a failed matrix job's log is routinely tens of megabytes
      and must never be shipped whole across IPC
- [x] `parseIssueList`, `parseRunDetail` and the log envelope in
      [`gh-parse.ts`](../packages/desktop/src/main/forge/gh-parse.ts) — total functions over
      `unknown`, matching the existing parsers' shape
- [x] New domain types in [`forge.ts`](../packages/shared/src/domain/forge.ts): `ForgeIssue`,
      `ForgeIssueState`, `ForgeJob`, `ForgeStep`, `ForgeRunDetail`, `ForgeRunLog`, each with the
      `{cli, items, error}` envelope the existing results use
- [x] New channels `mgit:forge:issues`, `mgit:forge:run-detail`, `mgit:forge:run-log`, documented
      in [`channels.ts`](../packages/shared/src/ipc/channels.ts) under the same read-only comment
      block
- [x] `listRuns` grows an optional **`workflow` filter** (`gh run list --workflow <file>`) and the
      payload carries the run's workflow **file name**, so `.yml` grouping is data rather than a
      string-match on the display name
- [x] Every new call goes through the existing `ghStatus()` gate and inherits the login-shell
      wrapper, `GH_PAGER=cat`, `shellQuote()` and the probe timeout. **No new subprocess path**
- [x] Handlers in [`forge-handlers.ts`](../packages/desktop/src/main/ipc/forge-handlers.ts) resolve
      owner/repo in main from `repoId`; the renderer never learns a path
- [x] Issues appear as a sidebar section too, beside Actions and Reviews in
      [`forge-sections.tsx`](../packages/app/src/features/repos/forge-sections.tsx) — closed by
      default, `enabled: false` until opened, like its siblings
- [x] Unit tests: issue-list parsing including empty and issues-disabled output, run-detail parsing
      with a skipped job and an in-progress step, and log truncation at the boundary

### D — The dashboard: grid and widgets (L) — ✅ DONE (2026-08-26)

- [x] `react-grid-layout` added to `packages/app` only, with its CSS imported into
      [`styles.css`](../packages/app/src/styles.css) and **overridden for theme tokens** — the
      shipped stylesheet hard-codes light-mode placeholder and handle colours that read as bugs in
      dark mode
- [x] A width-observer wrapper (`ResizeObserver` around the grid container). There is no responsive
      container pattern in the app yet, and `WidthProvider` re-measures on window resize only,
      which misses the sidebar and terminal resizes this app does constantly
- [x] A **widget registry** — each widget declares `id`, `title`, default `w`/`h`, `minW`/`minH`
      and its data dependency (`stats` | `forge` | `both`), so the board can render, list and gate
      widgets from one table rather than a switch statement
- [x] Layout persisted **per repository** in `ui-store` under the existing
      `midnite-git.ui` key, with a shared default applied to any repo not yet customised, plus
      **Reset layout** and an add/remove-widget menu
- [x] Widgets whose data source is unavailable **remove themselves from the picker** rather than
      rendering an error tile — no GitHub remote means no PRs, issues or runs widget at all
- [x] **Commit calendar** — a GitHub-style day-cell heatmap over the selected window, cells scaled
      by count, hovering a day showing its commits, clicking a day filtering the activity feed
- [x] **Contributor leaderboard** — commits, insertions, deletions and last-seen per author, with
      gravatar identicons reusing the Phase 14 avatar helper
- [x] An **author filter that is board-wide**, not per-widget: selecting a contributor scopes the
      calendar, the activity feed and the churn tile together. A dashboard where each tile filters
      separately is seven dashboards
- [x] **Recent activity** — a merged feed of commits, and (where a GitHub remote exists) run and PR
      events, newest first, each row clickable through to the graph, the Actions view or the browser
- [x] **Open pull requests** and **Open issues** tiles over the Theme C data, with state, author,
      labels and age; both link out
- [x] **Latest workflow runs** tile grouped by workflow file, each row a status dot, branch, actor
      and duration, clicking through to the Actions view's run detail
- [x] **Repo health** tiles — repo size, stale branches, hot files by churn, ref counts. These are
      the natural home for `@bilo-io/ui`'s installed-but-unused `MetricDial` and `RadialGauge`; use
      them where a single bounded number is the whole message, and hand-roll only where they do not
      fit
- [x] Every widget renders a **skeleton, an empty state and a failed state**. A repo cloned five
      minutes ago has no year of history and must not look broken
- [x] The board is **keyboard- and screen-reader-survivable**: drag is not the only way to reorder
      (the widget menu can move a tile), and every tile is a landmark with a heading

### E — The Actions view (M) — ✅ DONE (2026-08-26)

- [x] `features/actions/actions-view.tsx` — the main pane for the Actions view: a run list on the
      left, run detail on the right, following the sidebar's repo selection
- [x] Runs **grouped by workflow file** with a filter control, driven by the workflow file name
      Theme C now returns rather than by matching display names
- [x] Each run row: status dot reusing the Phase 17
      [`checks-verdict.ts`](../packages/app/src/features/repos/checks-verdict.ts) colour mapping,
      workflow name, branch, actor, event, duration and relative age
- [x] Run detail: the **job/step tree**, each step with its conclusion and elapsed time, failed
      jobs auto-expanded and successful ones collapsed — the failure is the only reason the pane is
      open
- [x] A **log pane** for a selected job, with ANSI colour handling and GitHub's `##[group]` /
      `::group::` markers folded into collapsible regions. Virtualised via the existing
      `@tanstack/react-virtual`, and honest about truncation: a visible "log truncated — open in
      GitHub" affordance, never a silently short log
- [x] **"Open in GitHub"** on the run, on each job, and on the workflow file itself, through the
      guarded `mgit:shell:open-external` channel. Anything that would *change* a run — re-run,
      cancel, approve — links out; it is not built here
- [x] Refresh is **explicit**, matching the existing forge sections. Polling a run to completion is
      a subprocess every few seconds against a rate-limited API and is deliberately not done
- [x] `gh` missing or unauthenticated renders the existing Phase 17 CLI-status affordance rather
      than an empty list

### F — Tests: discovery and the Tests view (M) — ✅ DONE (2026-08-27)

- [x] New `git-engine/src/tests/discover.ts` — detect configured test suites from
      `package.json` scripts, `moon.yml` / `.moon/tasks` tasks, and the presence of
      `vitest.config.*`, `playwright.config.*`, `jest.config.*` and `cypress.config.*`. Pure
      functions over file contents; no execution, so this stays electron-free and unit-testable
- [x] Suites are classified into **unit / integration / smoke / e2e / lint / typecheck**, by
      config file first and script-name heuristics second, with `other` as the honest fallback for
      anything unrecognised
- [x] **Monorepo-aware**: workspace packages each contribute their own suites, so a repo shows a
      tree of package → suite rather than one flat list. This repo is itself the test case — four
      packages, moon tasks, vitest configs and a Playwright e2e project
- [x] New `shared/src/domain/tests.ts` (`TestSuite`, `TestSuiteKind`, `TestDiscovery`) and a
      `mgit:tests:discover` channel taking a `repoId`, cached like Theme B (`discovery-cache.ts`,
      TTL + `invalidate(repoId)`). **Not yet wired into the Phase 10 watcher** — same gap Theme B's
      own `invalidateStats` already has on `main`; a config-file edit is picked up within the
      cache's TTL rather than instantly
- [x] A **Tests** sidebar section using `FaCheckDouble`, grouped by suite kind, closed by default
- [x] `features/tests/tests-view.tsx` — the main pane: the discovered suite tree, each suite showing
      its literal command, its source (which file declared it) and its package
- [x] **"Run in terminal"** on every suite — opens a new shell session with the command typed at
      the prompt and not run, the `start-claude.ts` posture. **No new trust surface**: it is the
      user typing the command, in their own shell, at their explicit request
- [x] Unit tests over fixture repo shapes: a plain npm package, a pnpm workspace, this moon repo,
      and a repo with no tests at all (which must render an empty state, not a broken tree)

### G — Tests: execution and parsed results (M) — ✅ DONE (2026-08-27)

- [x] Suite execution rides 18E's `desktop/src/main/diagnostics/runner.ts`, generalised and
      relocated to `desktop/src/main/process-runner.ts` (both diagnostics and tests now import the
      spawn/deadline/kill engine from there); `diagnostics/runner.ts` is a thin eslint-shaped
      adapter over it, `diagnostics/runner.test.ts` unchanged and green. Also generalised: the kill
      now signals the whole process group (`detached` + `process.kill(-pid, 'SIGKILL')`), not just
      the direct child — a test runner routinely spawns workers of its own, which diagnostics never
      had to account for
- [x] Structured results where the runner supports it — `vitest`/`jest`'s shared JSON reporter
      shape, and `playwright`'s `stats` + nested `suites` shape — parsed into pass/fail/skip counts
      and per-test failures (`desktop/src/main/testing/reporters.ts`). Unknown runners fall back to
      **exit code plus raw output** (`structured: false`), which is still a useful answer
- [x] `mgit:tests:run` (invoke, returning a run id) and `mgit:tests:output`/`mgit:tests:result`
      one-way streams for live output and completion, mirroring the Phase 18 sample-stream shape.
      Trust is granted **per suite**, not per repo (`desktop/src/main/testing/trust-store.ts`) — a
      repo's `test` and `e2e` scripts are different propositions and approving one must not
      silently approve the other
- [x] Results render in the Tests view: per-suite pass/fail counts, a failed-test list, and the
      output pane. **Last result is remembered per suite** for the session (`tests-store.ts`) so
      switching suites does not throw the answer away
- [x] Cancellation kills the process tree via the process-group signal above. A `moon run :test`
      that spawns four vitest children does not leave them running after Cancel

## Files this phase touches

| Area | Files |
|------|-------|
| Contract | [`shared/src/ipc/channels.ts`](../packages/shared/src/ipc/channels.ts), [`schemas.ts`](../packages/shared/src/ipc/schemas.ts), [`bridge.ts`](../packages/shared/src/ipc/bridge.ts), [`ipc.test.ts`](../packages/shared/src/ipc/ipc.test.ts), [`domain/forge.ts`](../packages/shared/src/domain/forge.ts), new `domain/stats.ts` + `domain/tests.ts` |
| git-engine — stats | new `git-engine/src/stats/{commit-history,calendar,contributors,churn,health}.ts` + tests |
| git-engine — tests | new `git-engine/src/tests/{discover,classify}.ts` + tests |
| Main — forge | [`forge/gh-cli.ts`](../packages/desktop/src/main/forge/gh-cli.ts), [`forge/gh-parse.ts`](../packages/desktop/src/main/forge/gh-parse.ts), [`ipc/forge-handlers.ts`](../packages/desktop/src/main/ipc/forge-handlers.ts) |
| Main — new handlers | new `desktop/src/main/ipc/{stats-handlers,tests-handlers}.ts`, [`main/index.ts`](../packages/desktop/src/main/index.ts), [`preload/index.ts`](../packages/desktop/src/preload/index.ts) |
| Renderer — shell | [`app.tsx`](../packages/app/src/app.tsx), [`store/ui-store.ts`](../packages/app/src/store/ui-store.ts), [`features/repos/repos-panel.tsx`](../packages/app/src/features/repos/repos-panel.tsx), [`use-dirty-filter.ts`](../packages/app/src/features/repos/use-dirty-filter.ts), [`components/tree-section.tsx`](../packages/app/src/components/tree-section.tsx) |
| Renderer — dashboard | new `app/src/features/dashboard/{dashboard-view,widget-registry,widget-frame,use-repo-stats}.*` + `widgets/*`, new `app/src/store/dashboard-store.ts`, [`styles.css`](../packages/app/src/styles.css) |
| Renderer — actions | new `app/src/features/actions/{actions-view,run-list,run-detail,job-tree,log-pane,ansi.ts}.*`, [`forge-sections.tsx`](../packages/app/src/features/repos/forge-sections.tsx), [`checks-verdict.ts`](../packages/app/src/features/repos/checks-verdict.ts) |
| Renderer — tests | new `app/src/features/tests/{tests-view,suite-tree,use-test-discovery}.*` |
| Tests | [`e2e/mock-bridge.ts`](../packages/app/e2e/mock-bridge.ts), new `e2e/{dashboard,actions,tests-view}.spec.ts` |

## Verification

- [x] `moon run :typecheck :lint :test` green
- [x] Boundary lint still passes: `packages/app` imports nothing from `git-engine` — the stats and
      discovery modules are reachable only through `mgit:stats:*` and `mgit:tests:*`
- [x] `mock-bridge.ts` grows `stats`, `tests` and the three new `forge` handlers, with
      `MockFixtures` fields for each, commented with the state they unlock. The `tests.output`
      stream needs a **live handler array and a real splice teardown**, not an inert `unsubscribe`
- [x] Playwright: the rail shows Dashboard pinned above the section, Actions hidden for a
      non-GitHub repo, the Actions view filtering the sidebar to Actions + Worktrees, the "show all
      sections" toggle restoring the rest, and Tests grouping discovered suites by kind
- [x] Playwright: the dashboard renders its widgets, a widget can be removed and restored, Reset
      layout restores the default, and a repo with no GitHub remote offers no forge widgets in the
      picker
- [x] Unit tests: local-timezone day bucketing across a DST boundary, contributor aggregation by
      email with a renamed author, `--numstat` with renames and binary files, `gh issue` output for
      an issues-disabled repo, run-detail with a skipped job, log truncation at the boundary, and
      suite discovery across the four fixture repo shapes
- [x] Dashboard layout survives an app restart, per repository
- [x] **Open, for a human:** the dashboard against a large repository (10k+ commits) ✅
- [x] **Open, for a human:** the Actions view against a real failing matrix run ✅
- [x] **Open, for a human:** `react-grid-layout`'s stylesheet in both themes ✅

## Not in this phase

- **Any write to GitHub.** No creating, closing or commenting on issues; no re-running, cancelling
  or approving; no merging. The read-only rule in `channels.ts` holds, and everything stateful
  links out
- **Non-GitHub forges.** GitLab and Bitbucket are `pickForgeRemote` cases with entirely different
  CLIs; `forge` already exists as a discriminant so this is a new branch, not a refactor
- **Cross-repo dashboards.** One repository at a time, following the sidebar selection
- **Watch-mode or continuous test running**, and **coverage**. The fs watcher fires on every save
  and nothing here runs a test because a file changed
- **Test-failure → source navigation.** The Folder view is a read-only browser with no editor to
  land in — the same reason Phase 18 does not jump to a lint diagnostic
- **A blame/ownership view.** `git blame` per file is a different phase with a different data shape
- **Notifications** on run completion or new issues. That needs polling, which this phase
  deliberately does not do
- **PR detail** — diffs, review threads, checks. The PRs widget lists and links out; the Reviews
  section stays as Phase 17 left it

## Decisions / open questions

- **Resolved — the grid is `react-grid-layout`**, not hand-rolled and not static. The app has
  hand-rolled its tab strip, tooltip and charts, but a dashboard needs free-form placement, resize
  handles, collision resolution and a serialisable layout, and that is a library's job. The cost is
  a stylesheet that needs theme-token overrides, which is a known, bounded piece of work.
- **Resolved — Dashboard uses `NavConfig.pinned`**, so it renders above the workspace section with
  no group header, exactly as asked. This required no change to `@bilo-io/shell`.
- **Resolved — the sidebar filter is a hard allowlist plus a "show all sections" toggle.** The
  focused view is the default; the toggle exists so wanting a branch mid-triage is not a reason to
  leave the view.
- **Resolved — Actions goes as deep as job trees and logs** before linking out. A run detail that
  can only say "it failed" would send the user to the browser every single time, which makes the
  view decorative.
- **Resolved — Theme G waits for Phase 18 Theme E** rather than building its own runner. Noted as a
  risk: Phase 18 is at 0% with only Themes A and B committed to a branch, so if 18 stalls, G stalls.
  Theme F is deliberately independent and ships a useful Tests view — discovery plus *run in
  terminal* — with no trust surface at all, so the blocked half is the smaller half.
- **Resolved — statistics live in git-engine**, not in main and not in the renderer. It keeps the
  maths under bare vitest and keeps `packages/app` on the far side of the IPC boundary.
- **Open — the history window.** Recommendation: default to 1 year (the calendar's natural span),
  configurable in Settings to 3 / 6 / 12 months and all-time, with the cache keyed on the window so
  switching is not free but is not a full recompute either.
- **Open — dashboard layouts per-repo or global.** Recommendation: **per-repo, seeded from a global
  default**, so a repo with no CI does not carry three dead tiles from a repo that has it. Revisit
  if maintaining many layouts feels like bookkeeping.
- **Open — the log cap.** Recommendation: head-and-tail with a visible truncation marker (the
  failure is usually at the end, the setup context at the start, and the middle is matrix noise),
  plus an Open-in-GitHub for the whole thing. A "load full log" button is the alternative and can
  be added if head/tail proves insufficient.
- **Open — whether Tests belongs in the rail for a repo with no discoverable suites.** Currently it
  is always present and shows an empty state. Recommendation: keep it — unlike Actions, "this repo
  has no tests" is itself information worth surfacing.
- **Open — activity feed merge semantics.** Commits are local and instant; runs and PRs come from a
  rate-limited CLI with an explicit refresh. Recommendation: render the local half immediately and
  fold forge events in as they arrive, marking the feed's freshness rather than blocking it.
