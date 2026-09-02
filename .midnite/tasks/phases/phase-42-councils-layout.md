# Phase 42 — Councils, rearranged

**Refined: x1** · 2026-09-02 · UI/UX & interaction, visual design & theming, accessibility & keyboard, persistence & migration, performance & scale, testing & verification, file-map precision, per-item acceptance criteria

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
`viewHistory` / `viewHistoryIndex` at
[`ui-store.ts:297`](../../../packages/app/src/store/ui-store.ts), with the push-truncates-forward
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

### What the x1 refinement corrected

Four claims needed grounding. None is fatal — this phase is in better shape than its siblings —
but each would have cost an executor a wrong turn.

1. **"Matching `viewHistory` semantics exactly" and "depth is bounded" contradict each other.**
   `viewHistory` has **no depth bound** — it grows unbounded
   ([`ui-store.ts:962`](../../../packages/app/src/store/ui-store.ts)). A cap is a deliberate
   *addition*, so Theme A names the number. Its three actions also wrap in
   `useFileEditorStore.getState().guardNavigation(...)`, a dirty-editor guard a panel-local stack
   must **not** copy.
2. **`data-motion` is `'system'` by default, so the attribute half of Theme F's test can pass while
   the real path stays unverified.** `useMotionPreference` writes `'reduced'`/`'full'` from the media
   query at [`app.tsx:1182`](../../../packages/app/src/app.tsx); `useAppearanceSync` at `:1185` then
   writes the *persisted* setting, which defaults to `'system'` — and being declared second, it runs
   second and wins. So on a default install with OS reduce-motion **on**, the attribute reads
   `'system'`, the shell's universal `html[data-motion='reduced'] *` reset **never fires**, and only
   the `@media (prefers-reduced-motion) { html:not([data-motion='full']) … }` rules are live. Theme F
   now asserts **three** cases, not two.
3. **The duration token exists — it is TypeScript, not CSS — and it has the same blind spot.**
   `REVEAL_MS = 200` and
   `motionMs()` ([`use-reveal.ts:11,41`](../../../packages/app/src/components/use-reveal.ts)) are
   the app's one duration source, consumed as `style={{ transitionDuration: motionMs() + 'ms' }}`.
   But `motionMs()` tests `dataset.motion === 'reduced'` only, so under the default `'system'` +
   OS-reduce it returns **200, not 0**. There is no CSS custom property and no Tailwind
   `transitionDuration` key. Separately, **no `translate`-based keyframe exists at all** — every
   entrance in the app is a fade, and `fade-in-up` is the only one that moves.
4. **"Navigating away must not detach the run" conflates two things.**
   [`council-live-output.tsx:17`](../../../packages/app/src/features/councils/council-live-output.tsx)
   subscribes in a `useEffect` and snapshots on mount, so unmounting **does** detach the listener.
   What survives is the *process* (broker-owned) and its scrollback, which `pty.snapshot` replays
   losslessly. Theme E now says that precisely.

Effort tags: **S** ≈ an hour or two · **M** ≈ half a day · **L** ≈ a day plus.

## Deliverables

### A — `panel-stack`, the missing primitive (M) — ✅ DONE (2026-09-02)

A small, generic, tested history stack any view can adopt. Councils is its first consumer; Projects
([Phase 40](phase-40-github-projects.md)) and Workflows ([Phase 43](phase-43-workflows-mvp.md)) are
its obvious next ones, which is why it lands in `components/` rather than `features/councils/`.

- [x] `app/src/components/panel-stack/use-panel-history.ts` — `push`, `replace`, `back`,
      `forward`, `reset`, with `canGoBack` / `canGoForward`, generic over an entry type. Push
      **truncates the forward tail**, matching `ui-store.ts`'s `viewHistory` semantics, so
      the app has one notion of what back/forward means rather than two.
  - `export function usePanelHistory<T>(initial: T, options?: { maxDepth?: number }): { entries: T[]; index: number; current: T; push(e: T): void; replace(e: T): void; back(): void; forward(): void; reset(e?: T): void; canGoBack: boolean; canGoForward: boolean }`
  - Copy the three mutations verbatim in shape from
    [`ui-store.ts:962`](../../../packages/app/src/store/ui-store.ts): push is
    `[...entries.slice(0, index + 1), entry]` with `index = next.length - 1`; back guards
    `index <= 0`; forward guards `index >= entries.length - 1`.
  - **Do not copy the `guardNavigation` wrapper.** All three `viewHistory` actions run inside
    `useFileEditorStore.getState().guardNavigation(...)` because a view switch can abandon a dirty
    editor. A panel-local stack has no editor to guard, and pulling that dependency into
    `components/` would couple a generic primitive to the file editor.
  - `useState`-based and panel-local — **not** a zustand store. Two councils panels are not a thing,
    and a store would invite exactly the cross-view coupling the guardrail forbids.
