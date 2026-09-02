# Phase 41 — Agentic Kanban

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

Effort tags: **S** ≈ an hour or two · **M** ≈ half a day · **L** ≈ a day plus.

## Deliverables

### A — The board shell (M)

- [ ] `[ Table | Board ]` toggle in the Projects view header, persisted per repo in
      [`ui-store.ts`](../../../packages/app/src/store/ui-store.ts) — the board is a *mode*, not a
      route, so nothing about `ViewId` or `FORGE_GATED_VIEWS` changes.
- [ ] `features/projects/board/board-view.tsx` — columns derived from the project's `Status`
      single-select field, in the field's own option order, each with its option colour as an
      accent.
- [ ] Horizontal column scroll with vertical scroll *inside* each column, so a 40-card column does
      not stretch the page — the overflow discipline the diff and graph views already follow.
- [ ] Explicit empty states: no board selected, board has no `Status` field, board has no items,
      and a column with none.
- [ ] Column headers carry a live count and collapse to a rail, so a Done column with 200 items is
      not the whole screen.

### B — Cards (M)

- [ ] `board/task-card.tsx` — title, the type glyph from `ForgeProjectItemContent`'s discriminant
      (issue / PR / draft), assignee avatars, labels, and `#number` linking out to github.com for
      the two types that have one.
- [ ] Non-`Status` field values render as compact chips, so a board that leans on a custom
      `Priority` or `Size` field is legible without opening anything.
- [ ] Card detail — clicking a card opens the item in a right-hand pane (body, assignees, all
      fields editable, the agent composer from Theme G). Reuses Phase 40 Theme E's inline editors.
- [ ] Virtualise a column past a threshold, reusing the approach the commit graph already proved,
      rather than rendering 200 DOM cards per column.

### C — Drag between columns (M)

- [ ] `@dnd-kit` drag from column to column, writing `Status` via Phase 40 Theme E's
      `setItemFieldValue`. **Optimistic** — the card moves on drop, and rolls back with the
      GitHub error text if the mutation fails.
- [ ] Within-column ordering is **read-only in this phase**. Board position is a separate
      ProjectV2 concept (`updateProjectV2ItemPosition`) and pretending a drop reorders when it does
      not is worse than not offering it — the drop indicator only appears at column boundaries.
