# Phase 40 — GitHub Projects

**Refined: x1** · 2026-09-02 · data model & IPC contract, functionality & edge cases, security & blast radius, performance & scale, testing & verification, file-map precision, per-item acceptance criteria

> **Theme A is excluded from this refinement — it is in flight.** A parallel session has it checked
> out (`.worktrees/p38-bcef-p40-a-p22-h`, claimed 2026-09-02) and is building it now. Editing the
> text of a theme someone is executing is how two sessions produce conflicting work, so **A is left
> exactly as written** and this pass covers **B–G** only.

This app already knows a great deal about a repository's forge — Phase 17 put Actions and Reviews
behind `gh`, Phase 19 gave them view-scoped homes, Phase 20 built the PR reading surface — but it
knows nothing at all about **planning**. A `grep` for `ProjectV2`, `projectsV2`, `gh project` or
`kanban` across `packages/` returns zero hits. The one place work is tracked today is a GitHub
Issue list with no status, no ordering and no board.

This phase opens that door. A **Projects** view lists the ProjectV2 boards attached to the open
repository's owner, shows one board's items as a table with its custom fields, and can **write**
two of them back: change an item's field value, and add an existing issue or PR to a board. It is
deliberately a *reading-and-nudging* surface, not a project management app — creation, deletion and
schema editing of boards stay on github.com, where they belong.

**Builds on.** [`gh-graphql.ts`](../../../packages/desktop/src/main/forge/gh-graphql.ts) is already
the GraphQL escape hatch for everything the `gh` REST surface cannot answer, and ProjectV2 is
**GraphQL-only** — there is no REST endpoint for it, which is precisely why that module exists.
[`gh-shell.ts`](../../../packages/desktop/src/main/forge/gh-shell.ts) owns spawn, quoting, host
flags, the auth probe and the two timeout constants; this phase adds no new process-spawning
machinery. The domain lands beside the existing forge contract in
[`shared/src/domain/forge.ts`](../../../packages/shared/src/domain/forge.ts), whose `ForgeRun` /
`ForgePull` / `ForgeIssue` shapes are the model to follow — including its own comment about keeping
the read and write surfaces apart in the contract. The nav registration follows the seven-step
recipe every view since Phase 19 has used; `FORGE_GATED_VIEWS` at
[`app.tsx:271`](../../../packages/app/src/app.tsx) already gates `actions` and `reviews` behind a
resolvable remote, and `projects` joins them.

**Scope guardrails.** **Read plus two writes**, nothing more. Out: creating or deleting a project,
editing a project's field *schema*, draft-issue creation, project views/filters/grouping as GitHub
models them, org-level project discovery beyond the repo owner, iteration fields, and any write
that is not `updateProjectV2ItemFieldValue` or `addProjectV2ItemById`. The **board** rendering of
this same data is [Phase 41](phase-41-agentic-kanban.md) — this phase ships the table and the
contracts the board will read; it does not ship columns.

**One honest constraint up front.** ProjectV2 requires the `project` (or `read:project`) OAuth
scope, which `gh auth login` does **not** grant by default. A user with a perfectly working
`gh` install will get a scope error the first time they open this view. Theme F treats that as a
first-class UI state with the exact `gh auth refresh -s project` command to fix it — the same
posture [`gh-shell.ts`](../../../packages/desktop/src/main/forge/gh-shell.ts)'s auth probe already
takes for a missing login, not an error toast.

Effort tags: **S** ≈ an hour or two · **M** ≈ half a day · **L** ≈ a day plus.

## Deliverables

### A — Shared contracts (S) — ✅ DONE (2026-09-02)

The spine every other theme reads off; lands first, and Phase 41 consumes it unchanged.

- [x] `ForgeProject`, `ForgeProjectField`, `ForgeProjectFieldValue`, `ForgeProjectItem` zod schemas
      in a new [`shared/src/domain/forge-project.ts`](../../../packages/shared/src/domain/forge-project.ts),
      re-exported from `domain/index.ts` alongside `forge.ts`. Kept in its own module rather than
      appended to `forge.ts` — that file is already ~750 lines and ProjectV2 is a distinct API.
- [x] `ForgeProjectItemContent` as a **discriminated union** on `type`: `'issue' | 'pull' | 'draft'`.
      A draft item has no number and no URL; making that a union rather than three optional fields
      is what stops the renderer rendering a link to nowhere.
- [x] `ForgeProjectField` as a discriminated union on `dataType` — `text`, `number`, `date`,
      `single_select` (carrying `options: {id, name, color}[]`), `iteration`. Only the first four
      are writable in Theme E; `iteration` parses and renders read-only, so a board that has one
      does not fail to load.
- [x] Channels in [`shared/src/ipc/channels.ts`](../../../packages/shared/src/ipc/channels.ts)
      under the existing naming rule: `mstudio:forge-project:list`, `:items`, `:fields`,
      `:set-field`, `:add-item`. Never written as a literal anywhere else.
