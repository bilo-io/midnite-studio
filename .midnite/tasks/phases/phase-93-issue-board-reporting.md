# Phase 93 — Issue board reporting from inside the app

[Phase 65](phase-65-somewhere-for-a-crash-to-go.md) built the whole crash-reporting machine —
a rotating log, a renderer→main report channel, redaction, and a "Copy diagnostics" button — and
ended at one anchor: **"Report a bug"** (`CrashReporting()` in
[`monitor-page.tsx`](../../../packages/app/src/features/settings/settings-pages/monitor-page.tsx),
and its twin in
[`version-notes-panel.tsx`](../../../packages/app/src/features/version/version-notes-panel.tsx))
is `openExternal(NEW_ISSUE_URL)` and nothing else. It opens a browser to a blank GitHub issue form;
the user has already pressed "Copy diagnostics" on a separate button, and now has to paste it in
themselves. This phase builds the missing write: an in-app composer that files the issue directly,
prefilled with the diagnostics that already exist.

**Confirmed this phase, not assumed.** Two issue boards exist and they are not interchangeable.
`gh api repos/bilo-io/midnite-studio -q .visibility` → **private**, one collaborator (`bilo-io`),
yet it carries real, populated issues (`#86`–`#141`, labelled `bug`/`enhancement`/`size:*`/
`docs-hub`) — that tracker is this repo's own internal engineering backlog, running alongside
`.midnite/tasks/`, and **no external user can reach it**: a private repo has nothing to show
someone who is not a collaborator. `gh api repos/bilo-io/midnite-apps -q .visibility` → **public**,
`has_issues: true`, and it already ships `.github/ISSUE_TEMPLATE/{bug,feature,config}.yml` plus a
label set built for exactly this (`bug`, `enhancement`, `app: midnite-studio`, `needs-triage`,
`size/*`) — but it has **zero issues filed today**. So CLAUDE.md's "public downloads and issues
live in `bilo-io/midnite-apps` because this repo is private" is correct as design intent and
simply unexercised: the scaffold is ready, nobody has used it, and the in-app entry point that
would drive traffic to it does not exist yet. This phase's whole premise is closing that gap —
posting from inside the app, to the board that can actually receive a stranger's report.

