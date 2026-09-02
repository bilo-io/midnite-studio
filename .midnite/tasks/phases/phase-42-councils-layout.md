# Phase 42 — Councils, rearranged

[Phase 34](phase-34-agent-councils.md) shipped Agent Councils as a working vertical slice and
explicitly deferred the shape of the room it lives in. That shape is now the thing holding it back.

[`councils-view.tsx`](../../../packages/app/src/features/councils/councils-view.tsx) is **33 lines**
of flat two-pane flex: a fixed `w-64 shrink-0 border-r` rail holding `<CouncilList>`, and either
`<CouncilDetail>` or an `<EmptyState>` filling everything else. Selection is a local
`useState<string | null>`. That single `useState` is why "navigate councils and runs from the same
panel, with a back button and a forward transition" is not a CSS change — **there is no history to
navigate**. Meanwhile [`council-detail.tsx`](../../../packages/app/src/features/councils/council-detail.tsx)
is 221 lines carrying the members panel, the run list *and* the prompt composer in one column, so
the output — the actual point of a council — competes for width with its own configuration.

This phase does three things: it builds the **history primitive** the app is missing, it moves
councils to **three panes** (navigation left, output centre, configuration right), and it gives
council members the **drag-reorder** Phase 34 listed as deferred.

**Builds on.** The app already has a back/forward stack — but at the *view* level:
`viewHistory` / `viewHistoryIndex` in
[`ui-store.ts:292`](../../../packages/app/src/store/ui-store.ts), with the push-truncates-forward
semantics you would expect. That is the model for the panel-level primitive, and worth reading
before writing a second one. Councils' data layer needs no change at all — 
[`shared/src/council.ts`](../../../packages/shared/src/council.ts),
[`council-runner.ts`](../../../packages/desktop/src/main/council-runner.ts) and
[`councils-store.ts`](../../../packages/desktop/src/main/councils-store.ts) are untouched. `@dnd-kit`
already ships and already does exactly this job in the repos sidebar and terminal session list.

**Scope guardrails.** This is a **renderer-only, layout-and-navigation** phase. No IPC changes, no
main-process changes, no new council capability — the format stays `brainstorm`, councils stay
global, the member pool stays `agy`/`codex`/`opencode`. `panel-stack` is a **panel-local** history
primitive, deliberately **not** an app-wide router: replacing the `ViewId` switch in
[`app.tsx`](../../../packages/app/src/app.tsx) would touch every view, the title-bar breadcrumbs,
the palette's nav provider and `FORGE_GATED_VIEWS`' redirect, and it is not what this phase is for.

Effort tags: **S** ≈ an hour or two · **M** ≈ half a day · **L** ≈ a day plus.

## Deliverables

### A — `panel-stack`, the missing primitive (M)

A small, generic, tested history stack any view can adopt. Councils is its first consumer; Projects
([Phase 40](phase-40-github-projects.md)) and Workflows ([Phase 43](phase-43-workflows-mvp.md)) are
its obvious next ones, which is why it lands in `components/` rather than `features/councils/`.

- [ ] `app/src/components/panel-stack/use-panel-history.ts` — `push`, `replace`, `back`,
      `forward`, `reset`, with `canGoBack` / `canGoForward`, generic over an entry type. Push
      **truncates the forward tail**, matching `ui-store.ts`'s `viewHistory` semantics exactly, so
      the app has one notion of what back/forward means rather than two.
- [ ] `panel-stack.tsx` — renders the current entry with a directional slide: forward pushes in
      from the right, back from the left. Only two panes are ever mounted during a transition.
- [ ] `panel-header.tsx` — a back chevron (disabled at the root), a forward chevron, and a
      breadcrumb trail of the stack, each crumb clickable.
- [ ] Depth is bounded, and pushing the entry already on top is a no-op — a run clicked twice is
      not two entries.
- [ ] `use-panel-history.test.ts`: push/back/forward ordering, the forward-tail truncation, the
      depth bound, the duplicate-push no-op, and back at the root.
- [ ] Documented as reusable in the module's own header comment, naming Councils as consumer #1 —
      the convention Phase 39's `StatusToggle` established for a shared primitive.

### B — Three panes (M)

- [ ] Rewrite [`councils-view.tsx`](../../../packages/app/src/features/councils/councils-view.tsx)
      as three regions: a left **navigation** rail (the `PanelStack`), a centre **output** region,
      and a right **configuration** panel.
- [ ] Centre is the widest region by default and the one that grows — a synthesis write-up and a
      live member transcript are what the view is *for*.
- [ ] Left and right panels are resizable and their widths persist, using the same
      resizable-panel machinery Phase 13 built and Phase 27 extended. Not a new mechanism.
- [ ] The right panel collapses to a rail, so a council mid-run can be read full-width.
- [ ] Responsive floor: below a threshold the right panel becomes an overlay rather than squeezing
      the centre to nothing.

### C — Configuration moves right, and members reorder (M)

- [ ] Extract the members panel out of
      [`council-detail.tsx`](../../../packages/app/src/features/councils/council-detail.tsx)
      (currently 221 lines holding three concerns) into `council-config-panel.tsx`, mounted in the
      right region.
- [ ] `@dnd-kit` drag-reorder of council members — the item Phase 34 named as deferred. Order
      persists through the existing debounced save (`SAVE_DEBOUNCE_MS`), and a drag must not race
      that debounce: flush on drop rather than waiting out the timer.
