# Phase 52 — Projects, the Board, and Workflows, navigable

[Phase 40](phase-40-github-projects.md) taught this app to read a ProjectV2.
[Phase 41](phase-41-agentic-kanban.md) turned that table on its side into a board where a card runs
an agent. [Phase 50](phase-50-kanban-projects-followthrough.md) closed six gaps those two named.
All three declined the same thing, in the same words: **filtering, grouping and sorting**. Phase
40's "Not in this phase" lists *"GitHub's own project views/filters/grouping"*; Phase 41's lists
*"grouping by any field but `Status`"*; Phase 50's re-declines that verbatim. The result is a view
with no search box, no filter, no sortable column and exactly one grouping — a single-select field
matched by the **literal string `Status`**. This phase is the one that stops declining.

**Builds on.** Nothing here needs a new IPC channel or a new GraphQL query, and that is the reason
this phase is small rather than sweeping. **Every field value is already client-side**:
`ForgeProjectItem.fieldValues` ([`forge-project.ts`](../../../packages/shared/src/domain/forge-project.ts))
carries every `text`/`number`/`date`/`single_select`/`iteration` value, and the item content carries
`assignees`, `labels`, `state` and `body`. So filter, group and sort are pure client work over the
one result `useForgeProjectItems` ([`queries.ts:635`](../../../packages/app/src/services/queries.ts))
already fetches. `deriveColumns` ([`board-derive.ts:33`](../../../packages/app/src/features/projects/board/board-derive.ts))
already takes *one field* as a parameter — Theme B is letting the caller pass a different one, not
rewriting the grouper. [`MultiSelectMenu`](../../../packages/app/src/components/multi-select-menu.tsx)
already exists with search, checkmarks and the house "empty selection means everyone" convention,
and [`FilterInput`](../../../packages/app/src/components/filter-input.tsx) exists with **zero
consumers** — this phase is its first. The pattern to copy is
[`reviews-list.tsx:75-190`](../../../packages/app/src/features/reviews/reviews-list.tsx), which
already does search-plus-facets over a grouped list and is the toolbar this repo has blessed.

**Scope guardrails.** This phase does not create boards, edit a field schema, create draft issues,
write iteration values, or discover projects org-wide — [Phase 40](phase-40-github-projects.md) put
each of those out of scope for reasons that still hold. It does not build within-column reordering,
swimlanes, a local/offline task store, multi-board views, auto-advance or agent handoff — all
[Phase 41](phase-41-agentic-kanban.md)'s, all still out. It does not build an Issues view (none
exists; `features/issues/` is absent). It adds **no** new `mstudio:forge-project:*` channel and no
change to [`gh-project.ts`](../../../packages/desktop/src/main/forge/gh-project.ts) — if a theme
here seems to need one, the theme is wrong. It does not raise
`PROJECT_ITEMS_PAGE_CEILING`; filtering a truncated set is honest as long as the truncation stays
visible, and Theme A keeps it visible.

Effort tags: **S** ≈ an hour or two · **M** ≈ half a day · **L** ≈ a day plus.

## Deliverables

### A — One filter toolbar, over both modes (M) — ✅ DONE (PR #116, 2026-09-04)

The Projects view has two controls today: a board `<select>` and a Table/Board `IconButton` pair
([`projects-view.tsx:96-141`](../../../packages/app/src/features/projects/projects-view.tsx)).
No search, no facets, in either mode.

- [x] A toolbar in [`projects-view.tsx`](../../../packages/app/src/features/projects/projects-view.tsx),
      above the mode switch and **shared by both modes** — a filter is a property of what you are
      looking at, not of how it is arranged, so switching Table↔Board must not reset it.
- [x] [`FilterInput`](../../../packages/app/src/components/filter-input.tsx) for free text, matching
      title, item number and body. It has no consumers today; adopting it here is the whole reason
      it was built, and doing so is cheaper than inventing a second search input.