- [x] Bridge method signatures on [`ipc/bridge.ts`](../../../packages/shared/src/ipc/bridge.ts),
      returning the same `GitOpResult`-style envelope the forge writes already use — a missing
      `project` scope is a normal outcome the UI renders, not a thrown error.
- [x] `forge-project.test.ts`: schema round-trips, a `single_select` value whose option id is no
      longer in the field's option list still parses, one malformed item does not cost the page.

### B — ProjectV2 reads (M) — ✅ DONE (PR #38, 2026-09-02)

- [x] `listProjects(owner, repo)` in a new
      [`forge/gh-project.ts`](../../../packages/desktop/src/main/forge/gh-project.ts) — the boards
      visible to the repo owner, via `gh api graphql`. Crib the query shapes from
      `~/Dev/midnite/packages/gateway/src/github/lib/github-projects-queries.ts` (**verified to
      exist**), adapting them to this repo's `gh`-shell transport rather than an Octokit client.
  - The transport pattern is
    [`gh-graphql.ts:88`](../../../packages/desktop/src/main/forge/gh-graphql.ts): a `ghStatus()`
    guard, a **single-line** query string built by `[...].join('')`, then
    `` `gh api graphql${apiHostFlag(forge)} -f query=${shellQuote(QUERY)} -f owner=…` `` run through
    `runInShell(command, LIST_TIMEOUT_MS)` (20 000 ms).
  - **`-f` for `String!`/`ID!`, `-F` for `Int!`** — the file's own comment explains why: `-F` would
    type-guess a string out of being one. Pagination cursors are `String!`, so `-f`.
  - Judge on **exit code, not payload**: `gh api graphql` prints a valid-JSON `errors` array and
    exits non-zero. On failure call `invalidateGhProbe()` then
    `describeGraphqlFailure(result.output)` (capped at 300 chars), exactly as `pullThreads` does.
  - Note `gh-graphql.ts`'s docblock argues for its own singularity — *"the one GraphQL read in the
    app, and why it has to be one"*. Adding a whole ProjectV2 surface widens that deliberately;
    a new `gh-project.ts` keeps the widening in its own file rather than swelling that one.