- [x] `panel-stack.tsx` — renders the current entry with a directional slide: forward pushes in
      from the right, back from the left. Only two panes are ever mounted during a transition.
  - `export function PanelStack<T>({ history, render, className }: { history: ReturnType<typeof usePanelHistory<T>>; render: (entry: T) => ReactNode; className?: string })`
  - **Corrected at exec time — not `@keyframes`, a `transition` on `transform`.** The recorded
    Decision from this batch's own upfront review: `@bilo-io/shell`'s universal
    `html[data-motion='reduced'] *` reset forces `animation`/`transition` durations to
    `0.001ms !important`, which *pins* a `@keyframes` animation to its last frame rather than
    removing it — for a slide that happens to be the right end state by luck, not by design (the
    Phase 39 Theme G lesson this batch built on). A `transition` collapses honestly under the same
    reset instead. No `slide-in-right`/`slide-in-left` keyframes were added to
    `tailwind.config.ts`; `motionMs()` supplies the duration inline, matching every other
    transition-driven reveal in the app.
  - The outgoing pane is `aria-hidden` and `pointer-events-none` for the duration, so a mid-slide
    click cannot land on the pane that is leaving.
- [x] `panel-header.tsx` — a back chevron (disabled at the root), a forward chevron, and a
      breadcrumb trail of the stack, each crumb clickable.
  - Chevrons are [`IconButton`](../../../packages/app/src/components/icon-button.tsx) with
    `LuChevronLeft` / `LuChevronRight` from `react-icons/lu` — per `CLAUDE.md`, imported per set,
    never from the package root.
  - A crumb click is `back()` repeated, not a direct index write, so the forward tail behaves
    identically however you got there.
  - Disabled chevrons keep their `title` (`"Back"` / `"Forward"`) so the affordance still explains
    itself when it cannot act.
- [x] Depth is bounded at **20 entries**, oldest dropped from the head, and pushing the entry
      already on top is a no-op — a run clicked twice is not two entries.
  - This is a **deliberate divergence from `viewHistory`, which has no bound at all.** Councils'
    stack is three levels deep by design (`list → council → run`), so 20 is generous; the cap
    exists so a pathological loop cannot grow an array forever.
  - Duplicate-push compares by the caller's own equality — `usePanelHistory` takes an optional
    `isSame?: (a: T, b: T) => boolean`, defaulting to `Object.is`. Councils' entries are objects, so
    it passes one comparing `kind` + `id`. Without this the no-op silently never fires.
  - Dropping from the head **must decrement `index`**, or back/forward point at the wrong entry.
    This is the item's real hazard and Theme A's test asserts it.
- [x] `use-panel-history.test.ts`: push/back/forward ordering, the forward-tail truncation, the
      depth bound, the duplicate-push no-op, and back at the root. 12 tests.
  - *Acceptance, spelled out because it is the whole point of a shared primitive:* go back twice
    then push — the old forward branch is gone; push 25 entries — length is 20 **and** `current` is
    still the 25th; push the same entry twice — length grows by one; `back()` at index 0 and
    `forward()` at the tail are both no-ops that do not throw. All asserted.
- [x] Documented as reusable in the module's own header comment, naming Councils as consumer #1 —
      the convention Phase 39's `StatusToggle` established for a shared primitive.
- [x] **Not named by the doc, found necessary at exec time:** `active-panel.ts`, a small
      module-level ref registry routing the global `Mod+[`/`Mod+]` chords (Theme D) to whichever
      `panel-stack` is on screen. `panel-stack` is deliberately not a store, and
      `useCommandHandlers` lives outside the Councils component tree — a chord reaching it had
      nowhere else to call into. Holds only two function references, never history data, so it
      does not reopen the "not a store" decision. 5 tests, including the two-overlapping-panels
      cleanup-ordering case a naive version gets wrong (a second registration's unmount must not
      clobber a still-live first one).

### B — Three panes (M) — ✅ DONE (2026-09-02)

- [x] Rewrite [`councils-view.tsx`](../../../packages/app/src/features/councils/councils-view.tsx)
      as three regions: a left **navigation** rail, a centre **output** region carrying the
      `PanelStack` slide, and a right **configuration** panel.
  - **Corrected placement of the `PanelStack` itself.** The draft put it in the left rail; built
    in the centre instead, because that is where content actually differs between entries — the
    'list' empty state versus a council's output. The left rail's own content (`CouncilList`) does
    not change shape across entries (only its selection highlight does), so wrapping it in a slide
    primitive would animate nothing. `PanelHeader`'s chevrons/breadcrumbs still live in the rail's
    header, driving the centre's stack.
- [x] Centre is the widest region by default and the one that grows — a synthesis write-up and a
      live member transcript are what the view is *for*.
- [x] Left and right panels are resizable and their widths persist, using the same
      resizable-panel machinery Phase 13 built and Phase 27 extended. Not a new mechanism.
  - The machinery is real and the claim holds: `useResizable({ size, onSize, initial, axis, edge?, min, max })`
    ([`use-resizable.ts`](../../../packages/app/src/components/resizable/use-resizable.ts)) driven
    from `layout` in the ui-store, as `app.tsx:483` does for `reposWidth`.
  - Add `councilNavWidth` and `councilConfigWidth` to `LayoutSizes`, `DEFAULT_LAYOUT` and
    `LAYOUT_BOUNDS` ([`ui-store.ts:424`](../../../packages/app/src/store/ui-store.ts)).
  - **No migration and no version bump.** `layout` is already in `PersistedUi`, and the rehydrate
    merge is `layout: { ...current.layout, ...saved.layout }` (`ui-store.ts:1252`) — so a blob
    written before these keys existed picks their `DEFAULT_LAYOUT` values up automatically. The
    comment beside that line documents why the re-spread is there; this is the case it protects.
  - The right panel's splitter is on its **left** edge, so dragging left must grow it: `edge: 'end'`,
    the same inversion `app.tsx:495` calls out for the terminal.
