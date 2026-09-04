# Phase 54 — An Issues view, and the deferrals waiting on it

Three phases have now declined the same piece of work in nearly the same sentence.
[Phase 50](phase-50-kanban-projects-followthrough.md) shipped "Add to project ▸" for pull requests
only and said why: *"this app has no Issues view … so an Issues entry point has no surface to live
on yet."* [Phase 52](phase-52-projects-navigation.md) carried that forward verbatim. Even
[Phase 19](phase-19-dashboard-actions-tests.md), thirty-five phases ago, opened by observing there
is *"no issues integration whatsoever."* There is a little now — `ForgeIssueSchema`, a `listIssues`
call and two small read-only surfaces — but `packages/app/src/features/issues/` does not exist, and
everything above is blocked on it. This phase builds it, and closes the deferrals behind it.

**Builds on.** More of this already exists than the absence of a directory suggests.
[`ForgeIssueSchema`](../../../packages/shared/src/domain/forge.ts) is defined, validated and served
over `mstudio:forge:issues` by a handler that is twelve lines of the usual boilerplate;
[`listIssues`](../../../packages/desktop/src/main/forge/gh-cli.ts) shells `gh issue list --json`
and [`parseIssueList`](../../../packages/desktop/src/main/forge/gh-parse.ts) already flattens its
uppercase enums and `{login}` objects. Two surfaces already render issues — the
[`IssuesSection`](../../../packages/app/src/features/repos/forge-sections.tsx) in the repos sidebar
and the [`IssuesWidget`](../../../packages/app/src/features/dashboard/widgets/forge-widgets.tsx) on
the dashboard — so the query hook, the status pill (`issueStatus()` in
[`forge-status.tsx`](../../../packages/app/src/features/forge/forge-status.tsx)) and the
`{cli, issues, disabled, error}` envelope are all in place. The view shell has a template in
[`features/actions/`](../../../packages/app/src/features/actions/), and
[`app.tsx`](../../../packages/app/src/app.tsx)'s `FORGE_GATED_VIEWS` docblock anticipates this exact
phase in as many words: *"a future forge-gated view … is one array entry, not three call sites."*

**The cheapest thing in this phase, and it is worth naming up front.** An issue's conversation needs
no new endpoint. `pullComments`
([`gh-cli.ts`](../../../packages/desktop/src/main/forge/gh-cli.ts)) already calls
`repos/{slug}/issues/{n}/comments`, and `parseIssueComments` already parses the response — because
GitHub's REST API models a pull request's conversation *as* issue comments, on the issue-numbered
route. The function this phase needs for issue comments is the one the Reviews page has been using
all along, pointed at a number that is already an issue number. Theme B should reuse it, not
reimplement it.

**Scope guardrails.** This phase builds a *view*, sized like
[`features/actions/`](../../../packages/app/src/features/actions/) (9 files, ~1,750 LOC) and not
like [`features/reviews/`](../../../packages/app/src/features/reviews/) (18 files, ~3,900 LOC).
Reviews is the richer model and the wrong one to copy wholesale: its `pr-checks`, `comment-thread`
and three-tab detail answer questions an issue does not have. It does not build issue **creation**,
milestones, projects-field editing from the issue pane, cross-repo issue search, or a notifications
inbox. It does not touch the two existing read-only issue surfaces except where a shared helper
moves. And it does not reopen [Phase 52](phase-52-projects-navigation.md)'s settled decisions about
the Projects surface — Theme E generalises code that phase wrote, in the direction that phase's own
Theme E argued for, and nothing else.

