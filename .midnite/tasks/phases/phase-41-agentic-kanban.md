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

> ## ⛔ This phase is hard-blocked on Phase 40, which is 0% built
>
> The x1 audit's first finding, and the one that governs scheduling. Phase 41 depends on **seven**
> things from Phase 40, and a `grep` across `packages/` for `ProjectV2`, `projectsV2`,
> `setItemFieldValue`, `ForgeProjectItemContent` or `updateProjectV2` returns **zero hits**. Not one
> file in the monorepo has "project" in its name.
>
> | What Phase 41 needs | State |
> |---|---|
> | `shared/src/domain/forge-project.ts` (cited in the Files table) | **does not exist** |
> | `packages/app/src/features/projects/` — the view the toggle lives in | **does not exist** |
> | The ProjectV2 read path + its IPC channels | **do not exist** |
> | `projects` in `ViewId` / `VIEW_IDS` / `VIEW_ICON` / the rail | **not registered** |
> | `projects` in `FORGE_GATED_VIEWS` ([`app.tsx:271`](../../../packages/app/src/app.tsx)) | **not added** |
> | `setItemFieldValue(projectId, itemId, fieldId, value)` | named by Phase 40 Theme E, **unbuilt** |
> | "Phase 40 Theme E's inline editors" | **has no API to bind to** — see below |
>
> **Do not start this phase before Phase 40 Themes A–E have landed.** The seam itself is agreed —
> Phase 40's own Decisions say *"Theme D should therefore build `projects-view.tsx` with a header
> slot ready for a `[ Table | Board ]` toggle"* — so this is a sequencing constraint, not a design
> conflict.
>
> **One dependency is weaker than it looks.** Phase 41's Theme B says the card detail "reuses Phase
> 40 Theme E's inline editors", but Theme E names **no exported symbol** for them — it describes
> behaviour ("a single-select field edits as a menu of its own options") scoped to *the table*. As
> written, Phase 40 would build those editors inline in its table component, not as extractable
> ones. Either Phase 40 extracts them deliberately, or this phase builds its own. Recorded as a
> Decision.

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

### A — The board shell (M)

- [ ] `[ Table | Board ]` toggle in the Projects view header, persisted per repo in
      [`ui-store.ts`](../../../packages/app/src/store/ui-store.ts) — the board is a *mode*, not a
      route, so nothing about `ViewId` or `FORGE_GATED_VIEWS` changes.
  - `projectsMode: Record<string, 'table' | 'board'>` keyed by `repoId`, added to `partialize`
    ([`ui-store.ts:1173`](../../../packages/app/src/store/ui-store.ts) is where `fabSessions` does
    it) and **shallow-spread on rehydrate**, the merge the comment at `:1240` explains is needed so
    a saved map does not drop keys added since.
  - The gate is inherited, not rebuilt: Phase 40 adds `'projects'` to
    `FORGE_GATED_VIEWS` ([`app.tsx:271`](../../../packages/app/src/app.tsx)) and the board lives
    inside that view, so it is gated for free. **Add nothing to that array here.**
- [ ] `features/projects/board/board-view.tsx` — columns derived from the project's `Status`
      single-select field, in the field's own option order, each with its option colour as an
      accent.
  - Derivation is a **pure exported function**, `deriveColumns(field, items): Column[]`, so Theme I
    can test option order, a missing field and an item whose option id is no longer in the field
    without mounting anything.
  - An item whose `Status` is empty goes to a leading **"No status"** column, not dropped and not
    invented into the first real one.
- [ ] Horizontal column scroll with vertical scroll *inside* each column, so a 40-card column does
      not stretch the page — the overflow discipline the diff and graph views already follow.
- [ ] Explicit empty states: no board selected, board has no `Status` field, board has no items,
      and a column with none.
  - Literal copy, so it is not re-invented per state: *"Pick a project to see its board."* ·
    *"This project has no Status field — the board groups by Status, so there are no columns to
    show."* · *"This project has no items yet."* · a column with none renders a dashed drop zone
    reading *"Drop here"*, which doubles as the drag affordance.
  - Use [`EmptyState`](../../../packages/app/src/components/empty-state.tsx) (`{ icon, title, body }`),
    as `councils-view.tsx:25` does.
- [ ] Column headers carry a live count and collapse to a rail, so a Done column with 200 items is
      not the whole screen.