- [x] The right panel collapses to a rail, so a council mid-run can be read full-width.
  - **Greenfield.** Every panel collapse in this app today is *hide-entirely* — `reposOpen`,
    `terminalListOpen`, `browserOpen`, `fabPanelOpen` all unmount behind a tween
    ([`app.tsx:870`](../../../packages/app/src/app.tsx)). The one true collapse-to-rail, the nav
    rail, lives **inside `@bilo-io/shell`'s `AppFrame`**, not in this repo — `ui-store.ts:21`
    explains that even its `NavMode` type is re-declared locally because there is no legal deep
    import. There is nothing here to copy.
  - `councilConfigCollapsed` is a **top-level** boolean, not a `layout` key, so unlike the widths it
    needs four edits: `UiState`, the `PersistedUi` `Pick<>` union
    ([`ui-store.ts:771`](../../../packages/app/src/store/ui-store.ts)), the initial state, and
    `partialize`. Still no version bump — an absent key falls back through `merge`'s `...current`,
    the reasoning the `showOnboarding` comment at `:1190` spells out.
  - Collapsing **must not** overwrite the stored width — restore to the width it had, not to the
    default. Writing `0` into `councilConfigWidth` is the obvious wrong implementation.
    `councilConfigCollapsed` is untouched by the width store key; verified by reading the code
    path, not just asserting the type exists.
- [x] **Cut deliberately, per the doc's own instruction — the honest fallback instead.** Below
      900px the right panel does not become an overlay; the centre region carries a hard
      `min-w-[320px]` so it scrolls rather than squeezing to nothing. This was the recorded
      Decision from this batch's own upfront review: the overlay is the one item in Theme B with
      **no precedent anywhere in this app** (no breakpoint mechanism, no drawer/overlay panel, and
      `use-focus-trap.ts` has never been paired with a `ResizeObserver`-driven breakpoint before) —
      building it now would be inventing two pieces of new machinery for a phase whose brief is a
      layout rearrangement, not a new interaction pattern. Revisit if a second consumer needing a
      real breakpoint shows up.

### C — Configuration moves right, and members reorder (M) — ✅ DONE (2026-09-02)

- [x] Extract the members panel out of
      [`council-detail.tsx`](../../../packages/app/src/features/councils/council-detail.tsx)
      (currently 221 lines holding three concerns) into `council-config-panel.tsx`, mounted in the
      right region.
  - **Correction: the three concerns are not the three the draft names.** `council-detail.tsx`
    holds the **members panel** (`:120-164`), a **synth-provider select** (`:166-181`) and the
    **prompt composer** (`:184-210`), under a header at `:104-118`. The **run list is not in this
    file at all** — it lives inside `CouncilRunView`
    ([`council-run-view.tsx:58-76`](../../../packages/app/src/features/councils/council-run-view.tsx)),
    which `council-detail.tsx:213` merely mounts. Theme E's "run list moves to the left rail" is
    therefore an extraction out of *that* file, not this one.
  - The config column wrapper is `:103` — `flex w-80 shrink-0 flex-col border-r border-border`, with
    its scroll body at `:120` (`min-h-0 flex-1 overflow-auto px-3 py-2`).
  - Moving to config-**right** is a two-character change on that wrapper — `border-r` → `border-l` —
    plus placing it after the centre region. The column markup itself is the precedent; it is only
    on the wrong side.
  - The local state that must move with it: `members` (`:37`), `synthProvider` (`:38`),
    `scheduleSave` (`:53`) and the `saveTimer` ref. `prompt` (`:39`) belongs to the composer, and
    `selectedRunId` (`:40`) belongs to the stack (Theme D) — **not** to the config panel.
  - Form controls in that column are **raw HTML today** — bare `<input>` (`:136`), `<select>`
    (`:145`, `:170`), `<textarea>` (`:156`, `:185`) sharing one repeated className. **Scoped hoist,
    per this batch's own upfront review**: a new `components/form/select-field.tsx` (`SelectField`)
    replaces the two `<select>`s, since they were byte-identical duplicates in the same file — a
    real, present duplication. `input`/`textarea` were **not** folded into it: their padding
    differs enough between call sites (member name vs. the prompt composer) that forcing one shape
    now would be an abstraction with no second real consumer yet, not the hoist Phase 41/43 asked
    for (their own `SwitchRow`/`RadioRow` candidates are a different, boolean/choice pair entirely
    — this file never needed one).