- [x] `MultiSelectMenu` facets for **assignees**, **labels**, **type** (issue / pull / draft) and
      **state** (open / closed / merged), following the established *empty array means everyone*
      convention that [`dashboard-store.ts:38`](../../../packages/app/src/store/dashboard-store.ts)
      documents and every other facet in this app already obeys.
  - Draft items carry no `number`, `url` or `labels` — the type facet is therefore not cosmetic, it
    is what lets a user exclude the items for which half the other facets are meaningless.
- [x] A pure `filterItems(items, filter)` in a new `features/projects/filter.ts`, with the
      view holding only the filter state. **Correction:** landed without the doc's own third
      `fields` parameter — no facet here (assignees/labels/type/state) reads a field's `dataType`,
      unlike `deriveColumns`'s own `field` argument, so it would have been an unused parameter.
      Every other pure derivation on this surface (`deriveColumns`, `applyOptimisticMove`,
      `composeCardPrompt`) lives outside its component and is unit-tested; this follows that.
- [x] The truncation footer stays truthful. `useForgeProjectItems` caps at
      `PROJECT_ITEMS_PAGE_CEILING = 10` pages and reports `truncated`; with a filter applied the
      footer must say the filter ran over a *truncated* set, not merely that N items matched.
      Filtering a partial list and presenting the result as complete is the one way this theme
      could actively mislead.
- [x] Tests: `filter.test.ts` — each facet alone, facets combined as AND across categories and OR
      within one, an empty facet matching everything, text matching title/number/body, and a draft
      item behaving correctly against a label facet it cannot satisfy. Also caught a real gap in
      `e2e/projects.spec.ts`'s own fixture — missing `body`/`labels` (zod's `.default()` masks this
      in production; the mock bridge skips validation) — the same class of bug `kanban.spec.ts`'s
      fixture already documents, now fixed here too.

### B — Group by any single-select or iteration field (M) — ✅ DONE (PR #116, 2026-09-04)

The board's grouping is `findStatusField()`
([`board-view.tsx:336`](../../../packages/app/src/features/projects/board/board-view.tsx)),
which matches a single-select field by **the literal name `Status`**. A board organised around
"Priority", or a project whose status field is called "Stage", renders an EmptyState. `deriveColumns`
itself is already generic — it takes a field and derives columns from its options.

- [x] A group-by picker in the toolbar listing every `single_select` and `iteration` field on the
      project, defaulting to a field named `Status` when one exists (so today's behaviour is the
      default, not a special case) and to the first single-select otherwise.
- [x] `findStatusField` is replaced by a `resolveGroupField(fields, preferredId)` that falls back
      predictably when the remembered field has been deleted from the project since it was chosen —
      a stale persisted id must degrade to the default, not to the EmptyState.
- [x] **Drag-to-move stays enabled for `single_select` grouping and is disabled for `iteration`.**
      The drop handler writes through `setItemFieldValue`
      ([`gh-project-write.ts`](../../../packages/desktop/src/main/forge/gh-project-write.ts)), whose
      payload shape differs for an iteration value, and writing iterations is explicitly out of
      scope per [Phase 40](phase-40-github-projects.md). Grouping by iteration is therefore a
      **read-only** arrangement, and the board must say so rather than offering a drag that fails.
      `board-view.tsx` folds this into the existing `writesEnabled` gate (so every already-tested
      disabled-drag rendering path is reused) with a `disabledReason` string naming which of the two
      causes applies.
- [x] The synthetic "No status" column generalises with it — it is "no value for the grouping
      field", and [Phase 50 Theme C](phase-50-kanban-projects-followthrough.md)'s
      `clearProjectV2ItemFieldValue` already makes it a real drop target for any single-select.
      Reads `No <field name>` now (e.g. "No Priority"), not a hardcoded "No status".
- [x] This theme explicitly **reverses** Phase 41's and Phase 50's "no grouping by a field other
      than `Status`". Recording why: both deferrals were scope decisions taken while the load-bearing
      work was elsewhere, not judgements that it was hard. `deriveColumns` was written generic on
      day one; only its caller was hardcoded.
- [x] Tests: `board-derive.test.ts` gains non-Status grouping cases; `resolve-group-field.test.ts`
      covers the default, the explicit choice, and the deleted-field fallback; `board-dnd.test.ts`
      asserts a drag is refused under iteration grouping.