- [ ] **The board must not eagerly load every column.** Every forge read in this app is gated on
      `enabled` — "a human opened this section" — because each is a `gh` subprocess plus rate-limit
      spend; see `useForgeIssues`
      ([`queries.ts:452`](../../../packages/app/src/services/queries.ts)) and the shared
      `FORGE_STALE_MS = 60_000` at `:418`. A board that fetches all columns on mount would be the
      first violation of that convention in the codebase.
  - One paged read for the board's items, `enabled` on the Board mode being active — **not one
    query per column.** Columns are a client-side grouping of one item list, which is also why
    `deriveColumns` is pure.

### B — Cards (M)

- [ ] `board/task-card.tsx` — title, the type glyph from `ForgeProjectItemContent`'s discriminant
      (issue / PR / draft), assignee avatars, labels, and `#number` linking out to github.com for
      the two types that have one.
  - A draft item has no `number` and no URL — render no link rather than a dead one. This is the
    discriminant's whole purpose.
- [ ] Non-`Status` field values render as compact chips, so a board that leans on a custom
      `Priority` or `Size` field is legible without opening anything.
- [ ] Card detail — clicking a card opens the item in a right-hand pane (body, assignees, all
      fields editable, the agent composer from Theme G).
  - **Do not assume Phase 40's inline editors are importable.** Theme E there names no component,
    no file and no props, and describes them as living in *the table*. Before starting this item,
    check whether they were extracted; if not, this theme builds them and Phase 40's table should
    adopt *these*. Recorded as a Decision.
- [ ] Virtualise a column past a threshold, rather than rendering 200 DOM cards per column.
  - Threshold **50 cards**; below that the DOM cost is not worth the machinery.
  - Cards are variable-height, so the model is
    [`diff-view.tsx:157`](../../../packages/app/src/features/diff/diff-view.tsx) — `estimateSize`
    paired with `measureElement: (el) => el.getBoundingClientRect().height` — not the graph's
    fixed-height recipe. House default `overscan: 24`.
  - **This is the first per-container virtualizer in the app.** All six existing `useVirtualizer`
    call sites are one-per-view; none is instantiated per element in a loop. Say so, because "reuse
    the approach the commit graph already proved" (the draft's wording) understates it.

### C — Drag between columns (M)

> **Re-tagged: this is the theme with the least precedent.** A `grep` for `onDragOver`, `arrayMove`,
> `rectSortingStrategy`, `closestCorners` and `pointerWithin` across `packages/app/src` returns
> **zero hits**. Every one of the four `@dnd-kit` call sites is a single-container list reorder or a
> discrete drop target. True column-to-column dnd is new machinery here.

- [ ] `@dnd-kit` drag from column to column, writing `Status` via Phase 40 Theme E's
      `setItemFieldValue`. **Optimistic** — the card moves on drop, and rolls back with the
      GitHub error text if the mutation fails.
  - What is genuinely reusable: the `activationConstraint: { distance: 6 }` every call site shares,
    and the **discriminated-union payload** model from
    [`graph-dnd.tsx:24`](../../../packages/app/src/features/graph/graph-dnd.tsx)
    (`{ kind: 'card'; itemId } | { kind: 'column'; optionId }` here) rather than loose string ids.
  - What must be introduced fresh, none of it present today: `onDragOver`, one `SortableContext`
    per column, and a multi-container collision strategy — `closestCorners` or `pointerWithin`,
    **not** the `closestCenter` the single-list wrappers use.
  - Do **not** reuse [`SortableList`](../../../packages/app/src/components/sortable-list.tsx): it
    applies `restrictToVerticalAxis` and `restrictToParentElement` (`:66`), which is precisely
    "cannot leave its column".
  - The optimistic move is a **pure reducer** — `applyOptimisticMove(items, itemId, toOptionId)` —
    so Theme I tests it and its rollback without a DOM.
  - *Acceptance:* a rejected mutation restores the card to its original column **and** surfaces the
    GitHub error text, not a generic message.
- [ ] Use a `<DragOverlay dropAnimation={null}>`, not an in-place transform.
  - [`graph-dnd.tsx:84`](../../../packages/app/src/features/graph/graph-dnd.tsx) already had to do
    this and its comment says why — *"graph rows are virtualized, so the dragged element is
    unmounted the moment it scrolls out of view and the drag would visibly die mid-gesture."* A
    virtualized column has exactly that problem.
  - Note dnd-kit's drag-end carries **no pointer position** (`graph-view.tsx:224` keeps a manual
    `lastPointer` ref); use the `over` id, never coordinates.
- [ ] Within-column ordering is **read-only in this phase**. Board position is a separate
      ProjectV2 concept (`updateProjectV2ItemPosition`) and pretending a drop reorders when it does
      not is worse than not offering it — the drop indicator only appears at column boundaries.
