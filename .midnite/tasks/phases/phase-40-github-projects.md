# Phase 40 — GitHub Projects

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

### A — Shared contracts (S)

The spine every other theme reads off; lands first, and Phase 41 consumes it unchanged.

- [ ] `ForgeProject`, `ForgeProjectField`, `ForgeProjectFieldValue`, `ForgeProjectItem` zod schemas
      in a new [`shared/src/domain/forge-project.ts`](../../../packages/shared/src/domain/forge-project.ts),
      re-exported from `domain/index.ts` alongside `forge.ts`. Kept in its own module rather than
      appended to `forge.ts` — that file is already ~750 lines and ProjectV2 is a distinct API.
- [ ] `ForgeProjectItemContent` as a **discriminated union** on `type`: `'issue' | 'pull' | 'draft'`.
      A draft item has no number and no URL; making that a union rather than three optional fields
      is what stops the renderer rendering a link to nowhere.
- [ ] `ForgeProjectField` as a discriminated union on `dataType` — `text`, `number`, `date`,
      `single_select` (carrying `options: {id, name, color}[]`), `iteration`. Only the first four
      are writable in Theme E; `iteration` parses and renders read-only, so a board that has one
      does not fail to load.
- [ ] Channels in [`shared/src/ipc/channels.ts`](../../../packages/shared/src/ipc/channels.ts)
      under the existing naming rule: `mstudio:forge-project:list`, `:items`, `:fields`,
      `:set-field`, `:add-item`. Never written as a literal anywhere else.
- [ ] Bridge method signatures on [`ipc/bridge.ts`](../../../packages/shared/src/ipc/bridge.ts),
      returning the same `GitOpResult`-style envelope the forge writes already use — a missing
      `project` scope is a normal outcome the UI renders, not a thrown error.
- [ ] `forge-project.test.ts`: schema round-trips, a `single_select` value whose option id is no
      longer in the field's option list still parses, one malformed item does not cost the page.

### B — ProjectV2 reads (M)

- [ ] `listProjects(owner, repo)` in a new
      [`forge/gh-project.ts`](../../../packages/desktop/src/main/forge/gh-project.ts) — the boards
      visible to the repo owner, via `gh api graphql`. Crib the query shapes from
      `~/Dev/midnite/packages/gateway/src/github/lib/github-projects-queries.ts`, adapting them to
      this repo's `gh`-shell transport rather than an Octokit client.
- [ ] `projectFields(projectId)` and `projectItems(projectId, cursor)` — items paginated at 100 per
      page with cursor follow-through, capped at a documented ceiling so a 5 000-item board cannot
      hang the view.
- [ ] Owner resolution: a repo's owner may be a `user` **or** an `organization`, and the ProjectV2
      root field differs. Probe once, cache the answer per owner — this is the single most common
      cause of an empty-looking projects list.
- [ ] Parsers in `gh-project.ts` (or extend
      [`gh-parse.ts`](../../../packages/desktop/src/main/forge/gh-parse.ts)) that flatten GraphQL's
      `fieldValues.nodes[]` — a heterogeneous list of `ProjectV2ItemFieldTextValue`,
      `…SingleSelectValue`, etc. — into the flat `Record<fieldId, ForgeProjectFieldValue>` the
      contract declares. This is the whole reason Theme A's union exists.
- [ ] Scope detection: recognise the `INSUFFICIENT_SCOPES` / `read:project` GraphQL error and
      return it as a distinct `kind`, not a generic failure string.
- [ ] Cache reads through the same TTL discipline the forge modules already use (see
      [`gh-cache.test.ts`](../../../packages/desktop/src/main/forge/gh-cache.test.ts)).

### C — IPC + query layer (S)

- [ ] [`ipc/forge-project-handlers.ts`](../../../packages/desktop/src/main/ipc/forge-project-handlers.ts),
      registered next to [`forge-handlers.ts`](../../../packages/desktop/src/main/ipc/forge-handlers.ts)
      and wrapped by the shared [`handle.ts`](../../../packages/desktop/src/main/ipc/handle.ts).