**Ordering.** Theme E depends on [Phase 52 Theme A](phase-52-projects-navigation.md) having landed
(PR #116 at the time of writing); every other theme here is independent of it. If 52 A has not
merged when this phase is picked up, build E last or split it out — do not fork `filter.ts`.

Effort tags: **S** ≈ an hour or two · **M** ≈ half a day · **L** ≈ a day plus.

## Deliverables

### A — The schema learns what a detail pane needs (S)

[`ForgeIssueSchema`](../../../packages/shared/src/domain/forge.ts) carries `number`, `title`,
`state`, `author`, `labels`, `assignees`, `updatedAt`, `createdAt` and `url` — everything a *list
row* needs and nothing a *detail pane* does. Notably it has **no `id`**, which is the ProjectV2 node
id, which is exactly the field [Phase 50 Theme E](phase-50-kanban-projects-followthrough.md)
discovered was missing from `ForgePullSchema` and had to thread through `gh-cli.ts`/`gh-parse.ts`
mid-phase. The same discovery is avoidable here by making it Theme A.

- [ ] Add `id` (node id), `body`, `commentCount` and `milestone` (nullable) to `ForgeIssueSchema`,
      and the corresponding names to `ISSUE_FIELDS` in
      [`gh-cli.ts`](../../../packages/desktop/src/main/forge/gh-cli.ts).
- [ ] `body` belongs on the **detail** response, not the list one. A list of 100 issue bodies is a
      payload nobody asked for; keep the list lean and let the detail fetch its own. `commentCount`
      is the exception — it is a row-level signal and costs nothing.
- [ ] Extend `parseIssueList` and its tests rather than writing a second parser. Its existing job
      — lowercasing `gh`'s uppercase enums, flattening `{login}` and label objects — is unchanged.
- [ ] Tests: `gh-parse` cases for the new fields, including a null milestone and a zero comment
      count, which are the two shapes a real repo produces constantly and a fixture usually omits.

### B — `gh issue view`, and the comments endpoint already in the tree (M)

`listIssues` is the only issue query that exists. There is no `gh issue view`, no comments call, and
no issue write anywhere — [`gh-write.ts`](../../../packages/desktop/src/main/forge/gh-write.ts)
excludes issues from the writable surface explicitly.

- [ ] `issueDetail(repo, number)` in `gh-cli.ts` — `gh issue view <n> --json body,…` following the
      shape of `pullDetail` exactly, returning the established `{cli, issue, error}` envelope. **Not**
      the `kind: 'ok' | 'insufficient-scope' | 'error'` triple: that is ProjectV2-only
      (`ForgeProjectReadKindSchema`), and borrowing it here would suggest a scope failure mode that
      `gh issue view` does not have.
- [ ] `issueComments(repo, number)` — **reuse `pullComments`' REST path and `parseIssueComments`
      verbatim.** `repos/{slug}/issues/{n}/comments` is the same endpoint for both, because GitHub
      models PR conversation comments as issue comments. If this theme ends up with a second
      comment parser, something has gone wrong.
  - Rename nothing on the Reviews side to make this read better. `pullComments` is called from a PR
    surface and its name is honest there; a shared internal that both call is the right shape, and
    a rename would touch a working surface for a cosmetic gain.
- [ ] Two channels, two twelve-line handlers, two schema pairs, one bridge group — the same
      boilerplate `forgeIssues` already follows, with no new pattern invented.
- [ ] Tests: `gh-cli`/`gh-parse` cases for the detail and comment shapes, plus an
      issue-with-no-comments case (the empty array, not a null).

### C — The Issues view itself (M)

- [ ] `features/issues/` as `issues-view.tsx` (shell: resolve `repoId` from `useActiveWorktree()`,
      empty state when null) → `issue-list.tsx` → `issue-detail.tsx`, a resizable split on a new
      `issuesListWidth` layout key. This is `actions-view.tsx`'s structure, deliberately, and it is
      the size target for the whole theme.
- [ ] Selection persisted in `store/issues-store.ts` — `selectedIssue: ByRepo<number>`, the exact
      shape [`reviews-store.ts`](../../../packages/app/src/store/reviews-store.ts) uses in its 52
      lines. A per-repo selection is what makes switching repos and coming back feel like returning
      rather than restarting.
- [ ] The detail pane is **one pane, not tabs.** A PR earns three tabs because it has files and
      checks; an issue has a body and a conversation, which is one scroll. Tabs here would be
      chrome imitating the Reviews page rather than serving the content.
- [ ] Open/closed state, labels with their real colours (the schema already carries six-hex-digit
      values without the `#`), assignees and the comment count on each row. Markdown bodies and
      comments render through the app's existing markdown surface, not a new one.
- [ ] Skeletons for list and detail. Reviews has a dedicated `reviews-skeletons.tsx` for a reason —
      forge calls are network-bound and a bare spinner on a two-pane layout reads as a hang.
- [ ] Tests: `issue-list.test.tsx` (rows, empty, `disabled` tracker, error), `issue-detail.test.tsx`
      (body, comments, no-comments), `issues-store.test.ts` (per-repo selection survives a switch).
- [ ] Honour `disabled` as its own state. `ForgeIssuesResultSchema` makes it a first-class field
      distinct from `error` precisely because a repo with its issue tracker switched off is a
      *configuration*, not a fault — and it must not render as one.

### D — Registering a view, in the places that actually need it (S)

Small, but wide, and easy to half-do. The compiler catches most of it and not all.

- [ ] `'issues'` into the `ViewId` union and `VIEW_IDS` (rail order) in
      [`ui-store.ts`](../../../packages/app/src/store/ui-store.ts) — `pathForView`/`viewForPath`
      derive from it, so routing needs no edit.
- [ ] `GIT_NAV_ITEMS` in [`app.tsx`](../../../packages/app/src/app.tsx), beside `projects`,
      `actions` and `reviews`; the lazy `loadIssuesView`/`IssuesView` pair in the same file's
      established inline style; and a branch in the `activeView` chain placed **after** the
      `!selectedRepoId` guard, because issues are repo-scoped. Miss that ordering and the view
      renders against a null repo instead of the workspace empty state.
- [ ] **One entry** in `FORGE_GATED_VIEWS`, exactly as that constant's docblock promises. If this
      turns into three call sites, the promise was wrong and the abstraction should be fixed rather
      than worked around.
- [ ] The five exhaustive `Record<ViewId, …>` maps that will fail typecheck until updated:
      `VIEW_ICON` ([`nav-icons.ts`](../../../packages/app/src/components/nav-icons.ts)),
      `VIEW_LABELS` ([`title-bar-nav.tsx`](../../../packages/app/src/components/title-bar-nav.tsx)),
      `VIEW_LABELS`/`VIEW_KEYWORDS` ([`providers.ts`](../../../packages/app/src/services/palette/providers.ts)),
      `VIEW_LABELS` ([`sidebar-page.tsx`](../../../packages/app/src/features/settings/settings-pages/sidebar-page.tsx)),
      and `VIEW_FILTERS` ([`view-sections.ts`](../../../packages/app/src/features/repos/view-sections.ts)).
      The last one is not a formality: it decides whether the sidebar's existing `IssuesSection`
      still shows once there is a whole view for the same data.
- [ ] `issuesListWidth` in the layout type, `DEFAULT_LAYOUT` and `LAYOUT_BOUNDS` — all three, the way
      `reviewsListWidth` and `actionsListWidth` appear in all three.
- [ ] A chord: a `view.issues` descriptor in
      [`keybindings.ts`](../../../packages/shared/src/keybindings.ts)'s `COMMANDS` (`CommandId` and
      `COMMAND_IDS` derive from it), `issues: 'view.issues'` in
      [`nav-chords.ts`](../../../packages/app/src/components/nav-chords.ts)'s `VIEW_COMMAND` — a
      **CommandId, never a chord literal**, so a rebind carries the rail tooltip with it — and the
      handler in `use-command-handlers.ts`. Follow the `Mod+Shift+<letter>` convention the other
      cross-app navigations use; a plain `Mod+<letter>` would need a `TERMINAL_YIELD_COMMANDS`
      argument this view has no reason to make.