### C — Sortable table columns (S) — ✅ DONE (PR #116, 2026-09-04)

The table's column order is fixed — `Title | Assignees | …fields in API order`
([`projects-view.tsx:220-228`](../../../packages/app/src/features/projects/projects-view.tsx)) —
and no header does anything when clicked.

- [x] Tri-state click-to-sort headers (ascending → descending → none), where *none* restores the
      API order rather than some other sort. A two-state toggle would make the project's own
      ordering unreachable once you had sorted.
- [x] One comparator per `dataType`: lexical for `text`, numeric for `number`, chronological for
      `date`, **option order** for `single_select` (not alphabetical — "Todo, In Progress, Done" is
      meaningful and alphabetising it destroys the meaning). **Correction, iteration:** sorted by
      `title`, not "start-date" as drafted — `ForgeProjectFieldValueSchema`'s iteration member
      carries no start date at all (`{iterationId, title}` only), and this phase adds no schema
      field to invent one, per its own hard guardrail against any schema change.
- [x] Items with no value for the sorted field sort last in both directions. An empty value is not
      "smallest"; it is absent, and it should not migrate to the top merely because the user
      reversed the direction. An unresolvable `single_select` option id (deleted/renamed since set)
      sorts last the same way, rather than crashing the comparator.
- [x] Sorting composes with Theme A's filter and runs after it, over the already-virtualized rows
      (`@tanstack/react-virtual`, `ROW_HEIGHT = 32`) — the row count changes, the virtualizer does
      not.
- [x] Tests: `sort.test.ts` — a comparator per `dataType`, single-select following option order,
      empty-last in both directions, and the tri-state cycle returning to API order.

### D — View state that survives, keyed by the right thing (S) — ✅ DONE (PR #116, 2026-09-04)

Only two things persist on this surface today: `projectBoardByRepo` and `projectsMode`
([`ui-store.ts:864,875`](../../../packages/app/src/store/ui-store.ts)). Column collapse
(`board-view.tsx:58`) is ephemeral and is lost on every remount.

- [x] Persist filter, group field, sort and column-collapse in `ui-store`, added to **both**
      `partialize` and the custom `merge` and declared in `PersistedUi` — the three places every
      other persisted key in this store appears, and forgetting `merge` is the failure mode that
      silently drops a key on the next app version. Version bumped 6 → 7, with a migration seeding
      an empty map for existing installs.
- [x] **Key it by `projectId`, not `repoId`.** This is the trap: `keys.forgeProjectItems(projectId)`
      ([`queries.ts:226`](../../../packages/app/src/services/queries.ts)) is repo-agnostic and sits
      *outside* the `repos/*` prefix the fs watcher invalidates, and one project is reachable from
      several repos. `projectBoardByRepo`/`projectsMode` are correctly repo-keyed because they answer
      "which board is this repo looking at"; a filter answers "how am I looking at this board", which
      is a property of the board.
- [x] Bound the persisted map so a user who opens many projects does not accumulate localStorage
      indefinitely — an LRU cap, evicting least-recently-used project entries. `project-view-lru.ts`'s
      `touchProjectView` relies on a plain object's string keys preserving insertion order (deleting
      and re-inserting a key moves it to the end) rather than a second bookkeeping array.
- [x] Tests: `ui-store.test.ts` — round-trips through `partialize`/`merge`, keys by project not
      repo, survives a repo switch, and the LRU evicts oldest-first.

### E — The Workflows list learns to filter (S) — ✅ DONE (PR #120, 2026-09-04)

[`workflow-list.tsx`](../../../packages/app/src/features/workflows/workflow-list.tsx) has **no
filter state at all**, and the run history beside it has none either — fine at three workflows,
not at thirty.

- [x] `FilterInput` over workflow names in the 224px list, and a status facet over the run history
      (`RunHistoryList`) so a failed run is one click away rather than a scroll.
- [x] Reuse Theme A's primitives verbatim. This theme exists partly because it is genuinely wanted
      and partly because it is the cheapest possible proof that the toolbar built in A is a
      *pattern* and not a one-off — if it does not drop in here, A built something too specific.