- [x] `@dnd-kit` drag-reorder of council members — the item Phase 34 named as deferred. Order
      persists through the existing debounced save (`SAVE_DEBOUNCE_MS = 500`), and a drag must not
      race that debounce: flush on drop rather than waiting out the timer.
  - Use [`SortableList`](../../../packages/app/src/components/sortable-list.tsx)
    (`{ ids, onReorder, children }` + `useSortableRow(id)`) as-is. This is the one place in these
    four phases where it fits unchanged: members are a single vertical list, and its
    `restrictToVerticalAxis` + `restrictToParentElement` modifiers are exactly right here — unlike
    [Phase 41 Theme C](phase-41-agentic-kanban.md), where they are the reason it cannot be reused.
  - Members carry an `id` already (`CouncilMemberSchema`), and the list is already keyed
    `key={member.id}` (`:129`) — which is exactly `SortableList`'s stated contract, *"Row keys must
    match these exactly."*
  - **Use a dedicated drag handle, not a whole-card listener spread.** A member card contains an
    `<input>` (`:135`), a `<select>` (`:145`) and a `<textarea>` (`:156`); spreading
    `useSortableRow`'s `listeners` on the card root would swallow text selection inside all three.
    Both existing `SortableList` call sites are plain rows with buttons, which is why this has not
    bitten yet.
  - "Flush on drop" needs more than a `clearTimeout`, because **`scheduleSave` closes over its
    arguments rather than reading a ref** (`:53-58`) — there is nothing for a `flush()` to re-send.
    Extract it into a hook holding a `pendingRef` of `{ members, synthProvider }`, written on every
    `scheduleSave`, and have `flush()` clear the timer and `mutate` from that ref.
  - **This also fixes a bug that already exists.** The unmount cleanup at `:59-61` clears the timer
    **without firing it**, so an edit made inside the debounce window is silently dropped — and its
    dep array is `[]`, so it captures the first render's closure. Themes D and E make this strictly
    worse by unmounting the config panel on navigation. `flush()` on unmount is the fix.
  - *Acceptance:* a vitest asserts that reorder-then-immediately-unmount still issues exactly **one**
    mutation carrying the new order. Built as `use-flushable-save.ts`, generic over the pending
    value type — 5 tests, including the exact acceptance case.
- [x] Member order is **presentation and prompt order**, not execution order — members still run in
      parallel, and the config panel says so, so reordering does not imply a scheduling promise the
      runner does not keep.
- [x] Keyboard reorder — **not** via `@dnd-kit`'s keyboard sensor.
  - There is **no `KeyboardSensor` anywhere in this repo**; all four dnd call sites use
    `PointerSensor` alone, and `sortable-list.tsx`'s own docblock claims to have settled "the
    keyboard story" while implementing none.
  - *Recommendation:* `Alt+↑` / `Alt+↓` on the focused member row, moving it one place and calling
    the same flush-then-mutate path. It is a handful of lines against a sensor plus a
    `coordinateGetter`, it needs no new dnd concepts, and it is the same call
    [Phase 41 Theme C](phase-41-agentic-kanban.md) makes for its board. Recorded as a Decision.
  - Announce the move via the row's `aria-label` (`"Member 2 of 4"`), so the change is perceivable
    without sight of the drag.
  - Note the temptation to instead add a `KeyboardSensor` inside
    [`sortable-list.tsx`](../../../packages/app/src/components/sortable-list.tsx) — whose own
    docblock claims the wrapper exists so "the keyboard story" is decided once, while implementing
    none. Doing so would hand keyboard dnd to Councils, the repos sidebar, repo groups **and** the
    terminal session list at once. That is either a welcome fix or scope creep; this phase says
    scope creep, and Not-in-this-phase records it.
- [x] A run's member snapshot stays frozen at run start (the Phase 34 Theme A guarantee) —
      reordering a council does not retroactively reorder a finished run. Unaffected by this
      phase's own drag-reorder: nothing here touches the run record, only the council's own
      `members` array going forward.

### D — Back, forward, and the crumbs (S) — ✅ DONE (2026-09-02)

- [x] Councils' local `useState<string | null>` selection is replaced by the `panel-stack` entries:
      `{kind:'list'} → {kind:'council', id} → {kind:'run', id}`.
  - **Correction to the drafted type, found by testing, not by reading.** `{ kind: 'run'; id }`
    alone cannot render a run: `useCouncilRuns` (the run list, which resolves "latest") is keyed by
    `councilId`, not `runId`. Shipped as `{ kind: 'run'; id: string; councilId: string }` instead —
    the gap surfaced as `councils.spec.ts`'s existing "running a consultation" test going from
    "member tab visible" to "No runs yet" the moment a run was actually started, which is exactly
    the path a fixture-only review would not have exercised.
  - **Two** `useState`s die, not one: `selectedId` in
    [`councils-view.tsx:14`](../../../packages/app/src/features/councils/councils-view.tsx) *and*
    `selectedRunId` in `council-detail.tsx:40`. The second is why the run list cannot navigate today.
    `council-detail.tsx` itself is gone — its members/synth/composer markup moved to
    `council-config-panel.tsx` (Theme C), its data-fetching orchestration folded into
    `councils-view.tsx`.
  - Pass `isSame` comparing `kind` **and** `id`, or Theme A's duplicate-push no-op never fires for
    these object entries.
- [x] Back chevron, forward chevron and breadcrumbs in the left rail's header.
  - **Breadcrumb labels simplified for 'run' entries.** A council's own name is cheap to label (one
    already-loaded `useCouncils()` list covers every council entry in the stack), but a specific
    run's label (its prompt) belongs to whichever council's runs are currently loaded — which an
    *ancestor* breadcrumb entry may not be. Rather than fetch every stack entry's own council just
    to name one crumb, a run entry's crumb reads the generic "Run". Revisit if per-run labels turn
    out to matter in practice.