- [ ] The command palette needs nothing — `providers.ts` maps over `VIEW_IDS` already.

### E — The filter toolbar, extracted rather than copied (M)

[Phase 52 Theme A](phase-52-projects-navigation.md) built `filter.ts` — `filterItems`,
`deriveAssigneeCounts`, `deriveLabelCounts`, the "empty array means everyone" convention — and a
`ProjectsToolbar` that lives as a **private component inside `projects-view.tsx`**, a file that grew
to roughly 700 lines in the process. Phase 52's own Theme E argued that a second consumer is the
cheapest proof a toolbar is a pattern and not a one-off. Issues is that consumer, and it is the one
that decides the question, because `filter.ts` is typed against `ForgeProjectItem` and an issue is
not one.

- [ ] Generalise `filterItems` over a **structural** shape — `{title, number, body?, assignees,
      labels, state}` — rather than the concrete `ForgeProjectItem`. Both callers satisfy it; a
      generic here is a type parameter, not an abstraction layer.
- [ ] Drop the ProjectV2-specific `types` facet from the shared path. `content.type === 'draft'` is
      meaningless for issues, and carrying it into a shared module as permanently-empty dead weight
      is how a shared module becomes a union of its callers.
- [ ] Lift `ProjectsToolbar` out of `projects-view.tsx` into `components/`, keeping its
      `MultiSelectMenu` composition unchanged — the same primitive
      [`reviews-list.tsx`](../../../packages/app/src/features/reviews/reviews-list.tsx) already uses
      for its assignee facet, so this is a third alignment rather than a new direction.