- [ ] Keyboard-accessible column moves, because a mouse-only board is a board half the app cannot
      use.
  - **There is no `KeyboardSensor` anywhere in this codebase** — all four dnd call sites are
    `PointerSensor` alone, and `sortable-list.tsx`'s docblock claims to have decided "the keyboard
    story" while implementing none. This is the app's first.
  - *Recommendation, and the cheaper correct answer:* skip `KeyboardSensor` and give the card a
    **menu** — `Move to ▸ <column>` in its context menu and on `Enter` — calling the same
    `setItemFieldValue` the drop does. A multi-container `coordinateGetter` is a large amount of
    fiddly code to reproduce what one menu does accessibly. Recorded as a Decision.
- [ ] A drag in flight must not be clobbered by the react-query refetch that Phase 10's watcher
      triggers — pause invalidation for the board while a drag is active.

### D — A session bound to a card (L)

- [ ] `'kanban'` added to
      [`TerminalSurfaceSchema`](../../../packages/shared/src/terminal.ts) (line 34), alongside
      `'main'` and `'fab'`.
  - Widening the enum is backward compatible for parsing — old rows carry no `surface` at all — but
    **not for the reason the draft gives.** There is no `.default('main')` anywhere; the field is
    `surface: TerminalSurfaceSchema.optional()` (`terminal.ts:363`) and "absent means main" is a
    *convention enforced by a predicate*, not by zod.
- [ ] **Fix all five `'fab'`-shaped checks.** This is the item that makes the surface actually work,
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
- [ ] A `taskRef` on the session record — `{ projectId, itemId }` — so a session can be matched
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
- [ ] Launching from a card starts a broker session `cwd`-ed at the repo's worktree, running the
      agent from `start-agent.ts`'s table with the composed prompt typed but **not sent**.
  - `startAgent({ repoId, cwd, title, prompt, agentId, command, extraArgs, surface: 'kanban', autoSend: false })`
    — `autoSend` defaults to `false` (`start-agent.ts:42`), so this is the default path, and the
    reasoning is in the framing above.
- [ ] One live session per card, enforced: a card already running shows Stop, never a second Start.

### E — The terminal inside the card (L)

- [ ] `board/card-terminal.tsx` — an xterm bound to the card's session, mounted inside the card
      while it is running, at a deliberately small viewport with a "pop out to Terminal view"
      escape.
  - It **must** go through
    [`LazyTerminalView`](../../../packages/app/src/features/terminal/lazy-terminal-view.tsx)
    (`{ session, active, initialInput, fitSignal, layoutClassName }`), as
    [`loop-tab.tsx:168`](../../../packages/app/src/features/loops/loop-tab.tsx) does with
    `layoutClassName="h-full w-full"`. That module's docblock is explicit: it is the single entry
    point because *"a second static import anywhere would put xterm straight back in the entry and
    nothing would say so."* A direct `./terminal-view` import silently undoes Phase 36 Theme C.
- [ ] **Only the visible running cards mount an xterm** — and this is new machinery, not a reused
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
- [ ] An off-screen or collapsed card renders the last activity line from the session record.
  - This is **free and correct**, and worth knowing before building something cleverer:
    `useAgentActivity()` is mounted once at
    [`app.tsx:1190`](../../../packages/app/src/app.tsx) and maps `ptyId → sessionId → activity` in
    the store regardless of what is mounted. Phase 35 moved it there precisely because a
    per-`TerminalView` subscription went dark when the panel collapsed. An unmounted card's activity
    stays live.
- [ ] Unmount cleanly.
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
- [ ] Scrollback survives a card being scrolled out of view and back, because the broker owns it,
      not the component.
  - The pty is deliberately **not** killed on unmount (`terminal-view.tsx:498`), which is the whole
    reason this works. On remount a live session refetches the broker's ring buffer via
    `api.pty.snapshot({ ptyId })` behind the replay gate (`:388`).

### F — The running glow (S)

- [ ] Card border glow driven from
      [`loop-glow.ts`](../../../packages/app/src/features/loops/loop-glow.ts) — one glow
      implementation in this app, not two. Colour keyed off the agent, matching the loop launchers.
  - `loopGlowColor(loopId: string): string` (`:44`) falls back to `'currentColor'` for an unknown
    id, so an agent id that is not a loop id degrades rather than throwing. Either pass the agent id
    and accept the fallback, or add an explicit agent→colour map; do not edit `LOOP_GLOW` itself.