- [ ] Keyboard-accessible column moves (`@dnd-kit`'s keyboard sensor), because a mouse-only board
      is a board half the app cannot use.
- [ ] A drag in flight must not be clobbered by the react-query refetch that Phase 10's watcher
      triggers — pause invalidation for the board while a drag is active.

### D — A session bound to a card (L)

- [ ] `'kanban'` added to
      [`TerminalSurfaceSchema`](../../../packages/shared/src/terminal.ts), alongside `'main'` and
      `'fab'`. Optional-with-`main`-default already makes this a backward-compatible schema change,
      exactly as Phase 35's addition was.
- [ ] Kanban sessions filtered **out** of the main terminal panel and its session list, the same
      filter `'fab'` sessions already pass through.
- [ ] A `taskRef` on the session record — `{ projectId, itemId }` — so a session can be matched
      back to its card after a restart. This is the one genuinely new field, and it is what makes
      Theme H possible.
- [ ] Launching from a card starts a broker session `cwd`-ed at the repo's worktree, running the
      agent from `start-agent.ts`'s table with the composed prompt typed but **not sent**.
- [ ] One live session per card, enforced: a card already running shows Stop, never a second Start.

### E — The terminal inside the card (L)

- [ ] `board/card-terminal.tsx` — an xterm bound to the card's session, mounted inside the card
      while it is running, at a deliberately small viewport with a "pop out to Terminal view"
      escape.
- [ ] **Only the visible running cards mount an xterm.** An off-screen or collapsed card renders
      the last activity line from the session record instead. Phase 36 measured what a permanently
      mounted animation costs; a permanently mounted xterm is worse.
- [ ] Unmount cleanly — Phase 36 / `outstanding.md` record an xterm-on-unmount StrictMode throw;
      this theme must not reintroduce it, and its test asserts so.
- [ ] Scrollback survives a card being scrolled out of view and back, because the broker owns it,
      not the component.

### F — The running glow (S)

- [ ] Card border glow driven from
      [`loop-glow.ts`](../../../packages/app/src/features/loops/loop-glow.ts) — one glow
      implementation in this app, not two. Colour keyed off the agent, matching the loop launchers.
- [ ] Three visual states, not one: **glowing + pulsing** = running · **amber** = waiting on input
      (the `use-loop-attention` signal) · **static ring** = this card's terminal is open.
- [ ] Pulse gated on window focus, per Phase 37's finding — a board of ten running cards is ten
      animations, and a blurred window should pay for none of them.
- [ ] `prefers-reduced-motion` removes the pulse and keeps the colour, asserted through the
      cascade rather than assumed — Phase 39 Theme G is the cautionary tale, where a reduced-motion
      rule lost on specificity and nobody noticed.

### G — The card composer (M)

- [ ] Agent picker from the Phase 21 roster, defaulting per repo.
- [ ] Prompt composed from the card: title, body, labels and the repo path, shown in full and
      editable before launch — the card is the context, and the user sees exactly what the agent
      will get.
- [ ] The composed command displayed verbatim above Start, since it is typed-not-sent and the user
      is the one who presses Return.
- [ ] Reuse the checkbox-modifier idiom from
      [`loop-composer.tsx`](../../../packages/app/src/features/loops/loop-composer.tsx) and
      [`shared/src/loops.ts`](../../../packages/shared/src/loops.ts)'s `LoopModifierSchema` rather
      than a second modifier mechanism.

### H — Binding survives a restart (M)

- [ ] On board load, reconcile live broker sessions against cards by `taskRef` — a session whose
      card is gone renders in the main terminal panel rather than being orphaned invisibly.
- [ ] A card whose session ended while the board was closed shows a terminal state (succeeded /
      failed / ended), not a stale glow.
- [ ] Quit-and-relaunch mid-run reattaches the card to its still-running detached session, the
      Phase 30 guarantee applied to this surface.
- [ ] Switching boards or repos does not kill running sessions; it hides them, and returning
      reattaches.

### I — Verification coverage (M)

- [ ] Vitest: column derivation from a `Status` field (including option order and a missing field),
      the optimistic-move reducer and its rollback, and the `taskRef` reconciliation in Theme H.
- [ ] Vitest: the glow-state function — running / waiting / open / idle — as a pure function, the
      way `loop-glow.test.ts` already tests its own.
- [ ] Playwright `e2e/kanban.spec.ts` against the mock bridge: toggle to Board, drag a card between
      columns and see the mutation fire, launch an agent on a card and see the glow and the
      terminal appear, stop it.
- [ ] Screenshots: the board at rest, a card mid-run with its terminal, and the reduced-motion
      rendering.

## Files this phase touches

| Area | Path |
|---|---|
| Contract | [`shared/src/terminal.ts`](../../../packages/shared/src/terminal.ts) (`'kanban'` surface + `taskRef`), [`shared/src/domain/forge-project.ts`](../../../packages/shared/src/domain/forge-project.ts) (Phase 40) |
| Main | [`desktop/src/broker/server.ts`](../../../packages/desktop/src/broker/server.ts), the terminal session store |
| Renderer | `app/src/features/projects/board/` *(new)*, [`features/loops/loop-glow.ts`](../../../packages/app/src/features/loops/loop-glow.ts), [`features/terminal/start-agent.ts`](../../../packages/app/src/features/terminal/start-agent.ts), [`ui-store.ts`](../../../packages/app/src/store/ui-store.ts) |
| Tests | `app/e2e/kanban.spec.ts` *(new)* |

## Verification

- [ ] `moon run :typecheck :lint :test` green.
- [ ] Boundary lint clean — the board reaches the broker only through `window.midniteStudio`.
- [ ] `moon run app:perf`: the board is inside the lazy Projects chunk and adds nothing to the entry
      chunk. `@dnd-kit` is already accounted for (see [`outstanding.md`](../outstanding.md)).
- [ ] Idle CPU with **five** cards running, window blurred, measured with
      `scripts/perf/idle-cpu.mjs --blurred` — the number, not an assurance.
- [ ] A real end-to-end pass on a real board: launch an agent from a card, watch it work, drag the
      card to Done, confirm on github.com.
- [ ] Quit mid-run and relaunch — the card reattaches to its session (Theme H, needs a **packaged**
      build, per Phase 35's own outstanding item).

## Not in this phase

Local/offline task store, within-column reordering, swimlanes, grouping by any field but `Status`,
auto-advancing a card when its agent succeeds, agent-to-agent handoff, multi-board views, and a
one-click launch-and-send.

## Decisions / open questions

- **Settled — cards are ProjectV2 items only.** No local store, no sync layer. The cost is that an
  offline or project-less repo shows an empty board; the benefit is that there is exactly one
  source of truth and a drag is a real mutation.
- **Settled — the board is a mode inside the Projects view.** Same picker, same gate, no second
  nav item.
- **Settled — a running card embeds a live terminal.** Bounded by Theme E's visible-only rule.
- **Open — what happens to a card's session when its agent finishes?** *Recommendation:* the
  session stays (so the transcript is readable) and the card shows a terminal state; a card is only
  cleared on explicit dismiss. Auto-clearing loses the one artefact worth keeping.
- **Open — does the composer prompt include the card's comment thread?** *Recommendation:* not in
  this phase — it is unbounded input, and title + body + labels is already the useful 90%.
- **Open — how many concurrent card sessions before the board pushes back?** *Recommendation:* soft
  warn at 5, matching what Theme I actually measures, rather than a number nobody checked.
