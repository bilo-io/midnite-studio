# Done — append-only log

<!-- Append one entry per landed phase/PR: date, phase, PR link, one-line summary. -->

## 2026-08-27 — Phase 21 · Themes A + B + C — a plural agent roster, and a `+` menu that says what it starts

Landed on `feature/phase-21-roster-plural`, squash-merged locally — no PR link, no GitHub remote on
this checkout. Phase 15 built the agent machinery around a roster with exactly one entry in it, and
the renderer never held up its half of the *"adding one is an edit, not a release"* bargain. These
three themes are the renderer finally keeping it.

- [x] **The roster becomes plural.** `AgentDefinitionSchema` gains `icon` (a key into the renderer's
      registry, defaulting to the agent's `id`) and `install` (the one-line hint a disabled menu row
      shows instead of nothing), and `BUILTIN_AGENTS` grows from one entry to four real terminal
      agents: Claude Code (`claude`), Antigravity (`agy` — the CLI, **not** the `antigravity-ide`
      shim, which opens the IDE), Codex (`codex`) and OpenClaude (`openclaude`)
- [x] **Whether a command exists on this machine is a SEPARATE type**, `AgentStatus`, keyed by id
      and travelling beside the roster on `agent.list()`. Folding it onto `AgentDefinition` would
      have meant `mergeAgents` validating a runtime fact and `agents.json` gaining two fields nobody
      should ever write — the definition is config a user hand-edits, the status is a probe result
      with a lifetime measured in seconds
- [x] **`agentIdMatchesKind` guarded one id when it was written and now guards four**, so both its
      invariants are re-asserted as a table over the whole roster. "True for all agents" and "true
      for Claude" used to be the same sentence; a fifth entry can no longer be added half-wired
- [x] **`login-shell.ts` extracted** from `claude-cli.ts` — `runInShell`, `loginShell` and
      `parseWhichOutput`, previously owned outright by the Claude probe and now shared with the
      roster's. The `-lic` trick is the load-bearing part and it now has one home
- [x] **`agent-probe.ts`: the install probe, and its trap.** `claude` and `agy` both live in
      `~/.local/bin`, which reaches the environment only through an interactive rc file — so an app
      opened from Finder inherits launchd's bare PATH and a probe resolving against **Electron's**
      environment would disable two agents that are sitting right there. The whole roster resolves
      in ONE `-lic` shell, each `command -v` wrapped in per-agent frame markers: without them
      `parseWhichOutput`'s "last path line wins" rule hands an rc-file banner's path to whichever
      agent parsed last, and every agent resolves to the same wrong binary. Cached on a 30s TTL, so
      `npm i -g` in the terminal next door un-greys its menu item without an app relaunch
- [x] **A probe that cannot answer OMITS the agent** rather than reporting `installed: false`, and
      the renderer reads absent as "assume it works". A slow rc file, a broken profile or a shell
      killed mid-batch costs the user an explanation, never a working agent — the same fail-soft
      posture `claude-cli.ts` already took
- [x] **Three new marks beside `claude-icon.tsx`**, all hand-drawn originals with their provenance
      in a doc comment. Antigravity is a Google trademark; OpenClaude publishes a **wordmark only**;
      and OpenAI's hexagonal knot turns to mud at the 14px the session list draws at — which is the
      failure Phase 19's spinner rewrite already paid for once. Codex is a `</>` instead:
      unmistakably the coding agent, legible at a third of its design size, and nobody's logo
- [x] **`AGENT_ICONS` + `resolveAgentIcon`** — the one place an `icon` key becomes a mark, plus a
      curated allow-list of `react-icons/si` names so a user-added agent can ask for
      `SiGooglegemini` without shipping an SVG. An allow-list rather than a dynamic lookup because
      resolving an arbitrary name would mean importing the whole set to resolve *against*, and
      CLAUDE.md forbids the root barrel for exactly that reason. An unrecognised key falls back to
      lucide's `Terminal`: a typo in a hand-edited config should cost a glyph, not a row
- [x] **`SessionIcon` resolves through the registry** instead of hard-coding `<ClaudeIcon>` for
      *any* agent id — invisible while the roster had one entry, and about to put Claude's face on
      Codex
- [x] **The `+` menu goes flat and iconned**: New Terminal, a separator, then Claude Code /
      Antigravity / Codex / OpenClaude. The `New Agent — ` prefix existed to disambiguate one entry
      from a heading; with four named agents the label *is* the disambiguation. `MenuEntryBase`
      gains `iconStyle` so an accent — roster data, a colour Tailwind has never seen — can reach the
      row inline; a **disabled** row drops it, because a saturated brand colour under 40% opacity
      reads as selected rather than unavailable
- [x] **`buildNewSessionMenu` is pure and separate from the panel**, because the interesting part of
      this menu is not how it is drawn but which rows are dead and why. Four cases, unit-tested:
      everything installed, one missing (OpenClaude is the live example — the other three are on the
      PATH of the machine this was written on), none installed, and no worktree selected, where the
      worktree reason wins over every install hint
- [x] **Found in passing, and fixed:** Phase 19 said in words that the repo name should shrink
      before the session name — *"the part that actually tells two Claude sessions apart"* — and
      wrote the opposite in CSS. The repo span was `shrink` (basis auto, content-sized until
      something overflows), the name span `flex-1` (basis **zero**, leftovers only), so at the
      list's default 176px the repo name rendered in full and the session name collapsed to one
      letter and an ellipsis. With four agents in the roster that is the one half that cannot be
      guessed
- [x] **Three e2e specs had been red on `main`** since Phase 19 split the row in two: each matched
      `span.truncate`, which silently began matching twice per row, so they asserted on whichever
      span came first. `data-session-name` gives them a hook on the half they were always about.
      All fourteen pass, plus four new ones — the flat menu naming four agents, the uninstalled one
      disabled with its hint, an agent row carrying its own accent, and two agents from one roster
      getting two different marks
- [x] Screenshots: `docs/screenshots/phase-21-new-menu.png`, `phase-21-session-list.png` and
      `phase-21-session-list-dark.png` — Theme B's "eyeball each mark at 14px, in both themes"