**Builds on.** Everything Phase 65 shipped is reused, not rebuilt:
[`redactPaths`](../../../packages/shared/src/redact.ts) (home-dir + secret-pattern redaction — no
second redaction path), the `mstudio:report:bundle` channel (boot line + last 50 log records,
already redacted), the `report` bridge group at
[`bridge.ts:1034`](../../../packages/shared/src/ipc/bridge.ts), and
[`NEW_ISSUE_URL`/`ISSUES_URL`](../../../packages/shared/src/release.ts) already pointed at
`bilo-io/midnite-apps`. The `gh` CLI delegation model this app already uses for every forge read
and write — [`gh-shell.ts`](../../../packages/desktop/src/main/forge/gh-shell.ts)'s
`runInShell`/`shellQuote`/`isAuthenticated` probe — is reused verbatim: the composer authenticates
as whoever the user's own `gh` CLI is already logged into, the same as every other forge call this
app makes. **No new secret storage, no vault entry, no token crossing the IPC boundary** — this is
deliberately unlike Phase 90/91's forge-account work, which is solving a different problem
(storing *other* providers' PATs for the git client itself).

**Scope guardrails.**
- **This is not Phase 54's deferred "issue creation."** [Phase 54](phase-54-issues-view.md)'s
  Issues view explicitly declined to build issue creation for *whichever repo the user has open* —
  "this phase's argument is that the reading gap is what blocks other work." This phase builds a
  narrower, single-destination composer that **always** targets the fixed `bilo-io/midnite-apps`,
  regardless of which repo is active in the git client. The two features share no code path beyond
  the `gh` CLI shell primitives, and a future "create an issue on the repo I'm looking at" feature
  is still Phase 54's to pick up, not this phase's.
- **No embedded browser tab for GitHub's own issue form.**
  [Phase 71 Theme B](phase-71-links-that-open-in-place.md) already made this call, in the very
  comment this phase's trigger button carries: *"filing a bug means typing credentials and a
  report into GitHub, and an in-app tab has no password manager to fill any of that in."* This
  phase does not reopen that decision — the composer never renders GitHub's own page. It shells
  to `gh`, which already holds its own credential outside the app entirely; nothing about that
  needs a browser, a password manager, or a `WebContentsView`.
- **No OAuth, no device flow, no new auth UI.** If `gh` is not installed or not authenticated,
  the composer degrades to exactly today's behaviour — open the browser, user pastes the bundle —
  rather than teaching the app to run `gh auth login` on someone's behalf.
- **No labels, milestone, or triage UI to build.** The target board's label set already exists
  (`bug`, `enhancement`, `app: midnite-studio`) — verified this phase, no label creation step
  needed. The composer applies the right two labels itself; `needs-triage` is deliberately never
  applied, since that label exists for the case the *web form's* App dropdown routing failed,
  which cannot happen when the app itself already knows which app it is.
- **No settings page, no new secret vault, no telemetry.** Every submission is one explicit
  button press in a dialog the user can read and edit first — that dialog *is* the consent gate;
  a separate opt-in switch would be redundant with it.

Effort tags: **S** ≈ an hour or two · **M** ≈ half a day · **L** ≈ a day plus.

## Themes

### A — The fixed target, and the write's odd shape (S) — ✅ DONE (PR #TBD, 2026-09-20)

The write this theme adds is architecturally unlike every other write in `forge/`: every function
in [`gh-write.ts`](../../../packages/desktop/src/main/forge/gh-write.ts) takes
`(forge: Forge, …)`, derived from whatever repo is open. This one never does — it always targets
`bilo-io/midnite-apps`, independent of the active repo, or whether there even is one.

- [x] Add `APP_ISSUES_REPO = 'bilo-io/midnite-apps'` to
      [`release.ts`](../../../packages/shared/src/release.ts), beside `NEW_ISSUE_URL`/`ISSUES_URL`
      — a bare `owner/repo` slug for `gh issue create -R`, not a URL to parse at call time.
- [x] New `packages/desktop/src/main/forge/gh-app-issue.ts`. A docblock stating plainly, up top,
      that this file is the one write in the directory with **no `Forge` parameter** and why —
      so the next person adding a write here does not copy this one's shape by accident.
- [x] `createAppIssueCommand({title, body, labels}): string` — a pure function returning the full
      `gh issue create -R 'bilo-io/midnite-apps' --title '…' --body '…' --label '…'` command
      line, built with [`shellQuote`](../../../packages/desktop/src/main/forge/gh-shell.ts) per
      argument, the same shape `gh-write.ts`'s `*Command()` functions already use for a plain `gh`
      subcommand (not `gh api`, not `--input -` — there is no JSON payload here, same reasoning
      [Phase 54 Theme G](phase-54-issues-view.md#g--two-writes-and-only-two-m--✅-done-2026-09-04)
      already landed for `gh issue comment`).
- [x] `createAppIssue(fields): Promise<ForgeWriteResult & {url: string | null}>` — runs the command
      through [`runInShell`](../../../packages/desktop/src/main/forge/gh-shell.ts), parses the
      created issue's URL from `gh issue create`'s stdout (it prints the URL on success and
      nothing else), and reuses `describeFailure` for the error message on failure, exactly the
      pattern every `gh-write.ts` function already follows.
- [x] Tests: `gh-app-issue.test.ts` — the command string (flags, quoting, ordering, the fixed
      `-R`), a successful create returning the parsed URL, and a `gh`-not-authenticated failure
      surfacing `cli`'s existing probe result rather than a generic error string.

### B — The IPC surface, extending `report`, not inventing `issues` (S) — ✅ DONE (PR #TBD, 2026-09-20)

- [x] `mstudio:report:submit-issue` in
      [`channels.ts`](../../../packages/shared/src/ipc/channels.ts), beside the other three
      `mstudio:report:*` invoke channels Phase 65 Theme B added — this is bug-reporting, not a
      second domain, and it must never collide with `mstudio:diag:*`
      ([`channels.ts:430-438`](../../../packages/shared/src/ipc/channels.ts), already owned) or
      any future `mstudio:issues:*` Phase 54 might add for its own, different, per-repo creation.
- [x] `AppIssueSubmitRequestSchema` in
      [`schemas.ts`](../../../packages/shared/src/ipc/schemas.ts) — `title` (capped, the same
      1 KB `perf.ts`/`ErrorReportSchema` convention), `body` (capped, generous — a diagnostics
      bundle plus a description), `kind: 'bug' | 'feature'` (picks the label pair and the default
      title prefix). `AppIssueSubmitResultSchema = ForgeWriteResultSchema.extend({ url:
      z.string().nullable().default(null) })` — reusing the existing `{ok, cli, error}` envelope
      rather than a new one, with `url` added for the composer's "View issue" link on success.
- [x] `report.submitIssue` on the `report` bridge group in
      [`bridge.ts`](../../../packages/shared/src/ipc/bridge.ts) (`:1034`), an `invoke`-shaped
      method beside the existing `send`-shaped `error`.
- [x] Handler in
      [`main/ipc/report-handlers.ts`](../../../packages/desktop/src/main/ipc/report-handlers.ts),
      registered beside the other three, calling `createAppIssue` from Theme A. Uses the generic
      `handle` helper (not `handleOp`, since the result extends `ForgeWriteResult` rather than
      `GitOpResult`) so a failure resolves rather than throws across the boundary, per CLAUDE.md's
      IPC rule.
- [x] Preload wiring: `submitIssue: (r) => call(CHANNELS.reportSubmitIssue, r)` in
      [`preload/index.ts`](../../../packages/desktop/src/preload/index.ts) (`:566-575`, beside
      `error`/`logPath`/`bundle`/`reveal`).
- [x] `useSubmitAppIssue()` mutation hook in
      [`queries.ts`](../../../packages/app/src/services/queries.ts), matching the shape of the
      other `report.*`-backed hooks already there.
- [x] Tests: schema round-trip beside the existing `ErrorReportSchema` tests; a handler test
      asserting an invalid payload resolves an error rather than throwing.

### C — The composer dialog (M)

- [ ] New `packages/app/src/components/report-issue-dialog.tsx` (+ `.test.tsx`) — a form inside
      [`Modal`](../../../packages/app/src/components/modal.tsx) (`size="md"`), living beside
      `confirm-dialog.tsx`/`prompt-dialog.tsx` because it is triggered from two unrelated features
      (`monitor-page.tsx`'s Diagnostics accordion and `version-notes-panel.tsx`), not owned by
      either.
- [ ] Fields, mirroring `bug.yml`/`feature.yml`'s own shape so a report filed from the app answers
      the same questions the web form would ask: a **Bug / Feature** toggle (picks `kind`), a
      **title** input (prefilled `[bug] `/`[feat] ` per the templates' own convention), a **What
      happened / What's the problem** textarea, and a **read-only diagnostics block** — the exact
      text `mstudio:report:bundle` already returns, already redacted, shown so the user can see
      what is about to be sent rather than trusting a "Copy diagnostics" button they pressed
      earlier and can no longer see.
- [ ] The diagnostics block is **collapsible but on by default for a bug report, off by default
      for a feature request** — a feature request has no crash to attach, and showing an empty or
      irrelevant log block first is the wrong default for that path.
- [ ] Submit calls `useSubmitAppIssue()`; on success, shows the created issue's URL as a link
      (`openExternal`, same protocol-restricted path every other outbound link in this app uses)
      and closes; on failure, renders `gh`'s own words from `ForgeWriteResult.error`, the same
      posture `gh-write.ts`'s docblock argues for everywhere else in this app.
- [ ] **The fallback path is not a dead end.** When `cli.status !== 'ok'` (not installed, not
      authenticated, wrong host), the dialog does not offer a disabled Submit button and nothing
      else — it shows why, and a one-click "Open in browser instead" that does exactly what
      today's button does (`openExternal(NEW_ISSUE_URL)`), with the diagnostics block still
      offering its own "Copy" action so the user is no worse off than before this phase.
- [ ] Wire both trigger sites: `CrashReporting()` in
      [`monitor-page.tsx`](../../../packages/app/src/features/settings/settings-pages/monitor-page.tsx)
      (`:201-286`) and the "Report a bug" link in
      [`version-notes-panel.tsx`](../../../packages/app/src/features/version/version-notes-panel.tsx)
      now open this dialog instead of calling `openExternal` directly.
- [ ] Tests: `report-issue-dialog.test.tsx` — bug vs feature toggle changes labels/title/prefill,
      a successful submit shows the issue link, a `cli`-not-ok result shows the fallback and the
      "Open in browser" path fires the same `NEW_ISSUE_URL` today's button does, and the
      diagnostics block's default-open state per `kind`.

### D — Redaction stays the single source, and nothing leaves silently (S)

- [ ] The composer never calls `redactPaths` itself — it renders whatever
      `mstudio:report:bundle` already returned, so there is exactly one redaction path in the
      app, matching Phase 65 Decision 7 ("redaction lives in `shared`, and runs on the way in").
- [ ] `AppIssueSubmitRequestSchema`'s `body` field, if the composer ever concatenates the user's
      free text with the diagnostics block before sending (rather than sending them as two
      sections `gh` joins), is capped the same way `ErrorReportSchema`'s fields are — an unbounded
      string from a renderer that may itself be misbehaving is still a second failure mode here.
- [ ] Confirm, with a test fixture, that `SECRET_PATTERNS` in
      [`redact.ts`](../../../packages/shared/src/redact.ts) needs no new entry for this phase — no
      new credential shape is introduced (the composer requests no token, stores none), so this is
      a verification bullet, not a build one.
- [ ] Every submission requires the user to have the dialog open and press Submit. No
      auto-submission on crash, no background retry queue. The dialog **is** the consent gate;
      Decision 2 below records why a separate settings toggle was rejected.

### E — The execution skill's gap, and only the gap (S)

[`.claude/skills/midnite-address-issue/SKILL.md`](../../../.claude/skills/midnite-address-issue/SKILL.md)
already covers "execute the issue tasks" end to end — scan, score, claim, reproduce, plan, build,
PR, merge, sweep — and does it well. It is not missing a stage. It is missing **one repo**. Its
own header says so, almost: *"Issues and code live in the same repo … This differs from midnite's
two-repo split — don't import those habits."* That sentence already flags the split as a known,
different shape and chooses not to build for it. Once this phase ships, real user reports start
landing in `bilo-io/midnite-apps`, a different repo from the one the fix is built and merged in
(`bilo-io/midnite-studio`) — and every `gh issue`/`gh pr` call in the skill today has no `-R`
flag, so it cannot see them.

- [ ] Extend Stage 1 ("Scan the board") to scan **two** boards, not one: this repo's own issues
      (internal/engineering, unchanged — `gh issue list --state open …` exactly as today) **and**
      `gh issue list -R bilo-io/midnite-apps --label "app: midnite-studio" --state open …` (the
      new user-facing stream this phase's composer feeds). Keep them visually distinct in the
      digest — a user-filed report and an internal backlog item carry different reporter-cost
      weight in Stage 2's scoring.
- [ ] Stage 4's claim comment and Stage 10's `Fixes #<N>` change shape for a `midnite-apps` issue:
      **`Fixes bilo-io/midnite-apps#<N>`**, GitHub's cross-repo closing keyword syntax, which
      auto-closes on merge only because both repos share the `bilo-io` owner and the PR author
      (`bilo-io`) has write access to both — true today, and worth a one-line comment in the
      skill saying why the same-repo assumption does not hold to fall back on if that ever
      changes. Every `gh issue comment`/`gh issue edit` call for a `midnite-apps` issue needs an
      explicit `-R bilo-io/midnite-apps` — nothing there defaults to the right repo the way a
      same-repo `gh` call does.
- [ ] Stage 12's post-merge wrap-up comment targets the same `-R`, for the same reason.
- [ ] **Not rewritten:** Stages 2, 3, 5–9, 11, 13 need no change — they operate on a single issue
      once found, and nothing about which repo it came from changes reproduction, scoring, the
      worktree, the build, or the sweep.

## Files this phase touches

| Area | Path |
|---|---|
| Shared | [`release.ts`](../../../packages/shared/src/release.ts) — `APP_ISSUES_REPO` (A); [`channels.ts`](../../../packages/shared/src/ipc/channels.ts) — `mstudio:report:submit-issue` (B); [`schemas.ts`](../../../packages/shared/src/ipc/schemas.ts) — `AppIssueSubmitRequestSchema`/`AppIssueSubmitResultSchema` (B); [`bridge.ts`](../../../packages/shared/src/ipc/bridge.ts) — `report.submitIssue` (B) |
| Main, forge | `forge/gh-app-issue.ts` — **new**, `createAppIssueCommand`/`createAppIssue` (A); [`gh-shell.ts`](../../../packages/desktop/src/main/forge/gh-shell.ts) — reused, unchanged (A) |
| Main, IPC | [`ipc/report-handlers.ts`](../../../packages/desktop/src/main/ipc/report-handlers.ts) — new handler (B); [`preload/index.ts`](../../../packages/desktop/src/preload/index.ts) — `report.submitIssue` (B) |
| Renderer, new component | `components/report-issue-dialog.tsx` — **new**, form + fallback (C) |
| Renderer, wiring | [`settings-pages/monitor-page.tsx`](../../../packages/app/src/features/settings/settings-pages/monitor-page.tsx) (`CrashReporting()`, `:201-286`) and [`version/version-notes-panel.tsx`](../../../packages/app/src/features/version/version-notes-panel.tsx) — open the dialog instead of `openExternal` directly (C) |
| Renderer, queries | [`services/queries.ts`](../../../packages/app/src/services/queries.ts) — `useSubmitAppIssue()` (B) |
| Redaction (unchanged, verified) | [`redact.ts`](../../../packages/shared/src/redact.ts) — no new pattern needed (D) |
| Skill | [`.claude/skills/midnite-address-issue/SKILL.md`](../../../.claude/skills/midnite-address-issue/SKILL.md) — Stage 1 dual-board scan, Stage 4/10/12 cross-repo `-R` + `Fixes owner/repo#N` (E) |
| Tests | `gh-app-issue.test.ts`, `report-issue-dialog.test.tsx` (new); `channels`/`schemas`/`bridge` ipc tests, `queries.test.ts` (extended) |

## Verification

- [ ] `moon run :typecheck :lint :test` green.
- [ ] `createAppIssueCommand` always emits `-R 'bilo-io/midnite-apps'`, never the active repo's
      slug, regardless of which repo is open when the dialog is used — a mock-bridge test with a
      different repo selected.
- [ ] A successful submit surfaces the created issue's URL, and the composer's labels match
      `kind` (`bug`+`app: midnite-studio` vs `enhancement`+`app: midnite-studio`) — verified
      against the real label set already on `bilo-io/midnite-apps` (`gh label list`, checked this
      phase, no creation step needed).
- [ ] `cli.status !== 'ok'` (not installed / not authenticated) shows the fallback, and "Open in
      browser instead" fires the exact `NEW_ISSUE_URL` today's button already uses — the
      pre-this-phase path is never regressed, only supplemented.
- [ ] The diagnostics block shown in the dialog is byte-identical to what `mstudio:report:bundle`
      returns — no second redaction, no re-formatting that could reintroduce something
      `redactPaths` already stripped.
- [ ] **Human pass, packaged build:** file one real bug report and one real feature request
      against `bilo-io/midnite-apps` from a packaged app, confirm both labels and the `app:`
      label landed correctly, and read the diagnostics block that shipped to confirm nothing in
      it should not have been public.
- [ ] `midnite-address-issue`'s Stage 1 digest lists a candidate from each board when both have
      one open, labelled distinctly.

## Not in this phase

- **Issue creation for the repo the user has open.** [Phase 54](phase-54-issues-view.md)'s own
  deferred scope; unrelated code path, different target repo, different phase.
- **An embedded GitHub issue form, or any new auth flow.** [Phase 71 Theme B](phase-71-links-that-open-in-place.md)'s
  decision stands; `gh` CLI delegation needs neither.
- **Triage UI, milestone assignment, or anything beyond title/body/two labels.** The composer
  writes what a bug/feature report needs; everything past that is a human on the board, same as
  today.
- **A persistent "diagnostics sharing" settings toggle.** The dialog's own Submit button is the
  consent gate — see Decision 2.
- **Rewriting `midnite-address-issue` beyond the dual-board / cross-repo `-R` change.** Every
  other stage is already correct for this repo's own issues and needs nothing.
- **Anything for `bilo-io/midnite-studio`'s own (private, internal) issue tracker.** That board
  is out of scope for an in-app "report a bug" feature by construction — it has no reachable
  audience beyond the one collaborator already using `.midnite/tasks/` and `/midnite-address-issue`
  directly against it.

## Decisions / open questions

- **Settled — the target is `bilo-io/midnite-apps`, not `bilo-io/midnite-studio`.** Verified this
  phase with `gh api …/repos/bilo-io/midnite-studio -q .visibility` (`private`) and the same
  against `midnite-apps` (`public`, `has_issues: true`, templates + labels already present, zero
  issues filed). A private repo cannot accept a report from someone who is not a collaborator on
  it, which is the whole crux of "allow users posting to that board" — so there is exactly one
  candidate destination, and it already carries the scaffold this phase writes to.
- **Settled — the write reuses `ForgeWriteResult`, extended with `url`, rather than a new result
  shape.** [Phase 54 Theme B](phase-54-issues-view.md#b--gh-issue-view-and-the-comments-endpoint-already-in-the-tree-m--✅-done-pr-122-2026-09-04)
  considered and rejected ProjectV2's `kind: 'ok'|'insufficient-scope'|'error'` triple for `gh
  issue view`, reasoning that endpoint has no scope-failure mode. This phase's write genuinely can
  fail that way (`gh` missing, signed out, wrong host) — the *reasoning* that made Phase 54 pick
  the plain envelope there is exactly why this phase's `cli` field earns its keep here; extending
  the existing envelope rather than reintroducing the triple keeps one shape for "a `gh` write
  that might find no credential" across the whole app.
- **Settled — no settings toggle for "share diagnostics."** *Rejected alternative:* a persistent
  opt-in switch in the Diagnostics accordion, gating whether the composer is even offered.
  *Why rejected:* the composer already shows the exact text before it is sent and requires an
  explicit Submit; a switch gating access to a dialog that itself asks for consent is a second
  gate in front of the first, not an extra safeguard.
- **Settled — labels are applied by the app, never by a dropdown.** The web templates' "App"
  dropdown exists because a human filing from the website might not know which app they mean;
  the in-app composer always knows, so it applies `app: midnite-studio` directly and never offers
  `needs-triage` (that label is specifically for the dropdown-routing-failed case, which cannot
  occur here).
- **Open — should the composer also offer "View existing reports" (a read-only list filtered to
  `app: midnite-studio`) before letting someone file a new one, to cut duplicates?**
  *Recommendation:* not in this phase. It is a second read surface against a third repo shape
  (public, no local remote, no `Forge` object at all) and would roughly double this phase's size
  for a nice-to-have; worth a follow-up once the composer has real usage to show whether
  duplicates are actually a problem.
- **Open — does `gh issue create`'s stdout format (bare URL on success) hold across `gh` versions
  worth supporting?** *Recommendation:* parse defensively (first line matching `https://github
  \.com/.+/issues/\d+`) and treat a parse miss as success-without-a-link rather than a failure —
  the issue was still filed; only the composer's "View issue" convenience link would be missing.
