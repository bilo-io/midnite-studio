# Phase 41 — Agentic Kanban

**Refined: x1** · 2026-09-02 · data model & IPC contract, concurrency & cancellation, performance & scale, functionality & edge cases, testing & verification, sequencing & dependencies, file-map precision, per-item acceptance criteria

[Phase 40](phase-40-github-projects.md) taught this app to read a GitHub Project. This phase turns
that table on its side and gives each card a **running agent**.

The board is a `[ Table | Board ]` mode toggle inside the Projects view — the same data, the same
picker, the same forge gate — because a second nav item over one data source means a second board
picker and a second gating path to keep honest. Columns are the project's `Status` single-select
field. Cards are its items. Dragging a card between columns is an
`updateProjectV2ItemFieldValue` mutation, not local state.

What makes it *agentic* is the second half: a card can **launch an agent against its own task**,
and while that agent runs the card grows a gradient glow border and embeds a live terminal showing
exactly what it is doing. This is the shape the sibling `~/Dev/midnite` app's tasks board has
(`board-view.tsx`, `session-card.tsx`, `session-terminal.tsx`) — re-implemented against this app's
IPC and broker rather than ported, exactly as Phase 34 did for councils.

> ## ✅ The Phase 40 block is resolved (2026-09-02)
>
> The x1 audit's first finding governed scheduling; it no longer applies. Phase 40 Themes A–F have
> landed (PRs #38, #41), and every one of the seven things this phase named as missing now exists:
>
> | What Phase 41 needed | State |
> |---|---|
> | `shared/src/domain/forge-project.ts` | ✅ landed, Phase 40 Theme A |
> | `packages/app/src/features/projects/` | ✅ landed, Phase 40 Theme D |
> | The ProjectV2 read path + its IPC channels | ✅ landed, Phase 40 Themes B/C |
> | `projects` in `ViewId` / `VIEW_IDS` / `VIEW_ICON` / the rail | ✅ landed, Phase 40 Theme D |
> | `projects` in `FORGE_GATED_VIEWS` | ✅ landed, Phase 40 Theme D |
> | `setItemFieldValue(projectId, itemId, fieldId, value)` | ✅ landed, Phase 40 Theme E |
> | "Phase 40 Theme E's inline editors" | **confirmed weak, as predicted below — not extracted** |
>
> **The one dependency that was "weaker than it looks" resolved the way this doc predicted.** Phase
> 40 Theme E built its editors (`ProjectFieldCell`, `SingleSelectEditor`, `TextLikeEditor`) inline in
> `projects-view.tsx`, coupled to the table cell's own layout and to a `useSetProjectItemField` call
> scoped to one project — not as a standalone, reusable API. **Theme B builds its own** for the card
> detail pane rather than importing these.
>
> Theme A (this theme) shipped in [PR #42](https://github.com/bilo-io/midnite-studio/pull/42):
> the `[ Table | Board ]` toggle, `projectsMode` persistence, and `deriveColumns`. Themes B onward
> remain open.

**Builds on.** Every ingredient already exists and none of them is new work:
[`loop-glow.ts`](../../../packages/app/src/features/loops/loop-glow.ts) is the running-glow idiom,
built renderer-side in Phase 39 precisely because `DEFAULT_LOOPS.color` is a Tailwind class no
`box-shadow` can read — a card reuses it rather than inventing a second glow.
[`TerminalSurfaceSchema`](../../../packages/shared/src/terminal.ts) is already the mechanism for "a
session that renders in *this* panel and is filtered out of the main stack entirely" — Phase 35
added `'fab'` to it for the FAB tabs, and this phase adds `'kanban'` the same way, inheriting
`terminals.json` persistence, broker restart survival and the activity pipeline unchanged. The
[broker](../../../packages/desktop/src/broker/server.ts) already spawns and tracks detached
sessions. `@dnd-kit` is already a dependency, already driving drag-reorder in the repos sidebar and
the terminal session list.
[`start-agent.ts`](../../../packages/app/src/features/terminal/start-agent.ts) already owns the
per-agent invocation flag table.

### What the x1 refinement corrected

Four claims in the first draft do not survive contact with the code. Each is corrected in place
below.

1. **Adding `'kanban'` to the enum does the *opposite* of what Theme D promises.** The draft says
   kanban sessions are "filtered out of the main terminal panel … the same filter `'fab'` sessions
   already pass through". But that filter is a **deny-one** test —
   `onMainSurface(s) { return s.surface !== 'fab'; }`
   ([`terminal-store.ts:625`](../../../packages/app/src/features/terminal/terminal-store.ts)) — so a
   `'kanban'` session returns `true` and renders in the main panel *and* its session list. **Five
   `'fab'` literals break this way**, listed in Theme D.
2. **`taskRef` is silently dropped unless the shared schema learns it.**
   `TerminalSaveRequest = z.object({ session: TerminalSessionSchema })`
   ([`schemas.ts:1033`](../../../packages/shared/src/ipc/schemas.ts)) and the handler saves
   `parsed.data.session` — the **zod output**. zod strips unknown keys, so a `taskRef` the renderer
   sets never reaches `terminals.json`. This is the single most important mechanical fact in the
   phase.
3. **There is no viewport-driven xterm mounting anywhere, and a WebGL cap is waiting.** Both
   existing multi-xterm hosts mount every session they own and rely on the whole container
   unmounting. Worse, each instance takes **its own WebGL context**, Chromium caps them (~16 per
   process) and evicts the oldest by dropping its context — and
   [`terminal-view.tsx:364`](../../../packages/app/src/features/terminal/terminal-view.tsx)'s
   `onContextLoss(() => webgl.dispose())` degrades that instance to the DOM renderer **permanently**,
   because nothing re-adds the addon. Nothing counts contexts today.
4. **The xterm unmount throw is not Phase 36's, and it was never fixed.** Only
   [`outstanding.md:106`](../outstanding.md) records it; grepping
   [phase-36](phase-36-performance-diet.md) for `StrictMode`/`Viewport` returns nothing. It is
   upstream in `@xterm/xterm`, dev-server/StrictMode only, never in a packaged build, and
   deliberately not worked around. A test asserting "no throw on unmount" **would fail against
   `main` today**.

**Scope guardrails.** Cards are **ProjectV2 items and nothing else** — there is no local task store
to reconcile, no offline mode, and a repo with no project shows the board's empty state. One board
at a time. Columns come from the `Status` field specifically; a project without one gets an
explanatory empty state rather than an invented grouping. Out: swimlanes, multi-select grouping,
card-level sub-tasks, agent-to-agent handoff, auto-advancing a card on agent success, and any
write beyond the field mutation Phase 40 Theme E already ships.

**The safety posture, stated deliberately.** Phase 34 made this app's first auto-executing agent
exception, and justified it on the grounds that a council member never touches a repo. **A Kanban
agent does touch the repo** — that is the entire point. So this phase keeps the *original* posture:
launching from a card **types the command and does not send it** (the `start-agent.ts` rule), and
the card's composer shows the exact command before you commit to it. A one-click "launch and run"
is a decision for a later phase, with a confirm, not a default here.

**And the argument the draft was missing.** The nearest precedent contradicts this posture:
[`use-loop-session.ts:108`](../../../packages/app/src/features/loops/use-loop-session.ts) starts its
FAB session with `autoSend: true`, reasoning that *"the explicit Start press IS the confirmation the
withheld Return normally collects"*. That reasoning is sound **for a loop** and does not carry here,
for a reason worth writing down: a FAB loop runs a **fixed prompt the user authored**, from a known
registry. A Kanban card composes its prompt from **remote GitHub data** — an issue title and body
that any contributor could have written. Typed-not-sent is what puts a human between untrusted
remote text and an agent with write access to the checkout.

Effort tags: **S** ≈ an hour or two · **M** ≈ half a day · **L** ≈ a day plus.

## Deliverables

### A — The board shell (M) — ✅ DONE (PR #42, 2026-09-02)

- [x] `[ Table | Board ]` toggle in the Projects view header, persisted per repo in
      [`ui-store.ts`](../../../packages/app/src/store/ui-store.ts) — the board is a *mode*, not a
      route, so nothing about `ViewId` or `FORGE_GATED_VIEWS` changes.
  - `projectsMode: Record<string, 'table' | 'board'>` keyed by `repoId`, added to `partialize`
    ([`ui-store.ts:1173`](../../../packages/app/src/store/ui-store.ts) is where `fabSessions` does
    it) and **shallow-spread on rehydrate**, the merge the comment at `:1240` explains is needed so
    a saved map does not drop keys added since.
  - The gate is inherited, not rebuilt: Phase 40 adds `'projects'` to
    `FORGE_GATED_VIEWS` ([`app.tsx:271`](../../../packages/app/src/app.tsx)) and the board lives
    inside that view, so it is gated for free. **Add nothing to that array here.**
- [x] `features/projects/board/board-view.tsx` — columns derived from the project's `Status`
      single-select field, in the field's own option order, each with its option colour as an
      accent.
  - Derivation is a **pure exported function**, `deriveColumns(field, items): Column[]`, so Theme I
    can test option order, a missing field and an item whose option id is no longer in the field
    without mounting anything.
  - An item whose `Status` is empty goes to a leading **"No status"** column, not dropped and not
    invented into the first real one.
- [x] Horizontal column scroll with vertical scroll *inside* each column, so a 40-card column does
      not stretch the page — the overflow discipline the diff and graph views already follow.
- [x] Explicit empty states: no board selected, board has no `Status` field, board has no items,
      and a column with none.
  - Literal copy, so it is not re-invented per state: *"Pick a project to see its board."* ·
    *"This project has no Status field — the board groups by Status, so there are no columns to
    show."* · *"This project has no items yet."* · a column with none renders a dashed drop zone
    reading *"Drop here"*, which doubles as the drag affordance.
  - Use [`EmptyState`](../../../packages/app/src/components/empty-state.tsx) (`{ icon, title, body }`),
    as `councils-view.tsx:25` does.
- [x] Column headers carry a live count and collapse to a rail, so a Done column with 200 items is
      not the whole screen.
- [x] **The board must not eagerly load every column.** Every forge read in this app is gated on
      `enabled` — "a human opened this section" — because each is a `gh` subprocess plus rate-limit
      spend; see `useForgeIssues`
      ([`queries.ts:452`](../../../packages/app/src/services/queries.ts)) and the shared
      `FORGE_STALE_MS = 60_000` at `:418`. A board that fetches all columns on mount would be the
      first violation of that convention in the codebase.
  - One paged read for the board's items, `enabled` on the Board mode being active — **not one
    query per column.** Columns are a client-side grouping of one item list, which is also why
    `deriveColumns` is pure.

### B — Cards (M) — ✅ DONE (PR #43, 2026-09-02)

- [x] `board/task-card.tsx` — title, the type glyph from `ForgeProjectItemContent`'s discriminant
      (issue / PR / draft), assignee avatars, ~~labels~~, and `#number` linking out to github.com for
      the two types that have one.
  - **Corrected — no labels row.** `ForgeProjectItemContent` carries no labels field at all
    (`assignees: string[]` is the whole of it); this claim did not survive contact with the
    contract, so nothing was built against data that does not exist. Avatars use GitHub's own
    `<login>.png` convention — the content only ever carries a login, never an avatar URL.
  - A draft item has no `number` and no URL — render no link rather than a dead one. This is the
    discriminant's whole purpose.
- [x] Non-`Status` field values render as compact chips, so a board that leans on a custom
      `Priority` or `Size` field is legible without opening anything.
- [x] Card detail — clicking a card opens the item in a right-hand pane (body, assignees, all
      fields editable). **Not the agent composer from Theme G** — that theme does not exist yet;
      this pane is read-and-edit only, exactly like the table it shares its editors with.
  - **Confirmed: Phase 40's inline editors were not importable**, exactly as this Decision
    predicted. Extracted into `field-editor.tsx`; the table now adopts the extracted version.
- [x] Virtualise a column past a threshold, rather than rendering 200 DOM cards per column.
  - Threshold **50 cards**; below that the DOM cost is not worth the machinery.
  - Cards are variable-height, so the model is
    [`diff-view.tsx:157`](../../../packages/app/src/features/diff/diff-view.tsx) — `estimateSize`
    paired with `measureElement: (el) => el.getBoundingClientRect().height` — not the graph's
    fixed-height recipe. House default `overscan: 24`.
  - **This is the first per-container virtualizer in the app.** All six existing `useVirtualizer`
    call sites are one-per-view; none is instantiated per element in a loop. Say so, because "reuse
    the approach the commit graph already proved" (the draft's wording) understates it.

### C — Drag between columns (M) — ✅ DONE (2026-09-02)

> **Re-tagged: this is the theme with the least precedent.** A `grep` for `onDragOver`, `arrayMove`,
> `rectSortingStrategy`, `closestCorners` and `pointerWithin` across `packages/app/src` returns
> **zero hits**. Every one of the four `@dnd-kit` call sites is a single-container list reorder or a
> discrete drop target. True column-to-column dnd is new machinery here.

- [x] `@dnd-kit` drag from column to column, writing `Status` via Phase 40 Theme E's
      `setItemFieldValue`. **Optimistic** — the card moves on drop, and rolls back with the
      GitHub error text if the mutation fails.
  - Built as one shared `moveItemToColumn(itemId, toColumnId)` in `board-view.tsx`, called by both
    `onDragEnd` and the "Move to ▸" menu below — one optimistic-move-plus-rollback path, not two.
  - Reused the `activationConstraint: { distance: 6 }` every call site shares, and a
    discriminated-union payload (`CardDragPayload`/`ColumnDropPayload` in `board-dnd.ts`) rather
    than loose string ids, per `graph-dnd.tsx:24`'s model.
  - Collision strategy: **`closestCorners`** (the recorded Decision), not `pointerWithin`.
  - **`SortableContext`/`useSortable` not used at all** — within-column order is read-only (see
    below), so cards are plain `useDraggable` and columns plain `useDroppable`; no
    `SortableList` reuse, and no multi-container `SortableContext` either.
  - `applyOptimisticMove(items, itemId, statusField, toColumnId)` is the pure reducer
    (`board-dnd.ts`), tested in `board-dnd.test.ts` including its own rollback-relevant no-ops: a
    target of `NO_STATUS_COLUMN_ID` (never a valid drop — see below) and an orphaned option id.
  - *Acceptance met:* `e2e/kanban.spec.ts`'s "a rejected drop rolls back and surfaces the GitHub
    error text" — the card returns to Todo and the toast carries `result.message`/`result.hint`.
  - **Gated on `forgeWritesEnabled`, at the surface** — `useDraggable({ disabled: !writesEnabled })`,
    matching the table's own `ProjectFieldCell`; a drag is a write like any other write in this app.
- [x] Use a `<DragOverlay dropAnimation={null}>`, not an in-place transform.
  - Renders the dragged `TaskCard` itself, covering the virtualized-column case
    [`graph-dnd.tsx:84`](../../../packages/app/src/features/graph/graph-dnd.tsx) names.
  - Uses `over.data.current` (`ColumnDropPayload`), never pointer coordinates.
- [x] Within-column ordering is **read-only in this phase** — no `SortableContext`, no reorder
      handler; a drop only ever targets a column, never a position inside one.
- [x] **"No status" is not a droppable column at all**, discovered while building this: clearing a
      field is `clearProjectV2ItemFieldValue`, a mutation Phase 40 Theme E never built (it shipped
      only `updateProjectV2ItemFieldValue`, which requires a real option id). `useDroppable({
      disabled: column.id === NO_STATUS_COLUMN_ID })` — a real constraint the draft did not name,
      not an oversight.
- [x] Keyboard-accessible column moves — shipped as the recorded Decision: **not** a
      `KeyboardSensor`. A card's context menu (right-click, or the OS context-menu key / Shift+F10,
      which fire the same DOM `contextmenu` event) offers "Move to ▸ <column>", calling the same
      `moveItemToColumn` the drop does.
  - **Not bound to `Enter`, correcting the draft.** `TaskCard`'s own root already answers
    `Enter`/`Space` by opening the card detail pane (Theme B, tested); doubling that key would
    silently break one of the two meanings. The context-menu path is the accessible one instead.
  - A collapsed column also auto-expands on drag-over (a Decision from the exec pass, "allow drop,
    auto-expand") — dragging near a collapsed rail opens it rather than requiring it pre-opened.
- [x] **Corrected, not built as the doc first framed it — "pause invalidation while a drag is
      active" turns out to be structurally unnecessary.** The optimistic move lives in local
      component state (`optimisticItems` in `board-view.tsx`), layered over the `items` prop rather
      than written into the query cache — so a concurrent refetch updates a value the overlay is
      already covering, and the overlay only lifts once the mutation's own outcome (`onSuccess` /
      rollback) says to. Separately, `keys.forgeProjectItems` sits outside every prefix the repo
      watcher invalidates today (see `queries.ts`'s own note beside that key), so the literal
      collision the draft named is not even reachable yet.

### D — A session bound to a card (L) — ✅ DONE (PR #47, 2026-09-02)

- [x] `'kanban'` added to
      [`TerminalSurfaceSchema`](../../../packages/shared/src/terminal.ts) (line 34), alongside
      `'main'` and `'fab'`.
  - Widening the enum is backward compatible for parsing — old rows carry no `surface` at all — but
    **not for the reason the draft gives.** There is no `.default('main')` anywhere; the field is
    `surface: TerminalSurfaceSchema.optional()` (`terminal.ts:363`) and "absent means main" is a
    *convention enforced by a predicate*, not by zod.
- [x] **Fix all five `'fab'`-shaped checks.** This is the item that makes the surface actually work,
      and each is a real behaviour change with existing test coverage.

      | Site | Today | Breaks how |
      |---|---|---|
      | [`terminal-store.ts:625`](../../../packages/app/src/features/terminal/terminal-store.ts) `onMainSurface` | `surface !== 'fab'` | kanban sessions render in the main panel **and** its list |
      | `terminal-store.ts:339` | `surface === 'fab' && !entry.live ? { asleep: true }` | a restored kanban session comes back **ended**, not asleep — the stale-glow bug Theme H exists to prevent |
      | `terminal-store.ts:426` | `activeId: surface === 'fab' ? state.activeId : session.id` | launching from a card **steals the main panel's selection** |
      | [`start-agent.ts:38`](../../../packages/app/src/features/terminal/start-agent.ts) | `surface?: 'main' \| 'fab'` | a hand-written union duplicating the zod enum; widening the schema does **not** widen this |
      | `start-agent.ts:55` | `if (surface !== 'fab') setTerminalOpen(true)` | launching from a card **pops the main terminal panel open** |

  - Invert `onMainSurface` to an allowlist: `surface === undefined || surface === 'main'`. Change the
    other four to test membership rather than inequality, so surface #4 does not repeat this.
  - `terminal-surface.test.ts:17-29` asserts the current semantics — including
    `expect(onMainSurface(session({}))).toBe(true)` — and must be updated, not deleted.
  - `start-agent.ts:38` should take `TerminalSurface` from shared rather than restating it.
  - All five sites fixed exactly as specced; `terminal-surface.test.ts` extended (not deleted) with
    the `'kanban'` parity cases: excluded from `onMainSurface`, never steals `activeId`, restores
    `asleep` not `exited`. `findCardSession`/`findAnyCardSession` (new, `terminal-store.ts`) are the
    two lookups Theme F's glow and a future Start/Stop button share.
- [x] A `taskRef` on the session record — `{ projectId, itemId }` — so a session can be matched
      back to its card after a restart. This is the one genuinely new field, and it is what makes
      Theme H possible.
  - **`TerminalSessionSchema` is a `ZodEffects`, not a `ZodObject`** — it closes with
    `.superRefine(agentIdMatchesKind)` (`terminal.ts:365`), so it **cannot be `.extend()`ed**. Add
    the field inside the `z.object({...})` literal, before the refinement.
  - **It must also be added to the shared schema or it never persists.**
    `TerminalSaveRequest = z.object({ session: TerminalSessionSchema })`
    ([`schemas.ts:1033`](../../../packages/shared/src/ipc/schemas.ts)) and the handler passes
    `parsed.data.session` — the zod *output* — to `saveTerminal`. zod strips unknown keys, so a
    `taskRef` absent from the schema is dropped at the IPC boundary, silently, and never reaches
    `terminals.json`.
  - Main's own validator needs **no** change: `isSession()`
    ([`terminal-store.ts:110`](../../../packages/desktop/src/main/terminal-store.ts)) is hand-rolled
    and non-zod, checks neither `surface` nor `asleep`, and passes whole objects through — the
    comment at `:100` explains it is deliberately loose so a bad row is dropped rather than taking
    the file down.
  - Write down the one-way-compat hazard, which nobody has: a `terminals.json` written by a build
    that knows `taskRef` and then opened by an **older** build loses the field permanently on its
    next save, through that same strip. The same is already true of `surface`.
  - `taskRef` added inside the `z.object({...})` literal (before `.superRefine`), and
    `TerminalSaveRequest` needed **no separate edit** — it wraps `TerminalSessionSchema` directly
    rather than restating its fields, so the new field flows through the IPC boundary for free.
    `startAgent()` grew a matching `taskRef` param.
- [x] Launching from a card starts a broker session `cwd`-ed at the repo's worktree, running the
      agent from `start-agent.ts`'s table with the composed prompt typed but **not sent**.
  - `startAgent({ ..., surface: 'kanban', taskRef, autoSend: false })` is the call site — Theme G's
    `CardComposer` (`board/card-composer.tsx`), which landed in the same PR as the rest of this
    theme once it was unblocked.
- [x] One live session per card, enforced *at the lookup level*: `findCardSession(sessions, states,
      taskRef)` in `terminal-store.ts` — a live, non-asleep `'kanban'` session bound to a card's
      `{projectId, itemId}`, tested for the "different card", "main surface", "exited" and "asleep"
      cases (`terminal-surface.test.ts`). Theme G's `CardComposer` calls it directly (no prop
      threading a session through `CardDetail`) and hides the composer form for a Stop button
      instead of drawing a second Start.

### E — The terminal inside the card (L) — ✅ DONE (2026-09-03)

- [x] `board/card-terminal.tsx` — an xterm bound to the card's session, mounted inside the card
      while it is running, at a deliberately small viewport with a "pop out to Terminal view"
      escape.
  - It **must** go through
    [`LazyTerminalView`](../../../packages/app/src/features/terminal/lazy-terminal-view.tsx)
    (`{ session, active, initialInput, fitSignal, layoutClassName }`), as
    [`loop-tab.tsx:168`](../../../packages/app/src/features/loops/loop-tab.tsx) does with
    `layoutClassName="h-full w-full"`. That module's docblock is explicit: it is the single entry
    point because *"a second static import anywhere would put xterm straight back in the entry and
    nothing would say so."* A direct `./terminal-view` import silently undoes Phase 36 Theme C.
- [x] **Only the visible running cards mount an xterm** — and this is new machinery, not a reused
      pattern.
  - Both existing multi-xterm hosts mount *everything they own*: `terminal-panel.tsx:186` maps every
    main-surface session into a stacked `absolute inset-0` pane (unbounded), and the FAB maps its
    four tabs. Both are bounded only by the container unmounting wholesale —
    `fab-panel.tsx:47`'s `if (!isOpen) return null;`. **There is no viewport-driven mount precedent
    anywhere.** An `IntersectionObserver` around the card is the mechanism.
  - **The hard ceiling to respect is WebGL contexts, not DOM.** Each xterm loads its own
    `WebglAddon` (`terminal-view.tsx:362`), Chromium caps live contexts at roughly 16 per process
    and evicts the oldest by dropping its context — and the local handler
    `onContextLoss(() => webgl.dispose())` (`:364`) degrades that instance to the DOM renderer
    **permanently**, because nothing ever re-adds the addon. A board of ten cards plus the main
    panel's terminals is a realistic path into that cap, and **nothing counts contexts today**.
  - So cap concurrently-mounted card terminals at **4**, matching the FAB's own ceiling, and render
    the last activity line for the rest. Beyond the cap the card shows *"Terminal running — open the
    card to watch"*.
  - Per-instance cost, for the record: one WebGL context and texture atlas, `scrollback: 10_000`
    lines (`terminal-view.tsx:247`), a `ResizeObserver`, a `visibilitychange` listener, three xterm
    subscriptions and a `pty.onData`/`onExit` pair.
- [x] An off-screen or collapsed card renders the last activity line from the session record.
  - This is **free and correct**, and worth knowing before building something cleverer:
    `useAgentActivity()` is mounted once at
    [`app.tsx:1190`](../../../packages/app/src/app.tsx) and maps `ptyId → sessionId → activity` in
    the store regardless of what is mounted. Phase 35 moved it there precisely because a
    per-`TerminalView` subscription went dark when the panel collapsed. An unmounted card's activity
    stays live.
- [x] Unmount cleanly.
  - **Correction to the draft:** the xterm-on-unmount throw is *not* recorded in
    [phase-36](phase-36-performance-diet.md) — only in [`outstanding.md:106`](../outstanding.md) —
    and it was never fixed. It is upstream in `@xterm/xterm`'s own teardown, reachable only through
    StrictMode's mount→unmount→mount, fires for every pane under `moon run desktop:start`, and never
    in a packaged build. **A test asserting "no throw on unmount" would fail against `main` today.**
  - So the honest item is: mirror the two local mitigations — the `cancelled` flag
    (`terminal-view.tsx:351`, which stops an in-flight snapshot writing into a disposed term) and
    the **read-not-take** `peekReplay` semantics (`terminal-store.ts:255`, where destructive
    consumption made StrictMode's second mount revive a shell nobody asked for).
  - *Acceptance:* an RTL test asserts the card's own `IntersectionObserver` and subscriptions are
    disconnected on unmount. It asserts teardown, **not** the absence of an upstream throw.
- [x] Scrollback survives a card being scrolled out of view and back, because the broker owns it,
      not the component.
  - The pty is deliberately **not** killed on unmount (`terminal-view.tsx:498`), which is the whole
    reason this works. On remount a live session refetches the broker's ring buffer via
    `api.pty.snapshot({ ptyId })` behind the replay gate (`:388`).

### F — The running glow (S) — ✅ DONE (2026-09-02)

- [x] Card border glow driven from
      [`loop-glow.ts`](../../../packages/app/src/features/loops/loop-glow.ts) — one glow
      implementation in this app, not two. Colour keyed off the agent, matching the loop launchers.
  - `loopGlowColor(agentId)`, accepting the `currentColor` fallback for an id that is not a loop id
    (the recorded Decision) — `TaskCard`/`DraggableCard` never edit `LOOP_GLOW` itself.
  - **A new CSS class, `.card-run-glow`, not `.loop-run-glow` reused verbatim** — the one place this
    diverges from a literal reading of "one glow implementation, not two." `.loop-run-glow` paints
    the shared `--rainbow-ramp` conic gradient a loop tab cycles through; a card is bound to one
    agent, not a spectrum, so it needs a **solid** colour a `box-shadow` can read directly
    (`--card-glow-color`, set inline from `loopGlowColor()`). What *is* one implementation, not two:
    `loopGlowColor()` itself, the pulse-keyframe idiom, and the focus-gate/reduced-motion pattern —
    see `styles.css`'s own comment beside `.card-run-glow` for the full reasoning.
- [x] Three visual states, not one: **glowing + pulsing** = running · **amber** = waiting on input ·
      **static ring** = this card's terminal is open — plus a fourth the doc's prose implies but its
      list omits: **idle**, no glow at all, for a card with no session and no open pane.
  - **Correction confirmed as drafted:** `useLoopAttention()` cannot be read from a card;
    `activity === 'waiting'` from the terminal store is the real signal, read here via a new
    `useCardStatus()` (`board/use-card-status.ts`) mirroring `loop-status.ts`'s own
    `running`/`waiting`/`thinking` shape.
  - **The `wasWaiting`/`waitingMask` transition debounce was not needed and was not copied.** That
    device exists in `use-loop-attention.ts` to stop a `useEffect` watching an *array* of four
    loops from re-firing a toast every render. `deriveCardGlowState` (`board/glow-state.ts`) is a
    plain per-render pure function, not an effect over a collection — there is no transition to
    debounce, only a value to read. Copying the device here would have been machinery solving a
    problem this shape does not have.
  - `waiting` never decays, `thinking` is folded into `running` (both pulse) — no timeout added.
  - **"This card's terminal is open" is stricter than the draft's own phrasing implies**: it means
    the detail pane is open **and** a session has ever been bound to this card — an open pane on a
    card that has never run anything is plain browsing, not a left-open terminal, and gets no ring.
- [x] Pulse gated on window focus — a board of ten running cards is ten animations, and a blurred
      window should pay for none of them.
  - **Not a hoist to `app.tsx` — `BoardView` calls `useWindowFocusGate(true)` itself, correcting the
    draft's framing.** The hook already supports concurrent hosts (`FabPanel` and `LandingView`
    both call it today, tracked by an internal ref-count — see the hook's own docblock), so a third
    caller costs nothing extra; a hoist would have been a real refactor for no behavioural gain.
    [Phase 43](phase-43-workflows-mvp.md) Theme G, if it lands first, is free to do the same.
- [x] `prefers-reduced-motion` removes the pulse and keeps the colour, asserted through the cascade.
  - Since `.card-run-glow` is its own class (see above), it gets its **own** rule rather than
    inheriting `.loop-run-glow`'s: `html[data-motion='reduced'] .card-run-glow.is-running { animation:
    none; … }` in `styles.css`, next to the `.loop-run-glow` block it was modelled on.

### G — The card composer (M) — ✅ DONE (PR #47, 2026-09-02)

- [x] Agent picker from the Phase 21 roster, defaulting per repo.
  - Defaults off this repo's most recently-launched agent (`useTerminalStore`'s own sessions),
    rather than a second persisted setting — read once as `useState`'s initial value, since the
    composer remounts per open card (`CardDetail key={item.id}`).
- [x] Prompt composed from the card: title, body, labels and the repo path, shown in full and
      editable before launch — the card is the context, and the user sees exactly what the agent
      will get.
  - Composition is a **pure exported function**, `composeCardPrompt(item, repoPath): string`
    (`board/board-derive.ts`), tested directly in `board-derive.test.ts` without a board.
  - Body capped at **4 000 characters** with a visible truncation notice.
- [x] The composed command displayed verbatim above Start, since it is typed-not-sent and the user
      is the one who presses Return.
- [x] Reuse the checkbox-modifier idiom from
      [`loop-composer.tsx`](../../../packages/app/src/features/loops/loop-composer.tsx) rather than
      a second modifier mechanism.
  - `SwitchRow`/`RadioRow` hoisted to `components/form/toggle-rows.tsx`, generalised off `id`/
    `label`/`title` rather than `LoopModifier` (that type was never load-bearing for either
    control). `loop-composer.tsx` now imports both; its own 32 tests pass unmodified.
  - **Only `RadioRow` is actually used here** (the agent picker, as pills) — the composer has no
    standing-policy toggle to draw with `SwitchRow`, so it is hoisted but not yet a second consumer
    of it. [Phase 43 Theme F](phase-43-workflows-mvp.md) remains free to be that second consumer.
  - Reads its own session off the store via Theme D's `findCardSession`/`findAnyCardSession` rather
    than a prop threaded through `CardDetail` — matching `useCardStatus`'s own rule that a card
    never keeps its own copy of "which session am I."

### H — Binding survives a restart (M) — ◐ PARTIAL (PR #47, 2026-09-02)

- [x] On board load, reconcile live broker sessions against cards by `taskRef` — a session whose
      card is gone renders in the main terminal panel rather than being orphaned invisibly.
  - Built as a pure function, `sessionsToRehome(sessions, { projectId, itemIds })`
    (`board/board-derive.ts`, tested), applied via a new `rehomeSession` store action
    (`terminal-store.ts`) that drops `surface`/`taskRef` back to `main`. `BoardView` runs it in a
    `useEffect` keyed on the live `sessions` selector, scoped to `projectId` — a `taskRef` session
    bound to a *different* board is left alone, per the doc's own note.
  - **Correction to the draft:** no separate inverse index was built. Theme F's `useCardStatus`
    already does the per-card `findAnyCardSession` lookup the doc worried would mean "scanning
    every session per card render" — that concern is about the board's *grid* of cards, and it was
    already solved before this theme started. This item is the *reconciliation*, not a second index.
- [x] The board triggers hydration on open, the way the FAB does.
  - Landed as part of Theme F (`BoardView`'s own `hydrate().catch(() => {})` effect) — confirmed
    still in place and load-bearing for this theme's reconciliation, which reads the same
    `sessions` selector.
- [x] A card whose session ended while the board was closed shows a terminal state (succeeded /
      failed / ended), not a stale glow.
  - Theme D's `terminal-store.ts:339` fix (now landed) is what buys this: a restored `'kanban'`
    session with no live pty comes back `asleep` rather than `exited`.
- [ ] Quit-and-relaunch mid-run reattaches the card to its still-running detached session, the
      Phase 30 guarantee applied to this surface.
  - The chain exists end to end per the doc's own reasoning and needed no new code here — but
    nobody has actually run it against a **packaged** build (quit, relaunch, watch the card
    reattach). Left open for the same reason Phase 35/37's own equivalent items are: it needs a
    human on real hardware, not something this batch could verify.
- [ ] Switching boards or repos does not kill running sessions; it hides them, and returning
      reattaches.
  - True by construction (nothing here kills a session on unmount or board switch), but not
    exercised by a test — left open rather than checked on inference alone.

### I — Verification coverage (M) — ◐ PARTIAL (2026-09-02)

> **Scoped to what this batch actually built — C, D's plumbing, and F.** `composeCardPrompt` is
> Theme G's, and `taskRef` reconciliation is Theme H's; neither theme is in this batch, so neither
> function exists yet to test. Everything else below is done.

- [x] Vitest, pure functions: `applyOptimisticMove` and its rollback-relevant no-ops
      (`board-dnd.test.ts`). `deriveColumns` already had its own suite from Theme A, untouched here.
      **Not built: `composeCardPrompt`, the `taskRef` reconciliation** — Theme G/H, not this batch.
- [x] Vitest: the glow-state function — running / waiting / open / idle — as a pure function
      (`glow-state.test.ts`), plus the hook that feeds it real store state (`use-card-status.test.ts`).
- [x] Vitest: **the surface predicates.** `terminal-surface.test.ts` extended with the `'kanban'`
      parity cases: excluded from `onMainSurface`/main list, never steals `activeId`, restores
      `asleep` not `exited` after a simulated restart (via `hydrate()` against a mocked bridge).
      `findCardSession`/`findAnyCardSession` get their own dedicated cases too.
- [x] Playwright `e2e/kanban.spec.ts` against the mock bridge — **descoped at exec time** to what
      this batch ships: toggle to Board, drag a card between columns and see the mutation fire (plus
      a rejected-drop rollback case and a writes-disabled case), and a card already bound to a live
      `'kanban'` session (seeded via `terminalSessions`, the way a restart restores one) shows the
      running glow. **Not built: "launch an agent on a card," "the terminal appear," "stop it"** —
      there is no launch UI in this batch (Theme G) and no in-card terminal (Theme E) to exercise.
  - The mock bridge already carried `terminalSessions` (Phase 21) and `forgeProject` (Phase 40 Theme
    G) — no bridge changes were needed for this spec.
- [x] Screenshots: one, `docs/screenshots/p41-cdfi/board-running-glow.png` — the board with a card
      mid-glow. **Not built: "a card mid-run with its terminal" (Theme E), "the reduced-motion
      rendering"** — the latter is a real gap for a human pass, not a batch-scope exclusion; noted
      as open below.

## Files this phase touches

| Area | Path |
|---|---|
| Contract | [`shared/src/terminal.ts`](../../../packages/shared/src/terminal.ts) — `'kanban'` in `TerminalSurfaceSchema` (line 34) **and** `taskRef` inside the `TerminalSessionSchema` object literal (line 335, before `.superRefine`) |
| Contract | [`shared/src/ipc/schemas.ts`](../../../packages/shared/src/ipc/schemas.ts) — **required**, or `taskRef` is stripped at the IPC boundary and never persists |
| Contract, Phase 40 | `shared/src/domain/forge-project.ts` — **does not exist yet**; Phase 40 Theme A builds it |
| Main, unchanged | [`desktop/src/main/terminal-store.ts`](../../../packages/desktop/src/main/terminal-store.ts) (**unchanged** — `isSession()` is non-zod and passes unknown fields through whole), [`broker/server.ts`](../../../packages/desktop/src/broker/server.ts) (**unchanged** — the reattach chain already carries everything Theme H needs) |
| Renderer, surface fixes | [`terminal-store.ts`](../../../packages/app/src/features/terminal/terminal-store.ts) lines 339, 426, 625 · [`start-agent.ts`](../../../packages/app/src/features/terminal/start-agent.ts) lines 38, 55 · `terminal-surface.test.ts` |
| Renderer, new | `app/src/features/projects/board/` — `board-view.tsx`, `task-card.tsx`, `card-terminal.tsx`, `card-composer.tsx`, `derive-columns.ts`, `optimistic-move.ts`, `compose-prompt.ts`, `glow-state.ts` |
| Renderer, edited | [`ui-store.ts`](../../../packages/app/src/store/ui-store.ts) (`projectsMode` + `partialize` + rehydrate merge), [`app.tsx`](../../../packages/app/src/app.tsx) (hoist `useWindowFocusGate`), [`styles.css`](../../../packages/app/src/styles.css) (extend the paused selector) |
| Renderer, moved | `components/form/` — `SwitchRow`/`RadioRow` out of [`loop-composer.tsx`](../../../packages/app/src/features/loops/loop-composer.tsx); coordinate with [Phase 43 Theme F](phase-43-workflows-mvp.md) |
| Renderer, reused | [`lazy-terminal-view.tsx`](../../../packages/app/src/features/terminal/lazy-terminal-view.tsx) (**the only legal xterm entry point**), [`loop-glow.ts`](../../../packages/app/src/features/loops/loop-glow.ts), [`empty-state.tsx`](../../../packages/app/src/components/empty-state.tsx) — all **unchanged** |
| Deliberately untouched | `FORGE_GATED_VIEWS` — Phase 40 adds `'projects'`; the board inherits the gate · `sortable-list.tsx` — its axis/parent restrictions are the opposite of what a board needs |
| Tests | `app/e2e/kanban.spec.ts` *(new)* |

## Verification

- [x] `moon run :typecheck :lint :test` green — 15 tasks, 1516 app/shared/git-engine/desktop tests.
- [x] Boundary lint clean — the board reaches the broker only through `window.midniteStudio`; no
      new boundary rule triggered.
- [x] **Phase 40 Themes A–E are landed before this phase starts.** Confirmed — all of Phase 40 (A–F)
      had already landed (PRs #38, #41) before this batch began.
- [x] A `'kanban'` session does not appear in the main terminal panel or its session list, does not
      become `activeId`, does not open the terminal panel on launch, and returns **asleep** after a
      restart — one assertion each, per Theme D's table (`terminal-surface.test.ts`).
- [x] `taskRef` **survives a full round trip** — not literally "quit, relaunch" (no packaged build
      in this environment), but the schema-level equivalent: `TerminalSaveRequest.parse()`, the
      exact boundary `saveTerminal` parses through, is asserted to keep `taskRef` rather than strip
      it (`terminal.test.ts`, "the kanban surface and taskRef"). The literal quit/relaunch pass
      needs a packaged build — folded into the human items below.
- [ ] `moon run app:perf`: the board is inside the lazy Projects chunk and adds nothing to the entry
      chunk. **Not run this batch** — `app:perf` needs a packaged build (`app:build desktop:bundle`
      first per `CLAUDE.md`), out of scope for what this batch's time went to. No new static import
      was added to the entry chunk (`@dnd-kit` and the board were already lazy from Theme A), so
      regression risk is low, but the number itself is unmeasured — open below.
- [ ] No more than 4 xterm instances are mounted at once — **not applicable to this batch**: Theme E
      (the in-card terminal, the thing that would mount xterm instances) is not built yet. Nothing
      in C/D/F mounts an xterm.
- [ ] Idle CPU with **five** cards running — **not applicable**, same reason: nothing in this batch
      runs an animation whose cost scales with running-card count except the glow itself, and its
      pulse is already focus-gated (Theme F).
- [x] The board issues **one** item read, not one per column — unchanged from Theme A/B, which this
      batch did not touch; `board-view.test.tsx`'s existing coverage still passes.
- [ ] A real end-to-end pass on a real board: launch an agent from a card, watch it work, drag the
      card to Done, confirm on github.com. **Partially open** — the drag half is provable and
      *is* covered by `e2e/kanban.spec.ts` against the mock bridge; "launch an agent from a card"
      needs Theme G, not in this batch. A genuine real-`gh`, real-board pass for the drag alone is
      still a human item, folded in below.
- [ ] **Open, for a human:** a real board, real `gh`: drag a card between columns and confirm the
      `Status` change on github.com. The mock-bridge e2e proves the mutation fires with the right
      shape; nothing in this environment proves the live GraphQL mutation actually lands.
- [ ] **Open, for a human:** quit mid-run and relaunch — the card reattaches to its session
      (Theme H, needs a **packaged** build, per Phase 35's own outstanding item). Genuinely blocked
      on Theme H existing, not just on a packaged build.
- [ ] **Open, for a human:** `moon run app:perf` against a packaged build, and reduced-motion
      screenshots of the glow (`html[data-motion='reduced']`) — the one Theme F item this batch
      built but did not screenshot.

## Not in this phase

Local/offline task store, within-column reordering, swimlanes, grouping by any field but `Status`,
auto-advancing a card when its agent succeeds, agent-to-agent handoff, multi-board views, and a
one-click launch-and-send.

Added by the x1 refinement, each with its reason:

- **A `KeyboardSensor` / multi-container `coordinateGetter`.** The accessible outcome is delivered by
  a `Move to ▸` menu calling the same mutation, at a fraction of the code. See Decisions.
- **WebGL-context accounting as a general facility.** This phase caps its *own* mounted terminals at
  4; building a process-wide context budget is a real piece of infrastructure and belongs with
  whoever needs the second one.
- **Fixing the upstream xterm unmount throw.** It is unfixed in `@xterm/xterm`, dev-only, and
  `outstanding.md` explicitly says it is worth revisiting on the next xterm bump rather than worked
  around from outside the library.
- **A migration for `terminals.json`.** There is no migration machinery in this repo; `version: 1`
  is written and never read. The one-way-compat hazard is documented in Theme D instead.

## Decisions / open questions

- **Settled — cards are ProjectV2 items only.** No local store, no sync layer. The cost is that an
  offline or project-less repo shows an empty board; the benefit is that there is exactly one
  source of truth and a drag is a real mutation.
- **Settled — the board is a mode inside the Projects view.** Same picker, same gate, no second
  nav item. Phase 40's Decisions already agree to leave a header slot for the toggle.
- **Settled — a running card embeds a live terminal.** Bounded by Theme E's visible-only rule and
  the 4-instance WebGL cap.
- **Settled — typed-not-sent, and now with the argument that was missing.** The nearest precedent
  (`use-loop-session.ts:108`) uses `autoSend: true` on the grounds that an explicit Start press is
  itself the confirmation. That holds for a loop running a **fixed prompt the user authored**; it
  does not hold for a prompt composed from **remote GitHub text any contributor could have
  written**. A human between untrusted text and repo write access is the whole point.
- **Resolved — this phase is hard-blocked on Phase 40 Themes A–E**, and the doc now says so at the
  top rather than implying availability in seven separate items.
- **Resolved — keyboard column moves ship as a `Move to ▸` menu, not a `KeyboardSensor`.** No
  keyboard dnd exists in this codebase, a multi-container coordinate getter is the fiddliest part of
  dnd-kit, and a menu calling `setItemFieldValue` is accessible, testable and obvious. Revisit only
  if drag-by-keyboard is asked for by name.
- **Resolved — the board issues one item read and groups client-side.** Every forge read is gated on
  `enabled` because each is a subprocess plus rate-limit spend; per-column queries would multiply
  that by the column count for no benefit, since ProjectV2 returns items with their field values in
  one page anyway.
- **Resolved — card terminals cap at 4 concurrent instances.** Matching the FAB's ceiling, and
  driven by the WebGL-context limit rather than by DOM cost. The failure mode without a cap is
  particularly nasty: an evicted context permanently downgrades that terminal to the DOM renderer,
  because `onContextLoss` disposes the addon and nothing re-adds it.
- **Open — does Phase 40 extract its inline field editors, or does this phase build them?**
  *Recommendation:* Phase 40 extracts them, because it is the one with a table full of them and it
  ships first. But its Theme E names no component, so **this is a real coordination item, not an
  assumption** — if Phase 40 lands with editors welded into its table, this phase builds its own and
  Phase 40's table should adopt them afterwards.
- **Open — what happens to a card's session when its agent finishes?** *Recommendation:* the
  session stays (so the transcript is readable) and the card shows a terminal state; a card is only
  cleared on explicit dismiss. Auto-clearing loses the one artefact worth keeping.
- **Open — does the composer prompt include the card's comment thread?** *Recommendation:* not in
  this phase — it is unbounded input, and title + body + labels is already the useful 90%. Note the
  body itself is already capped at 4 000 characters for the same reason.
- **Open — how many concurrent card sessions before the board pushes back?** *Recommendation:* soft
  warn at 5, matching what Theme I actually measures. Distinct from the 4-terminal *mount* cap: five
  agents may run while at most four of their terminals are painted.