- [ ] Member order is **presentation and prompt order**, not execution order — members still run in
      parallel, and the config panel says so, so reordering does not imply a scheduling promise the
      runner does not keep.
- [ ] Keyboard reorder via `@dnd-kit`'s keyboard sensor.
- [ ] A run's member snapshot stays frozen at run start (the Phase 34 Theme A guarantee) —
      reordering a council does not retroactively reorder a finished run.

### D — Back, forward, and the crumbs (S)

- [ ] Councils' local `useState<string | null>` selection is replaced by the `panel-stack` entries:
      `{kind:'list'} → {kind:'council', id} → {kind:'run', id}`.
- [ ] Back chevron, forward chevron and breadcrumbs in the left rail's header.
- [ ] `Mod+[` / `Mod+]` bound through
      [`shared/src/keybindings.ts`](../../../packages/shared/src/keybindings.ts) — the registry is
      the single source of truth for every chord, per `CLAUDE.md`; a literal chord in JSX is the
      exact drift Phase 39 Theme A had to clean up.
- [ ] Mouse back/forward buttons, if the platform surfaces them, drive the same stack.

### E — Councils and runs share the panel (M)

- [ ] `<CouncilList>` and the run list both render as `PanelStack` entries in the **left rail**,
      so moving between "which council" and "which run of it" is one back-and-forward motion in one
      place — the behaviour the feature note asks for.
- [ ] The centre region follows the stack top: a council entry shows its latest run or an empty
      prompt state; a run entry shows
      [`council-run-view.tsx`](../../../packages/app/src/features/councils/council-run-view.tsx).
- [ ] A run that starts while its council is on top pushes the run entry automatically — you land
      on the thing you just started.
- [ ] Live output ([`council-live-output.tsx`](../../../packages/app/src/features/councils/council-live-output.tsx))
      keeps streaming when its entry is not on top; navigating away must not detach the run.
- [ ] The stack survives leaving the Councils view and coming back within a session.

### F — Motion, and proving it (S)

- [ ] `prefers-reduced-motion` and the app's `html[data-motion='reduced']` attribute both collapse
      the slide to an instant swap. **Asserted through the real cascade**, not assumed: Phase 39
      Theme G found a reduced-motion rule losing on specificity (`0,2,1` vs `0,3,0`) with shell's
      `!important` duration masking it, and it shipped believing otherwise.
- [ ] Transition duration comes from the existing motion tokens, not a hard-coded ms.
- [ ] Update [`e2e/councils.spec.ts`](../../../packages/app/e2e/councils.spec.ts) for the new
      layout, and add: navigate list → council → run, go back twice, go forward once, land where
      you started.
- [ ] Vitest for the config panel's reorder-then-save flush.
- [ ] Screenshots: three panes at rest, the right panel collapsed, and a run mid-flight.

## Files this phase touches

| Area | Path |
|---|---|
| New primitive | `app/src/components/panel-stack/` *(new — `use-panel-history.ts`, `panel-stack.tsx`, `panel-header.tsx`, tests)* |
| Councils | [`councils-view.tsx`](../../../packages/app/src/features/councils/councils-view.tsx), [`council-detail.tsx`](../../../packages/app/src/features/councils/council-detail.tsx), [`council-list.tsx`](../../../packages/app/src/features/councils/council-list.tsx), [`council-run-view.tsx`](../../../packages/app/src/features/councils/council-run-view.tsx), [`council-live-output.tsx`](../../../packages/app/src/features/councils/council-live-output.tsx), `council-config-panel.tsx` *(new)* |
| Chords | [`shared/src/keybindings.ts`](../../../packages/shared/src/keybindings.ts) |
| Store | [`ui-store.ts`](../../../packages/app/src/store/ui-store.ts) (persisted panel widths) |
| Tests | [`app/e2e/councils.spec.ts`](../../../packages/app/e2e/councils.spec.ts) |

## Verification

- [ ] `moon run :typecheck :lint :test` green.
- [ ] No IPC, `shared/src/council.ts`, or main-process change in the diff — if one appears, the
      phase has grown past its brief.
- [ ] `moon run app:perf` unchanged: `panel-stack` is small and Councils is already lazy.
- [ ] Reduced motion verified **in the browser** with the attribute set, not by reading the CSS.
- [ ] A real council run, watched from the new layout: start it from the council entry, get pushed
      to the run, navigate back to the list mid-run, return, and confirm output never stopped.
- [ ] Screenshots per Theme F.

## Not in this phase

An app-wide router, per-repo council scoping, new synthesis formats, anonymization, export,
re-synthesis, changing the member pool, or adopting `panel-stack` in any other view — Projects and
Workflows adopt it on their own phases.

## Decisions / open questions

- **Settled — a generic `panel-stack` primitive, not a councils-local stack and not a router.**
  Two other phases in this batch want the same behaviour; a router is a much larger change than the
  problem justifies.
- **Settled — config right, output centre, navigation left.**
- **Open — does the stack persist across app restarts?** *Recommendation:* no. Within-session only,
  reset to the list on launch. A restored deep link into a finished run is more confusing than
  useful, and the run is one click away.
- **Open — does the run list live in the left rail or under the council in the centre?**
  *Recommendation:* the left rail, as Theme E writes it — the feature note explicitly asks for both
  lists to navigate from the same panel.
- **Open — should member order become execution order later?** *Recommendation:* keep them separate
  and say so in the UI (Theme C). If a future phase adds sequential councils, ordering is already
  there to mean something.