- [ ] **Do not** add a chips primitive to `@bilo-io/ui`. Phase 52 declined it explicitly and nothing
      here changes that argument.
- [ ] Blocked on Phase 52 Theme A being merged. Forking `filter.ts` to unblock this theme would
      create precisely the duplication the theme exists to prevent.
- [ ] Tests: the existing `filter.test.ts` cases must pass unchanged against the generalised
      signature — that is the actual proof the extraction was behaviour-preserving — plus new cases
      over an issue-shaped record.

### F — "Add to project ▸" for issues, closing a deferral three phases old (S)

The whole point of the dependency chain.
[Phase 50 Theme E](phase-50-kanban-projects-followthrough.md) shipped this action for PRs and left
the Issues half explicitly blocked on a surface to attach it to.

- [ ] The same "Add to project ▸" action on the issue detail pane, reusing `addItemToProject` and
      the board picker from
      [`review-action-bar.tsx`](../../../packages/app/src/features/reviews/review-action-bar.tsx)
      without modification. `addItemToProject`'s own docblock names *"the Reviews and Issues
      surfaces"* as its two intended entry points; this is the second one finally arriving.
- [ ] Requires Theme A's `id`. The mutation takes a node id, and the schema has never carried one —
      the same gap Phase 50 hit on the PR side.
