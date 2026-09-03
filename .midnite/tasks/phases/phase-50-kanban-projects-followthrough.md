# Phase 50 — Kanban & Projects, Follow-Through

[Phase 40](phase-40-github-projects.md) taught this app to read a GitHub Project. [Phase 41](phase-41-agentic-kanban.md)
turned that table into a board where a card can run an agent. Both landed the load-bearing
machinery and both left a named list of things their own docs called "a later phase's scope" or
"an open decision" rather than building them. This phase is that later phase — six independently
shippable gaps across the same surface, none of them new product ideas, all of them things the
prior two phases already argued for and then declined to build.

**Builds on.** Every theme below sits on code that already exists and ships today:
[`gh-project-write.ts`](../../../packages/desktop/src/main/forge/gh-project-write.ts) is the one
file with every ProjectV2 mutation this app sends, and its own docblock on `addItemToProject`
says outright that the mutation ships in Phase 40 but the entry points to reach it do not — Theme
E is that plumbing. [`board-derive.ts`](../../../packages/app/src/features/projects/board/board-derive.ts)'s
`NO_STATUS_COLUMN_ID` and [`board-view.tsx`](../../../packages/app/src/features/projects/board/board-view.tsx)
already carry a comment naming the exact mutation Theme C adds.
[`panel-stack`](../../../packages/app/src/components/panel-stack/use-panel-history.ts)'s own
docblock names "Projects (Phase 40) and Workflows (Phase 43)" as its next obvious consumers —
neither has adopted it since Phase 42 shipped it. `startAgent`'s `autoSend` flag
([`start-agent.ts:79`](../../../packages/app/src/features/terminal/start-agent.ts)) already exists
and already ships to FAB loops; Theme B is kanban's card composer finally being allowed to pass
`true`, behind a gate Phase 41's own doc says belongs "in a later phase." And
[`activity-detect.ts`](../../../packages/desktop/src/main/activity-detect.ts)'s detector is fully
generic, driven by `AgentDefinition.activity` marker regexes — `terminal.test.ts`'s own assertion
(`'carries only claude with an activity marker set among the builtins'`) says that today, every
kanban card, FAB tab and council run for a non-Claude agent has been running with a permanently
mute activity indicator since Phase 21 shipped the roster.