- [x] Tests: `workflow-list.test.tsx` — name filtering, an empty query showing everything, and the
      run-status facet. **Correction:** the status-facet cases landed in `run-history-list.test.tsx`
      instead — that component, not `workflow-list.tsx`, is what owns the facet state.

### F — Workflows adopts `panel-stack` (M) — ✅ DONE (PR #120, 2026-09-04)

[`use-panel-history.ts`](../../../packages/app/src/components/panel-stack/use-panel-history.ts)'s own
docblock names *"Projects (Phase 40) and Workflows (Phase 43)"* as its next obvious consumers.
[Phase 50 Theme D](phase-50-kanban-projects-followthrough.md) delivered the Projects half — a
board card's detail pane is `Mod+[`-reachable. Workflows still is not: moving node inspector → run
history → run node detail is a one-way trip.

- [x] A `panel-stack` instance in [`workflows-view.tsx`](../../../packages/app/src/features/workflows/workflows-view.tsx)'s
      right-hand region, so `NodeInspector` → `RunHistoryList` → `RunNodeDetail` push and pop with
      `panel.back`/`panel.forward`. A `WorkflowPanelEntry` discriminated union (`inspector | history
      | run`) drives it — the first *heterogeneous* panel-stack consumer, `councils-view.tsx`'s
      `CouncilEntry` the closer crib for that shape than `card-panel-stack.tsx`'s single-kind one.
- [x] Follow [`card-panel-stack.tsx`](../../../packages/app/src/features/projects/board/card-panel-stack.tsx)
      as the crib — it is the most recent adoption and it already settles the push/no-op/reset/
      drop-out cases that a second consumer would otherwise re-derive differently.
- [x] Both chords already yield to the terminal via `TERMINAL_YIELD_COMMANDS`
      ([`keybindings.ts`](../../../packages/shared/src/keybindings.ts)); this theme adds a consumer,
      not a binding, and must not touch the registry.
- [x] Tests: `workflow-panel-stack.test.tsx` — push, back, forward, and reset on switching workflow.

### G — The board becomes keyboard-navigable (M) — ✅ DONE (PR #120, 2026-09-04)

The board is mouse-only. Every card is a `useDraggable` and the columns are `useDroppable`
([`board-view.tsx:347,481`](../../../packages/app/src/features/projects/board/board-view.tsx));
there is no roving focus, no arrow-key movement and no keyboard route into a card's detail pane.

- [x] Roving tabindex across columns and cards: `←`/`→` between columns, `↑`/`↓` within one,
      `Enter` opening the card into the panel stack, `Escape` returning focus to the card it came
      from. One tab stop for the board as a whole, not one per card — a 200-card board must not
      cost 200 tab presses to traverse. `useDraggable`'s own attributes default `tabIndex` to `0`
      for a keyboard sensor this app never wires, which would have made every card's drag wrapper
      a second Tab stop; overridden to `-1` explicitly.
- [x] Column collapse reachable from the keyboard, and a collapsed column skipped by `←`/`→` rather
      than being a focus stop with nothing in it. Collapsing the *focused* card's own column
      rescues focus immediately (its DOM node is gone, not just visually hidden) rather than
      waiting for the next arrow press — found by testing the interaction, not just the arithmetic.
- [x] Focus must survive Theme A's filtering and Theme B's regrouping: when the focused card leaves
      the visible set, focus moves to the nearest remaining card rather than to `document.body`,
      which is what silently ends keyboard navigation mid-task.
- [x] Card **movement** by keyboard is **not** in this theme — `@dnd-kit` ships a keyboard sensor and
      wiring it is a real slice with its own announcements and confirmation semantics. Navigation
      first; the write path after. Recorded in *Not in this phase* below so it is a deferral, not
      an omission.