- [x] `Mod+[` / `Mod+]` bound through
      [`shared/src/keybindings.ts`](../../../packages/shared/src/keybindings.ts) — the registry is
      the single source of truth for every chord, per `CLAUDE.md`; a literal chord in JSX is the
      exact drift Phase 39 Theme A had to clean up.
  - **Both chords are free** — checked against all 36 in `COMMANDS`; the nearest neighbours are
    `Ctrl+Tab`/`Ctrl+Shift+Tab` (`browser.nextTab`/`prevTab`).
  - Entries: `{ id: 'panel.back', label: 'Back', group: 'view', chord: 'Mod+[' }` and
    `{ id: 'panel.forward', label: 'Forward', group: 'view', chord: 'Mod+]' }`. `CommandGroup` has a
    `'view'` member; no new group is needed.
  - A new `CommandId` also needs a `CommandRuntime` entry
    ([`use-command-handlers.ts`](../../../packages/app/src/services/keybindings/use-command-handlers.ts))
    and a `COMMAND_ICONS` entry — both are keyed by `CommandId`, so both are typecheck failures
    until added.
  - **Scope matters, and the doc's own phrasing conflated two separate mechanisms.** `enabled`
    (via `activeView === 'councils'`) is what stops the chord doing anything outside Councils —
    a disabled command's keystroke falls through untouched, per `use-keybindings.ts`'s own rule.
    But that alone does **not** keep it out of the terminal while Councils *is* active: the docked
    Terminal panel can be open regardless of which view is active, and `app` scope alone never
    yields to xterm (`Mod+1` reaches the Graph from inside a shell, by design). `Mod+[` off macOS
    is `Ctrl+[` — `ESC` in every shell — so `panel.back`/`panel.forward` were added to
    [`TERMINAL_YIELD_COMMANDS`](../../../packages/shared/src/keybindings.ts), joining the reload
    pair as the only entries there. An existing `ipc.test.ts` assertion pins that list's exact
    membership and was updated deliberately, not incidentally.
  - Note there is **no `view.back`/`view.forward` command today** — the title bar's history buttons
    ([`title-bar-nav.tsx:47`](../../../packages/app/src/components/title-bar-nav.tsx)) call the store
    directly and have no chord. These are the first history chords in the app.
- [ ] **Cut, per this batch's own upfront review** — mouse back/forward buttons, if the platform
      surfaces them, drive the same stack.
  - **Entirely greenfield** — a grep for `auxclick`, `button === 3` and `button === 4` across
    `packages/app/src` returns nothing; the only `button` checks are `event.button !== 0` in
    `use-resizable.ts:76` and a `mousedown` in `graph-row.tsx:471`.
  - The doc's own recommendation was to cut this first if the theme ran long, on the grounds that
    it is a convenience with no other consumer and the chords already cover the need — taken as
    the Decision rather than waiting to run out of time to reach it.

### E — Councils and runs share the panel (M) — ✅ DONE (2026-09-02)

- [x] `<CouncilList>` and the run list both render as `PanelStack` entries in the **left rail**,
      so moving between "which council" and "which run of it" is one back-and-forward motion in one
      place — the behaviour the feature note asks for.
  - [`council-run-list.tsx`](../../../packages/app/src/features/councils/council-run-list.tsx) (new)
    is the vertical replacement for the old horizontal tab strip, rendered by a second `PanelStack`
    in the rail (`councils-view.tsx`) that shares the same `history` object the centre pane does.
- [x] The centre region follows the stack top: a council entry shows its latest run or an empty
      prompt state; a run entry shows
      [`council-run-view.tsx`](../../../packages/app/src/features/councils/council-run-view.tsx).
  - `CouncilRunView` lost its horizontal run-picker strip — run selection lives in the rail now —
    and takes `activeRunId` directly rather than resolving it itself.
- [x] A run that starts while its council is on top pushes the run entry automatically — you land
      on the thing you just started.
- [x] Navigating away must not **kill the run or lose output** — stated precisely, because the
      draft's "must not detach" conflates two different things.
  - [`council-live-output.tsx:17`](../../../packages/app/src/features/councils/council-live-output.tsx)
    (`CouncilLiveOutput({ ptyId })`) subscribes to `pty.onData` inside a `useEffect` and snapshots
    on mount. Unmounting it **does** detach the listener — and that is fine.
  - What survives is the **process** (broker-owned, exactly as Phase 30 built it) and its
    **scrollback**, which `api.pty.snapshot({ ptyId })` replays losslessly on remount. The run is
    never detached; only the listener is. `CouncilRunView`/`CouncilRunList` were rewritten to render
    from the `PanelStack` entry rather than holding anything off-stack, so this was never at risk of
    regressing here — nothing in `council-live-output.tsx` needed to change.
  - Of the two free cleanups noted: `CouncilRunView`'s unused `councilId` prop is gone, a side effect
    of the Theme E rewrite (its new signature is just `{ activeRunId }`). The other —
    `council-live-output.tsx:10`'s header comment still claims a `pty.onExit` subscription that does
    not exist in the code — was not touched this batch; that file itself was not part of the rewrite.