- [ ] Three visual states, not one: **glowing + pulsing** = running · **amber** = waiting on input ·
      **static ring** = this card's terminal is open.
  - **Correction:** the draft cites "the `use-loop-attention` signal". `useLoopAttention()` is
    `(): void` — a fire-and-forget toast emitter hardcoded to `DEFAULT_LOOPS`, mounted once from
    `app.tsx:437`. A card cannot read state from it.
  - The actual state is `activity === 'waiting'` from the terminal store
    (`terminal-store.ts:128`), which is how `loop-status.ts:52` derives its own
    `waiting: running && activity === 'waiting'`. Amber is `LOOP_WAITING_COLOR` (`loop-glow.ts:37`,
    `#f59e0b`).
  - What *is* worth copying from `use-loop-attention` is its **transition debounce** — the
    `wasWaiting` ref and the `waitingMask` string (`:25-38`), whose comment explains that depending
    on the status array directly re-ran the effect every render and swallowed a second question.
  - `waiting` deliberately never decays (`activity-detect.ts:121`: *"a question left open for an
    hour is still a question"*), whereas `thinking` decays to `idle` after
    `THINKING_TO_IDLE_MS = 15_000`. The card's three states inherit that asymmetry — do not add a
    timeout to amber.
- [ ] Pulse gated on window focus — a board of ten running cards is ten animations, and a blurred
      window should pay for none of them.
  - The Phase 37 gate does **not** currently reach this: `html[data-window-focused='false']` pauses
    only `.fab-panel-gradient::before` ([`styles.css:967`](../../../packages/app/src/styles.css)),
    and `data-window-focused` is written by `useWindowFocusGate` **inside** `fab-panel.tsx:155`,
    only while that panel is mounted. Hoisting the hook to `app.tsx` and extending the selector is
    the work. *(If [Phase 43](phase-43-workflows-mvp.md) Theme G lands first it does exactly this —
    coordinate rather than doing it twice.)*
- [ ] `prefers-reduced-motion` removes the pulse and keeps the colour, asserted through the
      cascade rather than assumed — Phase 39 Theme G is the cautionary tale, where a reduced-motion
      rule lost on specificity and nobody noticed.
  - `html[data-motion='reduced'] .loop-run-glow { animation: none; }` already exists at
    `styles.css:1122`. Assert the card inherits it; do not write a second rule.

### G — The card composer (M)

- [ ] Agent picker from the Phase 21 roster, defaulting per repo.
- [ ] Prompt composed from the card: title, body, labels and the repo path, shown in full and
      editable before launch — the card is the context, and the user sees exactly what the agent
      will get.
  - Composition is a **pure exported function**, `composeCardPrompt(item, repoPath): string`, so
    Theme I asserts it without a board.
  - Cap the body at **4 000 characters** with a visible truncation notice. An issue body is
    unbounded remote text and the composer is a text field, not a document viewer.
- [ ] The composed command displayed verbatim above Start, since it is typed-not-sent and the user
      is the one who presses Return.
- [ ] Reuse the checkbox-modifier idiom from
      [`loop-composer.tsx`](../../../packages/app/src/features/loops/loop-composer.tsx) and
      [`shared/src/loops.ts`](../../../packages/shared/src/loops.ts)'s `LoopModifierSchema` rather
      than a second modifier mechanism.
  - `SwitchRow` and `RadioRow` are **module-private** inside `loop-composer.tsx` (`:262`, `:329`).
    Hoist them to `components/form/` rather than copying — and note
    [Phase 43 Theme F](phase-43-workflows-mvp.md) plans the same hoist, so whichever lands first
    does it and the other consumes it.

### H — Binding survives a restart (M)

- [ ] On board load, reconcile live broker sessions against cards by `taskRef` — a session whose
      card is gone renders in the main terminal panel rather than being orphaned invisibly.
  - Build the **inverse index** (`sessionId → card`) once at load and hold it in board-local state;
    do not scan every session per card render.
  - The Phase 35 precedent is `fabSessions: Record<string, string>` in `ui-store` — but it is keyed
    by a **fixed enumeration of four tabs** and persisted in localStorage. Cards are unbounded and
    remote-owned, which is exactly why `taskRef` belongs on the durable, main-owned record instead.
    `loop-status.ts:6` states the rule this follows: *"Both are derived, never stored — the bug this
    phase exists to fix came from a component keeping its own copy of 'which session am I'."*
  - A `taskRef` session whose item is absent from the current board is **not** necessarily orphaned
    — it may belong to another project. Re-home it to the main panel only when its `projectId`
    matches the open board and its `itemId` is gone.
- [ ] The board triggers hydration on open, the way the FAB does.
  - `useHydrateOnOpen` at `fab-panel.tsx:132` exists because *"until Phase 35's Theme I nothing but
    `TerminalPanel` ever called it"*. `hydrate()` early-returns once `hydrated`
    (`terminal-store.ts:303`), so calling it on board open is cheap and idempotent.
- [ ] A card whose session ended while the board was closed shows a terminal state (succeeded /
      failed / ended), not a stale glow.
  - This is what the `terminal-store.ts:339` fix in Theme D buys: with `'kanban'` included, a
    restored session with no live pty comes back `asleep` rather than `exited`.
- [ ] Quit-and-relaunch mid-run reattaches the card to its still-running detached session, the
      Phase 30 guarantee applied to this surface.
  - The chain already exists end to end and needs no new IPC: main adopts the broker's live
    processes at init (`pty-service.ts:381` → `listSessions()`), `terminal-service.ts:54` joins disk
    records to live ptys, `mstudio:terminal:list` carries it, and `hydrate()` binds — a live row
    going straight to `'open'` with its `ptyId` (`terminal-store.ts:365`).
  - **Do not build on `listLegacySessions`** (`broker-client.ts:475`): it writes to each legacy
    socket and returns an always-empty array.
- [ ] Switching boards or repos does not kill running sessions; it hides them, and returning
      reattaches.

### I — Verification coverage (M)

- [ ] Vitest, pure functions — each named so it can be written before any UI exists:
      `deriveColumns` (option order, missing field, unknown option id, empty-status bucket),
      `applyOptimisticMove` and its rollback, `composeCardPrompt` (including the 4 000-char
      truncation), and the `taskRef` reconciliation from Theme H.
- [ ] Vitest: the glow-state function — running / waiting / open / idle — as a pure function, the
      way `loop-glow.test.ts` already tests its own.
- [ ] Vitest: **the surface predicates.** Extend `terminal-surface.test.ts` so a `'kanban'` session
      is excluded from the main panel and its list, does not become `activeId` on launch, and
      returns asleep rather than ended after a restart. These are the four regressions Theme D's
      table exists to prevent, and they are cheap to assert.
- [ ] Playwright `e2e/kanban.spec.ts` against the mock bridge: toggle to Board, drag a card between
      columns and see the mutation fire, launch an agent on a card and see the glow and the
      terminal appear, stop it.
  - The mock bridge must learn the project read, `setItemFieldValue`, and a `pty` session that emits
    a couple of frames.
  - Given [Phase 38](phase-38-e2e-suite-repair.md)'s ratchet, land this spec green and keep it out
    of the ratchet list. Note `outstanding.md:72` — xterm e2e is red on GPU-less Linux runners
    because of `@xterm/addon-webgl`; a spec that asserts on terminal *content* will join that set,
    so assert on the card's state instead.
- [ ] Screenshots: the board at rest, a card mid-run with its terminal, and the reduced-motion
      rendering.

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

- [ ] `moon run :typecheck :lint :test` green.
- [ ] Boundary lint clean — the board reaches the broker only through `window.midniteStudio`.
- [ ] **Phase 40 Themes A–E are landed before this phase starts.** Not a nicety: seven of this
      phase's dependencies do not exist, and `grep -r ProjectV2 packages/` returns nothing.
- [ ] A `'kanban'` session does not appear in the main terminal panel or its session list, does not
      become `activeId`, does not open the terminal panel on launch, and returns **asleep** after a
      restart — one assertion each, per Theme D's table.
- [ ] `taskRef` **survives a full round trip**: set it, quit, relaunch, and read it back off
      `terminals.json`. This is the assertion that catches the zod-strip at `schemas.ts:1033`.
- [ ] `moon run app:perf`: the board is inside the lazy Projects chunk and adds nothing to the entry
      chunk. `@dnd-kit` is already accounted for (see [`outstanding.md`](../outstanding.md)).
- [ ] No more than 4 xterm instances are mounted at once, asserted by counting mounted terminals
      with 10 running cards — the WebGL-context ceiling, not a style preference.
- [ ] Idle CPU with **five** cards running, window blurred, measured with
      `scripts/perf/idle-cpu.mjs --blurred` — the number, not an assurance.
- [ ] The board issues **one** item read, not one per column — asserted by counting bridge calls in
      the RTL test.
- [ ] A real end-to-end pass on a real board: launch an agent from a card, watch it work, drag the
      card to Done, confirm on github.com.
- [ ] **Open, for a human:** quit mid-run and relaunch — the card reattaches to its session
      (Theme H, needs a **packaged** build, per Phase 35's own outstanding item).
- [ ] **Open, for a human:** screenshots per Theme I.

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