- [x] Tests: `board-keyboard.test.ts` (new) — the pure roving-tabindex arithmetic in isolation.
      **Correction:** the doc's own named RTL behaviours (roving focus across columns, collapsed
      columns skipped, `Enter` opening the detail pane, focus rescued when filtered out) landed as
      a new `describe` block in the existing `board-view.test.tsx` instead of a second
      `board-keyboard.test.tsx` — that file already owns `BoardView`'s real-DOM `Harness`, and a
      second copy of it would have been the exact redundancy this repo's conventions warn against.
      **Known gap, recorded rather than silently shipped:** a focused card past a virtualized
      column's (>50 cards) own render window has no DOM node for the focus-move to find —
      `board-view.tsx`'s `VirtualizedColumnItems` names it in place.

## Files this phase touches

| Area | Path |
|---|---|
| Renderer, projects view | [`projects-view.tsx`](../../../packages/app/src/features/projects/projects-view.tsx) — the toolbar (A), group picker (B), sortable headers (C) |
| Renderer, new pure modules | `features/projects/filter.ts` (A), `features/projects/sort.ts` (C), `features/projects/board/resolve-group-field.ts` (B) — each with its own test |
| Renderer, board | [`board-view.tsx`](../../../packages/app/src/features/projects/board/board-view.tsx) — `findStatusField` replaced (B), keyboard nav (G); [`board-derive.ts`](../../../packages/app/src/features/projects/board/board-derive.ts) — grouping generalised (B); [`board-dnd.ts`](../../../packages/app/src/features/projects/board/board-dnd.ts) — drag refused under iteration grouping (B) |
| Renderer, components adopted | [`filter-input.tsx`](../../../packages/app/src/components/filter-input.tsx) (first consumer, A + E), [`multi-select-menu.tsx`](../../../packages/app/src/components/multi-select-menu.tsx) (A, E), [`panel-stack/`](../../../packages/app/src/components/panel-stack/) (F) — all reused unchanged |
| Renderer, workflows | [`workflow-list.tsx`](../../../packages/app/src/features/workflows/workflow-list.tsx) (E), [`workflows-view.tsx`](../../../packages/app/src/features/workflows/workflows-view.tsx) (F) |
| Renderer, ui store | [`ui-store.ts`](../../../packages/app/src/store/ui-store.ts) — per-project view state in `PersistedUi`, `partialize` **and** `merge` (D) |
| Main / contract | **Unchanged.** No new channel, no `gh-project.ts` change, no schema change — stated here because a diff touching them means a theme went out of scope |
| Tests | `filter.test.ts`, `sort.test.ts`, `resolve-group-field.test.ts`, `board-keyboard.test.tsx`, `workflow-panel-stack.test.tsx` (new); `board-derive.test.ts`, `board-dnd.test.ts`, `ui-store.test.ts`, `workflow-list.test.tsx` (extended) |

## Verification

- [x] `moon run :typecheck :lint :test` green.
- [x] A filter set in Table mode is still applied after switching to Board and back, and vice versa.
      True by construction, not just by test: `view.filter` lives in `projectViewByProject`, keyed
      by `projectId` alone — `mode` is a separate, `repoId`-keyed store entry, so switching between
      them never touches the filter at all.
- [x] With a filter applied to a truncated result, the footer says the filter ran over a partial
      set — not just how many matched.
- [x] A project whose status-like field is **not** named `Status` renders as a board with columns,
      where today it renders an EmptyState.
- [x] Grouping by an iteration field renders columns and refuses the drag with a visible reason,
      rather than attempting a write that would fail.
- [x] Sorting a single-select column follows the field's own option order, not alphabetical; a
      third click restores the project's API order.
- [x] Filter, group field, sort and collapsed columns survive an app restart, are keyed to the
      project rather than the repo (the same project opened from a second repo shows the same view
      state), and a field deleted from the project degrades to the default grouping. Proved at the
      persistence-mechanism level (`ui-store.test.ts`'s `partialize`/`merge`/migration round-trips,
      the same zustand `persist` every other setting in this store already trusts) rather than by a
      literal app restart, which no test in this repo performs for any setting.
- [ ] The board is fully traversable from the keyboard — columns, cards, open, close — and focus is
      never lost when a filter removes the focused card. **A human pass** with the mouse untouched,
      alongside the unit tests.