- [ ] Gated on `forgeWritesEnabled`, like every other write in this app. No new gate, no exception.
- [ ] Update [Phase 50's](phase-50-kanban-projects-followthrough.md) Theme E entry and
      [Phase 52's](phase-52-projects-navigation.md) deferral note to record that the blocker is
      gone, rather than leaving two docs asserting a limitation that no longer holds.

### G — Two writes, and only two (M)

An issue view that cannot reply is a worse GitHub. But the write surface is where Reviews spent most
of its size — `review-action-bar.tsx` alone is 561 lines — so this theme names its two writes and
stops.

- [ ] **Comment** and **close / reopen**. Both through
      [`gh-write.ts`](../../../packages/desktop/src/main/forge/gh-write.ts), which excludes issues
      today, using the JSON-on-stdin (`--input -`) pattern
      [`gh-project-write.ts`](../../../packages/desktop/src/main/forge/gh-project-write.ts)
      documents — never `-f`/`-F`, which string-coerce and type-guess — and returning the existing
      `ForgeWriteResult` `{ok, cli, error}` envelope.
- [ ] Both gated on `forgeWritesEnabled`; both refetch the detail on success rather than mutating a
      cache optimistically, matching the house rule that only the board's drag is optimistic.
- [ ] **Labels, assignees and milestone editing are out.** Each needs its own picker over its own
      remote vocabulary, which is three more surfaces and the reason Reviews' action bar is the size
      it is. Recorded below as deferred, so it reads as a decision rather than an oversight.
- [ ] Tests: a write refused when the gate is off, a successful comment refetching the detail, and a
      close/reopen round trip against a mock bridge.

## Files this phase touches

| Area | Path |
|---|---|
| Contract | [`forge.ts`](../../../packages/shared/src/domain/forge.ts) — `id`/`body`/`commentCount`/`milestone` on `ForgeIssueSchema`, a detail schema + envelope (A, B); [`channels.ts`](../../../packages/shared/src/ipc/channels.ts), [`schemas.ts`](../../../packages/shared/src/ipc/schemas.ts), [`bridge.ts`](../../../packages/shared/src/ipc/bridge.ts) — detail + comments (B); [`keybindings.ts`](../../../packages/shared/src/keybindings.ts) — `view.issues` (D) |
| Main, forge | [`gh-cli.ts`](../../../packages/desktop/src/main/forge/gh-cli.ts) — `ISSUE_FIELDS`, `issueDetail`, `issueComments` reusing the PR comments path (A, B); [`gh-parse.ts`](../../../packages/desktop/src/main/forge/gh-parse.ts) — extended `parseIssueList` (A); [`gh-write.ts`](../../../packages/desktop/src/main/forge/gh-write.ts) — comment + close/reopen (G); `forge-handlers.ts` — two handlers (B) |
| Renderer, new view | `features/issues/` — `issues-view.tsx`, `issue-list.tsx`, `issue-detail.tsx`, `issue-action-bar.tsx`, skeletons (C, F, G) |
| Renderer, store | `store/issues-store.ts` — new, per-repo selection (C); [`ui-store.ts`](../../../packages/app/src/store/ui-store.ts) — `ViewId`, `VIEW_IDS`, `issuesListWidth` in all three layout places (D) |
| Renderer, registration | [`app.tsx`](../../../packages/app/src/app.tsx) — nav item, lazy load, render branch, one `FORGE_GATED_VIEWS` entry (D); [`nav-icons.ts`](../../../packages/app/src/components/nav-icons.ts), [`title-bar-nav.tsx`](../../../packages/app/src/components/title-bar-nav.tsx), [`providers.ts`](../../../packages/app/src/services/palette/providers.ts), [`sidebar-page.tsx`](../../../packages/app/src/features/settings/settings-pages/sidebar-page.tsx), [`view-sections.ts`](../../../packages/app/src/features/repos/view-sections.ts) — the five exhaustive maps (D); [`nav-chords.ts`](../../../packages/app/src/components/nav-chords.ts) (D) |
| Renderer, shared filter | `features/projects/filter.ts` → generalised; `ProjectsToolbar` lifted out of `projects-view.tsx` into `components/` (E) |
| Renderer, queries | [`queries.ts`](../../../packages/app/src/services/queries.ts) — `useForgeIssueDetail`, `useForgeIssueComments`, and a paged `useForgeIssues` the view can drive (B, C) |
| Docs | [`phase-50`](phase-50-kanban-projects-followthrough.md), [`phase-52`](phase-52-projects-navigation.md) — deferral notes updated once the blocker is gone (F) |
| Tests | `issue-list.test.tsx`, `issue-detail.test.tsx`, `issues-store.test.ts`, `issue-action-bar.test.tsx` (new); `gh-parse`, `filter.test.ts`, `use-command-handlers.test.ts` (extended) |

## Verification

- [ ] `moon run :typecheck :lint :test` green.
- [ ] The Issues view is reachable from the rail, the command palette and its chord, is hidden and
      redirected away from on a repo with no GitHub remote (like the other three forge views), and
      shows the workspace empty state — not a null-repo render — when no repo is selected.
- [ ] A repo with its issue tracker **disabled** shows the disabled state, not an error state.
- [ ] An issue's conversation renders from the same REST path the Reviews page already uses, and the
      diff adds no second comment parser.
- [ ] Selecting an issue, switching repos and switching back returns to the same issue.
- [ ] Phase 52's `filter.test.ts` passes unchanged against the generalised `filterItems`, and the
      Projects view's filtering behaviour is visibly identical after the extraction.
- [ ] "Add to project ▸" on an issue adds it to the chosen board — against a mock bridge in the
      suite, and **a human pass** on github.com, the same posture
      [Phase 50 Theme E](phase-50-kanban-projects-followthrough.md) took for the PR half.
- [ ] With `forgeWritesEnabled` off, neither write is offered; with it on, a comment appears after
      the refetch and a close/reopen round-trips. **A human pass** for the real-repo half.
- [ ] Phase 50's and Phase 52's deferral notes no longer claim an Issues view is missing.

## Not in this phase

- **Creating issues.** A composer with title, body, labels and assignees is its own surface, and
  this phase's argument is that the *reading* gap is what blocks other work.
- **Label, assignee and milestone editing.** Three pickers over three remote vocabularies; Theme G
  ships the two writes that need no picker at all.
- **A three-tab detail pane, checks, or review threads.** Those belong to a pull request. Copying
  Reviews' shape here would be chrome without content.
- **Cross-repo issue search, or a notifications inbox.** Both are new data surfaces, not this view.
- **Retiring the sidebar `IssuesSection` or the dashboard `IssuesWidget`.** Theme D decides whether
  the sidebar section still *shows* alongside a full view; removing either is a separate call about
  surfaces this phase does not otherwise touch.
- **A chips primitive in `@bilo-io/ui`.** Declined by Phase 52; unchanged here.
- **Issue templates, reactions, linked-PR resolution.** All real GitHub features, none of them the
  blocker anything is waiting on.

## Decisions / open questions

- **Settled — sized like `features/actions/`, not `features/reviews/`.** Reviews is 18 files and
  ~3,900 LOC because a PR has files, checks and review threads. An issue has a body and a
  conversation, and a view that imitates the larger shape would carry tabs with nothing behind them.
- **Settled — issue comments reuse `pullComments`' REST path and parser.** GitHub serves both from
  `repos/{slug}/issues/{n}/comments`; a second parser would be duplication of a function this repo
  already tests.
- **Settled — the `{cli, …, error}` envelope, not ProjectV2's `kind` triple.** The
  `insufficient-scope` arm exists because ProjectV2 needs a token scope `gh issue view` does not.
- **Settled — `id` lands in Theme A, before anything needs it.** Phase 50 discovered the same gap
  mid-theme on the PR side and had to thread it through two files under time pressure.
- **Settled — two writes only.** Comment and close/reopen need no picker; everything else does.
- **Open — does the sidebar's `IssuesSection` stay once a full view exists?** *Recommendation:* keep
  it. It is collapsed by default and lazily fetched, it is a glance rather than a workspace, and the
  Reviews view has never displaced the sidebar's PR section either — consistency argues for keeping
  both.
- **Open — should the list default to open issues, or remember the last state filter per repo?**
  *Recommendation:* default to open, and remember the filter per repo once
  [Phase 52 Theme D](phase-52-projects-navigation.md)'s persistence pattern is available to copy.
  Two mechanisms for "remember how I was looking at this" is one too many.
- **Open — what chord?** *Recommendation:* `Mod+Shift+i`, following the `Mod+Shift+<letter>`
  convention the other cross-app navigations use. Worth checking against the registry at
  implementation time rather than trusting this note — the registry is the source of truth and it
  has moved twice.
- **Open — should Theme E's extraction land as its own PR, ahead of the view?** *Recommendation:*
  yes. It touches a surface another session may still have open, it is behaviour-preserving by
  design, and a refactor reviewed on its own is a refactor that can be reverted on its own.