**Scope guardrails.** This phase does not reopen anything Phase 41 already settled and marked "Not
in this phase": no within-column reordering, no swimlanes, no grouping by a field other than
`Status`, no local task store, no offline mode, no multi-board views. It does not build an Issues
view — one does not exist in this app (`ForgeIssueSchema` is read for the repo dashboard's issue
list only; there is no `features/issues/`), so Theme E's "add to project" entry point ships for
Reviews/PRs only, and an Issues equivalent waits for an Issues view to exist. It does not build a
process-wide WebGL context budget (Phase 41 Theme E's own "Not in this phase" already declines
that, for the same reason: this phase's own additions mount no new xterm instances at all).

Effort tags: **S** ≈ an hour or two · **M** ≈ half a day · **L** ≈ a day plus.

## Deliverables

### A — A card session outlives its agent (S)

- [ ] Resolve [Phase 41's open decision](phase-41-agentic-kanban.md#decisions--open-questions)
      ("what happens to a card's session when its agent finishes?") the way that doc's own
      recommendation said: the session **stays** after the agent exits, the card renders a
      terminal state (succeeded / failed / ended) instead of losing its binding, and it is cleared
      only by an explicit "Dismiss" action on the card.
  - The closest existing primitive is Theme H's `rehomeSession` (drops `surface`/`taskRef` back to
    `'main'`) — but that function runs automatically on board load to reconcile an orphaned
    session, and Dismiss is a **user-initiated** action on a still-bound card, so it is a distinct
    store action rather than a second call site for the same one. Name it for what it does —
    `dismissCardSession(taskRef)` — and have it call the same drop-to-`'main'` transition
    `rehomeSession` already performs, so the two never diverge on what "no longer bound to a card"
    means.
  - Dismiss appears only once `useCardStatus()` reports a non-running terminal state — a running
    card has a Stop control (Theme D of Phase 41), not a Dismiss one.
- [ ] A soft warning, not a hard block, at **5** concurrently-bound card sessions on one board —
      Phase 41 Theme I's own recorded recommendation, distinct from Theme E's 4-instance *mounted
      xterm* cap: five agents may be running while at most four of their terminals are painted.
  - A toast on the 6th launch attempt, matching this app's "controls disable until the answer
    comes back" posture rather than inventing a client-side quota that blocks the action outright.

### B — Launch and run, as an explicit opt-in (M)

- [ ] A "Launch and run" action beside the existing Start (which still types-and-does-not-send by
      default), gated behind a new `Settings ▸ Projects` toggle — that page already exists
      ([`projects-page.tsx`](../../../packages/app/src/features/settings/settings-pages/projects-page.tsx))
      — defaulting **off**.
  - This is Phase 41's own deferred item, stated in its doc: *"A one-click 'launch and run' is a
    decision for a later phase, with a confirm, not a default here."* Both halves of that sentence
    are binding on this theme: the toggle only reveals the button, and pressing it still shows a
    confirm dialog with the exact composed command before it runs — the setting removes a step,
    not the look-before-you-leap.
  - Implementation is `startAgent({ ..., autoSend: true })` — the flag already exists
    (`start-agent.ts:79`) and is already exercised by every FAB loop launch; the card composer
    (`board/card-composer.tsx`, Phase 41 Theme G) has simply never had a code path that passes
    `true`.
  - **Do not weaken the safety argument Phase 41 recorded to justify keeping this off by default:**
    a kanban prompt is composed from remote GitHub text (issue/PR title and body) any contributor
    could have written, unlike a FAB loop's fixed, user-authored prompt. The confirm dialog is
    where that argument earns its keep — it names the prompt's source, not just its content.

### C — A real "No status" drop target (S)

- [ ] `clearProjectV2ItemFieldValue` in
      [`gh-project-write.ts`](../../../packages/desktop/src/main/forge/gh-project-write.ts), a
      third mutation beside `setItemFieldValue`/`addItemToProject`, following the same JSON-on-stdin
      pattern the file's own docblock establishes (never `-f`/`-F`) and returning the same
      `ForgeProjectWriteResult` envelope.
- [ ] Wire it into the board: `board-dnd.ts`'s `applyOptimisticMove` and `board-view.tsx`'s
      `useDroppable({ disabled: column.id === NO_STATUS_COLUMN_ID })` both exist specifically
      because this mutation didn't — `board-dnd.ts:15` names it directly
      (*"There is no `clearProjectV2ItemFieldValue` in this phase's write path"*). Flip the
      disabled flag for the No-status column, and route a drop there through the clear mutation
      instead of `setItemFieldValue`, in the same `moveItemToColumn` call both the drag handler and
      the "Move to ▸" menu already share.
  - `applyOptimisticMove`'s existing rollback-relevant no-op test for `NO_STATUS_COLUMN_ID`
    (`board-dnd.test.ts:66`) currently asserts the target is rejected — that assertion inverts once
    this theme lands, and needs updating in place rather than deleting.

### D — The card-detail pane adopts `panel-stack` (M)

- [ ] Wrap the card-detail flow (Phase 41 Theme B's right-hand pane) in
      [`PanelStack`](../../../packages/app/src/components/panel-stack/panel-stack.tsx) +
      `usePanelHistory`, exactly the primitive Councils (Phase 42) already runs on and that its own
      docblock names Projects as the next intended consumer of.
  - `usePanelHistory` is panel-local (`useState`-based, not a store) per its own docblock, so this
    is `BoardView` (or a new `board/card-panel-stack.tsx` wrapper) owning one instance, pushing an
    entry when a card opens and replacing it if the same card is re-selected — no module-level
    store needed, unlike Councils' Theme E exception.
  - Buys `Mod+[`/`Mod+]` back/forward for free, and a breadcrumb via `PanelHeader` — useful the
    moment a card is opened, closed and reopened while browsing a board, which today loses no
    state but also offers no way back to "the card I was just looking at."
  - **Scope guardrail:** this theme pushes exactly one history depth — card open/close. It does
    **not** turn a linked PR/issue click inside the card detail into a second panel-stack entry;
    rendering PR content inside the stack is real added surface (Reviews' own `pr-detail.tsx` is
    not built to run inside a panel-stack pane) and stays a `#number` link-out, unchanged from
    Phase 41 Theme B.

### E — "Add to project" from the Reviews page (M)

- [ ] Add `id` to `PULL_FIELDS`/`PULL_DETAIL_FIELDS` in
      [`gh-cli.ts`](../../../packages/desktop/src/main/forge/gh-cli.ts) (currently
      `'number,title,state,isDraft,reviewDecision,headRefName,author,url,statusCheckRollup,mergedAt,closedAt'`
      — no `id` at all) and thread it through `ForgePullSchema`/`ForgePullDetailSchema`
      ([`forge.ts:156`](../../../packages/shared/src/domain/forge.ts),
      [`forge.ts:489`](../../../packages/shared/src/domain/forge.ts)).
  - **This is the real gap, found while grounding this theme, not an assumption.** `gh pr view/list
    --json id` returns the GraphQL global node id — exactly what `addItemToProject`'s `contentId`
    needs — but nothing in this app requests that field today. Without it, there is no id to hand
    the mutation and this theme cannot ship.
- [ ] An "Add to project ▸" action in
      [`pr-detail.tsx`](../../../packages/app/src/features/reviews/pr-detail.tsx), reusing Phase
      40/41's existing board picker (remembers last board per repo) rather than building a second
      one, calling `addItemToProject(projectId, pr.id)` and reporting the same
      `ForgeProjectWriteResult` shape every other write in this surface already renders.
  - **PRs only, deliberately.** `addItemToProject`'s own docblock names "the Reviews and Issues
    surfaces" as the two entry points Phase 40 deferred — but this app has no Issues view
    (`ForgeIssuesResultSchema` is read for the repo dashboard's issue list, not a page with a
    detail pane an action could attach to), so an Issues entry point has no surface to live on
    yet and is not this theme's job to invent one for.

### F — Activity markers beyond Claude (M)

- [ ] Author `activity` marker sets (`thinking`/`frameEnd`/`awaitingInput` regex sources, per
      `AgentDefinitionSchema.activity`) for `agy`, `codex` and `opencode` — the three providers
      Phase 34 already trusts to run unattended as council members, and the same three most likely
      to be running as a kanban card's agent or a FAB loop's.
  - `BUILTIN_AGENTS` carries ten roster entries; `terminal.test.ts`'s own assertion
    (`'carries only claude with an activity marker set among the builtins'`) is direct proof only
    one has ever had markers written. Every card glow, FAB pulse and status-bar loop badge for a
    non-Claude agent has been reading a permanently-`idle`/unset activity value this whole time —
    not broken, just never fed a signal.
  - The detector itself (`activity-detect.ts`'s `detectActivity`/`compileMarkers`) needs **no**
    change — it is already data-driven per agent. This theme is capturing a real session transcript
    per CLI and reading its own spinner/footer/option-sheet text, the same process that produced
    Claude's markers, then updating `terminal.test.ts`'s builtins-with-activity assertion to name
    all four rather than one.
  - **Not this theme:** the remaining six roster entries (`kilo`, `aider`, `cursor`, `copilot`,
    `cline`, `openclaude`) — narrowed to the three council-eligible providers because those are the
    ones this app already runs unattended today, and a marker set authored against a CLI nobody
    launches from a card or a loop is unverifiable.

## Files this phase touches

| Area | Path |
|---|---|
| Main, forge write | [`gh-project-write.ts`](../../../packages/desktop/src/main/forge/gh-project-write.ts) — new `clearProjectV2ItemFieldValue` (Theme C) |
| Main, forge read | [`gh-cli.ts`](../../../packages/desktop/src/main/forge/gh-cli.ts) — `PULL_FIELDS`/`PULL_DETAIL_FIELDS` gain `id` (Theme E) |
| Contract | [`shared/src/domain/forge.ts`](../../../packages/shared/src/domain/forge.ts) — `ForgePullSchema`/`ForgePullDetailSchema` gain `id` (Theme E) |
| Renderer, board | `app/src/features/projects/board/` — `board-view.tsx`, `board-dnd.ts`, `board-derive.ts` (Theme C); a new `card-panel-stack.tsx` wrapper (Theme D); `card-composer.tsx` (Theme B); a new `dismissCardSession` action surfaced on the card (Theme A) |
| Renderer, terminal store | [`terminal-store.ts`](../../../packages/app/src/features/terminal/terminal-store.ts) — new `dismissCardSession` action beside `rehomeSession` (Theme A) |
| Renderer, reviews | [`pr-detail.tsx`](../../../packages/app/src/features/reviews/pr-detail.tsx) — new "Add to project ▸" action (Theme E) |
| Renderer, settings | [`projects-page.tsx`](../../../packages/app/src/features/settings/settings-pages/projects-page.tsx) — new launch-and-run toggle (Theme B) |
| Renderer, reused unchanged | [`panel-stack/`](../../../packages/app/src/components/panel-stack/) (Theme D), `start-agent.ts`'s existing `autoSend` param (Theme B) |
| Main, activity | [`activity-detect.ts`](../../../packages/desktop/src/main/activity-detect.ts) — unchanged; only the roster's marker data changes |
| Contract, roster | [`shared/src/terminal.ts`](../../../packages/shared/src/terminal.ts) — `activity` field on `agy`/`codex`/`opencode`'s `BUILTIN_AGENTS` entries (Theme F) |
| Tests | `board-dnd.test.ts` (Theme C, invert the No-status rejection case), `terminal-store.test.ts` (Theme A), `terminal.test.ts` (Theme F, update the builtins-with-activity assertion), `pr-detail.test.tsx`/`reviews` e2e (Theme E) |

## Verification

- [ ] `moon run :typecheck :lint :test` green.
- [ ] A card whose agent has exited still shows in the board with a terminal-state indicator, not a
      stale glow, and Dismiss clears its binding without ending a still-live session early.
- [ ] The 6th concurrent card launch on one board shows the soft-warn toast; it does not block the
      launch.
- [ ] "Launch and run" is invisible with the settings toggle off, and even with it on, still shows
      the confirm dialog with the exact command before sending it.
- [ ] Dragging a card to "No status" clears the field on github.com (mock-bridge e2e for the shape;
      a real-board human pass for the live mutation, same posture as Phase 41 Theme I).
- [ ] Opening a card, closing it and reopening a different one is `Mod+[`-reachable back to the
      first, via the board's own panel-stack instance.
- [ ] "Add to project ▸" from a PR's Reviews detail pane adds it to the last-used board, verified
      against a mock bridge; a real-board human pass confirms the item appears on github.com.
- [ ] A non-Claude agent's kanban card / FAB tab shows a live `thinking`/`waiting` transition during
      a real run, not a static idle glyph — a human pass, since it needs a real CLI's real output.

## Not in this phase

Within-column reordering, swimlanes, grouping by any field but `Status`, a local/offline task
store, multi-board views, an Issues view (a prerequisite Theme E's Issues half is blocked on, not
built here), a process-wide WebGL context budget, and marker authoring for any roster agent beyond
`agy`/`codex`/`opencode`.

## Decisions / open questions

- **Settled — a card's session survives its agent, cleared only on explicit Dismiss.** This is
  Phase 41's own recommendation for its own open question, carried out here rather than re-litigated.
- **Settled — launch-and-run stays opt-in, off by default, confirm every time.** The toggle removes
  a step (reaching the button); it does not remove the look-before-you-leap the confirm dialog
  provides, which is where Phase 41's untrusted-remote-text argument actually does its work.
- **Settled — Theme E ships for PRs only.** An Issues entry point has no view to attach to yet;
  building one is a separate phase's scope, not a rider on this one.
- **Open — does the soft-warn-at-5 toast use the same notification-bell mechanism Phase 35's FAB
  waiting-toasts already use, or a plain inline banner on the board?** *Recommendation:* reuse the
  bell — it is already the one place this app surfaces an "agent wants your attention" signal, and
  a second toast mechanism for the same category of event would be the first one.
- **Open — should Theme F's newly-authored markers ship gated behind anything, given a wrong
  pattern degrades to "no signal" rather than a crash (per `activity-detect.ts`'s own time-budget
  breaker, which disables a slow detector automatically)?** *Recommendation:* no gate needed — the
  existing 3-strikes auto-disable already bounds the failure mode to "back to today's silence,"
  which is the worst case doing nothing already ships.