- [ ] `Mod+[` walks back through a Workflows run detail to the node inspector, and typing `[` inside
      a terminal still reaches the shell. The panel registers through the same
      `useRegisterActivePanel` every other panel-stack consumer uses, so the global chord reaching
      it is structurally the same path already proven for Councils and Projects — but no test here
      exercises the *global* keybinding dispatch specifically, only the panel's own local
      back/forward. Left open rather than claimed on inference alone.
- [ ] Real-board pass on github.com: filtering and regrouping change nothing server-side, and a drag
      under a non-`Status` single-select grouping writes the field it says it does. A human pass —
      the mock bridge cannot prove the second half.

## Not in this phase

- **Board creation, field-schema editing, draft-issue creation, iteration writes, org-wide project
  discovery.** [Phase 40](phase-40-github-projects.md)'s deferrals, unchanged.
- **Within-column reordering, swimlanes, multi-board views, a local/offline task store,
  auto-advance, agent handoff.** [Phase 41](phase-41-agentic-kanban.md)'s deferrals, unchanged.
- **Keyboard card *movement*.** Theme G ships navigation; wiring `@dnd-kit`'s keyboard sensor needs
  its own announcement and confirmation semantics and is a slice of its own.
- **An Issues view.** Was still absent at the time this phase was written, and was the
  prerequisite blocking [Phase 50 Theme E](phase-50-kanban-projects-followthrough.md)'s Issues
  half — [Phase 54](phase-54-issues-view.md) built it, 2026-09-04, and shipped that exact action
  in its own Theme F.
- **Raising `PROJECT_ITEMS_PAGE_CEILING`, or moving filtering into the GraphQL query.** Both are the
  answer if a real board ever exceeds 1000 items; neither is worth its complexity while every value
  is already client-side and the truncation is visible.
- **A chips/tag primitive in `@bilo-io/ui`.** `MultiSelectMenu` renders its own selection summary and
  needs no chip. If a chip is wanted later it belongs upstream, in the shared library.
- **A URL/query-param representation of the filter.** Routing here is a single `pathForView` string
  with no query params anywhere; adding one for this surface alone would be the first, and shareable
  view state is a feature with its own design.

## Decisions / open questions

- **Settled — no new IPC.** Every value the filters, grouping and sorting need is already on
  `ForgeProjectItem`. A theme that appears to need a channel has drifted out of scope.
- **Settled — view state is keyed by `projectId`, not `repoId`.** One project is reachable from
  several repos, and the items query key is already repo-agnostic. The existing repo-keyed
  `projectBoardByRepo`/`projectsMode` answer a different question and stay as they are.
- **Settled — iteration grouping is read-only.** Its write payload differs and iteration writes are
  out of scope; offering a drag that cannot succeed is worse than not offering it.
- **Settled — single-select sorts by option order.** "Todo, In Progress, Done" carries meaning that
  alphabetising destroys.
- **Settled — Theme G is navigation only.** Keyboard *movement* is a separate slice.
- **Open — should the filter toolbar be always-visible or collapse behind a filter button?**
  *Recommendation:* always-visible. This app's other faceted surface
  ([`reviews-list.tsx`](../../../packages/app/src/features/reviews/reviews-list.tsx)) shows its
  toolbar unconditionally, and a hidden filter that is still applied is the classic way a user comes
  to believe their data has vanished.
- **Open — when a filter hides every card in a column, does the column stay or disappear?**
  *Recommendation:* stays, rendered empty. A column vanishing changes the board's shape under the
  user and makes "where did In Progress go" a question the filter caused and does not answer.
- **Open — should Theme E's workflow filter persist like Theme D's project view state?**
  *Recommendation:* no. The workflow list is short and its filter is a momentary act; persisting it
  risks a user returning to a list that looks empty. Revisit if the list grows past a screenful.
- **Open — does the group-by picker belong beside the board `<select>` or inside the filter
  toolbar?** *Recommendation:* the toolbar. Grouping is how you are looking at the board, like the
  filters; the `<select>` chooses *which board*, which is a different kind of choice.