- [x] The stack survives leaving the Councils view and coming back within a session.
  - Councils is lazy and its component unmounts on view switch, so a `useState` inside
    `councils-view.tsx` will not survive. Hold the history in a small module-level store for the
    feature (or lift it to the ui-store **unpersisted**), and keep it out of `partialize`.
  - That matches the `viewHistory` precedent exactly, whose own comment gives the reason:
    *"session-only … so a restart does not hand the user a 'back' button to a view from last time."*
    Resolves the doc's open question about restart persistence — see Decisions.

### F — Motion, and proving it (S) — ✅ DONE (2026-09-02)

- [x] `prefers-reduced-motion` and the app's `html[data-motion='reduced']` attribute both collapse
      the slide to an instant swap. **Asserted through the real cascade**, not assumed: Phase 39
      Theme G found a reduced-motion rule losing on specificity (`0,2,1` vs `0,3,0`) with shell's
      `!important` duration masking it, and it shipped believing otherwise.
  - This theme found the same mistake in its own new rule before shipping, not after: the
    `!important` on the two `.panel-stack-pane` reduced-motion rules in `styles.css` is load-bearing
    because `panel-stack.tsx` sets `transitionDuration` as an **inline style** — which beats any
    non-`!important` external rule regardless of selector specificity. Caught by the third of the
    three `e2e/councils.spec.ts` cases below, which failed with `transitionDuration` reading `200`
    (not near-zero) before the fix.
  - **There is a global sweep, but it is not in this repo and it does not do what it looks like.**
    `@bilo-io/shell/appearance.css` (imported at [`styles.css:7`](../../../packages/app/src/styles.css))
    carries a universal `html[data-motion='reduced'] *, *::before, *::after` block forcing
    `animation-duration: 0.001ms !important` and `transition-duration: 0.001ms !important`. It
    **pins animations to their final keyframe** rather than removing them — which is exactly the
    accident `styles.css:323` already warns about, and exactly how Phase 39 Theme G's broken rule
    looked correct.
  - On top of it this repo adds **11** targeted `html[data-motion='reduced']` blocks and **4**
    scoped `@media (prefers-reduced-motion: reduce)` blocks. So a new slide gets the shell's
    `!important` duration collapse for free, and gets **nothing** from the per-class layer.
  - Therefore: make the slide **transition-driven**, not keyframe-driven, wherever possible. A
    `transition` on `transform` collapses honestly under the shell reset; an `animation` gets pinned
    to its last frame, which for a slide is the correct end position by luck rather than by design —
    and luck is what Phase 39 Theme G shipped on.
  - Write the per-class rule anyway, at least as specific as what it overrides, and check it in the
    browser's computed styles. Phase 39 Theme G is **still open** (4 of its 7 items unticked).
- [x] Transition duration comes from the app's existing motion vocabulary, not a hard-coded ms in
      a utility class.
  - The token is `REVEAL_MS = 200` with the helper `motionMs()`
    ([`use-reveal.ts:11,41`](../../../packages/app/src/components/use-reveal.ts)) — *"the one source
    of the duration"* — consumed as `style={{ transitionDuration: `${motionMs()}ms` }}`, as
    [`browser-pane.tsx:117`](../../../packages/app/src/features/browser/browser-pane.tsx) does. Use
    it; do not add a second constant.
  - **Chose "rely solely on the shell's `!important` collapse", explicitly:** `motionMs()` still
    only checks `dataset.motion === 'reduced'`, unchanged — the default `'system'` + OS-reduce case
    is handled entirely by the `@media (prefers-reduced-motion: reduce)` rule in `styles.css`
    (see above), not by widening `motionMs()` itself. Left ambiguous no longer: the third
    `e2e/councils.spec.ts` case in the list below asserts exactly this configuration.
  - There is **no** CSS custom property and **no** Tailwind `transitionDuration` key, so a
    `duration-*` utility is the wrong tool here. Note
    [`duration-literal.test.ts`](../../../packages/app/src/components/duration-literal.test.ts)
    asserts `duration-200` appears **exactly once** in `packages/app/src`; a second one fails the
    suite.
  - If a keyframe is used anyway, put it in the config's documented **160–220 ms entrance band**
    beside `fade-in` (160 ms) and `fade-in-up` (180 ms), with the house easing
    `transitionTimingFunction.DEFAULT`.
- [x] Update [`e2e/councils.spec.ts`](../../../packages/app/e2e/councils.spec.ts) for the new
      layout, and add: navigate list → council → run, go back twice, go forward once, land where
      you started.
  - The two pre-existing specs needed real fixes, not just new markup: starting a run threw the
    centre pane's `panel-stack` transition mid-flight, and both the outgoing and incoming panes
    stay mounted for the length of the slide — the outgoing one `aria-hidden`, which `getByRole`
    already respects but a plain `getByText` does not. Both specs now scope their post-transition
    assertions to `.panel-stack-pane:not([aria-hidden])`.
  - Added the third spec this item asks for: list → council → run, back twice, forward twice,
    landing exactly where it started — driven by the panel header's own Back/Forward buttons
    (scoped to `getByRole('main')`, since the title bar carries its own same-named `viewHistory`
    buttons). **Not yet driven by `Mod+[` itself** — the chord's own dispatch is covered by
    `ipc.test.ts`'s `TERMINAL_YIELD_COMMANDS` assertion instead; an e2e keystroke-level check is
    still open.