*Deliberately not here:* per-agent activity detection (`activity-detect.ts` stays keyed to Claude
Code's own chrome, so the three new agents show the idle caret), a writable Settings ▸ Agents page,
and launcher-style entries. All three are recorded in the phase doc's *Not in this phase*.

*Still open on Phase 21:* Themes D and E (OSC 7 live cwd, and the process probe) — F landed in
parallel and this branch rebased onto it, so the `+` menu's four agents now hang off F's rebuilt
header. Plus the three human passes: a real `cd` between worktrees, starting and quitting an agent
by hand, and the packaged `.app` launched from Finder, which is the one check that catches the probe
resolving PATH from Electron's environment instead of the shell's.

## 2026-08-27 — Phase 21 · Theme F — the terminal header, rebuilt

Landed on `feature/phase-21-terminal-header`, merged locally — no PR link, no GitHub remote on this
checkout. The first of Phase 21's six themes to land, and the one independent of the roster work
running in parallel on A/B/C.

- [x] **The word "Terminal" is gone.** The strip read `Terminal  /Users/you/Dev/midnite-git/…` — a
      label for the pane you are already looking at, then an un-collapsed path. It now leads with a
      glyph in the width the word cost, then the status circle, then where the terminal actually is
- [x] **`StateDot` lifted to `components/state-dot.tsx`.** The session list and the header draw the
      same dot for the same session; the pulse is a keyframe plus two inline CSS variables, which
      is exactly the pair that drifts once it exists twice. The header's dot reports the ACTIVE
      session and reads idle when nothing is open — there is no process to be alive
- [x] **`collapseHome`**, with the boundary check that is the whole reason it is a helper: a plain
      prefix match rewrites `/Users/bilolwabonaX/Dev` as `~X/Dev`, silently claiming a different
      user's home as yours, and the result reads plausibly enough to go unnoticed
- [x] **`resolveRepoForPath`** — Theme D's deliverable, brought forward because F's repo-segment
      emphasis needs the split point it returns. Longest-prefix, not first-wins: a linked worktree
      lives *inside* its repository, so both roots prefix the same path and the repository is the
      wrong answer. Separator-aware, so `/Dev/midnite-git-old` is not inside `/Dev/midnite-git`.
      D feeds it `liveCwd` instead of the stored cwd; the helper itself is unchanged by that
- [x] **The path is two spans** — dimmed ancestors, then the checkout you navigate by and
      everything under it at full weight — and that same split is how it truncates from the LEFT.
      The ancestor span is the flex child that shrinks (`min-w-0 truncate`) while the checkout span
      refuses to (`shrink-0`), which puts the ellipsis at the front with no bidi tricks and no
      measurement: `…/.worktrees/` + **`theme-f/packages/app`** rather than `/tmp/midnite-git/.wo…`
- [x] **`homeDir` on the preload bridge**, a plain value beside the other preload constants rather
      than a channel: it never changes for the life of the process, and the header needs it during
      its first render. An async fetch would paint the raw path and then rewrite it. It has to
      cross at all because the renderer may not import `node:os`/`node:path`
- [x] **`data-terminal-header` hit-test still green** across the strip's full width — the one thing
      that must stay true of this row, and an assertion that predates the phase
- [x] **Three stale e2e locators repaired**, incidentally. They had been failing on `main` since
      Phase 19 split the session row's label into a repo span and a session span: they looked for
      the old single `Claude · midnite-git` string, and for the dim state on a flat list of every
      `span.truncate` — where the repo span is muted at *both* densities and so says nothing about
      whether the session is live

Screenshots: `docs/screenshots/phase-21-terminal-header{,-narrow,-before,-before-narrow}.png` —
the strip alone at two widths, clipped, because a full-window shot renders it 20px tall and the
two-tone path unreadable.

Still open on the phase: A/B/C in flight elsewhere, D (OSC 7 live cwd — its resolver now exists)
and E (the process probe).

## 2026-08-27 — Phase 20 · Themes F + G — review write actions, and the consent switch in front of them

Landed on `feature/phase-20-review-writes`, squash-merged locally — no PR link, no GitHub remote on
this checkout. The phase's one deliberate reversal of the Phase 17/19 read-only-forge rule, and the
last of its seven themes.

- [x] **Six writes in `gh-write.ts`**, beside Theme E's three: approve/request-changes/comment,
      merge, reviewer re-request, draft→ready and run re-run. All six are plain `gh` subcommands
      rather than `gh api` — Theme E reaches for the API because threads have no CLI verb, and
      these have one. Command construction is split from the spawn, so each is a pure
      `*Command(forge, …)` returning a string and the tests assert the exact command line — flags,
      ordering, quoting — with no subprocess, network or repository. The failure modes worth
      catching are all textual: a verb that becomes a value, a body that breaks out of its quoting,
      a `--failed` nobody asked for, a method flag omitted so `gh` drops into an interactive prompt
      and hangs on the timeout
- [x] **`gh-shell.ts` extracted** — the spawn, quoting, both host flags, the availability probe and
      the failure summary, previously in `gh-cli.ts` and imported from there by the write module.
      Now a third module imported by `gh-cli`, `gh-write` and `gh-graphql` alike: two probe caches
      would let the read path and the write path disagree about whether `gh` holds a credential,
      and `gh-cli.ts`'s "strictly reads" comment is now true of its dependencies as well as its
      calls
- [x] **Contract**: six channels appended to the write block Theme E opened, so the whole write
      surface is auditable in one screen and the read-only comment above it says nine rather than
      going stale. Three rules encoded in the payloads rather than left to the UI — a merge method
      never defaults, a reviewer must look like a GitHub login, and `APPROVE` is the only bodiless
      verb. `ForgePullDetail` grows `commitCount`, a five-commit sample and `reviewRequests`, all
      three riding the `gh pr view` the detail header already makes
- [x] **The blast radius comes from GitHub, not `rev-list --count`** — a departure from the theme's
      own bullet. A PR's head ref usually is not in this checkout at all, and `rev-list` against a
      missing ref reads as zero, which is the one number a confirm dialog must never be wrong about
- [x] **Action bar under the PR header**, outside the tabpanel because these actions apply to the
      pull request rather than to one view of it — inside Conversation, GitHub's own placement,
      Merge would be hidden behind a tab. One composer for all three verbs, the verb restated on
      Submit. Merge has its own dialog rather than the shared `ConfirmDialog`: that one asks a
      single question whose answer is one click, and a merge asks two, the second ("merge, squash
      or rebase?") changing what the first one means. Nothing preselected, Merge disabled until a
      human picks
- [x] **Nothing optimistic.** Every action disables its control until `gh` answers, then either
      invalidates the listing and detail — not the patch, which a verdict does not change — or
      renders `gh`'s own sentence beside the control that caused it
- [x] **A default-off Settings → Reviews switch** gates all of it, and lists what stays out: no PR
      creation, no labels, no issue writes, no force-push, no branch deletion, no editing anyone's
      comment. Not the phase doc's idea and deliberately not Phase 18's per-repo trust prompt —
      nothing here executes anyone's code, so one machine-wide switch is the honest weight
- [x] **Two bugs found in self-review, both about what GitHub actually does.** `gh run rerun` adds
      an attempt to the *same* run id, and main caches a completed run's tree and logs permanently
      — so re-running would refresh the listing, watch the run finish, and then serve the previous
      attempt's failure for as long as the app stayed open; `forgetRun` now evicts it in the
      handler, scoped by host and slug because run ids collide across repositories. And a
      comment-review could be submitted empty, which GitHub refuses — `APPROVE` is now the only
      bodiless verb everywhere
- [x] **Tests**: 31 command-construction cases over `gh-write.ts`, five spawn-counting cases over
      the cache eviction, four contract cases over the new payloads, and 13 Playwright cases over
      the guards — consent, the required bodies, the merge count and method, the absent controls on
      a draft/merged PR, `--failed` only on a failed run, and the recorded requests proving the app
      sent the verb the user chose. Five committed screenshots

Still open on the phase, both needing a human: a real `gh pr review` / `gh pr merge` against a
disposable test PR, and syntax-highlighted diff scroll performance on a PR with 100+ changed files.

## 2026-08-27 — Phase 20 · Theme E — inline review comment threads on the PR diff

Landed on `feature/phase-20-inline-threads`, squash-merged locally — no PR link, no GitHub remote
on this checkout. The phase's highest-unknown piece, and two of its three unknowns turned out to be
API facts rather than design calls:

- [x] `ForgeReviewThread` / `ForgeReviewComment` domain types plus `ForgeThreadSide` and the
      `ForgeWriteResult` envelope. The thread carries **three** position fields — `line`,
      `originalLine`, `startLine` — because a thread can lose its anchor, and collapsing them is
      how a comment gets pinned to code its author never saw
- [x] **Read through GraphQL, on its own channel**, both departures from the original bullet and
      both forced: REST `pulls/{n}/comments` returns a flat list with no thread object, no
      `isResolved` and no thread node id — resolution is a property of `PullRequestReviewThread`,
      which REST does not expose, and its node id is the only handle `resolveReviewThread` takes.
      New `gh-graphql.ts` is the app's one GraphQL read, kept out of `gh-cli.ts` so that file stays
      one `gh` subcommand per function. `mgit:forge:pull-threads` is its own channel rather than a
      widening of `pull-comments`: one key serving the Files and Conversation tabs would make
      either tab's fetch serve the other's payload
- [x] Threads render as **rows** in the diff, not overlays — the diff is a list and a thread has to
      push the code below it down. The virtualizer now measures rather than assuming `ROW_HEIGHT`;
      code rows still land on exactly 18px, so a diff with no threads reflows nothing
- [x] The gutter affordance is opt-in on `threads`/`onComment` being present, because `DiffView` is
      shared with the Changes page and the commit inspector — a working-tree diff must not grow a
      comment gutter by accident. It replaces the `+`/`−` marker column rather than adding one, so
      hovering changes what a cell shows and nothing about where anything sits
- [x] `isCommentableLine` is the one gate on right-side-only v1, and `withCommentRows` refuses to
      splice onto a deleted line even if asked
- [x] The diff-position mapping, spiked first as the bullet asked. Verified against `cli/cli#14200`:
      `line`/`originalLine`/`startLine` and `diffSide` live on the **thread**, `databaseId` on the
      **comment**, and `diffSide` does not exist on `PullRequestReviewComment` at all — the first
      thing the spike got wrong
- [x] `gh-write.ts` exists as of this theme rather than waiting for F, carrying only E's three calls
      plus `describeApiFailure`, so `gh-cli.ts`'s "strictly reads" comment stays literally true

Found and fixed while reviewing the slice before it landed:

- **A live thread anchored outside every hunk rendered nowhere at all.** `isAnchored` cannot see
  this case: a reviewer who expands context on github.com can comment far outside any hunk, and the
  thread comes back live, right-side and unresolved with a perfectly real `line`, while `gh pr diff`
  fetches three lines of context. Keyed into `byLine` it matched no row and vanished — the same harm
  as pinning one to the wrong line, and harder to notice. `threadsForFile` now takes the `FileDiff`
  and checks the anchor against `rightSideLines(diff)`, a Set rather than a range test because a
  diff is hunks with gaps: line 50 falling between rendered hunks 10-12 and 90-92 does not make it
  renderable. Such threads join the collapsed group above the diff, which grew a fourth documented
  kind
- **`gh api graphql -F` type-guesses its variables**, which `gh-write.ts`'s own `apiPost` comment
  warns about for REST bodies and `gh-graphql.ts` then did anyway: `-F name=2048` sends the *integer*
  2048 for a `String!` variable and GitHub refuses the whole query — for a repo name that is neither
  unusual nor invalid (`gabrielecirulli/2048`). The String!/ID! variables now use `-f`; `-F` is kept
  only for `number`, which really is an `Int!`

**Pre-existing on `main`, not this theme's:** four e2e failures — `repos-workbench.spec.ts`'s
folded-repo trailing-edge test and three `terminal.spec.ts` session tests. Confirmed identical on a
detached `main` worktree at `5ff0df8`, and they sit in the two areas the last two `main` commits
touched. `229 passed` otherwise; the full vitest gate is green (599 app, 331 desktop).

## 2026-08-27 — Phase 20 · Themes A+B+C+D integration — the Reviews view gets its detail pane

Landed on `feature/phase-20-reviews-shell`, on rebase onto `main` after Theme C merged separately
(`feature/phase-20-pr-detail`, squash-merged locally — no PR link, no GitHub remote on this
checkout). Themes A/B/D built the Reviews view as a list-only pane against `main` as it stood
before Theme C existed; Theme C's own commit message said the plan all along was for the Reviews
*view* to mount the same `PrDetail` its workbench-tab route does. Rebasing surfaced that gap, so
this integrates the two rather than landing them side by side unconnected:

- [x] `ReviewsList` grows a resizable list-plus-detail split — the same shape `ActionsView`
      already has — with a new `reviewsListWidth` in `ui-store.ts`'s `LayoutSizes`
- [x] A row's click now **selects** the PR (mounting `PrDetail` on the right) rather than opening
      it on GitHub directly; that action moved to `PrDetail`'s own header button, which already
      existed for exactly this
- [x] New `store/reviews-store.ts` (`selectedPull`, keyed by repo) — the same shape
      `actions-store.ts`'s `selectedRun` uses, so the sidebar's Reviews section row can carry a
      specific PR number into the view, the same way `ActionsSection` already carries a run id
- [x] `ReviewsView`'s CLI-not-ready / error handling moved from a blanket early return into
      `ReviewsList`'s own list pane — a PR already selected from the sidebar keeps showing its
      `PrDetail` even when the listing itself can't refresh, since `PrDetail`'s three tabs already
      report "not ready" per tab on their own. Theme C's own `reviews.spec.ts` caught this: its
      signed-out-gh test expects the detail region to render regardless of the list's CLI status,
      which the original list-only Theme A/B early return would have blocked entirely
- [x] `gh-cli.ts`'s `listPulls` and the `forge.pulls` IPC contract both grow a `state` parameter
      (default `open`) rather than the hardcoded `--state all` Theme B shipped alone — the
      sidebar's Reviews section and the dashboard's pulls widget keep asking for open PRs only,
      exactly as Phase 17/19 shipped; only the Reviews view's own list explicitly asks for `all`.
      Caught in an independent code-review pass before the rebase: `--state all --limit N` meant N
      most-recent-of-any-state, which could silently starve those two surfaces of real open PRs
      on a repo where merges outpace opens
- [x] `pullStatus()` reads merged/closed off `pull.state` before falling back to
      `reviewDecision`/`isDraft` — also from that review pass, since a merged PR was rendering
      "Approved" once B started fetching every state
- [x] `LineRow` rounds only the outer edge of a run of adjacent `changed` diff pieces, not each one
      independently — a syntax-highlight token boundary landing inside one diff segment no longer
      draws a visible seam between two touching highlight boxes
- [x] Status tabs moved to `@bilo-io/ui`'s `Tabs` (WAI-ARIA roving-tabindex) instead of a
      hand-rolled tablist

### One thing worth remembering

**A parallel `/exec` loop landed Theme C on `main` while this session was mid-flight on A/B/D**,
and Theme C's own commit message and `done.md` entry both said, in effect, "the Reviews view will
mount this" — a forward reference to work this session hadn't written yet. The rebase's merge
conflicts were all mechanical (the same fields added to `PULL_FIELDS`/`gh-cli.ts` from both sides);
the real integration gap — a fully-built, tested `PrDetail` sitting unreachable because the
sidebar's route into Reviews no longer created the workbench tab that used to mount it — only
showed up by reading what Theme C actually shipped, not from any merge conflict. Worth remembering
for the next phase split across parallel sessions: a clean rebase is not the same claim as a
working merged result, and the two themes' own `done.md` entries are the place to check for a
forward reference like this one before calling a rebase finished.

## 2026-08-27 — Phase 20 · Theme C — PR detail: files, conversation and checks

Landed on `feature/phase-20-pr-detail` (squash-merged locally — this checkout has no GitHub
remote, so there is no PR link). Phase 17 shipped the Reviews tab as a summary and a link out,
and Phase 19 explicitly parked the rest; this is that parked work. Opening a pull request now
shows its diff, its discussion and its CI verdict without leaving the window.

### What landed

- [x] New `mgit:forge:pull-files` channel (`repoId` + PR number) — **bare `gh pr diff`, not
      `--patch`**: the phase doc named `--patch`, which asks GitHub for `git format-patch` output
      (one mbox entry per commit, so a file touched twice appears twice and every mbox header
      after the first is swallowed as diff body). Verified against `cli/cli#14255` — 16 sections
      for 14 files with `--patch`, exactly 14 without. Parsed in main by git-engine's **existing**
      hunk parser through a new `parseMultiFileDiff` entry point over the same `parseSection`, so
      a PR diff and a `git diff` agree about renames, combined hunks and the line cap by
      construction. Capped by bytes, preferring a file boundary (half a hunk is not a diff) but
      falling back to a whole-line slice for the two shapes that have no boundary — a one-file
      patch and a header-less one — because a cap that can be escaped is not a cap
- [x] New `mgit:forge:pull-comments` channel — `issues/{n}/comments` and `pulls/{n}/reviews`
      fetched concurrently and merged into one chronological thread in main, as a `ForgeComment`
      with a `kind` discriminator. A `PENDING` review and the empty `COMMENTED` shell around
      inline comments are both dropped: neither is a verdict anyone published
- [x] New `mgit:forge:pull-detail` channel (beyond the theme's spec) — `gh pr view --json` for the
      body, base branch, line counts, `mergeable` and the head sha, which no listing field carries
      and the Checks tab is built on. Its own channel rather than a widening of `listPulls`, which
      Theme B is rewriting
- [x] `ReviewView` rebuilt into a tabbed PR detail under `app/src/features/reviews/` — **Files**,
      **Conversation**, **Checks** — with `forge-detail.tsx`'s `ReviewView` reduced to a one-line
      delegation so the Reviews *view* (Theme A) mounts the same component
- [x] Files tab renders each changed file through the existing `DiffView`, first three expanded,
      matching the Changes page's accordion row rather than inventing a second layout. No
      `onExpandContext`: expanding context is a refetch, and `gh pr diff` has no per-file form
- [x] Conversation tab lists the merged thread read-only, markdown-rendered with no `rehype-raw`,
      review verdicts riding the same `StatusPill` the sidebar row uses
- [x] Checks tab mounts the Phase 19 `RunDetail` unchanged, resolving the PR's **head sha** against
      the cached run listing — no third subprocess, and correct after a force-push in a way
      branch-matching would not be
- [x] Handlers resolve owner/repo in main from `.git/config`; the renderer sends only a `repoId`
      and a PR number the schema bounds to a positive integer before it reaches a command line
- [x] Tests: `parseMultiFileDiff` (ordering, per-section classification, empty-section drop,
      per-file line cap), `parsePullDetail`/`parseIssueComments`/`parsePullReviews`/
      `mergeConversation`, `stripPatchPreamble` and `capPatch` under bare vitest; three new schema
      guards in `ipc.test.ts`; seven Playwright specs in `reviews.spec.ts` plus a
      `reviews-shots.spec.ts` producing the four committed screenshots

### Open

- The two human passes named in the phase's Verification list are Theme F's and D's, not this
  one's. Nothing from Theme C is left for a human.

## 2026-08-27 — Phase 20 · Themes A, B, D — Reviews view shell + PR list + syntax-highlighted diffs

Landed on `feature/phase-20-reviews-shell` (squash-merged locally — this checkout has no GitHub
remote, so there is no PR link). The first slice of Phase 20: Reviews grows from a sidebar-section
stub into a full nav-rail view with a real PR list, and every diff in the app gains syntax colour.
Themes C, E, F, G are separate, later slices.

### What landed

- [x] **Theme A** — `reviews` joins `ViewId`/`VIEW_IDS`; the rail gets a `FaCodePullRequest` item
      beside Tests' `FaCheckDouble`; `VIEW_FILTERS['reviews']` narrows the sidebar to Reviews +
      Worktrees, the same mechanism Actions/Tests already use. Actions and Reviews now share one
      `useForgeGateAvailable` gate (renamed from `useActionsAvailable`) since both ask the same
      "does this repo have a GitHub remote" question. The sidebar's Reviews section row now routes
      into the Reviews view instead of opening a workbench tab — the same move Phase 19 made for
      Actions runs, and it leaves the old `ReviewView`/`'review'` workbench-tab kind in place
      unrendered-but-reachable, exactly as Phase 19 did for `RunView`/`'run'`
- [x] **Theme B** — `listPulls` moves off `--state open` to `--state all`; `ForgePull` grows
      `mergedAt`/`closedAt`. `features/reviews/{reviews-view,reviews-list}.tsx`: status tabs
      (All/Open/Draft/Merged/Closed), an author filter (`MultiSelectMenu`, reused), a search box,
      all orthogonal (AND-combined), plus a "Load more" button — `gh pr list` has no cursor, so
      widening `limit` and refetching is the honest shape. No detail pane yet (Theme C); a row's
      click opens the PR on GitHub, matching the sidebar's own read-only Issues section
- [x] **Theme D** — `features/diff/line-highlight.ts`: per-line shiki highlighting, deferred
      through `requestIdleCallback` and cached module-level by `(path, line kind, line text)` —
      mirroring `services/avatars.ts` — so it never competes with the virtualized scroll path
      `outstanding.md` flagged as the risk when this was parked at Phase 12. `diff-rows.ts` grows
      `mergeSegmentsWithTokens`, intersecting the highlight tokens with the existing intraline
      diff segments as two independent partitions of the same line — syntax colour is the inner
      layer, the add/del tint stays the outer one. The shiki singleton itself moved out of
      `code-preview.tsx` into `lib/highlighter.ts` so the Files preview pane and diff rows share
      one engine instance. Applies to Changes and the Graph commit inspector by construction (one
      shared `LineRow`); Reviews' own diff surface gets it for free once Theme C lands

### One thing worth remembering

**shiki's instance `codeToTokensBase` does not auto-load a grammar**, despite its own type
declaration sitting right next to a *different*, module-level shorthand that does. Calling it for
a language shiki hadn't already loaded threw `Language 'typescript' not found` on every single
line, silently — the catch block swallowed it and every row just stayed unhighlighted, which reads
identically to "still scheduled" and cost real time to notice. The fix is the same on-demand
`loadLanguage()`-then-highlight two-step `code-preview.tsx` already uses for `codeToHtml`; worth
remembering that shiki's "shorthand" doc comments describe a sibling API, not the instance method
they're attached next to.

Also worth remembering for the next fixture author: the mock bridge stands in for the **preload**,
which only ever hands the renderer already-parsed domain objects (`gh-parse.ts`'s job) — a forge
fixture written in `gh`'s own raw JSON field names (`headRefName`, `author: {login}`) crashes the
renderer with "Objects are not valid as a React child" the moment a component reads the parsed
field name (`author` as a string) and gets the raw shape instead. `actions-view.spec.ts`'s `run()`
builder already gets this right; a new builder should be checked against it before assuming the
raw `gh --json` field names are the fixture's contract.

## 2026-08-27 — Phase 19 · Themes F+G — Tests discovery and execution

Landed on `feature/phase-19-tests` (squash-merged locally — this checkout has no GitHub remote, so
there is no PR link). The last two themes of Phase 19: the app looks at a repository's tests for
the first time, discovering what it can run and — once trusted — running it.

### What landed

- [x] `git-engine/src/tests/` — `discover.ts` reads `package.json` scripts, a package's `moon.yml`
      and the presence of `vitest.config.*`/`playwright.config.*`/`jest.config.*`/`cypress.config.*`
      across the workspace (npm/yarn `workspaces`, `pnpm-workspace.yaml`, or a bare single package),
      `classify.ts` sorts each candidate into unit/integration/smoke/e2e/lint/typecheck/other, and
      `discovery-cache.ts` memoises per repo on a short TTL. A moon project's standard tasks
      (`test`/`lint`/`typecheck`) route through `moon run <id>:<task>` rather than duplicating them
      as `pnpm run` suites; everything else stays a plain package-manager script
- [x] `shared/src/domain/tests.ts` + `mgit:tests:*` channels/schemas — discovery is `repoId`-only
      like `diagDetect`; trust and run take a `suiteId` and (for `trust`) a fingerprint of what the
      prompt showed, never a command — main always re-derives the argument vector itself
- [x] `desktop/src/main/process-runner.ts` — the diagnostics runner's spawn/deadline/`SIGKILL`
      engine, generalised out of `diagnostics/runner.ts` (now a thin eslint-shaped adapter over it,
      unchanged behaviour, its existing test suite green untouched) so `testing/runner.ts` can reuse
      it for suites. Also generalised: the kill signals the whole process group, not just the direct
      child — a test runner's own worker processes have to die with it
- [x] `desktop/src/main/testing/` — per-suite trust (`trust-store.ts`, widened from diagnostics'
      one-grant-per-repo to a map, because a repo's `test` and `e2e` scripts are different
      propositions), and `reporters.ts` reading vitest/jest's shared JSON shape and playwright's
      `stats` + nested `suites` shape — both write one blob at close, not a stream, so the runner
      streams raw stdout live for the output pane and parses the buffered blob once the process
      exits. An unrecognised runner is `structured: false` plus exit code and raw output
- [x] `features/tests/` — the Tests view (package → suite tree, suite detail with trust/run/cancel,
      live output, results), a sidebar section grouped by kind, `tests-store.ts` (per-suite live
      output and last-result-of-the-session), and `run-in-terminal.ts` (the `start-claude.ts`
      posture — types the command, does not run it, no new trust surface)

### One thing worth remembering

**`getByRole` found a `<TreeSection>` row I expected `inert` to hide.** Phase 16's own done.md entry
notes `<Collapse>` marks a folded section's content `inert`, which is what makes it actually
invisible to Playwright rather than merely a `toHaveCount(0)`-shaped illusion. The sidebar's Tests
section is folded by default and never toggled in the Tests-*view* specs, yet its suite rows still
resolved as buttons and collided with the main pane's identically-named ones — a strict-mode
violation, not a false pass, so it was caught immediately rather than shipped. Root cause not fully
chased down (possibly a mount-timing race before the `inert` attribute lands); the fix was giving
both panes `role="region"` landmarks and scoping every query through one, which is the more robust
answer regardless of the cause. Also worth remembering: `getByRole('button', { name: 'test' })` is a
case-insensitive **substring** match by default, and the new "Tests" sidebar toggle collided with an
unrelated `forge-issues.spec.ts` fixture whose CI job happens to be named `test` — fixed there with
`exact: true`, the same guard the spec already used for "Actions".

## 2026-08-26 — Phase 16 · Theme F (follow-up) — Coverage for the nav-mode lock

Landed on `feature/nav-mode-coverage`. Theme F shipped the locked/unlocked rail and it works,
but the behaviour itself was never asserted: the e2e only checked that the pin *appeared* once
Appearance had locked the rail, and `navMode` was the one Theme F field with no store test at
all — despite sitting in `partialize`, where a future edit could drop it silently.

### What landed

- [x] e2e — the pin's round trip, and the distinction that makes a lock a lock:
      `auto` hover-expands as an overlay (`--nav-offset` stays `3.5rem`), `expanded` is the only
      mode that moves content (`16rem`). The two rails render identically, so the custom property
      `AppFrame` publishes is the only thing that can tell them apart
- [x] e2e — unlocking lands on `auto`, never on `collapsed`: the pin is two-state by design, and
      nothing had held it to that
- [x] Three `ui-store.test.ts` cases — all three modes through `setNavMode`, the mode surviving a
      restart, and a stored payload that predates the setting merging to `auto` rather than
      booting someone into a rail they never locked

### Worth remembering

`openSettings` clicks the rail's own footer button, so the pointer is left sitting on the rail
and `auto` holds it hover-expanded — the "no pin at rest" assertion failed until the test moved
the mouse off first. A hover-driven rail makes the pointer's resting place part of the fixture.

Tests: `app:test` 513 passed; full e2e 192 passed / 8 skipped. Gate green.

## 2026-08-26 — Phase 16 · Theme F — Grouped settings navigation + the side-navigation control

Landed on `feature/sidebar-settings` (squash-merged — this repository still has no remote, so
there is no PR link). Follow-up scope on a phase that had already closed: the settings sidebar
Theme A built was a flat list of five words, and the store's third nav mode was reachable from
nowhere in the UI.

### What landed

- [x] `SETTINGS_GROUPS` — General / Tools / System — plus a `group` field on each
      `SETTINGS_PAGES` entry. One data change; every consumer of the flat list is untouched
- [x] The sidebar renders group-first behind collapsible headers on `@bilo-io/ui`'s `<Collapse>`,
      with `collapsedSettingsGroups` persisted. Stored as the list of *collapsed* groups, not a
      record of every group's state — the same inversion `collapsedNavSections` uses, which is
      what makes a group added later start open with no migration
- [x] One `react-icons/lu` glyph per page. The map lives in the view, not on `SETTINGS_PAGES`:
      putting React components in the store would make every consumer of a page id drag an icon
      package in behind it
- [x] Appearance gains a **Side navigation** control over `navMode`, and it is the only route to
      `collapsed` — the rail's own chevron is deliberately a two-state pin, `auto` ⇄ `expanded`.
      Both controls write the one field, so each reflects the other immediately
- [x] `Choice` takes an optional third element per option: a hint, rendered as the button's
      `title` and as a line under the selected row. "Auto / Locked open / Locked closed" cannot
      explain itself in three words, and one field-level hint cannot say it three ways. Omit the
      element and the control renders exactly as before

### Two things worth remembering

- **The nav had to widen, 11rem → 12rem.** A glyph plus its gap is ~22px, which is precisely
  what pushed "Monitor & Diagnostics" into an ellipsis. Caught from the regenerated Phase 16
  screenshot, not from a test — no assertion in this repo can see a clipped label. `truncate`
  stays as the backstop, and each page button now carries a `title`.
- **`<Collapse>` folds by animating a grid track to `0fr`, so a folded group's buttons keep
  bounding boxes of their own** — Playwright still calls them visible, and the first draft of
  the e2e spec asserted `toHaveCount(0)` and failed. What actually takes them out of the tab
  order and the accessibility tree is the `inert` attribute `<Collapse>` puts on the clipped
  region, so that is what the spec asserts. It is the stronger claim anyway: a regression to
  painted-but-focusable fails there, where a visibility check would not.

### Verification

- `moon run :typecheck :lint :test` green — 15 tasks
- Six new `ui-store.test.ts` cases: toggle, independence across groups, persistence,
  forward-compatible merge, and both directions of the page↔group integrity check (a page filed
  under a group no header declares renders nowhere, silently; there is no runtime check for it)
- Three new e2e specs in `settings-pages.spec.ts` — grouping and fold/unfold, a fold surviving a
  reload, and the nav-mode control agreeing with the rail's pin. Full suite: 191 passed
- `docs/screenshots/phase-16/settings-agent.png` regenerated — it is the shot that shows the
  grouped sidebar

## 2026-08-26 — Phase 19 · Theme D — The dashboard becomes a board

Landed on `feature/phase-19-dashboard` (squash-merged — this repository still has no remote, so
there is no PR link). The Dashboard rail item stops being a placeholder: it is a
`react-grid-layout` board over one repository, following the sidebar selection, with seven
widgets driven from a single registry.

This branch originally carried its own `gh issue list` — pulled forward so the Issues widget
would not have to wait for Theme C. C landed first, with a fuller version (run detail, logs,
`gh workflow list`, and a `--hostname` fix), so that commit was dropped on rebase and the widget
reads C's contract instead. Nothing of it survives here beyond the widget.

### What landed

- [x] `react-grid-layout` **v2** — not the v1 the phase doc was written against. `cols`/`rowHeight`
      moved into `gridConfig`, `draggableHandle` into `dragConfig`, and `WidthProvider` was
      replaced by a `useContainerWidth` hook that observes the CONTAINER rather than the window —
      which is precisely the responsive-container pattern the doc asked for, so it is used
      instead of the hand-rolled `ResizeObserver` wrapper that was written first and deleted
- [x] Its stylesheet retinted for theme tokens: the drop placeholder (shipped as `red` at 20%)
      and the resize handle (a base64 PNG of a grey corner), plus a reduced-motion opt-out
- [x] A widget registry — id, title, min size, and the **data source** each widget needs. One
      table serves rendering, the Add-widget menu and the availability gate
- [x] Per-repo layout, author filter and window in a new `dashboard-store.ts` on its own persist key
- [x] Per-tile ⋮ (Move up / Move down / Remove) and a board menu (add/remove, Reset layout).
      **Drag is not the only way to reorder**, and every tile is a `<section>` with an `<h3>`
- [x] Commit calendar, contributors, activity feed, open PRs, open issues, latest runs, repo health
- [x] The author filter is scoped **once**, in the view, and handed down — so the calendar, the
      feed and the contributor table cannot disagree about who is included
- [x] Widgets whose data source the repo lacks leave the board **and the picker**; a stale id in a
      persisted layout is skipped rather than crashing
- [x] `withChurn` is derived from the board, so a board with no widget that can show insertions
      never pays for `--numstat`
- [x] `MetricDial` and `RadialGauge` given their first callers — the two health figures that are a
      bounded fraction of a known total; the unbounded ones stay flat stat tiles
- [x] `docs/screenshots/phase-19-dashboard/*.png` — light, dark, author-filtered, widget picker

### Two bugs this found, and one thing worth remembering

- **A layout report must not delete what it did not mention.** The board renders only the widgets
  a repo can populate, and `hasForge` is false while the remotes query is in flight — so the
  grid's first `onLayoutChange` reports the stats widgets alone. `setLayout` replaced the stored
  layout wholesale and permanently deleted the three forge tiles a frame before the remotes
  arrived. It merges now. Found reviewing the diff; the regression test came second.
- **A disabled issue tracker is an answer, not an error.** `gh issue list` exits non-zero both for
  a switched-off tracker and for a bad credential. `issuesDisabled` keeps them apart, so a repo
  that tracks its work in Jira does not get a red failure card.
- **The heatmap ramp cannot be a theme token.** `--primary` is a near-black here (the same thing
  Theme A recorded about the sidebar toggle), and five alphas of a near-neutral give five greys.
  For a widget whose entire content is intensity that is not a styling preference — it is the loss
  of the only thing it says. The four steps are a data hue in `styles.css`, mirrored for dark,
  following the rule `metric-palette.ts` and `lane-colors.ts` already state.

Gate green: typecheck, lint, 1,190 unit tests, Playwright 170 passed / 8 skipped (rebased onto Theme C).
## 2026-08-26 — Phase 19 · Theme E — The Actions view

Landed on `feature/phase-19-actions` (squash-merged — this repository still has no remote, so
there is no PR link). Two panes: runs sectioned by workflow on the left, one run read in depth on
the right — facts, job/step tree, and the log of whichever job is selected.

### What landed

- [x] `features/actions/actions-view.tsx` — resizable two-pane, following the sidebar's repo
      selection, with an explicit Refresh and no polling
- [x] Runs sectioned under collapsible workflow headers, ordered by each section's newest run
- [x] Run detail: facts row, job tree with only the failed jobs expanded, per-step conclusions
      and elapsed times
- [x] `log-pane.tsx` — virtualised through `@tanstack/react-virtual`, `::group::` **and**
      `##[group]` folding, a truncation notice above the log, and a "Load the full log" escape
- [x] `ansi.ts` — sixteen colours, bold, dim, reset, resolved to theme-token pairs
- [x] Open-in-GitHub on the run, each job, and the workflow file; nothing here writes
- [x] `actions-store.ts` (selection, non-persisted) + `layout.actionsListWidth` (geometry, persisted)
- [x] 49 unit tests; 10 Playwright specs; `docs/screenshots/phase-19-actions/*` in both themes

Gate green: typecheck, lint, 1,247 unit tests, Playwright 188 passed / 8 skipped.

Four decisions, all taken before any code:

- **One place a run is rendered.** Phase 17 opened a run into a Changes tab because there was
  nowhere else for it to go. There is now, so the sidebar row selects the run and switches to
  this view. The `run` tab kind stays in `workbench-store` for any tab already open — it is
  simply never created again. Two surfaces rendering the same run differently, depending on how
  you arrived, is one surface too many.
- **One log fetch per run, split in the renderer.** `gh run view --log` prefixes every line
  `job<TAB>step<TAB>timestamp message`, so one subprocess serves the whole tree and clicking
  between jobs afterwards is free. The alternative — `--job <id>` per job — is a smaller payload
  per click and a subprocess per click, and a failed matrix run is exactly when you click a lot.
- **Folding changes which rows EXIST.** The pane virtualises, and a collapsed group left in the
  index space at zero height is a measurement that disagrees with the screen. `visibleRows`
  derives a fresh flat array from the fold state over the same parsed tree. Collapsed state is
  keyed on group **ordinal**, not label: a job's log routinely holds four groups called
  "Run actions/checkout@v4".
- **ANSI resolves to theme pairs, and the rest is removed.** A terminal's #cd0000 is unreadable
  on this ground; stripping colour altogether throws away what makes a failed vitest run legible.
  256-colour and truecolour sequences are *swallowed with their arguments* — reading `38;5;196`
  as three codes would paint the rest of the line at random. Carriage returns resolve to the last
  pass, so one npm install is one row rather than forty.

Two bugs the specs caught, both worth remembering:

- **A zustand selector that builds a value is a render loop.**
  `(s) => s.collapsedWorkflows[repoId] ?? []` returns a new array every call, and
  `useSyncExternalStore` compares snapshots by identity — so React reported "The result of
  getSnapshot should be cached to avoid an infinite loop" and *stopped rendering the subtree*.
  The view was blank with no error. Select the record, index it outside.
- **`=== null` is not a null check for anything a fixture built.** `RunHeader` read
  `run.headSha.slice(0, 7)` behind `run.headSha === null`. Through the real IPC path every
  payload is schema-parsed and that guard holds; a hand-built e2e fixture is under no such
  obligation, `undefined === null` is false, and the missing field took the whole view down.
  The renderer should not be the layer that trusts this.

The self-review pass found nine more. The one that mattered most was a **regression**: the run
row set the run but not the *repository*, and the view follows `selectedRepoId`. Every repo card
is expanded by default, so the row is clickable while another repo is selected — the view then
opened on that repo's runs with the clicked run nowhere in it, and if it had no GitHub remote the
rail hid Actions and `app.tsx` bounced to Graph. The workbench tab this replaced carried its own
`repoId`; removing the tab lost it.

Two more made the log actively lie, and both trace to the same thing — **a truncated log is two
windows that were never adjacent**:

- The gap marker main splices in has no `job<TAB>step<TAB>` prefix, so the parser filed it under
  `preamble`, which nothing renders. A capped log read as a complete one. It is a `gap` node now,
  always visible and never foldable, and `logGapMarker`/`isLogGapMarker` moved into
  `@midnite/git-shared` so the writer and the reader share one definition — with a round-trip
  test that says so rather than two regexes agreeing by luck.
- Folding ran over the concatenation, so the head window's dangling `##[group]` absorbed every
  tail line — including the failure the log was opened for — under the wrong header, where
  "Collapse all groups" hid it completely. Each window folds on its own now.

The other six, briefly: `ESC[?25l`/`ESC[?25h` (cursor hide/show — npm, pnpm, every CI spinner)
carry a *private* parameter byte that `[0-9;]` does not match, so they rendered as literal
`[?25l`; the log pane's fold state is keyed on the job, since group *ordinals* carried across
jobs fold unrelated groups; "Load the full log" blanked the pane, because the capped and
un-capped keys differ by design and a second query cannot bridge them (`placeholderData` can);
a stored job is now honoured only if it exists in the current run, which changes without anyone
selecting one; `full` is stored with its run id rather than reset in an effect that lands a
render *after* the query has already fired at the new run; and a running run no longer reports a
duration, since `updatedAt` is the last state change and is non-null mid-flight.

**Not covered, deliberately stated:** the two-repo case behind the first finding has no e2e test.
`mock-bridge.ts` serves a single hard-coded repository, and widening it would touch every
existing spec's fixture shape — a change worth making on its own, not inside this theme.

Also noted while landing: each pane is now a named landmark (`Workflow runs`, `Jobs`, `Run
detail`, `Job log`), and the job status pill moved *outside* its button. Both started as test
ergonomics — four panes rendering buttons called "CI" made every locator ambiguous — and both
are the accessible thing to do anyway. A status is a reading of a job, not part of what the
control does.

## 2026-08-26 — Phase 19 · Theme C — Forge: issues, run detail and logs

Landed on `feature/phase-19-forge` (squash-merged — this repository still has no remote, so
there is no PR link). Three more `gh` calls behind the wrapper Phase 17 built, the four channels
that carry them, and the one sidebar surface they make possible.

### What landed

- [x] `listIssues`, `runDetail`, `runLog` and `listWorkflows` in `gh-cli.ts` — same login-shell
      wrapper, `GH_PAGER=cat`, `shellQuote()` and `ghStatus()` gate. No new subprocess path
- [x] `parseIssueList`, `parseRunDetail`, `parseWorkflowList`, `parseRunLog` and
      `isIssuesDisabled` in `gh-parse.ts`, total over `unknown` like their siblings
- [x] `ForgeIssue`, `ForgeLabel`, `ForgeStep`, `ForgeJob`, `ForgeRunDetail`, `ForgeRunLog` and
      `ForgeWorkflow`, each in the `{cli, …, error}` envelope
- [x] `mgit:forge:{issues,run-detail,run-log,workflows}`, all read-only, all `repoId`-keyed
- [x] `ForgeRun` grows `event`, `workflowId`, `workflowName`, `startedAt`, `updatedAt`,
      `displayTitle`, `number`, `attempt` — every one nullable, so Phase 17's payloads still parse
- [x] An Issues sidebar section beside Actions and Reviews; run rows grow a disclosure chevron
      that peeks at the job tree in place
- [x] Unit tests over captured `gh` output; five Playwright specs over the new surface

Gate green: typecheck, lint, 1,144 unit tests, Playwright 160 passed / 4 skipped.

Four decisions worth carrying forward:

- **The field set was read off the installed `gh`, not assumed.** `gh run list --json` publishes
  no `actor` at any version, and an unknown `--json` field makes the whole call exit non-zero
  rather than degrade one column. Guessing here would have taken the Actions section down for
  everyone. `ForgeRun` therefore has no actor to fill — worth knowing before Theme E designs a
  run row around one.
- **"Issues are off" is a field, not an error string.** `gh issue list` exits non-zero for a
  repository with its tracker disabled, and that exit is the *only* signal — no payload, no
  distinct code. So the message match is load-bearing, and it degrades to an ordinary error
  rather than to a silent empty list. Theme D reads `disabled` to drop its Issues widget entirely.
- **Only completed runs are cached.** A completed run is immutable, an in-flight one is the
  opposite; the LRU is capped at 20 because these are the largest payloads the app holds. Logs
  need no status check at all — GitHub does not serve one for an unfinished run, so a log we
  managed to fetch is by definition final.
- **Grouping is by `workflowId`; the `.yml` path is a separate, lazy call.** No run-list field
  carries a path, so `gh workflow list` is a second subprocess — paid only when something needs
  to *link* to a workflow, never to render a list.

A self-review pass found ten things, two of which would have shipped broken:

- **`--hostname` is not a flag on any of these subcommands.** It reads like the flag for
  "target this Enterprise host" and is not one — `gh issue list --hostname x` exits with
  `unknown flag`, as do `run list`, `run view`, `pr list` and `workflow list`; it belongs to
  `gh auth` and `gh api`. This was **pre-existing in `listRuns`/`listPulls` since Phase 17**, so
  every forge section has been broken for GHES remotes all along and nobody had one to notice
  with. The supported form is `--repo [HOST/]OWNER/REPO`, and `hostFlag` is now `repoFlag`.
- **An exit code is the failure signal; an empty string is not.** `gh run view --log` prints the
  job logs it *did* fetch before exiting non-zero over the ones it could not, and the 60s
  timeout kills it mid-stream the same way. Believing non-empty stdout cached a half-log as
  `complete: true` — the silently-short log `ForgeRunLog` was shaped to make impossible. The
  rule is now `logVerdict`, pure and unit-tested, reading its verdict off stderr.

The other eight, briefly: `full: true` was returning the first 8MB and no tail, dropping the
failure that is the reason anyone opens a log; one unparseable step deleted its whole job,
because zod fails an object over a single bad array element; `ForgeRunStatus` was missing
`waiting`/`requested`/`pending`, so a job held by an environment protection rule — the one job
worth seeing — was the one that vanished; `runInShell` buffered a log twice; `describeFailure`
could render a whole JSON payload into a sidebar note; the job peek claimed "no jobs" for a
signed-out `gh`; `gh workflow list` was silently stopping at its default of 50; and twenty
expand chevrons were all called "Jobs in CI".

Two smaller things the work shook out. `runInShell` now keeps stdout and stderr apart as well as
combined: a log has no brace for `parseJsonPayload` to seek past, so a chatty `.zshrc` would
otherwise be interleaved into the text the user reads. And `runStatus` split into
`outcomeStatus(status, conclusion)` so a job borrows the run's conclusion→colour mapping instead
of growing a second opinion about whether `cancelled` is red.

## 2026-08-26 — Phase 18 · Theme F — The diagnostics segment, its trust prompt, and a settings page

Landed on `feature/phase-18-diag-ui` (squash-merged — this repository still has no remote, so
there is no PR link). The footer's right cluster gains a segment for the selected repository's
error and warning counts, opening into a flyout that lists them as `file:line`. Getting there
means passing the app's first consent gate: the dialog shows the literal command and the
directory it will run in, says why that command was proposed, and warns that this executes a
program from the repository itself.

### What landed

- [x] Trust prompt through `confirm-dialog.tsx` in `danger` mode — literal command, resolved
      workdir, detector evidence
- [x] Error/warning pills on `--destructive` and `--health-warn`, semantic tokens rather than the
      monitor's data hues
- [x] **Absent ≠ zero** — a trusted-but-unmeasured repo says "not measured", never a green zero
- [x] The segment follows `useActiveWorktree()`, not the workbench tab
- [x] The flyout caps its list and says what it withheld (Phase 17's `EXPAND_ALL_LIMIT` rule)
- [x] An untrusted repo shows "Enable diagnostics" rather than silence
- [x] A Monitor & Diagnostics settings page: which metrics appear, the closed-flyout cadence, the
      trusted command, and revocation
- [x] Re-running is manual — nothing lints because a file changed
- [x] `docs/screenshots/phase-18/diagnostics-{trust-prompt,flyout}.png`

Gate green: typecheck, lint, 1,105 unit tests, Playwright 155 passed / 4 skipped.

What this shook out — nearly all of it from **integrating F against the Theme E that actually
landed**, rather than the one F was written against:

- **A shim that documents its own deletion still has to be deleted.** F was built in a parallel
  session against `contract-shim.ts`, a restatement of E's contract whose docblock said every
  type in it dies when E merges. E merged; the shim did not. Because it reached the bridge
  through one `as unknown` cast, **the whole feature typechecked while talking a shape the
  renderer never receives** — `rule` for `ruleId`, `line: number | null` for a `number` where `0`
  means file-level, a `workdir` on the trust record that E deliberately does not carry. A cast is
  what let a compile-time guarantee become a comment.
- **A rebase can merge two implementations of the same key and pick one silently.** Both E's
  `diag` mock and F's landed in the same object literal in `mock-bridge.ts`, along with two
  `diagnostics?` fixture blocks in the same type. The second `diag` won at runtime, so every F
  spec was driving F's stand-in and none of them touched E's. Duplicate keys in a JS object are
  legal; that is the whole problem.
- **The evidence line in the consent dialog had never once rendered.** Detection was enabled only
  for `no-command`, and the prompt that quotes evidence is reached from `untrusted` — so "Proposed
  because: …" was unreachable in exactly the state that shows it. It now detects for every arm
  except `trusted` (the steady state still stats nothing), and matches evidence to the command
  being approved by `commandFingerprint`, so a repo whose detected command differs from its stored
  one cannot cite one's reasons for the other.
- **An absent `blastRadius` is not "no blast radius" — it is "still counting".** `ConfirmDialog`
  renders "Checking what this affects…" for `undefined`, so the diagnostics prompt carried a
  sentence that would never resolve. The type already documented `null` as "nothing to lose";
  the caller simply had to say so.
- **The consent dialog was collapsing the newline that separated the command from its directory.**
  `node_modules/.bin/eslint . --format json in /tmp/midnite-git` reads as one string — precisely
  the ambiguity a prompt asking to execute something must not have. The body is
  `whitespace-pre-line` now.
- **`min-w-0 flex-1` does not stop a long token overflowing its box.** A repo-relative file path
  is unbreakable, so it ran *underneath* the rule id in the next column. Only the screenshot
  showed it; every assertion about the row passed.
- **A fixed epoch in a screenshot fixture ages.** The flyout's shot read "Measured 24366 hours
  ago", which is what `ranAt: 1_700_000_000_000` becomes three years later.


## 2026-08-26 — Phase 19 · Theme A — The nav rail becomes the app's table of contents

Landed on `feature/phase-19-nav-shell` (squash-merged — this repository still has no remote, so
there is no PR link). `ViewId` grows from four to seven: **Dashboard**, **Actions** and **Tests**
join Files, Graph, Changes and Settings. Dashboard renders through **`NavConfig.pinned`** — the
shell's own ungrouped slot above the sections, documented in its type as being for exactly this —
so no shell change was needed. Tests takes `FaCheckDouble` from `react-icons/fa`, a second icon set
in the rail on purpose.

**`viewForPath` became a lookup over `VIEW_IDS`** rather than a chain of comparisons. The chain
answered `graph` for anything it had not been taught, so three new views would have meant three
rail links that all looked like the graph — and nothing would have failed to compile.

**One table now reshapes the sidebar, on two axes.** `features/repos/view-sections.ts` holds
`VIEW_FILTERS: Record<ViewId, ViewFilter>`, where a filter says which `SectionKey`s render AND
whether clean checkouts are dropped. Actions → `['actions','worktrees']`, Tests →
`['tests','worktrees']`, everything else → work-in-progress. Phase 17's `use-dirty-filter.ts` is
deleted: it was the first instance of this idea and is now just the `changes` row. Keeping both
axes in one hook is what makes "Show all sections" a real escape hatch — it has to put back the
ref sections *and* the clean checkouts, or it only half works.

`SectionKey` gained `actions`, `reviews` and `tests`, and `ForgeSections` takes the visibility
predicate as a **prop** rather than reading the view itself — one answer to "which sections does
this view show", not two free to disagree. A narrower `RefSectionKey` keeps `sectionMenu`'s
parameter honest: it has nothing to offer a forge or test section, and widening it would have
traded a compile error for a menu that opens empty.

**Actions hides itself when `pickForgeRemote` finds no GitHub remote**, and standing in it when
that happens redirects to Graph. The availability probe holds its **last** answer while remotes
load — including across a repo switch. That held answer is knowingly about a different repository:
it is wrong for at most one paint, whereas a cold "no" would be wrong for the same paint and take
the view down with it.

The narrowing toggle is persisted per view in `ui-store.sectionFilters`, a sparse map so a view
added later starts from its own default rather than a stale `false`.

**The e2e suite was un-rotted on the way through.** `graph-themes.spec.ts` had twelve tests failing
on `main` for two Phase 16 changes it was never updated for: Settings became a footer *button*
rather than a link, and the style picker moved onto a Settings **page**. Because `settingsPage`
persists, *which* tests failed moved with test order — the "cross-test ordering" the 30s timeouts
were masking. 6.4 minutes red → 25 seconds green. Ten new `nav-shell.spec.ts` specs cover the rail,
the gating, the narrowing, the escape hatch and the redirect; the repositories `<aside>` gained an
`aria-label` because AppFrame's rail is an `<aside>` too and two unlabelled ones are ambiguous.

**Left open:** the toggle's *visual* on-state. `--primary` is a near-black within a point of
`--muted-foreground`, and `bg-accent` / `bg-primary/10` both resolve to alpha ≈0.03, so the tint
Phase 17 shipped has never read. `aria-pressed` and the label carry the state and are asserted;
the colour belongs with the appearance tokens, not the nav shell.

## 2026-08-26 — Phase 19 · Theme B — Repository statistics from one history traversal

Landed on `feature/phase-19-stats` (squash-merged — this repository still has no remote, so there
is no PR link). The dashboard Theme D will build needs seven numbers about a repository's history;
this is the layer that produces all of them from **one** `git log --all` pass. On any real
repository the traversal is the entire cost and the arithmetic afterwards is free, so seven
widgets each shelling out would have been seven times slower for exactly the same information.

**The traversal.** `commit-history.ts` walks `--all` (a contributor table that omits everyone
whose work sits on a branch is simply wrong) with `--use-mailmap` always on — the flag has shipped
since git 1.8.2 and dugite bundles the binary, so the "if available" hedge in the plan was
guarding against a git we do not ship. Records are framed by a **sentinel**, not `-z`: with
`--numstat` git interleaves plain file lines between commit records, and `-z` removes the very
newlines that would distinguish a header from a file line. It asks for one commit more than the
cap so "exactly at the cap" and "there is more" stay distinguishable.

**Churn is opt-in**, and that turned out to be the most consequential decision in the slice.
`--numstat` makes git diff every commit against its parent rather than just read commit objects,
which on a large repository dominates everything else put together. A board with no churn widget
on it now pays nothing for one.

Three aggregators, each with a trap the obvious implementation falls into:

- **The calendar buckets in the reader's local timezone.** `%at` is a UTC epoch and a heatmap cell
  is *a day in the life of the person looking at it*. A commit made at 00:30 on the 6th in Berlin
  is 23:30 on the 5th in UTC — bucket it as UTC and the square lights up on a day that person had
  not started yet. The error is small, systematic, and lands precisely on the late-night commits
  people remember making. The zone is an **explicit parameter** rather than an ambient read, which
  is what makes it testable: mutating `process.env.TZ` mid-run is unreliable because V8 caches the
  resolved zone, and it cannot express "these two zones disagree about this instant", which is the
  only assertion worth making. Bucketing happens first and gap-filling second, so the
  daylight-saving case is correct for free — once a commit is a `YYYY-MM-DD` string, a 23-hour day
  is not a thing that can be miscounted.
- **Contributors aggregate by email and display the most recent name.** Keying on the display name
  is the obvious implementation and it splits one person into three entries that each look like a
  stranger, none of whom did enough work to appear near the top. Showing the *first* name seen is
  the other half of the trap: the table goes stale the moment anybody updates their git config.
- **Churn ranks by commits that touched a file, not by lines changed.** A lockfile rewritten once
  inside a 90,000-line diff tops any line-based ranking while telling you nothing; the file thirty
  commits have had to touch is where the work actually is. Binary files stay `null` rather than
  flattening to 0 — `-`/`-` means "not expressible in lines", and summing it as zero would drop a
  40MB asset from the table while claiming it never moved.

**Health counts stale-by-age and already-merged separately**, because they answer different
questions — "nobody has touched this in three months" and "this is already in the default branch,
so deleting it loses nothing" — and a branch can be either, both or neither. Collapsing them would
bury the actionable case inside the merely quiet one. "Merged into" resolves against `HEAD` rather
than guessing at `main`/`master`, and the current branch is excluded so every repository does not
report at least one deletable branch.

**The cache is keyed on a digest of every ref tip, not on HEAD.** The traversal is `--all`, so a
`git fetch` that moves `origin/main` changes the contributor table while HEAD stands perfectly
still — and a HEAD-keyed cache would serve the pre-fetch answer indefinitely. That failure is
invisible: the numbers look entirely plausible, they are just from before. A TTL sits alongside
the digest for the two things refs cannot see, a `git gc` changing the size figure and the passage
of time turning a fresh branch stale. Clock and ref-reader are injected, so the whole module stays
`electron`-free and runs under bare vitest.

`mgit:stats:summary` takes a **`repoId` only**, never a path — main resolves the checkout through
`resolveWorkdir`, the same rule `forge-handlers.ts` and the diagnostics channels follow. The row
cap and the timing budget surface as `truncated` in the envelope rather than quietly shortening a
year, so every widget can say "showing the last N" instead of presenting a fragment as the whole.

One naming collision worth recording: `commands/log.ts` already exported a `parseNumstat`, for the
`-z` form. This one is line-oriented and keeps binary counts as null, so it is
`parseNumstatLines` — two parsers for one flag, because they genuinely read different output.

Verification: `moon run :typecheck :lint :test` green (15 tasks). 70 new git-engine tests over the
parsers and aggregators — including the timezone bucketing in three zones, rename paths in both
git spellings, binary `-`/`-` rows, and the cache's ref-digest and LRU behaviour — plus 8 new
shared schema tests. No screenshots: Theme B is engine-only and renders nothing.

## 2026-08-26 — Phase 18 · Theme E — The diagnostics trust boundary, detector registry and runner

Landed on `feature/phase-18-diagnostics` (squash-merged — this repository still has no remote,
so there is no PR link). This is the first place Midnite Git executes a binary that belongs to
the **repository** rather than to us. Every other subprocess in the app is bundled git, a
binary found on the PATH a login shell builds (`gh`, `claude`), or the user's own shell at
their explicit request. `node_modules/.bin/eslint` is none of those: it arrives with the
checkout, and opening a folder to read its history is not consent to run code out of it. So the
policy is **written down**, in a docblock at the top of `main/diagnostics/index.ts`, the same
treatment the fs jail gets in `channels.ts` — rather than left implicit in a commit message.

**The seven rules.** Opt in per repository, never globally. The grant names the exact command.
Main never takes the renderer's word for what to run. Detection proposes, never invents.
Arguments, not a shell. Never on a timer and never on a file change. Fail soft, always.

**Trust is granted to a repo *and* a command together.** `trust-store.ts` records a
`commandFingerprint` — the NUL-joined `[parser, command, ...args]`, NUL for the same reason the
git parsers are — not a boolean. Editing the configured command therefore withdraws the grant,
because the sentence the user agreed to had the old command in it; a grant that survived an edit
would let a repository escalate by rewriting its own config. That makes `command-changed` a
distinct state from `untrusted`: identical to a state machine, completely different to a person.
First per-repo persisted config in the app — every setting before it was global — so `trust.json`
is a map from repoId to a record with room for more than trust. The userData dir is injected, so
the module carries no `electron` import and tests run against a temp dir.

**The detector registry is ecosystem-open and parser-gated.** The obvious shape — "look for
node_modules/.bin/eslint" — is wrong, because a repository opened in this app is as likely to be
Go with a Makefile, a language-agnostic `moon.yml`, dotnet, python, or C++. So a detector is a
pure function with a stable shape and adding Go is one object plus one parser module. The gate is
the honest half: a candidate naming a parser this build cannot read is **dropped**, so a C++ repo
proposes nothing rather than proposing `make lint` whose every run would come back `parse-failed`
— a feature that looks enabled and reports nothing. Candidates are ranked (flat config outranks
`.eslintrc`, because eslint 9 reads it in preference) and carry the `evidence` that made the
detector fire, so the trust prompt can say *why* a command is offered.

**The eslint parser streams.** One top-level array element at a time, so peak memory is bounded
by the largest single file result rather than by the payload — a checkout mid-refactor can emit
tens of megabytes for a result we reduce to two integers and a few hundred rows. Total about
messages (an unknown severity is dropped, never promoted) but **strict about the array**: output
that does not begin with `[` is `parse-failed`, not an empty success. That distinction is the
point — a command that errored must never be indistinguishable from a clean repository. Counts
are always complete; rows cap at `DIAGNOSTICS_ROW_CAP` (500) with a `withheld` count, and the cap
**favours errors**, because file-order truncation would let ten thousand warnings in one file
bury every error in the repo.

**The runner spawns an argument vector with no shell anywhere**, on a deadline enforced by a
SIGKILL timer (a wedged linter is precisely the process that ignores a polite signal), with
`NO_COLOR=1` and stdin `ignore` so a tool that decides to prompt gets EOF. It **ignores the exit
code** when the report parsed: eslint exits 1 whenever it found a single error, which is the
normal case here, and reading the code would make a repo with problems report nothing at all.

`diag-handlers.ts` is the enforcement point: `run` refuses without a live grant, and `trust` only
records commands main itself proposed — re-derived from detection, compared by fingerprint. Self
review moved that check into `isProposedCommand` as a pure function, because it was the most
security-relevant line in the diff and living inside an electron-importing handler made it
untestable; six cases now cover the ways a renderer could try to widen a grant.

Contract: `mgit:diag:{trust-status,trust,untrust,detect,run}`, each taking a **`repoId` only** —
the working directory comes from `resolveWorkdir` and the command from main's own store. Reason
codes `no-command | untrusted | not-installed | timed-out | parse-failed`, all fail-soft; nothing
throws across the boundary. The renderer caches results via react-query with `staleTime: Infinity`
and no automatic refetch — main stays stateless, because a lint result read from disk at boot
describes a working tree that has since changed, and would be stated with the same confidence as
a fresh one.

Verified end to end against this repository's own eslint: the detector found `eslint.config.mjs`
plus the local binary, the runner streamed, and the parser returned three real errors with
repo-relative paths. 53 new tests (trust-store 14, detect 16, parse-eslint 19, runner 10),
`moon run :typecheck :lint :test` green at 961 across four packages.

**Known limitation, deliberate:** the channels take a `repoId`, and `resolveWorkdir(repoId)` with
no worktree argument resolves the **main** worktree. A linked worktree selected in the sidebar
will therefore be linted in the main checkout. This is what the phase doc specifies; widening it
to an optional, `git worktree list`-validated `worktreePath` is a small follow-up rather than a
redesign, and is noted for Theme F to raise.

## 2026-08-26 — Phase 16 · manual verification — Phase 16 complete

The two real-app passes the phase had been holding open were run by the user and both pass:
browsing this repository (ignored entries dimmed, `node_modules` costing nothing until expanded,
`.ts` highlighting, `README.md` rendering with a working source toggle, a png/mp4/pdf displaying
in-pane, the >1.5 MB and binary fallback cards, and nothing anywhere offering to edit); and the
Agent page (the `~/.claude` tree, the real installed version, Update streaming to completion, and
Uninstall pasting into the terminal **without** executing). Phase 16 is now 36/36 and ✅ DONE —
its five themes had already landed on 2026-08-26.

## 2026-08-26 — Phase 18 · Themes A + B + C + D — The footer's right half becomes a live system monitor

Landed on `feature/phase-18-monitor` (squash-merged — this repository still has no remote, so
there is no PR link). The footer bar had looked the same since Phase 9: 24px of `border-t
bg-card/50` holding a terminal toggle, a branch name, ahead/behind arrows and a changed count —
every one of them a left-aligned flex child under a single `gap-3`, with no `ml-auto` anywhere,
so the entire right half was empty. It now carries CPU, RAM, GPU and disk as a coloured dot, a
percentage and a sparkline, opening into a flyout of area-chart timelines. E and F (the
diagnostics segment and its trust boundary) are untouched.

**Theme A — four probes in main, each a pure parser behind a thin `execFile`.**

- `cpu.ts` — `os.cpus()` reports **cumulative counters since boot**, so a single read says nothing
  about now; usage only exists as `1 - idleDelta/totalDelta` between two snapshots. The first call
  returns `undefined` rather than a fabricated zero, and a counter that went backwards (a sleep,
  a changed core set) is `undefined` too — a difference that is not a rate.
- `memory.ts` — **not `os.freemem()`**, which on macOS counts the file cache as free and reads
  99% used on an idle 32 GB machine. Activity Monitor's own sum instead:
  `max(anonymous - purgeable, 0) + wired + compressed`, over `/usr/bin/vm_stat`. The page size is
  read from the `page size of (\d+) bytes` header rather than assumed — Apple Silicon uses 16 KiB
  pages, so a hardcoded 4096 under-reports by exactly 4×. Any parse failure degrades to
  `os.freemem()` rather than reporting nothing.
- `gpu.ts` — `/usr/sbin/ioreg -c IOAccelerator` matched for `"Device Utilization %"`, the same
  counter Activity Monitor graphs, and deliberately **not** `powermetrics`, which needs sudo. Takes
  the busiest accelerator rather than the first in registry order. **Self-disables after three
  consecutive failures and logs once**; a single good read clears the streak, so a transient spawn
  failure under load does not retire the probe for the session.
- `disk.ts` — `fs.statfs` capacity, **not throughput**. `bavail` not `bfree`, and denominated
  against `used + available` rather than the raw volume size, so the gauge agrees with the
  percentage printed beside it.

`metrics-service.ts` keeps **one** interval however many `start`s arrive (each cadence change is a
fresh one), `unref()`s it so main can still exit, collapses concurrent probes onto a single
in-flight promise (`ioreg` under load outlasts a 2s tick, and without the guard they stack), and
reads disk once every ten ticks rather than every tick. Sampling stops outright on blur, hide and
minimize. No probe module imports `electron`, so all of it runs under bare vitest.

**Theme B — the contract.** `MetricSample` has **every metric optional**, which is the whole
design: a GPU whose counter cannot be read is *omitted from the payload*, so "not readable here"
and "0%" stay different answers all the way to the chart. A flat zero line is a lie about a
working GPU. Cadence crosses IPC as a **re-sent `start`** rather than its own verb — one channel,
no extra schema, and main clamps the interval rather than trusting it (the floor exists because a
renderer bug asking for 10ms would fork-bomb the machine with `ioreg` spawns).

**Theme C — the store and the drawing.** Points are `{value, at}`, not bare numbers, and the
window is evicted **by time** (five real minutes) rather than by count — a fixed sample count
would silently become 2.5× longer in wall-clock terms whenever the flyout closed. The first
sample seeds a **flat pair** so a new series draws a straight line at its true value instead of
ramping up from an implicit zero, which reads as a load spike that never happened at exactly the
moment someone looked. `metric-path.ts` has no y-scaling pass at all — the 0–100 domain is fixed
by the contract, so two screenshots a minute apart are comparable — and spaces points by index,
with `cadenceBreaks()` finding where the interval changed so the chart marks it with a dashed
rule instead of drawing a 5s gap as though it were a 2s one. Colours are raw HSL triples per the
`lane-colors.ts` policy (metric colours are *data*, with no semantic role; the diagnostics counts
in Theme F are the opposite case and will take tokens), with muted and fill variants derived
rather than hand-tuned twice. Charts are hand-rolled despite `@bilo-io/ui` shipping an unused
`AreaChart`, consistent with the app hand-rolling its tab strip, tooltip and theme toggle.

**Theme D — the cluster and the app's first popover.** `components/popover.tsx` is genuinely new:
`tooltip.tsx` is hover-triggered and `pointer-events-none` so it cannot host a chart, and
`context-menu.tsx` is item-list shaped. It reuses their portal-and-clamp mechanics and adds
click-toggle, a focus trap, outside-click and capture-phase-scroll dismiss, and focus returned to
the trigger on close — extracted as a shared primitive because Theme F's diagnostics flyout and
Phase 17's checks-verdict indicator both want exactly this. The cluster takes **slots** rather
than a fixed list of four metrics, so those arrive as children rather than as a restructuring of
whatever got there first. A metric that is null renders **no readout at all** — no dot, no dash,
no zero. Disk gets a gauge instead of a fourth timeline, because a capacity line is flat for hours
and drawing it as one would imply movement that is not there.

**A latent e2e bug this uncovered.** `mock-bridge.ts` reported `windowChrome.frameless: false`,
which is not what ships on macOS. `AppFrame` only sets `--titlebar-h` when it draws the chrome
itself, and `app.tsx` sizes its content box `calc(100vh - var(--titlebar-h, 0px))` — so with a
framed window the box claimed the full viewport height starting 40px down, and **every spec had
been running against an app whose footer sat entirely below the fold**. Nothing failed, because
`toBeVisible()` asks for a non-empty box rather than one inside the viewport; it only surfaced
when a spec first tried to *click* something down there.

Twelve Playwright specs (including the phase's screenshots) plus 42 unit tests in desktop and 35
in app. `moon run :typecheck :lint :test` green.

**Left open:** the three human passes the phase doc names — cross-checking CPU/RAM/GPU against
Activity Monitor on Apple Silicon, and an hour's idle battery cost confirming the blur pause
really stops the `ioreg` spawns. Also noted while here: `graph-themes.spec.ts` has twelve
pre-existing failures on `main`, unrelated to this phase — its `chooseTheme` helper still reaches
for `getByRole('link', {name: 'Settings'})`, which Phase 16 turned into a bottom-pinned rail
button. Fixing that locator alone makes it worse (twenty failures), because the suite also has
cross-test flake underneath, so it is left for whoever owns Phase 14's specs.

## 2026-08-26 — Phase 12 · Themes C + F — Ref badges as controls, graph row polish

The chip stopped being a label. A branch that is ahead or behind expands on hover into the
buttons that fix it; the checked-out one glows; and the same four verbs appear in its context
menu, rendered from the same derived array so the two surfaces cannot disagree.

### Theme C — ref badges as a control surface

- [x] `features/graph/ref-sync.ts` — `syncActions(ref, currentBranch, remoteNames)` returning
      push/pull/publish/fetch with enablement and reason already resolved; pure + unit-tested
- [x] `isHead` glow: a still halo plus a gradient border sweeping over it (`lane-sweep` keyframe,
      `background-position` on a masked 200%-wide gradient — a conic one re-rasterises per frame)
- [x] Hover-expand strip of `IconButton`s, ↓ pull / ↑ push, with the real counts in the label
- [x] Native `title=` replaced by the `Tooltip` component; upstream state laid out, not crammed
- [x] `refMenu` gains Push / Pull / Fetch / Publish, disabled items carrying their reason
- [x] `useFetch`/`usePull`/`usePush` take an optional `SyncScope {remote, branch}`; the title-bar
      cluster passes none and keeps acting on HEAD
- [x] In-flight state per ref+verb, so one badge spins and the rest stay live
- [x] `e2e/ref-sync.spec.ts` — ten specs over the four upstream states

### Theme F — graph row polish

- [x] Selected row: a bar at the left edge in the row's own lane colour, plus a full-strength
      tint (it was `bg-accent/70` against a `bg-accent/30` hover)
- [x] Lane palette retuned for colour-vision deficiency; `lane-contrast.test.ts` measures it
- [x] `laneInk` flips on measured WCAG contrast rather than on HSL lightness
- [x] Chips cap at 60% of the column when two share it, so the shorter name survives
- [x] Row density (`comfortable`/`compact`) as a second axis, with a Settings picker
- [x] The working copy as the row above the first commit — dashed node, dashed lane, italic count

Landed on `feature/phase-12-land` (squash-merged — this repository still has no remote, so
there is no PR link). The unit gate is green and the Playwright suite runs 137 passed / 4 skipped,
with four new screenshots under `docs/screenshots/phase-12-badges-rows/`.

What this shook out:

- **A palette with a flat lightness profile is inaccessible by construction.** Every lane sat
  inside a 0.63–0.77 band of perceptual lightness. That looks tidy, and it is exactly the
  failure: red–green deficiency collapses hue, so two equally-light lanes have nothing left to
  separate them. Simulated protanopia put violet and indigo 0.0097 apart in OKLab — one colour.
  The retune spreads lightness deliberately; the worst pair under any simulated deficiency is
  now 0.068.
- **`laneInk` was flipping on the wrong axis, and its test agreed with it.** HSL lightness is
  not how light a colour looks: at `l: 48%` the cyan is the brightest thing in the palette and
  was being given white text, while the violet at `l: 57%` got dark ink. The old test restated
  the same `l >= 58` rule, so it passed. Comparing real contrast ratios removes the threshold.
- **An overlay inside the row is clipped, and still passes a visibility assertion.** The
  BRANCH / TAG cell is `overflow-hidden`, so the sync strip was invisible to a user while
  keeping a bounding box — which is all `toBeVisible()` checks. Portalling it to `<body>` fixes
  that and the virtualizer's `transform` stacking context at once, the same pair of traps
  `Tooltip` already documents. The e2e assertion that the subject column does not move on hover
  is what caught it.
- **A portalled strip breaks its own hover.** Moving the pointer from the chip onto the buttons
  fires `mouseleave` with no `mouseenter` on any descendant, because they are not DOM relatives
  — the strip closed as the user reached for it. A 140ms grace period, cancelled by an enter
  anywhere in the group, makes the gap crossable.
- **A flat density multiplier breaks the drawing.** 0.8 across the board put `git-graph`'s
  arriving segment at 3px, under `MIN_ARROW_RUN` — a marker overhanging the row edge above a
  line too short to see. `minRowHeight` derives the floor from the style's own geometry, so
  compression stops where the drawing would break and the existing invariants cover the compact
  styles unchanged.
- **A branch may track a differently-named upstream.** `main` → `origin/trunk` is legal, and
  `PushRequest` carries one `branch`, not a `local:remote` pair — so pushing by name would have
  created `origin/main` beside the `origin/trunk` it meant to update.
- **The e2e port is contended between worktrees, not just against the dev server.** The config's
  dedicated port solved `moon run app:dev`; two `.worktrees/*` checkouts running the suite still
  collide. `MGIT_E2E_PORT` is the escape hatch.
- **`toBeVisible()` ignores opacity.** The first screenshot of the sync strip contained no sync
  strip: the assertion passed mid-`fade-in`.
- **The last Theme F item described polishing something that was never built.** No
  uncommitted-changes pseudo-row existed anywhere in `features/graph/`. It was built rather than
  deferred.

## 2026-08-26 — Phase 12 · Themes A + B — Commit inspector: rendered message, live references, real header

Landed on `feature/phase-12-inspector` (squash-merged — this repository still has no remote, so
there is no PR link). Phase 5 shipped the commit detail pane as an explicit stub: `%B` dumped
into a `whitespace-pre-wrap` div, a flat file list, and a `<pre>` of `git show --stat` repeating
the very numbers the list beside it already showed. This makes it the thing you actually read a
commit in.

**Theme A** renders the message as markdown (`react-markdown` + `remark-gfm`, deliberately **no**
`rehype-raw` — raw HTML in a commit message stays inert text, which removes the sanitisation
problem rather than solving it) and then linkifies references in the resulting text nodes. Two
passes in that order, because at the hast stage a code span is a real `code` element: "don't
linkify inside a fence" becomes an ancestor test rather than a lookaround in a regex. The matcher
is a pure `segment(text): Segment[]` with no React and no hast in it, and the plugin beside it
knows nothing about the grammar.

Three matcher decisions are load-bearing and each has a test:

- **URL wins the alternation.** `https://github.com/o/r/commit/7c521fed00d` contains a valid
  abbreviated sha and an issue-shaped fragment; with SHA first it shreds into three links, one of
  which navigates the inspector somewhere unrelated.
- **An abbreviation must contain both a digit and a hex letter.** `deadbeef`, `facade`, `decade`
  and `defaced` are pure hex and pure English; `12345678` is a record count. About 3.7% of genuine
  7-character shas are pure digits and 0.14% pure letters, and that is still the right trade — a
  missed link renders as the text the author typed, while a false one is a control that navigates
  to an unrelated commit, or to nothing.
- **`#\d{1,7}` needs its trailing `(?!\d)`.** Without it the quantifier takes the first seven
  digits of `#12345678` and links `#1234567`, orphaning the `8` — a link to a real but entirely
  unrelated issue, which is worse than no link.

`#123` resolves through Theme E's `pickForgeRemote`; a repo with no forge remote renders it as
plain text rather than inventing a URL that 404s. Trailers (`Co-Authored-By:` and friends) are
split off the message tail by a pure `splitTrailers` implementing git's rules more strictly than
git does — every line in the block must be a trailer or a continuation, because the cost of being
loose is a real final paragraph restyled as metadata and detached from the message it belongs to.
Trailer values are linkified WITHOUT a markdown pass: `<s@example.com>` is an address in angle
brackets, which markdown reads as a tag and swallows.

**Theme B** rebuilds the panel: the full sha with a copy button, author and committer identities
(the committer row only when the name **or** the email differs — a squash-merge keeps the address
and changes the name), relative dates with the absolute in a tooltip, parents as clickable short
shas labelled `parent 1` / `parent 2` on a merge, a tree ⇄ list toggle persisted in the ui-store,
and a draggable split between the file list and the diff. The tree is built by a pure
`buildFileTree` that collapses single-child directory chains on the way *up* (`packages/desktop/src/main`
is one row, and whether it collapses is only knowable once its children are final) and rolls
subtree totals into every directory row, so collapsing does not hide the number you collapsed in
order to compare. The list view sorts by change size descending — a 4000-line lockfile churn and
a two-line fix are indistinguishable in a path-sorted tree.

Three contract changes came with it:

- **`CommitDetailResponse` gains `parents`, `subject`, `author` and `committer`, and loses
  `stat`** — and with `stat` goes one of the three `git show` invocations per selection. One
  NUL-separated `--pretty=format:` record now carries everything, with `%B` deliberately last so
  surplus tokens rejoin into the body rather than truncating it.
- **`readCommitDetail` returns null** for a sha this repo does not have, instead of the
  empty-but-well-formed record it used to, which conflated "that repo is closed" with "no such
  commit" and rendered both as a commit with no message, no author and no files.
- **A new `mgit:repo:rev-parse` channel** resolves an abbreviation *before* it becomes a
  selection. A 7-char sha reaches `git show` fine, but the selection is also what the graph
  highlights and what the diff key is built from, and neither works with an abbreviation.

Clipboard goes through a new `mgit:clipboard:write-text` channel rather than
`navigator.clipboard`: the packaged app loads the renderer from `file://`, which is not
guaranteed to be a secure context, and the Async Clipboard API is gated on one — so the web API
is the one path that would work under the dev server and fail silently in the shipped dmg. The
button's checkmark is shown only on a confirmed write.

Beyond the plan, reviewing the diff turned up four real defects, each now pinned by a test:

- **Opacity is about ancestry, not parentage.** `unist-util-visit` hands a visitor only the
  immediate parent, so `a > strong > text` — what a markdown link with a bold label produces —
  passed the `code`/`pre`/`a` check and was linkified inside the anchor. The result is a control
  nested in a link: one click fires both, so `[**deadbeef1**](https://evil.example)` in a commit
  message would select a commit *and* open the URL. Replaced with an explicit walk carrying an
  inherited flag, which also dropped the dependency.
- **Resetting selection in an effect is one render too late.** The render that first observed a
  new sha still held the previous commit's path and issued a real `git diff` for it — cached under
  `staleTime: Infinity`. The same shape, and the same fix, as `useContextReset` in
  `use-file-diff.ts`. (Theme D hit this exact bug once already.)
- **Absolute pixel bounds cannot know how tall the window is.** A 720px file list in a short
  window collapsed both the message above and the diff below to nothing — and, being persisted,
  stayed collapsed across restarts with only a zero-height handle left to drag back.
- **react-markdown keys its element map by component identity.** `components={{ button:
  shaButton(onSelectSha) }}` built inline remounts every sha button on every render, dropping
  keyboard focus to `<body>`.

`CommitDetailRequest.sha` is now hex-validated like `RevParseRequest` and `git show` takes
`--end-of-options`: `git show` accepts diff options, and `--output=<file>` alone is an arbitrary
file write. No caller could reach it — the linkifier's output is hex by construction — but one
of the two rev-taking channels being guarded and the other not is an asymmetry one refactor away
from mattering.

Phase 16's markdown preview picked up the shared prose classes and live links on the way past:
its links were inert only because `shell:open-external` did not exist when it was written, and
Theme E had already landed by the time it did.

70 new tests (22 matcher, 10 plugin, 14 file tree, 12 trailers, 7 detail record, plus git-engine
integration for merges, root commits, unknown shas and tag peeling) and 18 new Playwright specs;
51 e2e green. `moon run :typecheck :lint :test` green.

Not in this slice: Themes C (ref badges as controls) and F (graph row polish), which landed
the same day — see the entry above.

## 2026-08-26 — Phase 16 · Themes A–E — Folder explorer, preview pane, settings pages

The app grows real pages, in one branch (`feature/phase-16-explorer-settings`, squash-merged —
no remote/PR yet). A new **Folder** view above Graph browses the active checkout as a lazy tree
(dotfiles shown, gitignored entries dimmed via one batched NUL-delimited `check-ignore` per
listing, `node_modules` costing nothing until opened) with a strictly read-only preview pane:
shiki-highlighted code (github-dark/light synced to the app theme, grammars lazy-loaded
per-extension, a 200 KB highlight cap so a minified bundle can't freeze the render thread),
markdown rendered through `react-markdown`+`remark-gfm` with a source ⇄ rendered toggle and
deliberately inert links, and images/video/audio/PDF streaming straight off a new jailed
`mgit-file://` protocol — media bytes never cross IPC.

Underneath: the first arbitrary-fs IPC in the app, `mgit:fs:list-dir` / `mgit:fs:read-file`,
scoped requests only (`repo` via `resolveWorkdir`, `claude-home` for `~/.claude`) with a
two-stage path jail — pure `joinWithin` (traversal/absolute/NUL) plus `realpath` confinement
(symlink escapes) — that fails closed everywhere, crafted percent-encoding included. No write
channel exists; "can't edit yet" is the contract, not the UI.

Settings moved to the **bottom of the nav rail** (the shell's `footer` slot) and split into four
pages behind an inner sidebar — Appearance and Graph moved one-to-one, **Terminal** hosts the
sidebar-side toggle and the agent roster, and **Agent** peeks into `~/.claude` (tree + preview),
probes `claude --version` through a login shell (`-lic`, banner-proof parsing, best-effort
npm/brew/native detection) and offers the hybrid actions: **Update** runs in main with output
streamed over `agent:claude-update-data`; **Uninstall** opens the terminal with the
method-matched command pasted and *no newline* — Enter is the confirmation, consumed once so a
revived session never re-types it.

25 new tests (jail table-tests, NUL round-trip `check-ignore` integration, claude parsers,
language map, ui-store persistence) plus 7 new Playwright specs; 45 e2e green. Still open in the
phase doc: the two real-app manual verification passes (media/PDF in the packaged renderer).

Nothing in the repo modelled a git remote: no domain type, and no command ever read
`.git/config`. Theme A's `#123` links need one, and so does every "open this on the forge" verb
that follows it. `Remote {name, fetchUrl, pushUrl, forge}` now ships from main with the URL
already normalised, alongside `pickForgeRemote` (origin first, then the first remote that
resolves to a known forge) and the GitHub/GitLab project and issue URL builders.

- [x] `shared/src/domain/remote.ts` — `Remote` + a derived `forge {host, owner, repo, kind}`
- [x] `git-engine/src/commands/remotes.ts` — `listRemotes` via `git config -z --get-regexp`
- [x] URL normaliser, pure + unit-tested: scp-like, `ssh://`, `https://`, `git://`, self-hosted
      GitLab subgroups; unknown hosts degrade to `kind: 'unknown'` and do not linkify
- [x] Issue-URL builder — GitHub `/issues/{n}`, GitLab `/-/issues/{n}`
- [x] Channels `mgit:remotes:list` and `mgit:shell:open-external`, the latter protocol-restricted
- [x] `remotes` + `shell` on the bridge and the preload `Pick<>`; `ipc.test.ts` extended

Beyond the checklist: a `useRemotes` hook keyed under `keys.repo` and one visible consumer, so
the slice is exercised rather than dormant until Theme A — each Remotes group in the sidebar
gains a link to its project page, absent (not disabled) for a remote that has none.

429 tests green plus 44 Playwright specs.

What this shook out:

- **`git remote -v` is the wrong command.** Its output is whitespace-delimited with a
  parenthesised suffix, a URL may legally contain a space, and it has no `-z`. `git config -z
  --get-regexp` frames records as `key\nvalue\0`, which is the NUL-delimited form the rest of
  the engine already assumes. It also reads `pushurl` in the same pass — git's own rule is that
  it falls back to `url`, and resolving that once in the engine beats every reader remembering
  it.
- **`new URL()` silently mangles the scp-like syntax.** `git@github.com:o/r.git` parses as
  protocol `git@github.com:` with the whole path opaque, so the host disappears — and that is
  the exact form git prints for a GitHub SSH remote. It is matched ahead of `URL`, not after.
- **A remote name may contain dots.** `remote.my.fork.url` split on `.` yields the name `my`.
- **`github.com.evil.example` classified as GitHub.** It carries the leading `github.` label the
  self-hosted heuristic keys on, so the suffix check never saw it — and the test that claimed to
  cover this only asserted the easier `notgithub.com` shape. A host embedding the canonical
  domain as a prefix is now excluded explicitly, and a trailing FQDN dot is stripped first.
- **`decodeURIComponent` throws on a malformed percent-escape**, and `%` is legal in a
  repository name. The throw escaped `listRemotes` and rejected the whole IPC call, so one
  oddly-named repo would have cost every remote in that repository its link.
- **A schema refine is not a security boundary on its own.** `shell.openExternal` hands a scheme
  to the OS's registered handler, so an unfiltered `file://` opens Finder on an arbitrary path.
  The allow-list is enforced in the schema AND re-checked on the line that makes the call — and
  main opens the *normalised* href, because the URL parser strips leading control characters, so
  `\njavascript:` and `javascript:` validate identically and only one of them is the string the
  OS would otherwise have received.

## 2026-08-25 — Phase 12 · Theme D — Real diff rendering

`readFileDiff` and the new `readCommitFileDiff` return a parsed `FileDiff` — hunks, per-line
old/new numbers, word-level intraline ranges — instead of patch text, so the renderer paints
geometry rather than tokenising on the render thread. New `mgit:commit:file-diff` channel (kept
separate from `mgit:file:diff`, where `staged` is meaningless against a sha), a hunk parser in
git-engine, and one `<DiffView>` serving both the status panel and the commit inspector: rows
virtualised, low-alpha row tint with the saturated colour on a 2px gutter bar, both line-number
columns behind a persisted toggle, context expansion as a refetch at a wider `-U`, and an honest
"N more lines not shown" past the cap. The inspector's `git show --stat` block is gone — it
repeated the file list's own numbers as preformatted text; that space now shows the diff.

372 tests green (`moon run :typecheck :lint :test`) plus 8 Playwright specs under
`moon run app:e2e` — the repo's first renderer-level test harness, driving the real app against a
mocked `window.midniteGit`.

What this shook out — mostly a family of cases where the pane rendered something plausible that
was not the file in front of you, which is the failure a diff viewer can least afford because
nothing about it looks wrong. Each is now covered by a regression test:

- **A pathspec is applied before rename detection**, so `git diff -M -- new-name` sees only the
  addition and reports a brand-new file with every line green. Both diff requests gained an
  `oldPath`; it comes from `StatusEntry.origPath` in the status panel, and in the inspector from
  the rename token `parseNumstat` had been reading and discarding.
- **`git show` prints no diff at all for a merge commit** — a merge has no single pre-image, so
  git declines to guess. `-m --first-parent` is what makes a merge's files inspectable.
- **A diff body line can be indistinguishable from a file header.** A deleted `-- comment` reads
  `--- comment` in the patch; parsing headers anywhere but before the first hunk dropped the line
  from the diff entirely, under-counted the deletion, clobbered `oldPath`, and shifted every
  following old-side line number by one. Found in self-review, not by the original tests.
- **`git diff` on an unmerged path emits a combined diff** (`@@@ -1,3 -1,3 +1,7 @@@`, one marker
  column per parent), which an `^@@ -`-anchored parser skips whole — so mid-merge the one file
  you most need to see said "No changes to show for this file." The parser reads N-parent headers
  now and flags `combined`, and the view states that the old numbers are the first parent's.
- **A pathspec is glob-matched**, so `pages/[id].tsx` is a character class that matches
  `pages/i.tsx` — the pane rendered a *different file's* content under the requested name.
  `--literal-pathspecs` fixes it, and it is a MAIN git option: as a subcommand flag it exits 255,
  which reads downstream as an empty diff rather than as an error.
- **"Empty output and not staged" does not mean "untracked."** A tracked file with nothing
  unstaged looks identical, and the `/dev/null` fallback painted it entirely green. Settled with
  `ls-files --error-unmatch`.
- **A query key outside the invalidation prefix is never refreshed.** The diff key sat at
  `['diff', …]` rather than under `keys.status`, and with the client's `staleTime: Infinity` the
  pane held its first-loaded hunks for the life of the process — through edits, stages, discards.
- **State reset in an effect lands one render late.** The context reset ran after the render that
  had already issued its query, so the click after "show the whole file" fetched the *next* file
  in full — precisely what the reset exists to prevent. It adjusts during render now.
- **The Vite dev port is contended across worktrees.** Playwright's `reuseExistingServer` attached
  to whichever server reached 5173 first, running the suite against another checkout's source
  while looking entirely healthy. The e2e config owns its own port.

Deferred to `outstanding.md`: syntax highlighting inside diff lines, side-by-side mode.

## 2026-08-25 — Phase 0 · Scaffold

proto/moon/pnpm workspace skeleton with four packages (`shared`, `git-engine`, `app`,
`desktop`), eslint 9 flat config carrying the dependency-boundary rules as per-package
`no-restricted-imports` groups, and `@bilo-io/ui@0.1.0` + `@bilo-io/shell@0.1.0` installed from
GitHub Packages (registry auth proven). `moon run :typecheck :lint :test :build` green; single
`react@19.2.8` in the store. Boundary rules negative-tested (probe files importing `electron`
from `app/src` and `git-engine/src` both fail lint).

## 2026-08-25 — Phase 1 · Shared contracts + git-engine exec/parsers

`shared` now carries the whole wire contract (domain zod schemas, `mgit:*` channel constants, IPC
payload schemas, the `MidniteGitBridge` type, the CommandId registry + default keymap), and
`git-engine` reads a real repository: dugite exec with env hygiene, the per-repo write queue, four
NUL-delimited parsers, and `log`/`status`/`refs`/`worktrees` commands including an incremental
`streamLog`. 93 tests green — 47 parser unit tests against fixture strings plus 21 integration
tests that build throwaway repos with real git (renames, conflicts, detached HEAD, unborn repo,
linked worktrees, upstream ahead/behind). `scripts/smoke.ts` parses ~/Dev/midnite — 4 worktrees,
200 refs, 2000 commits in 156ms.

## 2026-08-25 — Phase 2 · Lane layout engine

`LaneLayoutSession.push(commits) → GraphRow[]`: a single forward pass over `--topo-order` output
assigning straight branch lanes with left-first lane recycling, and sha-derived colours so a
branch keeps its colour across refreshes. Streaming-safe — batched layout is byte-identical to a
one-shot pass. 28 unit tests (linear, single merge, octopus, criss-cross, orphan roots, multiple
children, truncated history, degenerate input) plus structural invariants and an inline snapshot.
`smoke.ts` renders the lanes as ASCII next to `git log --graph` and they match row for row on
~/Dev/midnite.

## 2026-08-25 — Phase 3 · Electron shell boots

Frameless macOS window rendering the Vite app inside `@bilo-io/shell`'s `AppFrame`, with a working
`TitleBar` bound to a typed `windowChrome` bridge, the login-shell PATH fix, a native menu that
dispatches CommandIds, and the design tokens driving light/dark. Verified with three in-app
screenshots: dark, light (tokens flip), and fullscreen (traffic-light clearance collapses from
112px to 20px, proving `onFullscreenChange` round-trips). Tailwind's library content globs
verified by asserting 21 shell-only utility classes are present in the generated CSS.

## 2026-08-25 — Phase 4 · Repo open/list + worktree sidebar

A repo registry in main that resolves any path inside a repository — root, subdirectory, or linked
worktree — to one entry, so opening a worktree nests it under its owner instead of adding a
duplicate top-level repo. Paths (only paths) persist to `userData/repos.json`; everything else is
re-read from git at open time. VS Code-style sidebar with nested worktrees, native folder picker,
and worktree removal that never passes `--force`. Verified against `~/Dev/midnite` and its real
worktrees, including a restart. 40 new tests.

## 2026-08-25 — Phase 5 · Commit graph, read-only

Streaming log service in main (parse + lane-layout incrementally, 500-row batches, cancellation
by `requestId`) feeding a virtualized SVG-per-row graph: coloured lanes with merge curves, ref
badges joined by sha with ahead/behind, subject/author/date columns, and a commit detail pane.
On `~/Dev/midnite` (2,376 commits) 56 DOM rows are live, scrolling holds a median 8.3ms frame,
and switching repos mid-stream carries zero rows across.

## 2026-08-25 — Phase 6 · Status / stage / commit / sync

Stage, unstage, discard, commit, fetch, pull and push in the engine — all through the write queue,
all with explicit paths, and none of them with a force-push escape hatch — plus a VS Code-style
changes panel: ahead/behind chips with Fetch/Pull/Publish, staged and unstaged lists (a partially
staged file correctly appears in both), a commit box, and a unified-diff text pane. Verified by
committing through the UI on a scratch repo and checking `git log`. 130 engine tests green,
including a push/fetch/pull round trip and a conflicting pull against a real bare remote.

## 2026-08-25 — Phase 7 · Graph interactions

Checkout, branch create/rename/delete, tag create and reset in the engine, each with git's
refusals translated into a sentence that says what to do; renderer-drawn context menus on commit
rows and ref badges; double-click a badge to check it out; and a confirmation dialog that shows
the real blast radius. The count excludes commits any other ref still holds — the naive
`to..from` range overstated it, which is how safety dialogs become noise. 157 engine tests green.

## 2026-08-25 — Phase 8 · Drag-drop ops + conflicts

merge/rebase/cherry-pick plus a sequencer that detects in-progress state and exposes abort and
continue, all returning conflicts as the `GitOpResult` conflict arm rather than throwing.
@dnd-kit gestures on the graph: drag a branch badge onto another to get a merge/rebase choice,
drag a commit onto a branch to cherry-pick. An always-visible conflict banner lists the unmerged
files, disables Continue until they are resolved, and never disables Abort. 173 engine tests.

Also fixed a build-graph bug found here: `desktop:typecheck` could pass against a stale
`git-engine` API because moon hashed only the task's own inputs.

## 2026-08-25 — Phase 9 · Integrated terminal + keybindings

node-pty in the main process (lazy, fail-soft, login shell, cwd = the selected worktree) behind an
xterm panel that defers `open()` until its container is measurable; a CommandId dispatcher shared
by the key handler and the native menu, with an xterm escape allow-list derived from the keymap's
`global` scope; and a footer bar with the toggle, branch, ahead/behind and change count. Verified
with real OS-level key events: `Ctrl+\`` opens from cold and closes again with the terminal
focused, and `git status --short` inside the shell agrees with the footer.

## 2026-08-25 — Phase 10 · Watcher / live refresh

`fs.watch` on the narrow set of git paths plus the working tree, classified into
refs/head/index/worktree, debounced at 200ms, with own-write suppression driven by the write
queue so the app's own commits don't loop back as external changes. The renderer maps each kind
to the narrowest correct refresh. Verified live: committing from the integrated terminal adds the
row to the graph, and `git checkout -b` outside the app makes the badge appear.

The mapping had a real bug worth remembering: `refs` events were treated as badge-only, which
meant a commit — the commonest ref event there is — never appeared in the graph.

## 2026-08-25 — Phase 11 · Packaging + docs

macOS arm64 dmg + zip via electron-builder, with main and preload bundled by esbuild so
electron-builder never has to walk pnpm's workspace symlinks; dugite's bundled git and node-pty
unpacked from the asar; an afterPack hook that restores +x on 197 executables, prunes dangling
symlinks and ad-hoc signs; `install-local` using `ditto`. CI runs the gate on every PR and
packages on main. README rewritten around what the app does and the decisions behind it.

Verified on the installed app launched with a bare `env -i` PATH: the graph renders (bundled git
works from `app.asar.unpacked`) and the terminal runs the user's real zsh (node-pty plus the
login-shell PATH fix).

## 2026-08-25 — Final end-to-end verification

Against the installed `/Applications/midnite-git.app`, launched with `env -i` and
`PATH=/usr/bin:/bin:/usr/sbin:/sbin` (what a Finder launch actually gets), opening the real
`~/Dev/midnite`:

- 2 repositories, 3 linked worktrees nested under their owner
- 2,376 commits streamed, lanes and ref badges rendered
- Full-graph scroll (61,776px): median frame **8.3ms**, 1 frame over 16.7ms in 120
- Integrated terminal runs the user's own zsh in the selected worktree
- A commit made in that terminal appears in the graph without a refresh

Screenshot: [`docs/screenshots/midnite-git.png`](../docs/screenshots/midnite-git.png).

## 2026-08-25 — Brand assets from the midnite app

The crescent mark and the Quick Kiss wordmark face are now the midnite app's own files rather than
placeholders: `resources/icon.icns` + `icon.png` become the macOS app icon, `logo.PNG` is the
in-app mark, and `quick-kiss.ttf` sets the wordmark. Same product family, same logo — an
approximation reads worse than none.

Worth knowing: the mark is an **opaque** disc (a black crescent on a white ground, transparent
only outside the circle). A CSS mask reads only the alpha channel, so masking it flattens it to a
featureless dot — it has to be an `<img>`, in the rounded-coin-with-a-hairline-ring treatment
midnite itself uses, which is also what makes one asset work on both themes.

## 2026-08-25 — Phase 13 · UI polish

Resizable panels (sidebar, terminal, commit detail, changes list) with geometry persisted in
`midnite-git.ui`; a full per-repo ref tree (Branches · Remotes · Tags · Worktrees) replacing the
worktree-only sidebar, with `FolderGit2` distinguishing a checkout from a branch; a lockable nav
rail; the theme toggle and an icon-only fetch/pull/push cluster moved into the title bar (with a
framed-window fallback, since `<TitleBar>` renders nothing off darwin); graph column headers with
resizable Author/Date/SHA driven by CSS custom properties so the memoised rows never re-render
during a drag; and a multi-select branch filter that re-runs the log stream server-side —
`LogOptions.revisions` already existed in the engine, only `log-service` hard-coded `--all`. Every
Unicode glyph is now a lucide icon, and motion is a two-keyframe vocabulary disarmed by
`applyMotion` under `prefers-reduced-motion`. Three CommandIds (`sync.fetch/pull/push`) that had
been declared with chords and menu items since Phase 9 finally have handlers. 304 tests green.
**Not verified visually** — Electron cannot reach the macOS window server from the agent's shell,
so the manual smoke and the screenshot are outstanding.


## 2026-08-25 — Sidebar: flush delimiters, collapsible sections, and a smoke run that works

Two fixes to the Phase 13 sidebar, plus the visual verification that phase had left open.

Each repo `<section>` carried `py-0.5` *and* `mt-0.5 … pt-1.5`, which put ~6px under the
delimiter against ~4px above it, so a selected repo's highlight floated clear of the rule above
it. The rule now carries no padding of its own — the repo row and the tree below it already have
theirs. Every subsection folds independently (Local · Remotes · Tags · Worktrees), state held as
the set of *closed* keys so a section defaults open, and `TreeSection` swapped its boolean
`indent` for a `depth` so each nesting level's heading indents left of its own rows. "Branches"
became **Local**: the section under it is branches too, and the old heading left the reader to
work out which was which.

Worth knowing: `moon run desktop:start` was never blocked by the macOS window server, which is
what Phase 13 recorded. It exits ~700ms with no output because `app.requestSingleInstanceLock()`
hands the launch to the packaged app in /Applications and quits — silently, by design. The lock
is keyed on `userData`, so `electron . --user-data-dir=<tmp>` runs a dev instance alongside the
installed one. With that plus `MGIT_OPEN_REPOS` and the `MGIT_CAPTURE` harness already in
`main/capture.ts`, the sidebar was screenshotted expanded and folded without touching the
user's running app — closing Phase 13's last two verification items.
## 2026-08-25 — Phase 14 · Graph themes, avatars, author filter

Four selectable graph styles (`git-graph` with solid nodes and arrowheads, `git-extensions`,
`sourcetree`, `gitkraken`) driven by a `GraphTheme` descriptor — git-engine untouched, since
lane assignment is already a pure function of history and a style only decides how lanes are
drawn. Gravatar avatars inside every commit node, hashed with SHA-256 via `crypto.subtle`
(no MD5 dependency), deduped by email so twelve authors across 50 000 commits is twelve
requests, with generated initials as both the first-paint and the failure state. The avatar
retires the Author column; name/email/date moved to a tooltip on the bubble. Ref chips moved
into a dedicated BRANCH / TAG column. An author filter that dims rather than removes —
`git log --author` omits commits without rewriting `%P`, which would leave the lane engine
holding a lane open per filtered-out parent. And Settings finally exists: a style picker that
draws the same synthetic history four ways, plus the shell's appearance runtime (seven
appliers and a 500-line stylesheet shipped since Phase 0 and never called). Playwright covers
it against a stubbed Gravatar. 422 unit tests + 10 e2e green. **Outstanding:** the ref-chip drag gesture
(Phase 8's merge/rebase) has no test and needs a human in the real app.

## 2026-08-25 — Phase 14 verification: the ref-chip drag gesture, under a real pointer

Closes the one item Phase 14 landed without: whether Phase 8's drag gestures survived the ref
chips moving into the BRANCH / TAG column. They did — `useRefDnd` is wired from `graph-row.tsx`,
so the wiring travelled with the chips — but nothing in the markup says so, which is why the
item was left for a human. `e2e/ref-drag.spec.ts` now drives merge, rebase and cherry-pick with
a real pointer through the Playwright mock bridge, and the mock's `ops` proxy records its calls
so each assertion lands on the *operation*, not just on a menu label: choosing "Merge X into Y"
has to reach `ops.merge({source: X})`. The guard cases come with it — a tag is neither a drag
source nor a drop target, a branch dropped on itself is a no-op, and a drop onto a branch that
is not checked out shows both items disabled with the reason attached. 8 tests, plus
`docs/screenshots/phase-14/drop-menu.png`.

Two things bit while writing it, both worth knowing before touching a dnd-kit test again.
**dnd-kit eats the click that trails a drag for 50ms** — `AbstractPointerSensor` adds a
document-level capture listener that `stopPropagation()`s `click` on activation and only tears
it down on a 50ms timeout. A human never meets it; a synthetic click lands inside the window
and dies before React's delegated listener sees it, so the menu item looks stone dead while a
DOM-level `.click()` on the same button works perfectly. **And `rectIntersection` collides the
DragOverlay's rect, not the dragged element's** — the overlay pill is sized by the text it
carries, so the first version of this spec dropped a commit on `main` and was offered a
cherry-pick onto `feature/drag-me` one row above. The fixture keeps ref-less rows around every
drop target now; that spacing is load-bearing.

445 unit tests + 26 e2e green.

## 2026-08-25 — Sidebar: per-repo sync, primary-checkout switching, status dots

The repository headers grew the sync control that only the title bar had: `↑n ↓n` plus
fetch / pull / push per repo, acting on **that** repo's primary checkout whether or not it is the
selected one. Which needed two generalisations rather than a copy — `useRepoStatus(target)` and
`useTargetedGitOp(target, …)`, with `useStatus`/`useGitOp` now the selected-checkout case of each —
and one extraction: `<SyncControls>` and `<AheadBehind>` are shared with the title bar, so the two
places cannot disagree about when Push is live.

When a button is live and when it is not is now a pure function, `syncAffordances(branch)`, and
every disabled state carries a reason. That forced a fix in `IconButton`: a real `disabled`
attribute suppresses mouse events in every engine, so the one state most in need of explaining was
the only one that could not raise a tooltip. With a `disabledReason` it switches to `aria-disabled`,
stays hoverable and swallows the click. The same rules feed the header's ellipsis menu, which
replaces the bare ✕ — Fetch/Pull/Push, a *Switch primary checkout to ▸* submenu, Copy path, and
Close, reachable from the ⋮ or a right-click anywhere on the row.

Switching the primary checkout also lands on the branch rows themselves, on right-click and as a
hover button, with git's own refusal spelled out (`Checked out in <path> — a branch can only be
checked out once`). The sidebar's menus stay non-destructive on purpose: delete and rename remain
on the graph's ref badges behind Phase 7's blast-radius gating. Remote rows offer *Create local
branch from origin/x…* instead of a checkout, because `git checkout origin/x` lands on a detached
HEAD, which is never what clicking a remote branch means.

The checked-out marker is now a `<BranchDot>`: the same dot, with a radial-gradient halo that
breathes (`halo-breathe`, the app's only ambient loop — scale/opacity only, so it stays off the
main thread, and reduced motion freezes it on its final frame) and a red/amber/green level from
`branchHealth()`. Only signals the app can justify get a colour — a paused merge or a conflict is
red, uncommitted changes are amber, a gone upstream is amber — and a clean tree deliberately
reports `unknown` and stays neutral white, because "you have not edited anything" is not a verdict
on the code and a sidebar of green dots would drown a real one. `ChecksVerdict` is the seam a test
run or a GitHub pipeline plugs into (todo/outstanding.md → Branch checks); nothing supplies one
yet, so every branch git has nothing to say about shows no dot at all rather than a green lie.
Worst-signal-wins, which is why the worktree rows carry their own dot for the checkout they name.

Fitting all that on a 256px row cost the header's branch chip while the repo is expanded — the
Local list two rows below names the same branch and marks it live — and the fresh-profile default
sidebar width went to 288. Verified in the app via `--user-data-dir` + `MGIT_OPEN_REPOS`: names
intact, `↑0 ↓0` with both counts dimmed, Pull/Push at `aria-disabled` + `opacity .4` with
`pointer-events: auto`, the submenu listing exactly the branches free to check out, and amber dots
on both dirty checkouts. `moon run :typecheck :lint :test` green, with 16 new unit tests across
`sync-availability` and `branch-health`. **Outstanding:** the light theme's amber was not screenshotted, and no
screenshot can show a pulse.

## 2026-08-25 — Graph: a fifth style, colour-matched ref chips, a usable theme menu

Three follow-ups to Phase 14, one of them a plain bug.

**`classic` — the pre-avatar graph, back as a style.** Phase 14 replaced 26px rows, 14px lanes and
a 3.5px dot with an avatar in every node, and retired the Author column because the face named the
author. That was a change of default, but it read as a change of options: there was no way back to
the denser table. `classic` is the old module constants verbatim — bezier lanes at 1.75px, hollow
merges, no faces — with the Author column returned. Which is why `GraphTheme` grew `node:
'avatar' | 'dot'` rather than a `showAvatars` flag: the column and the node are the same decision
seen twice, so `showsAuthorColumn(theme)` derives from the node and the two incoherent pairings —
a face beside a redundant Author column, a dot graph with the author nowhere — are unrepresentable.
`nodeExtent` branches with it (avatar + ring, or dot + half its stroke), so the lane-spacing
invariants still hold for a style whose `avatarSize` is 0.

**Ref chips take their lane's colour.** A branch name in the BRANCH / TAG column and a coloured
node in the GRAPH column are the same object shown twice, and nothing connected them: every chip
was one of four semantic tints (`primary`, `muted`, `success`) regardless of which branch it named.
They are now the hue of the lane their commit sits on, at two strengths — the checked-out ref
filled solid and semibold, everything else a 14% wash at 0.78 opacity — because a column of
equally-loud chips answers "which branches exist" while the question being asked is "where am I".
Kind moved onto the icon (check / cloud / tag / branch), since kind and identity are independent
facts and spending colour on kind costs the identity colour is there to carry. The chips publish
`--lane-h/s/l` and the stylesheet composes tint, border and ink from them, because the label's
lightness has to flip with the app theme and only the stylesheet knows which one is on.

A **leader line** now runs from the chip to its node, in two halves: a flex-`1` rule to the
column's edge (the chips ahead of it are of unknown width, which is what `flex` solves and a fixed
viewBox cannot) and an SVG line starting at `-ROW_GAP`, crossing the row's gap into the gutter. It
is drawn before the lanes so the verticals stay unbroken — a horizontal rule laid over them chops
history into segments. Commits carrying more refs than the column holds now end in a GitKraken-style
`+N` chip with the rest in its tooltip, instead of a name clipped mid-word.

**The theme menu opened off-screen.** `<ThemeToggle>` from `@bilo-io/ui` anchors its menu
`bottom-0 left-full` — a flyout to the right of the trigger, growing upward. Correct for the
sidenav rail it was written for; in this app the trigger is in the window's top-right corner, so
all four options rendered past the right edge and above the top one: present in the DOM,
unreachable by pointer. The library takes no placement prop, so the app has its own toggle now,
built on the library's `useTheme` and positioned the way `<Tooltip>` and `<ContextMenu>` already
are — measured against the trigger, right-aligned, clamped to the window, and portalled to `<body>`
so no transform or backdrop-filter up the title bar can reinterpret its coordinates.

157 unit tests + 31 Playwright green (`moon run :typecheck :lint :test`, `moon run app:e2e`), with
new coverage for the node/column pairing, the lane-colour helpers, the two chip strengths, the
connector's negative origin, and the theme menu landing inside the viewport.

## 2026-08-25 — Graph: the table lines up, the gutter resizes, the rail lands

Three defects and one addition, all in the graph table's geometry.

**The gutter sat four pixels high.** Its SVG defaulted to `display: inline`, so it
participated in a line box and carried a descender's worth of phantom height beneath it. The row's
`items-center` split that evenly and lifted the whole graphic, leaving every ref chip pointing at a
node slightly below it and every leader line meeting its lane off-centre. `block` on the SVG and
`flex` on the two spans wrapping it. Asserted per style, because the offset came from the row's
font metrics rather than from anything one style could be blamed for.

**The header sat nine pixels right of the rows it labelled**, per resize handle preceding it. A
handle is 5px wide with −2px margins, which is 1px of net width — but it is also an extra item in a
`gap-2` flex row, so it costs a whole additional gap. The rows have no handles, so the two laid out
on different grids and the drift compounded: Graph +9, Commit message +7, Date −9. `ResizeHandle`
now takes the row's `gap` and pulls itself in by half its own width plus that gap, so inserting one
moves neither neighbour. Every column origin now matches the rows to the pixel.

**The gutter is a resizable column.** Dragging it in closes the lanes up and slides the indented
commits left; `Home` takes it to its floor, `End` and a double-click back to the natural fit. Both
bounds are geometry rather than constants, so they are computed per render and handed to
`useGraphColumns`: `max` is `lanes * laneWidth`, and `min` is where the lanes have closed to half a
node — which for a single-lane history is exactly one node wide.

That floor is deliberate. Nodes that merely TOUCH would cap compression at three percent for the
avatar styles, since GitKraken's 30px lane already holds a 29px node; at half a node they overlap
the way a stacked avatar list does, each keeping a visible crescent. To let them, `laneOffset` pins
the outermost lanes a node-radius from the gutter's edges instead of half a lane — identical at a
style's own spacing, so nothing that was never dragged moves, and it turns "lane 0 stays inside the
gutter" from an invariant every new style must be checked against into a structural fact.
`laneWidthForGutter` inverts `gutterWidth` exactly across both regimes, so the handle and the
painted edge stay on the same pixel instead of the graph lagging the pointer.

Lane spacing is the one piece of geometry the row takes as a prop rather than as a custom property,
and it does bust the row's memo on every pointermove of a gutter drag. SVG coordinates are
attributes, not styles, so no variable can reach them; the drag re-renders the ~30 rows the
virtualizer has mounted, not the 50 000 behind them.

**The lane rail.** GitKraken stands a bar in the branch's colour between the graph and the subject,
so the message you are reading is tied to the branch it landed on without your eye travelling back
to the node. Full row height, so a run of commits on one branch reads as one rail rather than a
column of ticks. Only the styles whose node is an avatar: a face says who, not where, while
`classic` already draws the whole lane in that colour a few pixels away.

Along the way the e2e suite stopped asserting on `svg circle`, which had been quietly matching the
hole in a ref chip's tag icon as well as the commit nodes — three tests appeared to cover the
gutter's geometry while measuring an icon. The lane graphic carries `data-graph-gutter` now, and
the assertions that matter — nodes inside their column, the squeeze losing none of them — actually
look at it.

198 unit tests + 38 Playwright green (`moon run :typecheck :lint :test`, `moon run app:e2e`).

## 2026-08-26 — Phase 15 · Verification — and the three defects it found

The point of a verification pass is the things it turns up, and this one turned up three, none of
which the existing suite could have seen.

**Two ptys per terminal.** `start()` guarded on `store.ptyIds[session.id]`, which is only written
once `pty.create` has *resolved*. Two calls in the same tick therefore both saw it empty and both
spawned a shell; the second `bindPty` overwrote the first, orphaning a live process nothing held an
id for — never killed, never listed, invisible except in `ps`. StrictMode's double-invoked mount
effect made it happen for **every terminal opened under the dev server**, which is how the app is
run day to day. The guard now covers the await: `starting` is set synchronously before it, so the
second call bails on the state rather than on a field that does not exist yet.

**Restored sessions revived themselves.** `takeReplay` consumed the transcript on first read, on
the reasoning that a remount would otherwise double it. But a remount builds a *new* xterm with an
empty screen, so replaying into it is right every time — and consuming it meant the second mount
found nothing, came up blank, and, since the auto-start condition was `if (!replay)`, read "no
replay" as "brand new session" and started a shell. Precisely the promise the phase makes
("reopening the app with a dozen of them is free"), broken. Now `peekReplay` reads without
consuming, `bindPty` retires the transcript once a live shell owns the screen, and auto-start keys
on `state === 'idle'` — a restored session hydrates as `exited`, which is the actual question
being asked. The transcript was always a poor proxy for it: a session saved before it printed
anything would have been revived on sight.

**`TerminalSessionSchema` never enforced its own comment.** `agentId` was documented as "set when
`kind === 'agent'`" and required by neither direction, and both halves degrade *silently*: an agent
with no id restores as a row the roster cannot resolve, losing its accent and its Claude mark and
reviving as a bare login shell while still labelled an agent; a shell carrying an id paints that
mark on a terminal running no agent. Both reachable from `terminals.json`, a file that outlives any
one build. `agentIdMatchesKind` now refines the session record and `PtyCreateRequest` alike.

**The tests.** `ipc.test.ts` had no pty coverage at all — which is how `PtyCreateRequest` grew four
fields across this phase without a single assertion. It is now a table (schema, a payload that must
parse, payloads that must not, each labelled with the rule it tests) closed by a guard asserting
every `pty:*`/`terminal:*` channel has a row. That guard's first act was to find `pty:data`, left
unvalidated on purpose — one message per chunk of shell output, and putting zod on the path of each
keystroke's echo buys nothing for a payload whose only consumer is xterm. It is a named exemption
with its reason, so the guard still fires for the next one.

The e2e mock stopped being a stub and became a **fake pty that talks back**: a coloured prompt,
echoed keystrokes with backspace, a short canned transcript, and silence after `kill` — escape
sequences included deliberately, because the real pty sends them and a mock that omitted them would
quietly stop testing that they survive the trip. Sessions are seeded through `terminalSessions`, so
a spec reaches the restored-and-dimmed state without quitting an app it never launched.

Assertions moved to the bridge rather than the screen. xterm paints through the WebGL addon, so a
terminal's contents are canvas pixels that no DOM query can read — and what crossed the bridge is
the more precise thing anyway. "The shell survived hiding the panel" is asserted as *no `kill` was
sent and no second `create` followed*, which is the Phase 9 unmount-kills-the-shell contract being
overturned, stated in the terms it was written in. "Restored sessions come back dimmed" is asserted
as *no pty was created*, which is what dimmed means.

Nine specs: open on Ctrl+` and close again with xterm focused, a second terminal getting its own
pane and pty, the Claude row's accent coming from the roster rather than a default, the session list
docking either side and surviving a reload, maximize and restore, restore-dimmed-then-revive,
hide-without-killing, and drag reorder with a real pointer past dnd-kit's 6px activation constraint
— the only thing that would catch a misrouted `DndContext`.

One item is left open on purpose: quitting and relaunching the packaged app to confirm `ps` shows no
surviving shells. A browser cannot quit Electron or read the process table, and faking it would be
the one assertion in the list that proved nothing.

562 unit tests + 47 Playwright green.

---

## Phase 17 — the repositories sidebar as a workbench (2026-08-26)

Five gaps closed on one branch: change counts, a Changes-view filter, menus on everything,
whole-checkout diffs, and the app's first forge integration.

The counts needed **no new IPC at all**, which was the surprise. `status.get` has taken an
optional `worktreePath` since Phase 6, `resolveWorkdir` validates it against
`git worktree list`, and `getStatus` resolves `.git` through `rev-parse --git-dir` so it
already worked inside a linked worktree. The sidebar simply never asked. `useWorktreeStatuses`
asks — one `useQueries` entry per checkout, on **exactly** `keys.status(repoId, path)`, so a
row's pill and the Changes panel that later selects that checkout are one cached `git status`
rather than two, and the Phase 10 watcher invalidates both without knowing the hook exists.

`isPlaceholderData` turned out to be load-bearing twice over. The placeholder is an *empty*
status, so trusting it would report every checkout clean while its query was in flight — and
Theme B's filter would then have hidden a dirty worktree on the strength of a number that had
not arrived. `byPath` therefore holds only checkouts that have actually answered, and the
filter refuses to hide anything while `isLoading`.

The old `isMain`-only guard on `worktreeHealth` was right and is preserved. Its comment said a
linked worktree gets no dot rather than the primary's dirt attributed to it; `liveStatus()`
keeps that invariant and the data caught up to it.

**Destructive verbs moved into the sidebar**, reversing a documented Phase 4 decision. The old
docblock argued that delete and rename belonged only to the graph's ref badges, because a
second set of destructive affordances would be somewhere for the two to disagree. That did not
survive contact with the tree — the sidebar is where branches and worktrees are actually
managed, and sending someone to the graph to delete a branch they are looking at is the
indirection a git client exists to remove. The docblock was rewritten rather than left
contradicting the code, and the disagreement risk is answered by one shared confirm shape.

Branch delete passes `--force` unconditionally, which looks alarming and is the honest choice:
git's `-d` refuses on unmerged commits with no way to see what they are, so a UI built on it
can only relay a refusal. The blast radius dialog *names the commits*, which is strictly better
information — so the decision moves to the person, in front of the numbers.

Worktree removal is two-step. The first attempt never forces; only after git has actually
objected does a second, separately-confirmed dialog offer to override it, so "force" is always
a reply to a specific objection rather than a checkbox nobody read.

Two rows in one tree can both be called `main` — a branch and the worktree it lives in. Their
action buttons had identical accessible names, which a Playwright strict-mode violation caught
and which a screen reader user would have hit the same way. Labels now name the kind.

`inline` mode on `DiffView` drops the **virtualizer**, not just the chrome: inside an accordion
the scroller is the page, so a virtualizer would render three rows and stop. `DIFF_LINE_CAP`
already bounds a single file, which is what makes plain flow affordable. Each accordion's query
lives in its *body*, so a checkout with 200 changed files costs 200 rows and zero `git diff`
calls until something is expanded; expand-all is capped and **says** what it withheld.

Tabs live in their own store rather than a `ui-store` slice. Everything in that store is a
persistence candidate; a tab names a repo, a checkout or a run, any of which can be gone by
next launch — so keeping them apart means nobody has to remember to exclude them from
`partialize`. `NewWorkbenchTab` distributes its `Omit`: a naive `Omit` over the union keeps
only shared keys and would have erased the very fields tab identity is derived from.

**The forge integration goes through the user's own `gh`.** No PAT, no keychain decision, no
token that silently expires — `gh` already holds a credential and knows about enterprise hosts.
`shellQuote()` is the load-bearing piece and not defensive politeness: `runInShell` takes a
single command string, and owner/repo are parsed out of whatever URL is sitting in
`.git/config`. It is tested against `$(…)`, backticks, `;`, `&&`, `|`, a newline, and the
embedded `'` that is the only character single-quoting cannot contain. Owner/repo are resolved
**in main** from the config rather than sent by the renderer, so the only thing crossing the
boundary is a `repoId`.

Two `gh` details cost a debugging round each and are now encoded: an interactive login shell
convinces `gh` it has a tty, so `GH_PAGER=cat` is required or the call hangs until the timeout;
and `gh auth status` exits 1 if *any* configured host has a bad token, which must not sign the
user out of the host that works.

This finally closes **"Branch checks (the RAG dot's real source)"** from `outstanding.md`, by
the exact route that entry predicted. `checksVerdict()` matches on **sha**, never branch name —
a green tick sourced from the previous tip is the precise failure that teaches people to
distrust the dot — takes the newest run per workflow so a re-run supersedes what it replaced,
and reports an all-skipped set as `unknown` rather than green. The rate-limit worry that
parked it is answered by never fetching for the dot at all: the sidebar reads the Actions query
with `enabled: false`, so a branch is coloured only when the user has already opened that
repo's Actions section.

Two verification items are left open for a human, both because this session could not perform
them rather than because they were skipped. Electron will not attach to the macOS window server
from a non-interactive shell — it exits silently with no output while other Electron apps on
the same machine run fine — so the packaged-app screenshot pass in both themes did not run. And
the `gh`-availability matrix (present-and-authed, absent, authed-but-offline) needs a machine
whose state can be changed between runs.

Note for whoever picks this up: `e2e/graph-themes.spec.ts` has 12 failures **on `main`** —
verified in a clean worktree at `0b810c2`, identical count and file. It looks like a Phase 16
leftover: the spec reaches for Settings via `getByRole('link')`, but Settings became a footer
`button` when the nav rail regrouped. Untouched here; it is not this phase's to fix.

724 unit tests + 56 Playwright green (11 of them new).

## 2026-08-26 — Sidebar: rows stop changing height, and folded summaries line up

Three polish fixes to the repositories sidebar, each about the same disease: layout that
depended on what a row happened to contain.

`TreeSection` headings sized themselves with `py-1`, and the trailing ellipsis action is an
`h-6` IconButton — so Local, Remotes and Worktrees (which carry one) sat ~7px taller than Tags,
Actions and Reviews (which do not), and the section rhythm stuttered from repo to repo. The
heading now pins `h-7`; an optional control cannot change it. Repo rows got the same treatment
(`h-8`): the sync cluster only renders once `git status` comes back, so a padded row grew a few
pixels the moment status loaded and every repo below it shifted down.

On a folded repo, the branch + change-count summary used to trail the name, starting at a
different x on every row because names differ in length. It is now pushed to the trailing edge
(`ml-auto`), so folded rows read as a column — the summary lines up down the panel, directly
left of the sync control it explains. And the panel header's filter and "open a repository"
buttons became one trailing cluster instead of two controls spread by `justify-between`, which
had read as a third column of the title row.

Two new Playwright tests pin both fixes: one asserts the four heading kinds share a single
bounding-box height, the other that a folded row's change-count pill sits in the trailing half,
left of the sync button. All 14 repos-workbench e2e tests green; unit gate green.

## 2026-08-27 — Settings: the sidebar gets a page of its own

The repositories sidebar's narrowing — which views show the whole tree and which arrive
narrowed to what the view is about — was settable only one view at a time, from the funnel
button inside the panel itself. It now also has a **Sidebar** page under Settings › General
(its own nav sub-item, `LuPanelLeft`): every view's answer in one column, each row a
Narrowed/Everything pair with the view's own default named beside it, plus a reset.

Both faces write the same `sectionFilters` field, so a row flipped here is immediately what
the funnel button reads and vice versa — the e2e proves it on the live view: Settings IS the
active view while the page is open, so flipping its row must narrow the panel sitting beside
the page, and does. What "Narrowed" means per view is spelt out from `VIEW_FILTERS` rather
than written by hand, so a view whose narrowing changes cannot leave a stale description.

The reset is a new store action, `resetSectionFilters`, and it empties the map rather than
writing each view's default back as an explicit entry: an absent entry means "whatever this
view does by default", so a default that changes in a later release still applies.

Worth knowing for the next settings e2e: an empty ref section hides itself (`hideWhenEmpty`
in `TreeSection`), and the settings spec's fixtures carried no refs — so the sidebar next to
Settings never showed Local at all, unfiltered or not. The spec now feeds one branch in.

## 2026-08-27 — Sidebar page: the side-navigation lock moves in

The "Side navigation" control (Auto / Locked open / Locked closed) moved from Appearance to
the Sidebar settings page — locking the nav is a sidebar decision, and that page is where
someone looking for it looks. Same `navMode` field, same three states, and the rail's own
chevron pin remains the two-state face of it.

No behaviour needed building: `AppFrame` (from `@bilo-io/shell`, and verified in the
installed dist) already keys everything off this value — hover-expand handlers attach only
in `auto`, so **locked closed never expands, hover included**, and while the rail is
collapsed each item names itself in a portal tooltip. What was missing was the setting's
home and any proof of that contract. The e2e now locks the rail closed, hovers a nav item,
and asserts the tooltip appears — a tooltip only renders against a collapsed rail, so its
visibility during a hover IS the assertion that the hover expanded nothing.

## 2026-08-27 — The agent activity spinner reads a frame, not a chunk

The spinner added a commit earlier never once appeared. `detectActivity` decided "thinking"
by looking for `esc to interrupt`, and the strings in the shipped binary
(`~/.local/share/claude/versions/2.1.247`) say that phrase now survives only in the retry
banner — the live spinner row prints `✳ Kneading… (1m 38s · ↓ 4.5k tokens)`. Meanwhile the
*waiting* marker it fell through to (`auto mode on` / `shift+tab to cycle`) is drawn on every
repaint, generating or not, so every busy agent read as idle.

Thinking is now keyed on the spinner row itself: the frame glyphs `✢ ✳ ✶ ✻ ✽` — taken from
the binary's own frame arrays, with `·` and the ASCII `*` left out because a middle dot is
the separator in every footer segment — followed by the verb's ellipsis, plus the
`↓ N tokens` counter and the old interrupt hint for older builds.

The footer's real job turned out to be a FRAME BOUNDARY, not a state: the spinner row is
drawn above it, so a frame that reaches its footer with no spinner in it is what means
"waiting". Detection therefore runs over the bytes since the last boundary rather than over
one pty chunk — a repaint is a couple of kilobytes and macOS hands it over in pieces, so
judged chunk by chunk the same frame said thinking and then waiting a millisecond later and
the glyph flickered between the two for the length of the turn. `TerminalView` carries that
state per session, beside the decoder it already kept for the same reason.

Alongside it, the session list got the two things a list that now says something useful
needs: a drag ceiling of 560 rather than 360 (matching the repos sidebar — an agent row's
label is a summary of the task it was given, so these are the longest rows in the app), and
a `List` toggle in the terminal header, persisted as `terminalListOpen`. The toggle is
explained-disabled below two sessions, since a list of one still names nothing the header
does not.

## 2026-08-27 — The thinking ring was spinning all along; nobody could see it

The spinner appeared, correctly, the moment an agent started generating — and read as a
static circle. Everything that could have stopped it was ruled out before anything was
changed: `.animate-spin{animation:spin 1s linear infinite}` is in the built stylesheet with
no later rule overriding it, the persisted appearance is `motion:"system"` with the OS
`ReduceMotionEnabled` at 0 so the shell's universal reduced-motion reset never armed, and
the packaged app in /Applications ships the exact bundle and CSS that was inspected. Driving
a real tool-using Claude turn through `detectActivity` (138 pty chunks over 80s) produced one
transition into `thinking` and then held, so the ring was never being remounted mid-turn
either — a remount would have reset the rotation to 0° and frozen it in place, which was the
obvious suspect and the wrong one. Sampled in a browser against the app's own stylesheet, the
element reported `animationName: spin`, `playState: running`, and transforms stepping
0° → 57° → 111° → 165° → 219° over 600ms.

So the animation was running the entire time. What failed was the mark. One lit quadrant on a
12px circle is a lone ~8px dash, and `border-[1.5px]` floors to a single device pixel below
2× scale — Chromium's computed `borderTopWidth` comes back `1px`. A one-pixel dash going round
once a second, in a sidebar nobody looks straight at, is not perceptible as motion; captured
frame by frame off a paused animation it is plainly rotating, and at speed it is a ring
sitting still.

The fix is geometry, not motion: 14px, a 2px rim, and two adjacent borders lit rather than one,
so a half ring sweeps instead of a dash creeping. Duration stays Tailwind's built-in 1s
deliberately — a custom `spin 900ms` would rest on `@keyframes spin` still being emitted, and
Tailwind only emits it while some other file uses the built-in utility.

Left standing for next time: once `thinking` is seen, the state is sticky. In that same 80s
probe the detector returned `thinking` 113 times and `waiting` never again after the turn
ended, so a finished agent keeps its spinner until its next byte of output.

## 2026-08-27 — The PR description becomes a tab, and the header stops spending height on it

The description sat under the PR title in a `max-h-40` scroller, which spent 160px on every
pull request whether or not anyone was reading it and pushed the review actions and the tabs
that far down the pane — on a short window the diff got what was left. It is the `Overview`
tab now, first of four, and it opens by default: the body was always visible when a PR opened,
so making Files the landing tab would have hidden it behind a click nobody asked to make.

Overview costs no extra fetch. It reads `useForgePullDetail`, which the header already runs
for the base branch and the line counts, so a PR opened onto Overview now pulls *less* than
before — the patch and the review threads stay behind their own tab gates, and a reader who
only wanted the description never fetches them. Its three states are kept distinct (in flight,
no detail, a genuinely empty body) so a panel that has not answered yet cannot read as a PR
with nothing to say.

The dead band under the header was two margins doing one job: `ReviewActionBar`'s root carried
`mt-2` and its slot in `PrDetail` carried `pb-2`, so the gap above the Approve row came from
the bar and the gap below it came from the pane. The slot owns both now (`px-3 py-2`) and the
bar's own top margin is gone. With the body out of it the header is a fixed two rows however
long the description is, so the rule, the actions and the tablist stack with 8px between them.

## 2026-08-27 — A changed image is shown, not described

`git diff` on a PNG prints "Binary files differ" and stops, so the diff pane printed
`Binary file — no textual diff.` and stopped too: true, and no answer to the only question the
reader has. An image now renders as its two revisions, with three ways to compare them —
two-up, a swipe divider, and an onion-skin fade — because no single one answers everything:
two-up says what the picture is now, swipe catches geometry (a shifted element lines up or it
does not), and onion catches tone, where a slow fade shows a colour shift that side-by-side
hides. The header states the dimensions, and the change in them, which is the difference a
picture makes hardest to see and a number makes obvious.

The hard part was never the viewer, it was the *before* side: those bytes are not on disk
anywhere. They come out of the object database instead, through the `mgit-file://` scheme the
Files preview already uses, with a `?rev=` the handler answers by `git cat-file blob <rev>:<path>`
— `readBlob` in git-engine, spawned rather than `execGit`'d because dugite hands stdout back as
a *string* and would corrupt every byte outside the encoding it assumed. Same jail as before
plus two conditions of its own: the rev must survive a narrow whitelist (`cat-file` takes its
object as a bare argument with no `--` terminator, so anything flag-shaped must never reach
git), and a `?rev=` request that fails any check 404s rather than falling through to the disk
read — otherwise a crafted rev would quietly serve the working-tree file at that path.

Which revisions to pair was the decision worth getting right, and it belongs to the caller:
the Changes pane compares the index with the checkout (or HEAD with the index, when the file is
staged), the commit inspector compares the commit with its first parent — matching the
`--first-parent` diff it already asked git for. `imageDiffSources` is that arithmetic, pure and
unit-tested, and it returns `null` for everything that is not a binary image, so every call site
wires it unconditionally and the branch never fires for text. An SVG keeps its textual diff on
purpose: it has one, and replacing it with two pictures would hide the change rather than show
it. A rename reads its pre-image from the *old* path, since asking for the new one at the old
revision finds nothing.

Two smaller things fell out. A blob at a rev is immutable, so those responses are cached
forever — which is what makes flipping between before and after instant. A working-tree image
is the opposite case: its URL does not change when the bytes do, so disk-served *images* now
revalidate, or a re-exported screenshot would sit next to today's "before" and look like the
diff was wrong. Video and audio were left alone; they go through Chromium's range machinery,
which is not worth disturbing for a staleness problem they do not have.

## 2026-08-27 — The Files view compares an asset, not just displays it

The image viewer landed in the diff surfaces first, which left the Files browser as the one
place that shows a picture and cannot answer what changed in it. It has a `Compare` toggle now,
on an image whose bytes differ from HEAD's: off is today's pane, on is the same `ImageDiff` the
diff pane mounts — two-up, swipe, onion — over HEAD → the file on disk.

That pairing is deliberately the only one offered here. A file browser has no staged/unstaged
distinction to work with; it shows one checkout, and the question a reader has of a changed
asset is how it differs from what is committed, which covers both halves of a staged-then-edited
change in one comparison.

The gate is `differsFromHead`, over the status entry the sidebar has already fetched for this
checkout — so it costs a cache read, not a subprocess. A path status never mentions matches
HEAD and offers nothing. Untracked, ignored, and staged-as-added are refused for a different
reason: HEAD holds no pre-image, and a "compare" that opens an empty before pane reads as a
broken viewer rather than as a new file.

Two things the single-image pane gained on the way past: the checkerboard the viewer already
used (an alpha channel on the plain pane background reads as a solid dark shape — exactly the
detail worth seeing), and the natural dimensions in the header. Both come from the diff
viewer's own module rather than a copy, so the two surfaces cannot drift on what a picture sits
on.

## 2026-08-27 — The Reviews view draws the shape of what it is fetching

Every wait in the view was a sentence in the middle of an empty pane — "Asking GitHub…",
"Reading the diff…", "Reading the conversation…". Each threw away a layout the app already
knew, so the pane sat blank and then everything landed at once and jumped.

`components/skeleton.tsx` adds the two marks and, more usefully, the rule for choosing between
them: a skeleton stands in for content that is not on screen yet and whose shape is known; a
spinner belongs where content *is* on screen and something is happening to it — a write in
flight, a refetch behind a list that still shows the last answer. `LoadingRegion` keeps the
prose those placeholders used to show as an `sr-only` status, so the bars can be `aria-hidden`
and a screen reader hears "Reading the diff…" instead of "div div div".

`reviews-skeletons.tsx` holds every pane's outline in one module rather than beside each
component. What makes them work is being the same geometry as the panes they replace — same
padding, same row heights, same borders — and that only stays true if they are read together;
a skeleton kept next to its component drifts from it one padding change at a time. Widths are
constants, never random: a random width is a diff in every screenshot and a flicker on every
re-render while the fetch is still out.

The ordering matters more than the bars. Anything the app can actually assert — an empty list,
filters matching nothing, a signed-out CLI, an error — is still prose, and every caller checks
for those *before* reaching for a skeleton. That is what lets a grey bar mean "still asking"
rather than "nothing here". Spinners go on the four in-flight writes (comment, review submit,
request review, merge) and on the list's own refresh, where the rows behind the fetch are good
and must not be blanked out.

None of it was photographable or testable: the mock bridge answers in the same tick it is
asked, so the skeletons lived for zero frames and a change deleting them would have passed the
whole suite. `forgeLatencyMs` holds every forge answer — the whole namespace, so a call added
later is slow too, and zero skips the wrapper entirely so no existing spec changes timing.
`reviews-loading-shots.spec.ts` asserts each `sr-only` status and photographs seven states into
`docs/screenshots/phase-20-reviews-loading/`. The shots settle animations first; without that
they caught the shell mid-fade and came out as a washed-out grey page showing none of the work.

## 2026-08-27 — The repositories panel gets a switch, in the footer and on Mod+B

The panel that is always there is the one you cannot get out of the way. The repositories
sidebar had a width the user could drag but no off state, so a 288px column of branch trees sat
beside the graph whether or not the current task was about picking a repository.

`Repos` now sits in the footer immediately left of `Terminal`, built as the same control: glyph,
label, chord hint, `aria-pressed`, the accent-filled pressed state. Two toggles of the same kind
read as one group, and the leading slot goes to the panel that is open by default. Its glyph is
Octicons' `GoRepo` — the mark the panel's own header already wears, so button and panel are
recognisably one object. Lucide, which the rest of this file uses, has no repository mark that
is not a folder, and every folder variant in this app already means "worktree".

The chord is `repos.toggle` / `Mod+b` in `DEFAULT_KEYMAP`: Cmd+B on macOS, Ctrl+B elsewhere, the
binding every editor with a left sidebar uses and therefore the one a user tries first. Scope is
`app`, not `global` — deliberately unlike the terminal toggle, because Ctrl+B is a readline
motion the shell is entitled to keep while it owns the keyboard. The View menu gets the item from
the same registry, so accelerator and menu item cannot drift.

`Mod` is how the keymap spells "Cmd here, Ctrl there" — right for string comparison, meaningless
printed on a button. `displayChord` renders the modifier the user's keyboard actually has, and
both footer buttons go through it; the terminal's `Ctrl+`` passes through untouched.

Hidden means unmounted, not zero-width. The panel streams a per-repository status and ref list,
and a live column behind a dismissed view keeps paying for itself. `reposWidth` is separate
layout state, so it returns the size it was. The resize handle unmounts with it: a splitter with
nothing on its left edge is a drag target for an invisible thing. `reposOpen` persists beside the
terminal chrome and defaults to open — it is the app's primary object list, and a fresh install
whose first press REVEALED it would have started out looking broken.

## 2026-08-27 — The title bar gets a hairline, and the breadcrumbs get their glyphs

Two small reads of the same strip. The `right` cluster ran the sync actions, a hairline, the
per-checkout lifecycle actions, and then the theme toggle flush against the last of them — so a
window preference sat inside the run of git commands as if it were a fifth one. It gets the same
`h-4 w-px bg-border` rule the action clusters already use between themselves; the strip now reads
as three groups rather than two-and-a-half.

Every breadcrumb crumb now leads with an icon: `LuFolderGit2` for the repository, `LuGitBranch`
for the branch, `LuGitCommitHorizontal` when HEAD is detached — a commit glyph, because that state
is precisely standing on a commit rather than on a branch — and, for the last crumb, whichever
glyph the nav rail or the settings sidebar already shows for that destination. The glyph is what
says *what kind of thing* a name is once the strip has cut it to `midnite-…`, so truncation
flipped with it: `shrink-0` on the icon, `truncate` on the label. A half-clipped icon reads as a
rendering fault, a clipped repo name reads as a long repo name.

The rail's and the settings sidebar's icon maps moved into `components/nav-icons.ts`, shared by
all three surfaces rather than copied into the breadcrumb. One view wearing two different icons in
two places is worse than either icon. `SETTINGS_PAGES` still carries no glyph — the store stays a
plain data module, so nothing that only wants a page id pulls an icon package in behind it.

## 2026-08-27 — The repository row grows a third menu, behind the app's own mark

The row's two menus become three, in the order midnite → git → ellipsis: widest scope first.
The new one holds what you ask **this app** to do with the repository — **Exec**, **Brainstorm**,
**Loop PR Review**, **Loop PR Feedback** — where the Git logo holds what you ask git and the
ellipsis holds the repository's own tooling. Three marks rather than three ellipses, which is the
same argument that replaced the second ellipsis with the Git logo in the first place.

Each entry opens a fresh Claude session in the primary checkout and types its skill at the prompt
**without a newline** — `startClaude`, reused rather than reimplemented, so this shares its posture
with the Agent page's uninstall command and the test runner. Pressing Return is the confirmation, so
a mis-clicked menu cannot set an agent loose on a repository, and the queued command is readable
before it runs. That last part matters more here than anywhere else, because *what* each entry
invokes is a setting.

**The skills are configurable** (Settings → Agent → midnite menu, one field per entry, with a Reset
that appears only once a value has drifted from its default). They have to be: a skill is a file in
the user's `~/.claude`, not something this app ships — `/exec` and `/brainstorm` are this repo's own
project skills, `/loop-pr-reviews` and `/loop-pr-feedback` are personal commands — and any of them
can be renamed or forked without the app knowing. The values are whole prompts rather than bare
skill names, so an entry can also carry arguments or a plain sentence. Free text rather than a
picker over the skills found on disk, deliberately: enumerating them would catch a typo but refuse
every legitimate value that is not a bare skill, and the failure mode of free text is a terminal
showing you the wrong command before you press Return.

`agentSkills` lives on `ui-store` beside the other persisted preferences, with the ids and defaults
in the store and the labels and glyphs in `features/agent/agent-commands.ts` — the split
`SETTINGS_PAGES` / `PAGE_ICON` already draws, so the store pulls no icon package in behind it. The
persisted record is re-spread in `merge` for the reason `layout` is: a blob written before a fifth
entry existed would otherwise leave that entry's skill `undefined`, which reaches the shell as the
string "undefined".

`components/icons/midnite-icon.tsx` is the mark as an SVG, and it is a *trace*, not a redraw.
`brand.tsx` renders the same mark from `logo.png` and must keep doing so — that asset is
deliberately opaque, a black crescent on a white ground, which is what lets one file sit on both
themes. A toolbar glyph needs the opposite: it has to take the colour of its control, and a PNG
cannot. So the disc, the ring and the crescent's two arcs were fitted as least-squares circles
through the PNG's own edge pixels (r=465 and r=512 about the centre, r=297 and r=220 for the
crescent, max residual under 3px on a 1024 canvas), and the crescent's hooked horns — which are
not circular, and are why two circles alone will not do — are the traced outline simplified to 2px.
Rasterising the result back agrees with the PNG on 98.9% of sampled pixels, every disagreement on an
antialiased edge.

It is **one `evenodd` path with four subpaths**, not two clipped groups, because the mark inverts
across its own equator (top: filled disc, crescent knocked out; bottom: hairline ring, crescent
filled) and clipping needs an `id` — which collides with every other inlined copy of itself on the
page. Disc-512, disc-465, top-semicircle and crescent are chosen so the crossing count lands odd
exactly on the ink; the table is in the file. The third subpath is a semicircle rather than a
rectangle because a half-plane keeps toggling past the disc's edge and fills the top of the viewBox.

`IconButton` gains a third tone, `brand`: resting in `--primary`, hover to plain foreground. A tone
rather than a `className` because both halves are text colours — passing them in would put
`text-primary` and the base `text-muted-foreground` in the same slot and leave the winner to
whichever Tailwind emitted last. Note that `--primary` is only the accent hue while an accent is
chosen (`html[data-accent]`); on the default accentless theme it is already the full-contrast
colour, so the two states differ by the hover tint alone.

**The sidebar's default width goes 288 → 312**, and that came out of looking at the folded row
rather than out of taste. 288 was measured against a row with two menus; at that width a folded
`midnite-git` was already spending its last pixels on the branch name, and a third control took the
name's first character with it and pushed the change-count pill a third of a pixel into the sync
button. The 24 is the new menu's own footprint. A persisted width still wins, so this moves only
the installs that never dragged the panel.

The e2e asserts the ordering as one list rather than three presence checks — all three controls
existed before this change, in the wrong order, so a test that only looked for them would have
passed then too — and follows a skill from the settings field through the store to the pty's
`initialInput`, which is the one span no store test could cover. The store tests cover the half the
browser cannot see cheaply: that one entry moves without disturbing the other three, that the whole
record persists, and that `merge` refills an entry a stored payload predates instead of leaving it
`undefined` — which would reach the shell as `claude 'undefined'`, a prompt rather than a crash.

Known-red, and red before this too: `repos-workbench.spec.ts`'s folded-row test still fails its
second assertion (`pill.x` past the row's midpoint) on `main` and here alike. The e2e suite is
deliberately outside the `:test` gate; it stands at 20 failures on both sides of this change, with
the four new ones green.

## 2026-08-27 — The terminal session list drops its rename pencil

The hover pencil on each session row is gone. Double-click already renames — it is how a name
in a list is edited everywhere else (Finder, VS Code's tabs, a spreadsheet cell) — so the button
was a second control for something the row already did, and the context menu keeps the
discoverable and keyboard-reachable route alongside "Reset to detected name".

It was not free to keep. `opacity-0` hides a button but does not take it out of the flow, so the
pencil cost every row ~22px of layout width whether or not anyone hovered — in a list whose
default is 176px, and whose rows carry a repo name, a separator, the session's own name, an
activity indicator, a state dot and a close button. The session name is the part that tells two
Claude sessions apart and the part that truncates first, so those pixels went to the one thing
on the row that most needed them.

`rename` itself is untouched; only the third way to reach it is gone. The `LuPencil` import went
with it, and no test referenced the control.

## 2026-08-27 — Reviews splits into three questions, and stops fetching until asked

Both Reviews surfaces — the sidebar's per-repo section and the Reviews view's list pane — now sit
behind three accordions: **My Requests**, **Awaiting My Review**, **All Pull Requests**. Nothing is
fetched until one is expanded, which is the same rate-limit gate the forge sections have always
applied, one level finer: three collapsed groups cost exactly what one collapsed section used to,
and a reader who only ever opens "Awaiting My Review" never pays for the other two.

Each group is its own `gh pr list`, not a filter over a shared page — `ForgePullScope` carries the
reason. `--limit` counts the PRs `gh` matched, so a page of twenty narrowed to "mine" afterwards
is twenty minus everyone else's rather than twenty of mine; the same argument `state` already made
for itself. `mine` is `--author @me`, `review-requested` is `--search review-requested:@me` (the
query `gh pr status` builds for its own block), and `@me` rather than a looked-up login so the app
never holds a username or misses a `gh auth switch` in the terminal beside it. `scope` is part of
the query key for the same reason `state` is: sharing one would let whichever group expanded first
serve its rows to the other two.

The view's toolbar stayed where it was and now filters ACROSS the groups: the groups answer
"whose", the tabs and the search answer "which", and repeating either three times would be three
places to set the same thing. The author menu is built from the union of what the expanded groups
have loaded, deduplicated by PR number first — the same pull request is legitimately in two groups
at once, and a tally that counted it twice would be a number the list can never match.

Two things the split changed on purpose. The stored selection now wins outright rather than only
while its PR is in the filtered set: `PrDetail` fetches by number, so a PR chosen in the sidebar
has to survive arriving here with every group collapsed and nothing loaded for it to be "in". And
an open group prints no count until its fetch answers — "All Pull Requests 0" for as long as `gh`
takes, then changing its mind, is a claim rather than a reading.

## 2026-08-27 — One click into a terminal slid the whole app under the title bar

A maximized terminal lost its own header to the title bar, restore button and all, with no
gesture that could bring it back. The repositories panel was clipped at the top by the same
amount, and the nav rail — the one thing anchored to the viewport rather than laid out in
flow — looked perfectly fine, which is what made it read as a terminal bug rather than a
layout one.

The app column was sized `100vh - var(--titlebar-h)` and pushed below the bar with a top
margin of the same 48px. That sums to the viewport, which is why it measured correctly at
rest — but a top margin on the first in-flow child collapses out through `<main>` and
`#root`, neither of which has a border or padding to stop it. So the margin stopped being
space inside the page and became the page's own offset: a 100vh document sitting 48px down,
i.e. 48px taller than the window, with exactly one title bar's worth of scroll in it.

`body { overflow: hidden }` keeps that away from the wheel but not from the platform:
`focus()` and `scrollIntoView()` scroll an overflow-hidden viewport quite happily, and
clicking into a terminal focuses xterm's hidden textarea. One click, 48px, and every control
along the top of the column was behind a fixed bar at `z-60` that answered the clicks meant
for it. Scrolling back was not on offer either — an overflow-hidden viewport takes no user
gesture, only a programmatic one.

The fix is padding rather than a margin: padding sits inside the border box, so the box is
exactly `100vh` however tall the bar is and the document has nothing left to scroll. The
framed window's chrome strip moved inside that box while it was open — as a sibling above it,
its 40px added to a box already claiming the whole window, which is the same bug on the
platforms macOS is not.

Verified in the real window as well as the harness, against a copy of a live profile: the
maximized terminal's restore button is what answers a click at its own coordinates, and
`scrollTo(0, 400)` moves nothing. `terminal.spec.ts` states both — that the document has no
room to scroll, and that scrolled at anyway, the panel's header is still the thing under the
pointer across its whole width.

## 2026-08-27 — The footer's disk readout becomes a ring

Capacity was the one metric in the strip drawing a sparkline of a line that never moves. `disk.ts`
and the flyout both already made the argument — a capacity line is flat for hours, so a timeline of
it implies movement that is not there — and the flyout acted on it with a bar. The footer had not.

Disk now draws a 12px donut: a muted track in its own hue at the sparkline's area alpha, and the
used fraction as an arc from twelve o'clock. It replaces the DOT rather than the sparkline, and
loses the sparkline entirely — the ring is already a coloured mark in the metric's hue, so a dot
beside it would be the same identification twice, and putting the ring at the head keeps the column
of percentages down the strip aligned.

One `<circle>` with `stroke-dasharray`, not an arc path: an arc needs a large-arc flag that flips
at exactly 50%, and getting it wrong draws the complement of the number you meant. The arithmetic
lives in `ringGeometry` beside `linePath` and is tested there, including the half-stroke inset (a
stroke straddles its path, so a circle at the outer radius paints half the ring outside the viewBox)
and the clamp (120% wrapping past its own start would read as 20% — a smaller number than the one
that was measured, which is the worst way to be wrong).

`TIMELINE_METRICS` is now one list rather than two. The flyout had its own copy, and a metric that
was a timeline in one strip and a level in the other is a contradiction the user can see.

## 2026-08-27 — Dropdowns stop sliding under the title bar

The breadcrumb's repo switcher and the theme menu both opened from controls IN the title bar,
and both were painted UNDER it. `@bilo-io/shell` draws `<TitleBar>` at `z-[60]`; every overlay
this app owned was at `z-50`, `z-[60]` or `z-[70]` — numbers chosen against a plain Tailwind
scale where 50 IS the top, and each one written in a file that could not see the shell's.

Worst was any menu raised through `useDialogs().openMenu`, which places itself at the CURSOR:
click a title-bar control and half the bar's height of menu is buried, so the first row was
neither readable nor clickable. The theme menu overlapped by ~6px — its top row's upper half
answered clicks as the title bar rather than as "Light".

The numbers are now named in `tailwind.config.ts` — `z-menu` / `z-popover` / `z-dialog` /
`z-tooltip` at 80/85/90/95, all clearing the shell's chrome, all under the shell's own `z-[200]`
full-screen states. Named because the bug was not a wrong number, it was a number that could
only be judged against a value published by another package: `z-menu` at a call site says which
layer this is and leaves one place to check what that outranks. The dialogs moved with them —
`fixed inset-0 z-50` left the title bar bright and live over a modal backdrop.

`overlay-stacking.spec.ts` asserts it by hit-test, not by visibility. An occluded menu is
`toBeVisible()`, correctly positioned and passes Playwright's actionability checks — which is
how this survived a 250-spec suite. The probe is `elementFromPoint` at the centre of the menu's
INTERSECTION with the title bar, and no intersection throws rather than passing quietly: an
earlier draft probed the menu's centre, which sits below the bar, and passed against the bug.