- [x] `projectFields(projectId)` and `projectItems(projectId, cursor)` — items paginated at 100 per
      page with cursor follow-through, capped at a documented ceiling so a 5 000-item board cannot
      hang the view.
  - Ceiling: **1 000 items** (10 pages). Past it, stop and return `truncated: true` — and
    **render that truncation**, per the house rule that a cap the user cannot see is the bug the
    cap was meant to prevent (`appendCapped`'s `truncated` flag is the same idea).
  - Each page is a separate `gh` subprocess through a login shell. Ten of them serially at
    `LIST_TIMEOUT_MS` each is a worst case worth stating: fetch pages **sequentially** (a cursor
    forces it anyway) and surface progress rather than blocking silently.
- [x] Owner resolution: a repo's owner may be a `user` **or** an `organization`, and the ProjectV2
      root field differs. Probe once, cache the answer per owner — this is the single most common
      cause of an empty-looking projects list.
  - Concretely: `organization(login:$owner){projectsV2(first:20){…}}` versus
    `user(login:$owner){projectsV2(first:20){…}}`. Querying the wrong root returns a **`NOT_FOUND`
    error rather than an empty list**, which is why "no boards" and "wrong root field" look
    identical from the outside.
  - *Recommendation:* skip the probe entirely and use `repositoryOwner(login:$owner)`, which
    resolves either kind, with an inline fragment on both `... on Organization` and `... on User`.
    One query, no cache to invalidate, no per-owner state. Recorded as a Decision.
  - **The reference does something different, and it is worth knowing why it does not fit.**
    `github-projects-queries.ts`'s `VIEWER_PROJECTS_QUERY` resolves both kinds off `viewer` —
    `viewer.projectsV2` for personal boards and `viewer.organizations.nodes[].projectsV2` for org
    ones. That answers *"boards **I** can see"*, not *"boards **this repo's owner** has"*, and the
    two diverge for any repo whose owner org you are not a member of. Crib its **selection sets**,
    not its roots.
  - **`read:org` is a second required scope**, and its failure is silent: the reference's own
    docblock warns that without it the org half *"returns the personal boards only rather than
    failing"*. If Theme B keeps any `viewer.organizations` path, the missing-scope state must cover
    `read:org` as well as `read:project`, and the Theme D copy must name both.
- [x] Parsers in `gh-project.ts` (or extend
      [`gh-parse.ts`](../../../packages/desktop/src/main/forge/gh-parse.ts)) that flatten GraphQL's
      `fieldValues.nodes[]` — a heterogeneous list of `ProjectV2ItemFieldTextValue`,
      `…SingleSelectValue`, etc. — into the flat `Record<fieldId, ForgeProjectFieldValue>` the
      contract declares. This is the whole reason Theme A's union exists.
  - **`safeParse` one element at a time and `continue` on failure** — the rule stated at
    [`gh-parse.ts:435`](../../../packages/desktop/src/main/forge/gh-parse.ts): *"Handing an
    unvalidated array to `…Schema.safeParse` would let zod fail the whole object over a single bad
    element … Each step is parsed on its own so a row degrades a row."*
  - That rule is load-bearing here rather than merely tidy: `fieldValues.nodes` is a **heterogeneous
    union**, and every node that is not one of the value types the inline fragments name arrives as
    a literal `{}`. A whole-array parse would therefore drop **every** item on a board that has any
    field type this contract has not seen.
  - `parseJobs` (`gh-parse.ts:407`) is the canonical shape to copy: narrow to
    `Record<string, unknown>`, coerce through the `asString`/`asId`/`asTimestamp` helpers, then
    per-element `safeParse`.
- [x] Scope detection: recognise the `INSUFFICIENT_SCOPES` / `read:project` GraphQL error and
      return it as a distinct `kind`, not a generic failure string.
  - **Put it on the Projects result, not on `ForgeCliStatus`.** That enum is
    `z.enum(['ready', 'not-installed', 'not-authenticated'])`
    ([`forge.ts:202`](../../../packages/shared/src/domain/forge.ts)) and is read by **10 files**
    across features. Adding a fourth value is a cross-surface change with a known silent
    fall-through: [`pr-checks.tsx:91`](../../../packages/app/src/features/reviews/pr-checks.tsx)
    tests `reason === 'not-installed' || reason === 'not-authenticated'` — a **denylist**, so
    `'missing-scope'` would not match and that surface would treat a scope-blocked CLI as ready.
    (`pr-detail.tsx:404` allowlists `=== 'ready'` and would behave correctly — the two styles
    disagree, which is the point.)
  - A `read:project` gap is also **feature-scoped, not CLI-global**: `gh` is installed and
    authenticated; it simply lacks one scope. `ForgeCliStatus` is cached for 30 s and shared by every
    forge surface, so a global "not ready" would wrongly darken Actions and Reviews too.
  - Call `invalidateGhProbe()` on the failure anyway — the same reasoning
    [`gh-write.ts:218`](../../../packages/desktop/src/main/forge/gh-write.ts) gives for writes:
    *"the commonest cause of a refused write is a token that has expired or lost a scope, and the
    next `ghStatus()` should find that out rather than serve a cached `ready`."*
- [x] Do **not** cache in main. Let react-query own staleness.
  - **Correction: the cited precedent does not exist and would not transfer.** There is no
    `gh-cache.ts` module —
    [`gh-cache.test.ts`](../../../packages/desktop/src/main/forge/gh-cache.test.ts) tests
    [`gh-cli.ts`](../../../packages/desktop/src/main/forge/gh-cli.ts), and the cache it covers is
    **not TTL-based**: it remembers a run *permanently once it has completed*, because "a finished
    run is finished". Its single invalidation (`forgetRun`) exists because `gh run rerun` adds an
    attempt to the same run id.
  - **A project board is never in a terminal state**, so there is nothing to key that model on. Use
    the discipline every other forge *read* uses instead: `staleTime: FORGE_STALE_MS` (60 000 ms,
    [`queries.ts:418`](../../../packages/app/src/services/queries.ts)) plus explicit invalidation
    after Theme E's mutations.
  - Worth borrowing from that test regardless — its method: *"these tests count spawns rather than
    inspecting the cache, because the spawn is the cost the cache exists to avoid."*
  - The one real TTL in the forge layer is `WORKFLOW_CACHE_MS = 5 * 60_000` in
    [`gh-cli.ts:464`](../../../packages/desktop/src/main/forge/gh-cli.ts), keyed
    `` `${forge.host}/${slug(forge)}` `` — **per repo**. That key shape is wrong for Projects: a
    board belongs to a *user or org*, not a repo, so two repos under one owner would cache the same
    boards twice and invalidate independently. Another reason to leave caching to react-query, whose
    keys this phase controls.

- [x] Fetch boards and items **sequentially**, and never per-row.
  - There is **no rate-limit handling and no concurrency ceiling anywhere in the forge layer** —
    `runInShell` spawns unconditionally, and the only backpressure is a per-call timeout
    (`LIST_TIMEOUT_MS = 20_000`). `SEARCH_CEILING = 4` exists but is streaming-search-specific and
    unused by forge.
  - So a board that refreshed per card would be N unbounded concurrent `gh api graphql` spawns with
    nothing to stop them. One query for the board, one paginated walk for its items; if a ceiling is
    ever needed, `stream-registry`'s `register`/`release`/`countOf` is the in-repo prior art, but it
    is keyed on `BrowserWindow` + stream kind and would need adapting.
  - Nothing in this app reads GitHub's `X-RateLimit-*` headers or the GraphQL `rateLimit` field.
    Caching is the de facto strategy, which is another reason Theme D's `enabled` gating matters.

### C — IPC + query layer (S) — ✅ DONE (PR #38, 2026-09-02)

- [x] [`ipc/forge-project-handlers.ts`](../../../packages/desktop/src/main/ipc/forge-project-handlers.ts),
      registered next to [`forge-handlers.ts`](../../../packages/desktop/src/main/ipc/forge-handlers.ts)
      and wrapped by the shared [`handle.ts`](../../../packages/desktop/src/main/ipc/handle.ts).
- [x] Preload exposure on `window.midniteStudio` per the bridge type from Theme A.
- [x] Validate every GraphQL node id at the schema boundary, reusing the existing validator verbatim:
      `z.string().min(1).max(256).regex(/^[A-Za-z0-9_=-]+$/, 'a node id is url-safe base64')` from
      [`ForgeResolveThreadRequest`](../../../packages/shared/src/ipc/schemas.ts) (`schemas.ts:572`).
      `projectId`, `itemId`, `fieldId` and `optionId` are all node ids and all reach a shell command.
- [x] react-query key factory entries in
      [`services/queries.ts`](../../../packages/app/src/services/queries.ts):
      `forgeProjects(repoId)`, `forgeProjectFields(projectId)`, `forgeProjectItems(projectId)` —
      keyed so Theme E's mutations can invalidate precisely one board, not the whole forge.
  - These belong in `queries.ts` (unlike councils' feature-local hooks) because they **are**
    repo-scoped and carry a `repoId`, which is the documented dividing line: `use-council.ts:13`
    keeps councils out of that file precisely because they are global.
  - **Every forge read is `enabled`-gated** on "a human opened this section" — see `useForgeIssues`
    ([`queries.ts:452`](../../../packages/app/src/services/queries.ts)) — because each is a
    subprocess plus rate-limit spend. Projects must follow it: no board is fetched until the view is
    open and a board is picked.
  - `staleTime: FORGE_STALE_MS` on all three, matching every other forge read. The default is
    `Infinity`; forge queries override it because the file watcher cannot see GitHub.
  - *Acceptance:* an RTL test asserts opening the Projects view with no board selected issues
    **zero** item fetches.

### D — The Projects view (M) — ✅ DONE (PR #38, 2026-09-02)

- [x] `projects` added to the `ViewId` union and `VIEW_IDS` in
      [`ui-store.ts`](../../../packages/app/src/store/ui-store.ts) — **union order encodes rail
      order**, so it goes between `reviews` and `councils`.
  - **The cited line numbers were stale.** The union is at **`:51`** and `VIEW_IDS` at **`:66`**;
    `:46` is a comment and `:61` is `| 'workflows'`. The file grew by five lines after this doc was
    written — [Phase 43](phase-43-workflows-mvp.md) carried the identical drift.
- [x] **A new `ViewId` touches eight files, not two.** Every one is a `Record` over the union or an
      enumerated test, so each is a typecheck or suite failure until added — but discovering them
      one red run at a time wastes an hour:

      | File | What |
      |---|---|
      | [`ui-store.ts:51,66`](../../../packages/app/src/store/ui-store.ts) | union + `VIEW_IDS` |
      | [`nav-icons.ts:39`](../../../packages/app/src/components/nav-icons.ts) | `VIEW_ICON: Record<ViewId, IconType>` |
      | [`app.tsx:243`](../../../packages/app/src/app.tsx) | a `NavItem` in `GIT_NAV_ITEMS` |
      | [`app.tsx:977`](../../../packages/app/src/app.tsx) | the render ternary arm |
      | [`title-bar-nav.tsx:40`](../../../packages/app/src/components/title-bar-nav.tsx) | breadcrumb label |
      | [`palette/providers.ts:35,50`](../../../packages/app/src/services/palette/providers.ts) | `VIEW_LABELS` + `VIEW_KEYWORDS` |
      | [`sidebar-page.tsx:34`](../../../packages/app/src/features/settings/settings-pages/sidebar-page.tsx) | Settings → Sidebar toggle |
      | [`view-sections.ts:182`](../../../packages/app/src/features/repos/view-sections.ts) | `VIEW_FILTERS` entry |

- [x] `VIEW_ICON.projects` in [`nav-icons.ts`](../../../packages/app/src/components/nav-icons.ts),
      from `react-icons` — never `lucide-react`, which eslint blocks.
- [x] Lazy `loadProjectsView` import and a render branch in
      [`app.tsx`](../../../packages/app/src/app.tsx), under the existing Suspense boundary — Phase
      36 Theme C's lazy-view rule is a budget, not a suggestion.
  - Exact form, copying `app.tsx:102`:
    `const loadProjectsView = () => import('./features/projects/projects-view');` then
    `const ProjectsView = lazy(() => loadProjectsView().then((m) => ({ default: m.ProjectsView })));`
  - The arm goes **after** the `!selectedRepoId` guard (`app.tsx:961`), unlike `councils` — Projects
    is repo-scoped, so `<EmptyWorkspace />` is the correct thing to show with no repo open.
  - One shared `<Suspense>` already wraps all thirteen views; do not add a second.
- [x] `'projects'` added to `FORGE_GATED_VIEWS` at [`app.tsx:274`](../../../packages/app/src/app.tsx)
      (**the doc's `:271` was stale by +3**),
      so a repo with no resolvable remote hides the rail item and redirects rather than showing an
      empty board picker.
- [x] `features/projects/projects-view.tsx` — a board picker (remembering the last board per repo)
      above an item table: title, type glyph, assignees, and one column per non-hidden project
      field.
  - "Remembering the last board per repo" is `Record<repoId, projectId>` in the ui-store, added to
    `PersistedUi` and `partialize`. It is a top-level key, not a `layout` key, so it needs the
    `Pick<>` union too — but **no version bump**, since an absent key falls through `merge`'s
    `...current`.
  - **Leave a header slot for a `[ Table | Board ]` toggle**, even though only Table exists here —
    this doc's own Decisions already promise it, and [Phase 41](phase-41-agentic-kanban.md) is
    blocked on it.
  - Virtualise the table past **50 rows**, using the variable-height recipe
    (`estimateSize` + `measureElement`) from
    [`diff-view.tsx:157`](../../../packages/app/src/features/diff/diff-view.tsx); house `overscan` is 24.
- [x] Empty, loading and error states, including the **missing-scope** state from Theme B with the
      `gh auth refresh -s project` command shown verbatim and copyable.
  - Five distinct states, each with literal copy so they are not re-invented: no repo remote
    (handled by the gate, never rendered) · **no boards for this owner** (*"This owner has no
    projects, or none this token can see."*) · no board picked · board has no items · **missing
    scope**, showing the command and a Copy button.
  - The missing-scope copy names the actual fix — `gh auth refresh -s project` — because the generic
    `gh auth login` hint from `ghStatus` does **not** add a scope to an existing token.
  - Use [`EmptyState`](../../../packages/app/src/components/empty-state.tsx) (`{ icon, title, body }`).

### E — Field writes (M) — ✅ DONE (PR #41, 2026-09-02)

- [x] `setItemFieldValue(projectId, itemId, fieldId, value)` in a sibling
      `gh-project-write.ts` — `updateProjectV2ItemFieldValue`, with the mutation's value shape
      chosen off the field's `dataType` (`{text}` / `{number}` / `{date}` / `{singleSelectOptionId}`).
  - **Decided: a sibling file, not `gh-write.ts`.** The draft said "or", and the Files table below
    named only `gh-write.ts` — the two disagreed. A sibling keeps the ProjectV2 surface in one place
    and matches Theme B's `gh-project.ts`.
  - **This is the one item most likely to be built wrong.** The value is *polymorphic by definition*,
    and [`gh-write.ts:193`](../../../packages/desktop/src/main/forge/gh-write.ts)'s docblock is
    explicit about what that costs: *"`-f` sends every value as a string, so `-f line=42` posts
    `"42"` and GitHub rejects it, while `-F line=42` guesses types from the text and would coerce a
    body of `"true"` into a boolean. One `JSON.stringify` is the only form where the types are
    exactly what was meant."*
  - So build the mutation the way `apiPost` builds its REST body — **JSON on stdin**, not flags:
    `` `printf %s ${shellQuote(JSON.stringify({ query, variables }))} | gh api graphql${apiHostFlag(forge)} --input -` ``.
    A number field is exactly the `-f line=42` case; a text field whose value is `"true"` is exactly
    the `-F` case. Both are reachable on a real board.
  - Signature returns `ForgeWriteResult` (`{ cli, ok, error }`), guarded by
    `const cli = await ghStatus(); if (cli.reason !== 'ready') return notReady(cli);` and closing
    with `invalidateGhProbe()` + `describeGraphqlFailure` on a non-zero exit — the exact arc
    `setThreadResolved` (`gh-write.ts:167`) follows.
- [x] `addItemToProject(projectId, contentId)` — `addProjectV2ItemById`, taking an issue or PR node
      id. Reachable from the Reviews and Issues surfaces as an "Add to project ▸" action.
  - `contentId` is a GraphQL **node id**, not an issue number. Nothing in the current forge domain
    carries one — `ForgeIssueSchema` and `ForgePullSchema` are REST-shaped — so either the Theme B
    reads must fetch node ids alongside, or this action needs its own lookup. **Name which**, or an
    executor will discover it at the call site.
  - *Recommendation:* have Theme B's item query return node ids, and defer the Reviews/Issues entry
    points to a later phase. The mutation is cheap; the plumbing to reach it from two other surfaces
    is not, and it is not what this phase is for.
- [x] Inline editing in the table: a single-select field edits as a menu of its own options, text
      and number as inputs, date as a date field. **Not optimistic** — see below.
  - **Correction, and it inverts the draft.** There is no optimistic-with-rollback pattern in this
    codebase to follow: `grep -rn "onMutate" packages/app/src` returns **zero hits**. Phase 20
    did not establish it — it explicitly *rejected* it.
    [`queries.ts:756`](../../../packages/app/src/services/queries.ts) says so verbatim: *"None of
    them is optimistic. A review that appears in the header before the forge accepted it would be
    the app lying at exactly the moment trust matters."*
    [`review-action-bar.tsx:37`](../../../packages/app/src/features/reviews/review-action-bar.tsx)
    repeats the argument for the surface.
  - So the house pattern is: **disable the control until `gh` answers**, then either invalidate or
    render `gh`'s own sentence. Copy `useSetThreadResolved`
    ([`queries.ts:719`](../../../packages/app/src/services/queries.ts)) — `mutationFn` returning
    `ForgeWriteResult`, and an `onSuccess` that checks `if (result.ok)` before invalidating, because
    **the mutation never throws** and `onSuccess` fires on refusals too.
  - Invalidate **narrowly**: mirror `invalidatePullState` (`queries.ts:764`), which invalidates the
    detail exactly plus one prefix — not the whole `forge(repoId)` subtree. A board write should
    invalidate that board's items, nothing else.
  - *This decision propagates.* [Phase 41 Theme C](phase-41-agentic-kanban.md) specifies an
    optimistic card drag on the same mutation. A drag that visibly snaps back is a stronger case for
    optimism than a text field is — but it is now a **deliberate exception** to a documented house
    rule, and that phase should argue it rather than inherit it silently.
- [x] Writes are **never** silent: a failed mutation restores the prior value and surfaces the
      GitHub error text, not a generic "something went wrong".
  - `describeGraphqlFailure` already digs `errors[].message` out of the payload and caps it at 300
    chars — use it rather than `describeFailure`, which deliberately skips lines starting with `{`
    and would report "could not complete that request" for a response that named the exact field at
    fault.
- [x] Respect the existing `forgeWritesEnabled` setting — and gate it **at the surface**, not in the
      mutation.
  - The flag is renderer-only (`ui-store.ts:670`, default **off**, persisted at `:1211`) and is
    **not checked in main** — `forge-handlers.ts` has no gate. That is deliberate, and
    `review-action-bar.tsx:31` gives the reason: *"a disabled control that explains itself is the
    whole point of gating at the surface: a mutation that silently refused would be a dead click
    with nothing to read."*
  - So: read `useUiStore((s) => s.forgeWritesEnabled)` in the editor component and render it
    disabled-with-explanation, exactly as `review-action-bar.tsx:59` and `pr-checks.tsx:187` do.
    Do not add a main-process check; do not silently no-op the mutation.
  - *Acceptance:* with `forgeWritesEnabled` off, the inline editors render disabled **and say why**,
    and no mutation is issued.

### F — Wiring and the missing-scope path (S) — ✅ DONE (PR #41, 2026-09-02)

- [x] Command palette entries in
      [`palette/providers.ts`](../../../packages/app/src/services/palette/providers.ts): open
      Projects, plus one entry per board once loaded.
  - **"Open Projects" is free.** `createViewsSource` (`:89`) derives one palette row per `VIEW_IDS`
    entry, so adding the ViewId (Theme D) supplies it. What is new is only the per-board source,
    which needs its own `PaletteSource` (`{ key, items: () => PaletteItem[] }`) fed from the loaded
    board list.
  - A per-board source must not *trigger* a fetch — it lists what is already loaded, or nothing.
    Opening the palette is not "a human opened this section".
- [x] ~~Native menu item in [`menu.ts`](../../../packages/desktop/src/main/menu.ts), under the
      existing Tasks group.~~ **Corrected, not built.** No "Tasks" group exists in `menu.ts`
      (it has File/Edit/View/Repository), and no sibling forge view — Actions, Reviews — has a
      native menu item either; only `view.graph` gets a `CommandId`, and even that has no menu
      entry. Adding one only for Projects would be new, inconsistent surface with no precedent to
      follow, so this checks off as *addressed* by not building a one-off rather than by shipping it.
- [x] Sidebar sections for the view in
      [`view-sections.ts`](../../../packages/app/src/features/repos/view-sections.ts).
  - `VIEW_FILTERS` is a `Record<ViewId, ViewFilter>` (`:182`), so an entry is **required** for the
    typecheck to pass regardless. The choice is what it contains: the sibling forge views use
    `{ sections: ['<own>', 'worktrees'], dirtyOnly: false }` (`actions`, `tests`, `reviews` at
    `:188-190`), which is the shape to copy if Projects gets its own board-list section.
  - *Recommendation:* start with `WORK_IN_PROGRESS`, matching councils, and add a dedicated
    `projects` section only if the header picker proves insufficient. A sidebar section is a second
    place to keep in sync with board state, for a picker that is already one click away.
- [x] A Projects settings page (`SettingsPageId` + a page under
      [`settings-pages/`](../../../packages/app/src/features/settings/settings-pages/)): default
      board per repo, item-count ceiling, and the scope-refresh instructions in one durable place.
  - Registration is **four edits across three files**, each enforced by a `Record` over the union:
    the id in `SettingsPageId` (`ui-store.ts:87`), a row in `SETTINGS_PAGES` (`:125`, group
    `'tools'`, beside `reviews`), an entry in `PAGE_CONTENT`
    ([`settings-view.tsx:33`](../../../packages/app/src/features/settings/settings-view.tsx)), and a
    `SETTINGS_PAGE_ICON` entry in `nav-icons.ts`.
  - The page shape is `graph-page.tsx`: a named `function ProjectsPage()` with no props returning
    `<div className="flex flex-col gap-3">` of `<Accordion title icon defaultOpen>` from
    `@bilo-io/ui`, each wrapping `<div className="p-3">`.
  - The palette picks the page up for free via `createViewsSource` — no extra palette edit.

### G — Verification coverage (M)

- [x] Vitest for `gh-project.ts` against **recorded GraphQL fixtures**, not live calls: a
      user-owned and an org-owned board, an item with every field type, a draft item, a
      cursor-paginated response, and an `INSUFFICIENT_SCOPES` error body. (`gh-project.test.ts`, PR #38)
- [x] Vitest for the field-value flattener specifically — the union-narrowing in Theme B is where
      this phase's bugs will live.
  - *Acceptance:* a fixture whose `fieldValues.nodes` contains one **unrecognised** node type still
    yields the item with its other fields intact. That is the assertion that proves the
    per-element-`safeParse` rule was followed, and the one a whole-array parse fails. (`gh-project.test.ts`, PR #38)
- [x] Vitest for `setItemFieldValue`'s command construction — assert the built command carries a
      **JSON body on stdin**, not `-f`/`-F` flags, and that a numeric value survives as a number.
      This is the item most likely to be built wrong, so it gets the assertion that catches it.
      (`gh-project-write.test.ts`, PR #41)
- [x] Vitest: with `forgeWritesEnabled` off the editor renders disabled and no bridge call is made.
      (`projects-view.test.tsx`, PR #41)
- [x] Playwright `e2e/projects.spec.ts` against the mock bridge: pick a board, see items, edit a
      single-select, see it persist; and the missing-scope state renders its command. (PR #45)
- [ ] **Open, for a human:** screenshots per the visual-phase convention — the board picker, the
      item table, and the missing-scope state.
- [ ] **Open, for a human:** one real pass against a genuine org-owned board and a genuine
      user-owned board. Owner resolution is the single most common cause of an empty-looking list,
      and no fixture proves the live root field is right.

## Files this phase touches

| Area | Path |
|---|---|
| Contract | [`shared/src/domain/forge-project.ts`](../../../packages/shared/src/domain/forge-project.ts) *(new)* |
| Channels | [`shared/src/ipc/channels.ts`](../../../packages/shared/src/ipc/channels.ts), [`bridge.ts`](../../../packages/shared/src/ipc/bridge.ts) |
| GraphQL | [`desktop/src/main/forge/gh-project.ts`](../../../packages/desktop/src/main/forge/gh-project.ts) *(new)*, [`gh-graphql.ts`](../../../packages/desktop/src/main/forge/gh-graphql.ts), [`gh-write.ts`](../../../packages/desktop/src/main/forge/gh-write.ts), [`gh-parse.ts`](../../../packages/desktop/src/main/forge/gh-parse.ts) |
| IPC | [`desktop/src/main/ipc/forge-project-handlers.ts`](../../../packages/desktop/src/main/ipc/forge-project-handlers.ts) *(new)* |
| Renderer | `app/src/features/projects/` *(new)*, [`app.tsx`](../../../packages/app/src/app.tsx), [`ui-store.ts`](../../../packages/app/src/store/ui-store.ts), [`nav-icons.ts`](../../../packages/app/src/components/nav-icons.ts), [`queries.ts`](../../../packages/app/src/services/queries.ts), [`palette/providers.ts`](../../../packages/app/src/services/palette/providers.ts), [`view-sections.ts`](../../../packages/app/src/features/repos/view-sections.ts) |
| Menu | [`desktop/src/main/menu.ts`](../../../packages/desktop/src/main/menu.ts) |

## Verification

- [ ] `moon run :typecheck :lint :test` green, and the eight-file `ViewId` checklist from Theme D is
      complete — `view-sections.test.ts` enumerates every view and fails loudly on an unhandled one.
- [ ] `moon run app:perf`: the Projects view is lazy and the entry chunk is unmoved.
- [ ] No `onMutate` anywhere in the diff — the house rule is that no forge write is optimistic, and
      this phase does not become the exception.
- [ ] `forgeWritesEnabled` off ⇒ editors disabled **with an explanation**, no mutation issued.
- [ ] A board with an unrecognised field type still lists its items.
- [ ] Opening the view with no board picked issues zero item fetches.
- [ ] The item ceiling is hit on a fixture and the truncation is **rendered**, not just returned.

- [ ] `moon run :typecheck :lint :test` green.
- [ ] Boundary lint clean: `gh-project.ts` stays in `packages/desktop`; `shared` carries only zod;
      `app` reaches ProjectV2 solely through `window.midniteStudio`.
- [ ] `moon run app:perf` still inside Phase 36's entry-chunk budget — the Projects view is lazy.
- [ ] A real board, on a real repo, with a real `gh` that **has** the `project` scope: items load,
      a single-select edit round-trips and is visible on github.com.
- [ ] The same, with a `gh` that **lacks** the scope: the missing-scope state renders and its
      command actually fixes it.
- [ ] Screenshots per Theme G.

## Not in this phase

Board creation/deletion, field-schema editing, draft-issue creation, GitHub's own project
views/filters/grouping, iteration-field writes, org-wide project discovery, and **the board
rendering** — that is [Phase 41](phase-41-agentic-kanban.md).

## Decisions / open questions

- **Resolved — nothing here is optimistic.** The draft cited "the pattern Phase 20's review write
  actions established"; Phase 20 established the opposite, in writing, twice
  ([`queries.ts:756`](../../../packages/app/src/services/queries.ts),
  [`review-action-bar.tsx:37`](../../../packages/app/src/features/reviews/review-action-bar.tsx)),
  and `onMutate` appears nowhere in the renderer. Controls disable until `gh` answers.
- **Resolved — `setItemFieldValue` sends a JSON body on stdin, not `gh` flags.** Its value is
  polymorphic by definition, which is exactly the case
  [`gh-write.ts:193`](../../../packages/desktop/src/main/forge/gh-write.ts) documents `-f` and `-F`
  both getting wrong. `printf %s <json> | gh api graphql --input -`.
- **Resolved — the ProjectV2 write lives in `gh-project-write.ts`**, not `gh-write.ts`. The draft
  said "or" and its own Files table said only `gh-write.ts`; they disagreed.
- **Resolved — owner resolution uses `repositoryOwner(login:)` with inline fragments**, not a
  cached user-vs-org probe and not the reference's `viewer` roots, which answer a different
  question.
- **Resolved — no caching in main; react-query owns staleness.** The cited `gh-cache.ts` does not
  exist, and the cache it referred to is a terminal-state cache that a never-terminal board cannot
  use.
- **Resolved — write gating stays at the surface**, per the reason already written down: a mutation
  that silently refuses is a dead click with nothing to read.
- **Open — does the missing-scope state need to cover `read:org` too?** *Recommendation:* yes if any
  `viewer.organizations` path survives Theme B, because that scope fails **silently** — you get
  personal boards only, which is indistinguishable from having no org boards. If the
  `repositoryOwner` recommendation is taken, `read:project` alone is enough and this disappears.
- **Open — should `addItemToProject` ship in this phase at all?** It needs a GraphQL **node id**,
  and nothing in the current forge domain carries one — `ForgeIssueSchema`/`ForgePullSchema` are
  REST-shaped. *Recommendation:* have Theme B's item query return node ids, and defer the
  Reviews/Issues entry points; the mutation is cheap, the cross-surface plumbing is not.
- **Noted — the reference has no `updateProjectV2ItemFieldValue`.** Its only mutation is
  `addProjectV2DraftIssue`, so the write must be authored rather than cribbed. Carry one gotcha from
  it: `rateLimit` is a `Query`-only field, and including it on a mutation fails **validation**,
  which returns a 200 with `errors[]`.

- **Settled — read plus two writes, in a dedicated Projects view.** Chosen over a contracts-only
  phase so Phase 41 inherits a proven read path rather than debugging GraphQL and a board at once.
- **Settled — the Kanban is a mode inside this view, not its own nav item.** Theme D should
  therefore build `projects-view.tsx` with a header slot ready for a `[ Table | Board ]` toggle,
  even though only Table exists here.
- **Open — how are boards discovered?** *Recommendation:* the repo **owner's** projects, plus any
  project the repo is explicitly linked to (`repository.projectsV2`). Owner-only would miss boards
  shared across repos; org-wide discovery is out of scope.
- **Open — the item ceiling.** *Recommendation:* 500 items with an honest "showing first 500" note,
  matching how Phase 5 caps the graph rather than pretending the limit is not there.
- **Open — does a missing `project` scope hide the rail item, or show the view with a fix prompt?**
  *Recommendation:* show the view with the prompt. Hiding it makes a fixable state look like a
  missing feature.