- [ ] Preload exposure on `window.midniteStudio` per the bridge type from Theme A.
- [ ] react-query key factory entries in
      [`services/queries.ts`](../../../packages/app/src/services/queries.ts):
      `forgeProjects(repoId)`, `forgeProjectFields(projectId)`, `forgeProjectItems(projectId)` —
      keyed so Theme E's mutations can invalidate precisely one board, not the whole forge.

### D — The Projects view (M)

- [ ] `projects` added to the `ViewId` union and `VIEW_IDS` in
      [`ui-store.ts:46,61`](../../../packages/app/src/store/ui-store.ts) — **union order encodes
      rail order**, so it goes between `reviews` and `councils`.
- [ ] `VIEW_ICON.projects` in [`nav-icons.ts`](../../../packages/app/src/components/nav-icons.ts),
      from `react-icons` — never `lucide-react`, which eslint blocks.
- [ ] Lazy `loadProjectsView` import and a render branch in
      [`app.tsx`](../../../packages/app/src/app.tsx), under the existing Suspense boundary — Phase
      36 Theme C's lazy-view rule is a budget, not a suggestion.
- [ ] `'projects'` added to `FORGE_GATED_VIEWS` at [`app.tsx:271`](../../../packages/app/src/app.tsx),
      so a repo with no resolvable remote hides the rail item and redirects rather than showing an
      empty board picker.
- [ ] `features/projects/projects-view.tsx` — a board picker (remembering the last board per repo)
      above an item table: title, type glyph, assignees, and one column per non-hidden project
      field.
- [ ] Empty, loading and error states, including the **missing-scope** state from Theme B with the
      `gh auth refresh -s project` command shown verbatim and copyable.

### E — Field writes (M)

- [ ] `setItemFieldValue(projectId, itemId, fieldId, value)` in
      [`gh-write.ts`](../../../packages/desktop/src/main/forge/gh-write.ts) or a sibling
      `gh-project-write.ts` — `updateProjectV2ItemFieldValue`, with the mutation's value shape
      chosen off the field's `dataType` (`{text}` / `{number}` / `{date}` / `{singleSelectOptionId}`).
- [ ] `addItemToProject(projectId, contentId)` — `addProjectV2ItemById`, taking an issue or PR node
      id. Reachable from the Reviews and Issues surfaces as an "Add to project ▸" action.
- [ ] Inline editing in the table: a single-select field edits as a menu of its own options, text
      and number as inputs, date as a date field. Optimistic update with rollback on failure, the
      pattern Phase 20's review write actions established.
- [ ] Writes are **never** silent: a failed mutation restores the prior value and surfaces the
      GitHub error text, not a generic "something went wrong".

### F — Wiring and the missing-scope path (S)

- [ ] Command palette entries in
      [`palette/providers.ts`](../../../packages/app/src/services/palette/providers.ts): open
      Projects, plus one entry per board once loaded.
- [ ] Native menu item in [`menu.ts`](../../../packages/desktop/src/main/menu.ts), under the
      existing Tasks group.
- [ ] Sidebar sections for the view in
      [`view-sections.ts`](../../../packages/app/src/features/repos/view-sections.ts) — the board
      list, so switching boards does not require the header picker.
- [ ] A Projects settings page (`SettingsPageId` + a page under
      [`settings-pages/`](../../../packages/app/src/features/settings/settings-pages/)): default
      board per repo, item-count ceiling, and the scope-refresh instructions in one durable place.

### G — Verification coverage (M)

- [ ] Vitest for `gh-project.ts` against **recorded GraphQL fixtures**, not live calls: a
      user-owned and an org-owned board, an item with every field type, a draft item, a
      cursor-paginated response, and an `INSUFFICIENT_SCOPES` error body.
- [ ] Vitest for the field-value flattener specifically — the union-narrowing in Theme B is where
      this phase's bugs will live.
- [ ] Playwright `e2e/projects.spec.ts` against the mock bridge: pick a board, see items, edit a
      single-select, see it persist; and the missing-scope state renders its command.
- [ ] Screenshot per the visual-phase convention: the board picker, the item table, and the
      missing-scope state.

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