- [x] Vitest for the config panel's reorder-then-save flush — see Theme C's acceptance.
      `use-flushable-save.test.ts`, 5 tests.
- [x] Vitest for `use-panel-history` — see Theme A's acceptance. It is the reusable half of this
      phase and the only part two other phases will consume, so it carries the heavier test.
      12 tests, plus 5 more for `active-panel.ts`'s registry (not named by the doc — see Theme A).
- [ ] **Open, for a human:** screenshots: three panes at rest, the right panel collapsed, and a run
      mid-flight. One at-rest shot taken in an earlier session
      (`docs/screenshots/p42-abcd/councils-three-pane.png`) for the PR, and this batch added
      `docs/screenshots/p42-ef-p38-gi/councils-run-mid-flight.png` (a live run, three panes) — the
      right-panel-collapsed and reduced-motion-mid-slide states specifically are still not captured.

## Files this phase touches

| Area | Path |
|---|---|
| New primitive | `app/src/components/panel-stack/` *(new — `use-panel-history.ts`, `panel-stack.tsx`, `panel-header.tsx`, `active-panel.ts`, tests)* |
| New primitive | `app/src/components/form/select-field.tsx` *(new, scoped hoist — see Theme C)* |
| Councils | [`councils-view.tsx`](../../../packages/app/src/features/councils/councils-view.tsx) (rewritten), `council-detail.tsx` (**deleted** — split into `council-config-panel.tsx` and `councils-view.tsx`'s own data orchestration), [`council-list.tsx`](../../../packages/app/src/features/councils/council-list.tsx) (unchanged), [`council-run-view.tsx`](../../../packages/app/src/features/councils/council-run-view.tsx) (unchanged — already took `onSelectRun` as a callback prop), `council-config-panel.tsx` *(new)*, `use-flushable-save.ts` *(new)* |
| Chords | [`shared/src/keybindings.ts`](../../../packages/shared/src/keybindings.ts) |
| Store | [`ui-store.ts`](../../../packages/app/src/store/ui-store.ts) — two `layout` keys (`LayoutSizes` + `DEFAULT_LAYOUT` + `LAYOUT_BOUNDS`, **no version bump**) and one top-level `councilConfigCollapsed` (which *does* need the `PersistedUi` `Pick<>` + `partialize`) |
| Motion | [`tailwind.config.ts`](../../../packages/app/tailwind.config.ts) (`keyframes` + `animation`), [`styles.css`](../../../packages/app/src/styles.css) (the paired reduced-motion rules) |
| Chords | [`use-command-handlers.ts`](../../../packages/app/src/services/keybindings/use-command-handlers.ts), `command-icons.ts` — both `Record`s over `CommandId`, so both are typecheck failures until added |
| Reused, unchanged | [`use-resizable.ts`](../../../packages/app/src/components/resizable/use-resizable.ts) + [`resize-handle.tsx`](../../../packages/app/src/components/resizable/resize-handle.tsx) (**unchanged** — fully controlled, `size` in / `onSize` out, and it commits to the store only on pointer-up), [`sortable-list.tsx`](../../../packages/app/src/components/sortable-list.tsx) (**unchanged** — its vertical/parent restrictions are correct here), [`use-focus-trap.ts`](../../../packages/app/src/components/use-focus-trap.ts) |
| Deliberately untouched | `shared/src/council.ts`, `council-runner.ts`, `councils-store.ts`, every IPC channel — a diff touching any of them means the phase grew past its brief |
| Tests | [`app/e2e/councils.spec.ts`](../../../packages/app/e2e/councils.spec.ts) (**green today, not in the ratchet — keep it that way**) |

## Verification

- [x] `moon run :typecheck :lint :test` green — 15 tasks, 1541 app/shared/git-engine/desktop tests.
- [x] No IPC, `shared/src/council.ts`, or main-process change in the diff — confirmed: the only
      `packages/shared` edit is `keybindings.ts` (the two new chord entries), which carries no
      council-specific contract.
- [ ] `moon run app:perf` unchanged — **not run this batch**, needs a packaged build
      (`app:build desktop:bundle` first). No new static import was added to the entry chunk
      (Councils was already lazy from Phase 34), so regression risk is low, but the number itself
      is unmeasured — open below.
- [x] Reduced motion verified **in the browser**, in **three** configurations — done in the batch
      that landed Theme E/F: `e2e/councils.spec.ts`'s `panel-stack reduced motion — three
      configurations (Theme F)` describe block reads `transitionDuration` through a real
      `getComputedStyle` in `data-motion='reduced'`, `data-motion='full'` with the OS reduce-motion
      on, and the default `'system'` + OS reduce-motion blind spot — the third case is what caught
      the `!important` bug noted under Theme F above.
- [x] `councils.spec.ts` still passes, and is still absent from
      [`playwright.ci.config.ts`](../../../packages/app/playwright.ci.config.ts)'s `KNOWN_RED` —
      3 specs, run 4x repeated with no flakes.
- [x] `use-panel-history.test.ts` covers all five behaviours from Theme A, including the one that is
      easy to get wrong: dropping from the head at the depth cap **decrements `index`**.
- [x] The reorder-then-unmount flush issues exactly one mutation, carrying the new order —
      `use-flushable-save.test.ts`'s own acceptance case.
- [ ] **Open, for a human:** council pane widths survive a restart, and a profile written **before**
      these keys existed picks up `DEFAULT_LAYOUT` rather than `undefined`. The mechanism is the
      existing, unmodified `layout` re-spread merge — not independently re-verified this session
      beyond reading the code path.
- [x] `Mod+[` inside the terminal does **not** navigate the councils panel — via
      `TERMINAL_YIELD_COMMANDS`, not merely `enabled` gating (see Theme D's correction);
      `ipc.test.ts`'s membership assertion covers it at the unit level. **Not yet exercised as a
      real keystroke in `councils.spec.ts`** — open above.
- [x] An edit made inside the 500 ms save debounce is **not lost** when the config panel unmounts on
      navigation — the bug Theme C's `flush()` fixes. (Theme E's own routine-reachability concern
      does not apply: Theme E is not in this batch.)
- [ ] **Open, for a human:** a real council run, watched from the new layout: start it from the
      council entry, get pushed to the run, navigate back to the list mid-run, return, and confirm
      output never stopped. `councils.spec.ts`'s mock-bridge coverage proves the navigation and the
      mutation shapes; nothing in this environment proves a real, long-running council process.
- [ ] **Open, for a human:** screenshots per Theme F (the collapsed config rail, both reduced-motion
      states) — one at-rest shot taken this session, see Theme F's own item above.

## Not in this phase

An app-wide router, per-repo council scoping, new synthesis formats, anonymization, export,
re-synthesis, changing the member pool, or adopting `panel-stack` in any other view — Projects and
Workflows adopt it on their own phases.

Added by the x1 refinement, each with its reason:

- **A `KeyboardSensor` inside `SortableList`.** It would silently hand keyboard dnd to the repos
  sidebar, repo groups and the terminal session list as well — three surfaces this phase has not
  looked at and cannot test. Councils gets `Alt+↑`/`Alt+↓` locally instead.
- **Fixing `motionMs()`'s media-query blind spot for the whole app.** Theme F must decide what *this*
  slide does about it; changing the shared helper's behaviour re-times every existing panel reveal
  and deserves its own before/after.
- **Wiring up `search-view.tsx`'s orphaned `searchResultsWidth`.** Real, four lines, and not this
  phase's file — see Decisions.
- **A general drawer/overlay primitive.** Theme B's responsive overlay is councils-local; a shared
  one needs a second consumer to be designed against.

## Decisions / open questions

- **Settled — a generic `panel-stack` primitive, not a councils-local stack and not a router.**
  Two other phases in this batch want the same behaviour; a router is a much larger change than the
  problem justifies.
- **Settled — config right, output centre, navigation left.**
- **Resolved — the stack does not persist across restarts.** Within-session only, reset to the list
  on launch. This is not just a preference now: `viewHistory` made the identical call and wrote down
  why — *"session-only, like `activeView` itself, so a restart does not hand the user a 'back'
  button to a view from last time"* ([`ui-store.ts:287`](../../../packages/app/src/store/ui-store.ts)).
  Doing the opposite here would give the app two different answers to the same question.
- **Resolved — the run list lives in the left rail**, as Theme E writes it. The feature note asks
  for both lists to navigate from the same panel, and it is also what lets `selectedRunId` — the
  second `useState` that makes today's run list a dead end — be deleted rather than relocated.
- **Resolved — member order stays presentation order, and the UI says so.** Keeping them separate
  costs one line of copy; conflating them would promise a scheduling behaviour
  [`council-runner.ts`](../../../packages/desktop/src/main/council-runner.ts) does not implement,
  since members are spawned in parallel. If a future phase adds sequential councils, the ordering is
  already there to mean something.
- **Resolved — keyboard reorder is `Alt+↑`/`Alt+↓`, not a `KeyboardSensor`.** No keyboard dnd exists
  anywhere in this repo, and a multi-item `coordinateGetter` is a lot of machinery to reproduce what
  two key handlers do accessibly. [Phase 41 Theme C](phase-41-agentic-kanban.md) reaches the same
  conclusion for its board; if either lands first, the other follows it.
- **Resolved — `panel-stack` is `useState`-based and panel-local, not a store.** A zustand store
  would invite exactly the cross-view coupling the scope guardrail forbids, and there is never more
  than one councils panel.
- **Open — is the responsive overlay (Theme B) in scope?** It is the only item in this phase with
  **no precedent of any kind**: this app has no breakpoint mechanism, no overlay/drawer panel, and
  uses `matchMedia` solely for reduced motion. *Recommendation:* keep it, but implement it last and
  cut it explicitly if the phase runs long — a hard minimum width on the centre region is an honest
  fallback, and unlike the overlay it is three lines.
- **Noted, out of scope — `search-view.tsx` never persists its sidebar width.** It uses a local
  `useState(380)` with inline bounds while `LayoutSizes.searchResultsWidth`,
  `DEFAULT_LAYOUT.searchResultsWidth` (420) and `LAYOUT_BOUNDS.searchResultsWidth` all exist in the
  store and are referenced by nothing else. The field was added and never wired up. Not this phase's
  job — recorded here because this is the phase that read every `useResizable` call site, and the
  fix is four lines for whoever next touches Search.
