# Phase 27 — The footer becomes a status bar, and the browser it makes room for

**Refined: x1** · 2026-08-28 · UI/UX, visual design, accessibility, empty/loading/error states, data model, persistence, edge cases, concurrency, performance, testing, observability, blast radius, sequencing, file-map, acceptance criteria, out-of-scope

The footer has been a 24-pixel strip since Phase 9 and it has never spanned the app. It is mounted
as the **last child of the right-hand content column** in
[`app.tsx`](../packages/app/src/app.tsx) — the box that also holds the view and the terminal — so it
begins at the repositories panel's right edge and stops short of the window on the left. Nobody
decided that; it is where the element landed when the terminal toggle needed a home, and it has been
inherited by everything since. Phase 18 filled its empty right half with the system monitor and
Phase 18 Theme F slotted diagnostics in beside it, both without touching the geometry, so the strip
now carries five controls across a width that is a leftover.

Moving it is ten lines. Moving it one level up — out of the content column at `app.tsx:645`, into
`CONTENT_BOX` at `app.tsx:597`, as a sibling *after* the `flex min-h-0 flex-1` row at `app.tsx:604`
— makes it span the whole content area, and that is the whole of Theme A. This phase exists because
of what the width is then *for*.

The nesting the move rearranges, verified against the current tree, is three deep: `CONTENT_BOX`
(`:597`) holds the framed-window chrome strip and then the content **row** (`:604`); the row holds
the repositories `<aside>` (`:624`) and the content **column** (`:645`); the column holds the
measured stack (`:652`, `ref={stackRef}`) and then `<FooterBar />` (`:773`). The footer moves out of
the column and becomes the row's next sibling inside `CONTENT_BOX`.

**The slot container is already there and was built for this.** `FooterCluster` in
[`monitor-cluster.tsx`](../packages/app/src/features/monitor/monitor-cluster.tsx) is one
`ml-auto flex gap-3` taking `children`, and its own comment says why: *"A container that takes
slots, not a fixed list of four metrics. Theme F's diagnostics segment and Phase 17's checks-verdict
indicator are both headed for this strip, and each would otherwise arrive as a restructuring of
whatever was here first."* Two of those three predictions have come true and the third has not
arrived. Themes C–E make the informal slot a real one — zones, priority, and an overflow rule — so
the next segment is an entry in a list rather than a negotiation with `ml-auto`.

**And it is not a terminal feature.** The file lives at
[`features/terminal/footer-bar.tsx`](../packages/app/src/features/terminal/footer-bar.tsx) and
imports from `features/diagnostics`, `features/monitor`, `services/keybindings` and the ui-store; the
only terminal thing in it is one toggle button. Theme B gives it `features/status-bar/`.

**The browser pane is a promise the keymap already made.**
[`keybindings.ts`](../packages/shared/src/keybindings.ts) has carried a `browser.open` command bound
to `Mod+b` since Phase 9, with the note *"Mod+b is where a browser will live — the built-in web pane
is not written yet, so for now the chord opens a notice that says so. Claiming it early costs
nothing and means the shortcut will not move under a user once the pane lands."* Today that chord
opens a dialog reading "The built-in browser is coming soon" (`app.tsx:352`). Theme F makes it true
— a third panel toggle beside Repos and Terminal, sliding a pane over the whole content row. It is a
**chrome stub with no engine**: back, forward, reload, a URL field that does not navigate, and a
plate saying so. That is deliberate, and it is also the phase's best demonstration of its own
premise, because a pane that covers everything above the bar and leaves the bar visible is only
possible once the bar is full-width.

**Builds on.** Phase 9 (the footer strip, the `CommandId` registry and `Mod+b` reserved), Phase 13
(`useResizable`, `useReveal`/`REVEAL_MS`, the persisted `LayoutSizes` and `LAYOUT_BOUNDS`), Phase 15
(the terminal store and session list), Phase 16 (`Popover` as the app's overlay primitive), Phase 17
(the forge checks verdict and the workbench), Phase 18 (`FooterCluster`, `MonitorCluster`,
`DiagnosticsSegment` and `e2e/footer-monitor.spec.ts`), Phase 19 (`tests-store.ts`, `actions-store.ts`),
Phase 21 (the agent roster and `use-agents.ts`).

**Scope guardrails.** **No new contract.** This phase adds no git command, no IPC channel and no zod
schema: `StatusResult.inProgress` has existed in
[`shared/src/domain/status.ts`](../packages/shared/src/domain/status.ts) since Phase 8, the mutations
Theme D watches are the ones already declared in
[`use-status.ts`](../packages/app/src/services/use-status.ts), and the only shared-package edit is
renaming one command id. **The blast radius is the footer.**
`app.tsx`'s shell nesting is not extracted into a layout module this phase — Theme A moves one
element and rewrites one stale comment, and everything else stays where it is. **The
anti-duplication rule holds.** `footer-bar.tsx` records it: *"It no longer repeats the checkout's git
status — branch, ahead/behind and the change count all live in the title bar, where the breadcrumb
and the sync cluster already say them. Two readings of the same thing, one at each edge of the
window, is one more place to disagree and no more information."* Nothing in Theme D reintroduces
them; the single exception is the mid-operation indicator, which the title bar does not show at all.
**A segment with nothing to say renders nothing** — no dash, no zero, no greyed-out control, exactly
the rule `MonitorCluster` already states for an unreadable GPU and `DiagnosticsSegment` states for an
unmeasured repository. **And the bar never spans the nav rail**: the rail is `AppFrame`'s, and
`<main>`'s left padding is in `@bilo-io/shell`, outside this repo's reach. "Full width of the content
area" is the achievable claim and the one this phase makes.

Effort tags: **S** ≈ an hour or two · **M** ≈ half a day · **L** ≈ a day plus.

## Deliverables

### A — The move, and the measurement that must survive it (S) — ✅ DONE (2026-08-28)

Ten lines of JSX and one paragraph of reasoning that stops being true. Lands first; everything else
assumes the new geometry.

- [x] `<FooterBar />` moves from `app.tsx:773` (last child of the content column at `app.tsx:645`) to
      a sibling of the content row inside `CONTENT_BOX` at `app.tsx:597` — closing `</div>` of the
      row is `app.tsx:775`, and the footer goes immediately after it, before `CONTENT_BOX`'s own
      close at `:776`.
- [x] Confirm `stackHeight` still measures correctly. It is `stack.clientHeight` off a
      `ResizeObserver` (`app.tsx:409–422`, observing the div at `app.tsx:652`), **measured rather
      than computed**, so the footer's slice is simply taken one box further out and the
      maximized-terminal target should be unchanged. Prove it rather than assume it — this is the one
      silent regression the move can cause.
  - The reason it survives, written down so the next reader does not have to re-derive it: the
    stack is `flex-1` inside the column, the column is `flex-1` inside the row, and the row is
    `flex-1` inside `CONTENT_BOX`. Removing the 24px footer from the column *grows* the stack by
    24px; adding it under the row *shrinks* the row — and therefore the column — by the same 24px.
    The two cancel and `stack.clientHeight` is unchanged. The move is only safe because the footer
    is `shrink-0 h-6` at both positions; if it ever becomes flexible, this reasoning stops holding.
  - The single consumer is `terminalTarget` at `app.tsx:429`
    (`terminalMaximized ? stackHeight : terminal.current`), read at `:752` and `:761`. Nothing else
    reads `stackHeight`, so that one expression is the whole blast radius of a mis-measurement.
- [x] Rewrite the now-false comment at `app.tsx:646–651` (*"View, splitter and terminal share this
      box, and the footer does not… no footer, no title bar, nothing else's slice"*). The reason it
      gives is still right; the arrangement it describes is not — the footer is no longer this box's
      sibling, it is the row's, and the sentence should say which box it is now excluded from.
- [x] Rewrite the `footer-bar.tsx` header comment's geometry claims — *"the cluster is an `ml-auto`
      sibling, so filling the empty right half cost no repositioning"* and *"the entire right half
      has been empty"* in `monitor-cluster.tsx` — both describe a strip that no longer exists.
- [x] A maximized terminal still stops at the status bar's top edge and never covers it.
      The assertion, in [`e2e/terminal.spec.ts`](../packages/app/e2e/terminal.spec.ts): with the
      terminal maximized, `frameBox.y + frameBox.height <= barBox.y + 1` where `frameBox` is
      `[data-terminal-frame]`'s bounding box and `barBox` is `[data-testid="status-bar"]`'s. The
      existing maximize test at `terminal.spec.ts:589` compares heights only (`toBeGreaterThan`,
      `toBeCloseTo`) and would pass with the bar completely covered — which is why this is a new
      assertion and not an existing one to lean on.
- [x] **`data-testid="status-bar"` on the `<footer>` element.** It has none today: every e2e spec
      locates it as `page.locator('footer').filter({ hasText: 'Terminal' })`, which is both fragile
      and about to become wrong when Theme F adds a third toggle. This lands in Theme A because
      Theme A's own left-edge proof needs a selector to measure. The `hasText` locators in
      [`footer-monitor.spec.ts`](../packages/app/e2e/footer-monitor.spec.ts) (`:220`, `:240`) and
      [`diagnostics.spec.ts`](../packages/app/e2e/diagnostics.spec.ts) (`:72`) move to it.
- [x] **Fix `footer-monitor.spec.ts:222`, which fails today.** It asserts
      `await expect(footer).toContainText('main')`, but the footer has rendered no branch name since
      `1cafcae refactor(footer): drop the git status the title bar already shows` — that commit
      touched only `footer-bar.tsx` and left the spec behind. It has gone unnoticed because
      [`moon.yml:50`](../packages/app/moon.yml) keeps `e2e` **out of the `:test` gate** deliberately
      (it needs a chromium download). Delete the assertion; the surrounding test is about the
      `ml-auto` cluster and does not need it. **This is a precondition, not a side quest** — Theme A
      cannot claim a green e2e run over a suite that is already red.
- [x] The bar's `border-t` now runs the full content width, including under the repositories panel.
      Check it against the panel's own right border at the junction — two borders meeting at a T is
      the visual bug this move can introduce. The rule: the `<aside>` at `app.tsx:624` carries no
      right border of its own (the `ResizeHandle` at `:642` draws that edge), so the T cannot form
      from the aside — but the terminal frame's `border-t` (`app.tsx:751`) and the bar's now sit on
      different boxes at different widths, and a maximized terminal puts them 24px apart. Verified by
      screenshot at both repositories-panel states, in both themes.

### B — A home of its own (S) — ✅ DONE (2026-08-28)

- [x] New `packages/app/src/features/status-bar/`. `footer-bar.tsx` moves there as `status-bar.tsx`
      and `FooterBar` becomes `StatusBar`; the `<footer>` element and its `h-6` stay.
- [x] All import sites updated (`app.tsx` is the only one today). No re-export shim —
      one mount point, so a compatibility alias would exist to serve nobody.
  - **`FooterBar` has exactly three references in the repo** and the rename is done when all three
    are gone: the import at `app.tsx:39`, the JSX at `app.tsx:773`, and the declaration at
    `footer-bar.tsx:44`. `grep -rn 'FooterBar' packages/*/src packages/app/e2e` returning nothing is
    the acceptance criterion — no e2e spec references the symbol, only the `<footer>` element.
- [x] **`chordFor` and `displayChord` move with the file**, into a new
      `features/status-bar/chord-hint.ts`, and both are exported. They are module-local in
      `footer-bar.tsx` today (`:25` and `:39`) — *not* exports of the keymap, which is what a reader
      of Theme F would otherwise assume.
  - `chordFor` is currently typed
    `(command: 'terminal.toggle' | 'repos.toggle', fallback: string): string` — a hardcoded union
    that Theme F's Browser toggle cannot pass. Widen the parameter to `CommandId` from
    [`@midnite/git-shared`](../packages/shared/src/keybindings.ts); the body
    (`DEFAULT_KEYMAP.find((b) => b.command === command)?.chord ?? fallback`) is unchanged.
  - `displayChord(chord: string): string` moves verbatim, comment included. It is the only place the
    `Mod+` → `⌘`/`Ctrl+` and `Shift+` → `⇧` rendering exists, and Theme F's Browser toggle is its
    third caller.
- [x] `FooterCluster` moves out of `monitor-cluster.tsx` and is superseded by Theme C's zones;
      `MonitorCluster` stays where it is and keeps its own file.
- [x] Test files follow: any `footer-*` unit test renames with its subject. `e2e/footer-monitor.spec.ts`
      keeps its name (it tests the monitor, not the footer) but its selectors are checked against the
      new DOM.

### C — Zones, priority, and a segment that can say nothing (M) — ✅ DONE (2026-08-28)

Static composition, not a registration store: a segment is a component with declared metadata, it
owns its own hooks, and it returns `null` when it has nothing to report. This is exactly how
`DiagnosticsSegment` and `MonitorCluster` already behave — the model is being written down, not
invented.

- [x] `segments.ts`: `type StatusSegment = { id: string; zone: 'left' | 'center' | 'right'; priority: number; label: string; El: ComponentType }`
      and one exported `STATUS_SEGMENTS: StatusSegment[]`.
- [x] `status-bar.tsx` renders three zone containers as a **three-column grid**, not as
      `mr-auto`/`ml-auto` siblings: `grid grid-cols-[1fr_auto_1fr]` on the `<footer>`, with
      `justify-self-start` / `justify-self-center` / `justify-self-end` on the three zone `<div>`s.
      A true centre that cannot drift as the left zone's text changes length, and the right zone
      still lands hard against the window edge, which is the one behaviour `MonitorCluster` relies
      on. Each zone maps its segments in array order (see the priority rule below).
  - The empty middle column costs nothing and is the accepted price: both centre segments are
    absent most of the time, and `1fr_auto_1fr` collapses the `auto` track to zero width when the
    centre renders nothing, so the left and right zones are not pushed inward by an empty centre.
- [x] **Priority is the overflow order, not the visual order.** Within a zone, render order is the
      array's; `priority` decides who survives Theme E's collapse. Two numbers doing two jobs is the
      trap here — document it at the type.
- [x] A segment that renders `null` must take no space and leave no gap. Zone containers use `gap-3`,
      so an empty child is invisible but a wrapper `<div>` around one is not — segments render
      themselves, the bar does not wrap them.
  - The rule stated as code: a zone maps `segments.map((s) => <s.El key={s.id} />)` — **no
    intermediate element**. A `<div key={s.id}><s.El /></div>` would satisfy every unit test and
    still leave a 12px `gap-3` hole per absent segment, which with five absent segments is 60px of
    unexplained space.
  - Verified in [`e2e/status-bar.spec.ts`](../packages/app/e2e/status-bar.spec.ts): open a repo with
    no agents, no test runs, no checks and a clean tree, and assert the left zone's `boundingBox()`
    width equals the width with only the three toggles rendered — not merely that the absent
    segments are `toHaveCount(0)`.
- [x] Existing controls become segments with no behaviour change: `repos-toggle`, `terminal-toggle`
      (left), `diagnostics`, `monitor` (right).
- [x] `segments.test.ts`: ids unique, priorities unique within a zone, every entry's `El` present.
      A duplicate id is a bug Theme E's overflow keying would otherwise surface as a React warning.

### D — The segments (L) — ✅ DONE (2026-08-28, merged locally — no PR/no remote)

Five new readouts, all reading state the app already has. None fetches anything the app was not
already fetching, and none adds an IPC channel.

Landed as planned, with the pure rollup functions (`opLabel`, `testVerdict`, `agentCount`,
`findPrForBranch`) extracted alongside their segments rather than left inline — the seam Theme H's
own doc asks for arrives with the segment instead of as a later refactor. `GIT_OP_RANK` collapsed
the doc's three tiers into numeric ranks (`100`/`50`/`40`/`30`/`10`) rather than a fourth lookup
table, since a `Record<GitOpId, number>` sorts the same way a tier lookup would. The right zone's
final render order is agent-count, diagnostics, monitor, test-verdict, checks-verdict — the two new
verdicts sit at the outer edge rather than between diagnostics and monitor — and `priority` follows
actionability rather than render position: the two verdicts and the mid-operation segment outrank
the toggles, diagnostics and the monitor at Theme E's future collapse time.

- [x] **Active repo / worktree** (left, after the toggles). The checkout the sidebar selection points
      at, via [`useActiveWorktree()`](../packages/app/src/services/use-status.ts) — the same source
      `DiagnosticsSegment` already follows, and for the reason its comment gives: *"Several tabs can
      point at different repositories, so the two genuinely disagree."* Makes the bar's own scope
      explicit instead of implicit.
  - `useActiveWorktree()` returns `{ repoId: string | null; worktreePath?: string }` and omits
    `worktreePath` entirely (rather than setting it `undefined`) when nothing is selected. Renders
    nothing when `repoId === null`; renders the worktree's basename when `worktreePath` is present,
    otherwise the repo name — the primary checkout is not worth a second label.
  - Click calls `useUiStore.getState().setReposOpen(true)` (`ui-store.ts:576`) and then focuses the
    panel. "Focuses" means moving DOM focus to the `<aside aria-label="Repositories">` at
    `app.tsx:624`, which needs a `tabIndex={-1}` it does not have today — add it. A click that only
    opens the panel leaves the keyboard where it was and reads as a no-op to anyone not on a mouse.
- [x] **Background op progress** (centre). An indeterminate spinner plus a verb — "Fetching…",
      "Pushing…", "Rebasing…" — driven by TanStack Query's `useIsMutating`. Indeterminate on purpose:
      git reports no percentage through the current channels and a fake bar is a lie about progress.
- [x] **The op label comes from an `opId` threaded through `useGitOp`, not from `queries.ts`.**
      Every git write in the app funnels through a *single* `useMutation`, inside `useTargetedGitOp`
      at [`use-status.ts:262`](../packages/app/src/services/use-status.ts). `queries.ts`'s eighteen
      mutations are forge, diagnostics and test-run work, and none of them can ever say "Fetching…".
      There is no `mutationKey` anywhere in the renderer today, and no `useIsMutating` call.
  - `useGitOp<TArgs>(opId: GitOpId, run)` and `useTargetedGitOp<TArgs>(target, opId, run)` each take
    a new **required** `opId`, passed straight through as `mutationKey: ['git-op', opId]` on the
    `useMutation` at `:262`. Required rather than optional, so a new operation cannot be added
    without deciding what the bar calls it.
  - `export type GitOpId` is a string-literal union declared beside `SyncScope` in `use-status.ts`:
    `'fetch' | 'pull' | 'push' | 'merge' | 'rebase' | 'cherry-pick' | 'revert' | 'checkout' |
    'reset' | 'stage' | 'unstage' | 'discard' | 'commit' | 'branch-create' | 'branch-delete' |
    'branch-rename' | 'tag-create' | 'worktree-add' | 'abort' | 'continue'`, paired with
    `export const GIT_OP_LABEL: Record<GitOpId, string>` giving the present participle
    (`fetch: 'Fetching…'`, `rebase: 'Rebasing…'`, and so on).
  - **31 call sites** across five files pass one, and the compiler finds every one the moment the
    parameter is required: `use-status.ts` itself (`useStage`, `useUnstage`, `useDiscard`,
    `useCommit`, `useFetch`, `usePull`, `usePush`),
    [`use-graph-actions.ts`](../packages/app/src/features/graph/use-graph-actions.ts) (9),
    [`use-repo-actions.ts`](../packages/app/src/features/repos/use-repo-actions.ts) (9),
    [`sync-controls.tsx`](../packages/app/src/features/status/sync-controls.tsx) (3) and
    [`conflict-banner.tsx`](../packages/app/src/features/status/conflict-banner.tsx) (2).
- [x] **Two operations at once: rank them, and say how many.**
      `useIsMutating({ mutationKey: ['git-op'] })` gives the count and `useMutationState` gives the
      running keys. Render the highest-ranked verb and append `+N` when the count exceeds one —
      "Rebasing… +1".
  - The rank, as `export const GIT_OP_RANK: Record<GitOpId, number>` beside the label map: history
    rewrites (`rebase`, `merge`, `cherry-pick`, `revert`, `reset`) outrank network (`push`, `pull`,
    `fetch`), which outrank index work (`stage`, `unstage`, `discard`, `commit`). A 30-second rebase
    must not be visually stomped by a 200ms fetch that happened to start later.
  - Ops are **not** filtered to the active worktree. The repositories sidebar acts on repos the user
    has not selected (`use-repo-actions.ts` targets an explicit checkout), and a bar that went
    silent during those would read as nothing happening. The verb is what is running in the app.
  - On repo switch mid-flight the segment keeps rendering: the mutation is still in flight and still
    counted, and cancelling it is not on offer. The label is app-scoped, so it does not lie.
- [x] **A failed op clears silently.** When the mutation settles `{ok:false}` the segment simply
      stops rendering — no red state, no held message. The bar is a progress indicator, not an error
      channel: `sync-controls.tsx`, `ConflictBanner` and the dialogs already render `GitOpResult`
      failures at the surface the user invoked them from, and a second report at the far edge of the
      window is the anti-duplication rule again. A toast is Phase 22 Theme H's, and this is not one.
- [x] **Mid-operation state** (centre, higher priority than op progress). `merge` / `rebase` /
      `cherry-pick` / `revert` from `StatusResult.inProgress` —
      [`InProgressOpSchema`](../packages/shared/src/domain/status.ts) already exists and
      [`ConflictBanner`](../packages/app/src/features/status/conflict-banner.tsx) already has the
      `Record<InProgressOp, string>` label map to reuse. **The one sanctioned exception to the
      anti-duplication rule**, because the title bar does not show it and a rebase you have forgotten
      you are in the middle of is the single most expensive thing this bar can tell you. Click
      navigates to the Changes view where Abort/Continue live; it does not offer them itself.
  - The label map is **module-local today** (`conflict-banner.tsx:17-22`, not exported). Export it
    as `INPROGRESS_LABEL` from that file rather than copying the four strings — two maps that must
    agree is exactly the duplication this bar's own rule is about. Values are `merge: 'Merge'`,
    `rebase: 'Rebase'`, `'cherry-pick': 'Cherry-pick'`, `revert: 'Revert'`; the segment renders
    `` `${INPROGRESS_LABEL[op]} in progress` ``, matching the banner's wording exactly.
  - Reads `useRepoStatus(useActiveWorktree())`, whose `placeholderData` is `EMPTY_STATUS` with
    `inProgress: null` — so **collapse the placeholder before reading it**:
    `const loaded = isPlaceholderData ? undefined : status`, the pattern
    [`all-changes-view.tsx:44,48`](../packages/app/src/features/changes/all-changes-view.tsx) and
    `use-status.ts:206` already use. Without it the segment is correctly silent by accident rather
    than by rule, and would stay silent for a real mid-rebase repo during the first fetch.
  - Click is `useUiStore.getState().setActiveView('changes')` (`ui-store.ts:542`) — `'changes'` is a
    real `ViewId` member (`ui-store.ts:44`).
- [x] **Agent count** (right, left of diagnostics). Live agent sessions from
      [`terminal-store.ts`](../packages/app/src/features/terminal/terminal-store.ts) — a count only
      visible today if the terminal panel is open. Zero agents renders nothing.
  - **Not from [`use-agents.ts`](../packages/app/src/features/terminal/use-agents.ts).** That hook
    returns `AgentRoster = { agents: AgentDefinition[]; status: AgentStatus[] }` off the query key
    `['agents']` — the *installed-agent roster*, which is a constant list of what is on the machine
    and has nothing to do with how many are running.
  - The count is
    `useTerminalStore((s) => s.sessions.filter((x) => x.kind === 'agent' && (s.states[x.id] === 'open' || s.states[x.id] === 'starting')).length)`.
    The `live` predicate is copied from
    [`terminal-session-list.tsx:121`](../packages/app/src/features/terminal/terminal-session-list.tsx)
    (`state === 'open' || state === 'starting'`), which is the only place it exists today; it stays
    duplicated rather than extracted because the row needs the boolean and the bar needs the count.
    A number selector is safe without shallow comparison; an array selector would not be.
  - Click does what `run-in-terminal.ts` and `start-claude.ts` already do:
    `useUiStore.getState().setTerminalOpen(true)`, then
    `useTerminalStore.getState().setActive(id)` on the first live agent session — and
    `toggleTerminalList()` only if `terminalListOpen` is false, so an open list is not closed.
- [x] **Test verdict** (right). A **worst-of rollup across the repo's suites**, from
      [`tests-store.ts`](../packages/app/src/features/tests/tests-store.ts) — the indicator
      `FooterCluster`'s comment reserved a slot for in Phase 18 and Phase 17 never filled. Click is
      `setActiveView('tests')`.
  - `results` is `ByRepo<Record<suiteId, TestRunResult>>`, so there is no single "last outcome" to
    read; the rollup rule is the deliverable. `TestRunResult` is a discriminated union on `ok` with
    **no pass/fail enum**: `ok: true` means the runner ran, and pass/fail is `failed === 0`.
  - The rule, in order: any suite with `ok: true && failed > 0` → **fail**, labelled
    `` `${n} failing` ``. Otherwise, if every result present is `ok: false` → **render nothing** — a
    runner that could not start has produced no verdict, and a red light for "we could not look" is
    the exact trap `DiagnosticsSegment` warns about. Otherwise all present results are
    `ok: true && failed === 0` → **pass**, labelled `` `${n} suites passing` ``.
  - `results[repoId]` is `undefined` before any run and the store is deliberately unpersisted
    (`tests-store.ts:4-13`), so a fresh launch renders nothing. That is correct and must not be
    "fixed" into a grey placeholder.
- [x] **Checks verdict** (right, beside the test verdict). The checks rollup for **the PR on the
      currently checked-out branch**, from
      [`forge-status.tsx`](../packages/app/src/features/forge/forge-status.tsx). Click is
      `setActiveView('actions')`. Both `'tests'` and `'actions'` are real `ViewId` members
      (`ui-store.ts:45-46`).
  - The verdict type is `ForgeChecksRollup = 'passing' | 'failing' | 'pending'`, reaching the UI as
    `ForgePull['checks']`, which is `ForgeChecksRollup | null` — and `null` explicitly means *no
    checks at all*, not "pending" (`forge.ts:163`). Reuse `checksStatus(pull)` at
    `forge-status.tsx:211`, which already returns `ForgeStatus | null` and already renders nothing
    for `null`. Render it through the existing `StatusPill` (`forge-status.tsx:237`).
  - Match the PR by comparing `useForgePulls(repoId, enabled)` rows against
    `status.branch.head` from `StatusResult`. **No match renders nothing** — which is the common
    case, and correctly silent. A worst-of rollup across every open PR was considered and rejected:
    a red light for a colleague's branch is noise you cannot act on from a status bar.
  - `useForgePulls` sets **no `placeholderData`**, so `isPlaceholderData` is not the guard here —
    `data === undefined` (equivalently `isPending`) is. The query is also gated
    `enabled && repoId !== null`, so a repo with no GitHub remote never fetches and the segment
    never renders.
- [x] **Absent is not zero, everywhere.** A repo whose tests have never run, whose checks have not
      been fetched, or whose status is still `isPlaceholderData` shows *nothing* — never a green
      tick. `DiagnosticsSegment`'s comment states the trap and the reason: *"'Clean' is a claim; you
      have to have looked."*
  - The two guards are different mechanisms and both are needed, which is why they are named
    per-segment above: `isPlaceholderData` for the status queries that declare a placeholder
    (`useRepoStatus`, `useStatusCounts`), and `data === undefined` for the forge and tests queries,
    which declare none. Using the wrong one for the wrong query is silent and reads as a bug in the
    repo, not in the bar.

### E — Overflow (M) — ✅ DONE (2026-08-28)

The bar is wider than it was, which is not the same as being wide enough — the repositories panel
goes to 560 (`LAYOUT_BOUNDS.reposWidth`) and a narrow window plus eight segments still clips.

- [x] **`densityFor()` — a pure function, and the whole of the logic.** Declared in
      `features/status-bar/density.ts` and exported:
      `export type Density = 'full' | 'compact' | 'collapsed'` and
      `export function densityFor(m: { available: number; fullWidth: number; compactWidth: number }, current: Density): Density`.
      No DOM, no hook, no observer — every threshold, the hysteresis band and the collapse order are
      decided here, which is what makes them testable at all (see Theme H).
- [x] `use-overflow.ts`: a `ResizeObserver` on the bar element that measures, calls `densityFor`, and
      returns the `Density`. A thin wrapper by design — it owns the measuring, not the deciding.
  - Follows the one existing model in the repo, `app.tsx:411-422`: `useLayoutEffect`, ref guard, one
    measurement **before** the observer is attached (so the first paint is already correct), the
    `if (typeof ResizeObserver === 'undefined') return;` guard at `:418`, `observer.observe(el)`, and
    `return () => observer.disconnect()`.
  - **Observes the bar, not the window.** The window is cheaper and wrong: the repositories panel
    goes to 560px (`LAYOUT_BOUNDS.reposWidth`, `ui-store.ts:201`) and the browser pane can cover the
    row entirely, so the window's width stops predicting the bar's the moment either moves.
  - **Bug found and fixed in review: a sticky collapse.** `collapsed` removes a zone's segments from
    the DOM, and re-measuring `scrollWidth` off a DOM that has already lost them understates the true
    want — it converges on `available` itself, so the restore hysteresis (`available >= compactWidth
    + 24`) becomes unsatisfiable and the bar never comes back. Confirmed live: a real resize genuinely
    passes through a narrower intermediate width before settling (Chromium reports it, it is not a
    test artifact), so this fires on an ordinary shrink, not just a contrived one. Fixed by caching the
    last `fullWidth`/`compactWidth` reading taken while every segment was still mounted (i.e. not
    `collapsed`) and reusing it for the decision while collapsed, instead of re-deriving from the
    reduced DOM.
- [x] **Thresholds are content-measured, not px constants.** There are no magic numbers: measure each
      zone's `scrollWidth` (what the segments *want*) against the bar's `clientWidth` (what there
      *is*). `full` while the sum fits; `compact` when it does not; `collapsed` when it still does not
      after the labels are dropped. This is what "an em-based guess breaks at a different zoom or
      font" was asking for — it also survives a translated label and an added segment, neither of
      which a breakpoint does.
  - `fullWidth` and `compactWidth` are measured off the rendered zones. Measure `compactWidth` by
    reading `scrollWidth` while the `compact` classes are applied — one extra layout read per resize,
    not per frame, which at a 24px bar is not a budget worth defending.
  - **Bug found and fixed in review: a default flex row never actually overflows.** A zone's children
    shrink and their text wraps by default, which keeps `scrollWidth === clientWidth` always — the
    browser silently squeezes content instead of ever presenting an overflow to measure. Fixed with
    `whitespace-nowrap [&>*]:shrink-0` on each zone container (`status-bar.tsx`), so a genuine shortage
    of room shows up as real overflow.
- [x] `compact`: segments drop their text for icon-only, via one `.status-label` CSS class
      (`styles.css`) gated on `data-density` on the `<footer>` — not a `density` prop threaded through
      every segment. A segment opts in once by wrapping its trailing text, and Theme D's future
      segments earn the same compact styling for free (Q1/Q3 decisions).
- [x] `collapsed`: **the whole of a zone's segments** move into the one shared `…` button
      (`OverflowPopover`) — not a per-zone button (Q2). `collapseFor` (co-located in `density.ts`, Q5)
      is deliberately all-or-nothing per zone rather than a partial subset: it is a pure function with
      no access to per-segment widths (those live in the DOM), and a zone whose icon-only content does
      not fit has no principled halfway point to stop at. `priority` still orders the popover list,
      ascending. Opens a [`Popover`](../packages/app/src/components/popover.tsx), controlled so it can
      auto-close the instant density improves past `collapsed` (Q4) rather than keep listing segments
      that are rendered inline again.
  - `testId="status-overflow"`; `Popover` stamps `data-testid` on the trigger and derives
    `status-overflow-panel` for the portalled panel, so Theme H's selectors come free.
  - The popover renders each collapsed segment through its own live `El`, not a static label — the
    panel is portalled to `document.body`, outside the `<footer data-density>` element `.status-label`
    matches against, so a segment's label and click behaviour both come back with no override needed.
- [x] **Hysteresis: an asymmetric 24px band, no timer.** Collapse the instant the content overflows,
      but only restore once there is **24px more** room than the restore actually needs — i.e. going
      `compact → full` requires `available >= fullWidth + 24`, while `full → compact` requires only
      `available < fullWidth`. The same band applies to `collapsed ↔ compact`.
  - Frame-accurate and stateless-in-time, so a splitter drag cannot oscillate: a 1px wobble at the
    boundary cannot cross both edges of a 24px band. A debounce was rejected because it makes the bar
    visibly lag the drag, and the panel slide is already 200ms (`REVEAL_MS`) — the two would compound
    into a bar that settles a third of a second after the pointer stops.
  - 24px is one `h-6` bar height, chosen so the band is legible in the code rather than arbitrary.
    `current` is a parameter of `densityFor` precisely so the band can be asymmetric; a pure function
    of width alone cannot express hysteresis.
- [x] `density.test.ts`: density transitions at each threshold in both directions, hysteresis holds
      across a one-pixel oscillation, a direct multi-level jump (`full` straight to `collapsed` and
      back) resolves in one call, and `collapseFor`'s order is priority-ascending. All pure calls, no
      DOM — `use-overflow.ts` itself is left to the Playwright suite (Theme H), per the doc's own
      reasoning: jsdom has no `ResizeObserver` and no test file in this repo stubs one.
- [x] A segment in the overflow popover keeps its click behaviour — collapsing must not turn an
      action into a label. Satisfied by rendering the live component rather than a label: the three
      toggles read only global store state (no local state to lose across a collapse/restore
      remount), so this holds for Theme E's segments without further work. Flagged for Theme D: a
      future segment with genuine local UI state (e.g. an own open/closed flag) would reset that state
      if its zone collapses and restores while the segment is mounted only inside the popover —
      something Theme D should design around rather than something this phase needed to solve for
      segments that do not exist yet.
  - **Verified manually, not by the Theme H e2e spec.** Reaching `compact`/`collapsed` today needs a
    bar width under ~500px, which — with only three toggle segments before Theme D lands — is below
    `@bilo-io/shell`'s `md:` breakpoint (768px), where the shell's own mobile bottom-tab-bar overlays
    this row and can steal a Playwright pointer click. That breakpoint is unreachable in the packaged
    app (`desktop/src/main/window.ts` sets `minWidth: 900`) and unrelated to this phase; Theme H's own
    `e2e/status-bar.spec.ts` will need either a taller fullWidth (once Theme D's segments land) or a
    programmatic click to route around it.

### F — The browser pane the keymap already promised (M) — ✅ DONE (2026-08-28)

- [x] `browser.open` → `browser.toggle` in
      [`COMMANDS`](../packages/shared/src/keybindings.ts), label *"Toggle Browser"*, chord **`Mod+b`**
      unchanged, scope `app` (like `repos.toggle`; a browser is not something you reach for
      mid-command with the terminal focused). `grep -rn 'browser.open' packages/*/src`
      returning nothing is the acceptance criterion.
  - The keymap comment ("the built-in web pane is not written yet, so for now the chord opens a
    notice that says so") becomes false with this item and is rewritten, not deleted — the
    sentence worth keeping is the one about the chord never moving under a user.
  - **Correction:** the placeholder handler this item's acceptance criterion originally pointed
    at (`app.tsx:352`) had already moved to `use-command-handlers.ts` by the time this theme
    started — Phase 23 Theme B lifted the whole handler map out of `app.tsx` first. The rename
    landed there instead; `app.tsx` was untouched by this specific item.
- [x] **Add `item('browser.toggle')` to the native menu** — it was not there. The View submenu
      at [`menu.ts`](../packages/desktop/src/main/menu.ts) placed `view.refresh`, `repos.toggle`
      and `terminal.toggle`; `browser.open` appeared nowhere in `packages/desktop`. The `item()`
      helper pulls both label and accelerator from `DEFAULT_KEYMAP`, so this is one line and
      cannot disagree with the keymap. It goes after `terminal.toggle`, matching the left zone's
      toggle order.
- [x] Deleted the placeholder handler — the dialog reading *"The built-in browser is coming
      soon."* — and pointed the command at the toggle: `'browser.toggle': { enabled: true, run: () =>
      useUiStore.getState().toggleBrowser() }` in `use-command-handlers.ts`, matching the
      `terminal.toggle` and `repos.toggle` entries beside it. (See the correction above — this
      landed in `use-command-handlers.ts`, not `app.tsx:352`.)
- [x] `browserOpen` in [`ui-store.ts`](../packages/app/src/store/ui-store.ts) with
      `toggleBrowser` / `setBrowserOpen`, defaulting **false**, added to `partialize` — the same shape
      `reposOpen` and `terminalOpen` already have.
- [x] **No `version` bump and no `migrate` arm.** The store already has a custom `merge` doing
      `{ ...current, ...saved }`, so a blob written before the key existed picks `browserOpen` up
      from the initial state — `false` — automatically. This is exactly the argument
      `forgeWritesEnabled`'s own comment makes: *"an older stored blob has no such key, `false` is
      the initial value, and a restored state therefore cannot arrive with writes silently on."*
      A v3 with a no-op arm would be ceremony for a case `merge` already handles.
  - Consequence for Theme H: the test drives **`merge`**, not `migrate`. `ui-store.test.ts`
    already had the shape ("fills in panes a stored payload predates") — landed as a new case
    beside it.
- [x] **Fixed `PersistedUi`'s existing drift while adding to it.** The type omitted `reposOpen`,
      `terminalOpen`, `terminalMaximized`, `terminalSidebarSide` and `terminalListOpen`, all of
      which `partialize` already returned — TypeScript missed it because `partialize`'s return
      was inferred rather than annotated. Added the five missing keys plus `browserOpen`, and
      annotated `partialize` as `(state): PersistedUi => ({ … })` so the type's own doc comment
      ("Named so the two cannot drift") is true again.
- [x] A **Browser** toggle segment in the left zone beside Repos and Terminal, same button treatment,
      same `aria-pressed`, chord hint rendered through `displayChord()` — Theme B had already
      moved it into `features/status-bar/chord-hint.ts` and exported it.
- [x] **The Browser toggle has the lowest `priority` of the three toggles** (`5`, against Repos'
      `10` and Terminal's `20`), so at `collapsed` density it is the first into the `…` popover.
      Repos and Terminal outrank it: both toggle panels that hold work, and the browser pane
      holds nothing yet.
- [x] `features/browser/browser-pane.tsx`: an overlay absolutely positioned over the **whole content
      row** — view, terminal *and* repositories panel — leaving the status bar visible below it.
  - Concretely: mounted as a child of the content row with `absolute inset-0` and the row given
    `relative`.
- [x] Entrance and exit through [`useReveal`](../packages/app/src/components/use-reveal.ts) at
      `REVEAL_MS`, paired with `duration-200` the way every other panel is.
  - `useReveal(browserOpen)` gives `{ mounted, shown }`, used the way `reposReveal`/`terminalReveal`
    are: render nothing unless `mounted`, and drive the transformed property (opacity, here) off
    `shown`.
- [x] Chrome stub: back, forward, reload and a close button, all disabled except close; a URL
      field that accepts text and navigates nowhere; a centred plate stating that the web pane is
      not built yet. No `<webview>`, no `WebContentsView`, no `BrowserWindow`.
- [x] **Enter in the URL field is inert, and the plate says what would have happened.** The field
      keeps its text, the handler calls `preventDefault()` and navigates nowhere, and the centred
      plate reads *"No web engine yet — ‹url› would load here."* with the typed value substituted
      (falling back to *"No web engine yet."* while the field is empty).
- [x] The nav rail stays reachable while the pane is open — verified: it is outside `CONTENT_BOX`
      and cannot be covered from here.
- [x] `Escape` closes the pane; the toggle, the chord and the close button all agree; and the pane
      does not steal the terminal's `Ctrl+`` while it is open.
  - `Escape` is handled ad hoc by a local `keydown` listener, matching `popover.tsx`/`tooltip.tsx`'s
    precedent rather than claiming a keymap entry. The listener never calls `stopPropagation()`.
- [x] Extracted `components/empty-state.tsx` (not itemised in the original plan) from two
      near-duplicate ad hoc cards — `graph-view.tsx`'s local `EmptyState` and
      `file-preview.tsx`'s `FallbackCard` — so the pane's "no engine yet" plate is a third call
      site rather than a fourth copy.

### G — Targets, tooltips and live regions (S)

**Built ahead of D and E, which were still in flight in sibling worktrees when this landed.** The
three bullets below that name Theme D's five segments or Theme E's `compact`/`collapsed` density
and overflow popover are genuinely blocked on those themes' output and stay open — there is
nothing yet to attach `aria-live` to, no `compact` density to show a `Tooltip` in, and no `…`
button to name. Everything else — the five segments that exist today (Repos/Terminal/Browser
toggles, diagnostics, monitor), and the focus-trap extraction the browser pane needed regardless
of D or E — is unblocked and landed here.

- [x] Every segment that navigates or toggles is a `<button>` with an accessible name, reachable by
      keyboard in visual order across the three zones. Grid column order is DOM order here — the
      three zone `<div>`s are declared left, centre, right — so tab order follows the eye with no
      `tabindex` juggling. Do not reorder the zones visually with `order-*`, which would silently
      break that. Verified against today's five segments: no `order-*` utility anywhere in
      `status-bar.tsx`, and each zone maps `STATUS_SEGMENTS` in array order. The three toggles also
      gained an `aria-label` ("Toggle Repositories" / "Toggle Terminal" / "Toggle Browser") — their
      accessible name previously included the chord hint's visible text (e.g. "Repos ⌘G"), which is
      technically a name but reads oddly to a screen reader; `title` keeps the chord for sighted
      hover and existing `[title^="Toggle …"]` e2e locators are unaffected (2026-08-28).
- [x] Segments that only report are not buttons and are not focus stops — already true of both
      right-zone segments that exist today: `DiagnosticsSegment` renders `<span>` for every report
      state and only its "enable" affordance is a `<button>`; `MonitorCluster` is itself a `Popover`
      trigger, correctly a button since it opens something. **Theme D's five segments are not built
      yet**, so their button-vs-span split (per the doc's own description: worktree, agent count,
      mid-operation and both verdicts navigate and are buttons; op progress is a pure `<span>`) is
      that theme's to satisfy, not this one's (2026-08-28).
- [ ] [`Tooltip`](../packages/app/src/components/tooltip.tsx) on icon-only segments in `compact`
      density — **blocked on Theme E**, which has not landed `use-overflow.ts`/`densityFor()` yet;
      there is no `compact` state to attach a tooltip's icon-only condition to today.
- [ ] `aria-live="polite"` on the op-progress and mid-operation segments only — **blocked on Theme
      D**, whose `op-progress` and `in-progress` segment ids do not exist yet.
- [x] **Extract `use-focus-trap.ts` in this phase**, from `popover.tsx:150-179` plus the `FOCUSABLE`
      selector at `:219-220`: `export function useFocusTrap(ref: RefObject<HTMLElement | null>, active: boolean): void`.
      `Popover` now points at it verbatim (its own effect deleted, `FOCUSABLE` moved into the hook);
      behaviour is unchanged and `e2e/footer-monitor.spec.ts`'s keyboard assertions on the monitor
      flyout are the regression guard that it did not (2026-08-28).
  - The doc previously said the pane "reuses the popover's" trap. It cannot: the trap is an inline
    `useEffect` closed over `Popover`'s own `panelRef` and `open`, and there is no `use-focus-trap`
    file in the repo. A non-`Popover` overlay has no way to reach it without this extraction.
  - **Phase 23 Theme H shrinks rather than disappears** — updated there: it now inherits a done
    extraction and keeps only the retrofit onto `ConfirmDialog` and `PromptDialog`.
- [x] The browser pane traps focus while open and restores it to the toggle on close —
      `useFocusTrap(containerRef, shown)` on the pane's own outer `<div>` (given `tabIndex={-1}`,
      `role="dialog"`, `aria-label="Browser"`) for the first half; the second half cannot reuse
      `popover.tsx:80-83` directly (the trigger lives in a sibling component, not a shared `close()`),
      so it is a `useEffect` keyed on `shown` whose cleanup — fired only when `shown` was true and
      then changes — looks up `[data-testid="browser-toggle"]` (new on `BrowserToggle`) and focuses
      it (2026-08-28).
- [ ] The `…` overflow button is named for what it holds ("3 more"), not "More" — **blocked on
      Theme E**, which has not built the overflow popover yet.

### H — Tests (M)

Re-tagged from S: the vitest half now needs a testable seam that does not exist yet, and the e2e half
has a red spec to clear before it can claim anything. The pre-work that Theme A owns — the
`data-testid` and the already-broken `'main'` assertion — is listed there, not here, so that nothing
in H blocks on H.

**The two constraints that shape every vitest item below.** `packages/app/vitest.config.ts` declares
**no `setupFiles`** (and no package in the repo does), the environment is `jsdom`, and **jsdom has no
`ResizeObserver`**. And all 52 test files are `.test.ts` with **zero `render(<Component/>)` calls** —
the three files using `@testing-library/react` all use `renderHook`. So: test pure functions and
hooks, not rendered components.

- [ ] Vitest (C): `segments.test.ts` — unique ids, unique per-zone priorities, zone sorting, and
      that exactly `op-progress` and `in-progress` carry `live: true`. All assertions against the
      exported `STATUS_SEGMENTS` array; no rendering.
- [ ] Vitest (E): `density.test.ts` — `densityFor()` called directly with width triples.
      `full → compact` at `available < fullWidth`; `compact → collapsed` at
      `available < compactWidth`; **hysteresis** proved by asserting that
      `densityFor({available: fullWidth + 1, …}, 'compact') === 'compact'` while
      `densityFor({available: fullWidth + 24, …}, 'compact') === 'full'`; and a 1px oscillation
      across the boundary returning a stable value on every call.
  - **Testing `densityFor` and not `use-overflow.ts` is the point of extracting it.** A hook test
      would need `vi.stubGlobal('ResizeObserver', …)` and a hand-driven fake observer for logic that
      has nothing to do with observation. The hook keeps the `typeof ResizeObserver === 'undefined'`
      guard (`app.tsx:418`'s pattern) and is covered by the Playwright items instead.
- [ ] Vitest (E): the collapse selector — given a zone's segments and a density, the ids that stay
      and the ids that move to the popover, asserted priority-ascending. Also pure.
- [ ] Vitest (D): each new segment's absent case, as **pure predicate functions rather than rendered
      components** — `testVerdict(results)` returns `null` for `{}`, for all-`ok:false`, and a fail
      for one `ok:true, failed:1`; `agentCount(sessions, states)` returns `0` when every session is
      `kind: 'shell'` or every state is `'exited'`; `opLabel(keys)` returns `null` for `[]` and the
      higher-ranked verb plus `+1` for two. Each segment component is then a thin
      `if (x === null) return null` around one of these.
- [x] Vitest (F): **`merge`, not `migrate`.** ✅ landed with Theme F —
      `ui-store.test.ts`'s "defaults browserOpen to false for a payload written before the key
      existed".
- [x] Vitest (F): `partialize` includes `browserOpen`. ✅ landed with Theme F —
      `ui-store.test.ts`'s "persists the browser pane state".
- [ ] Playwright `e2e/status-bar.spec.ts`: the bar's bounding box starts at the content area's left
      edge with the repositories panel **open** — the assertion that would have failed before Theme
      A and is the phase's whole premise.
  - Concretely: `barBox.x <= asideBox.x + 1`, where `bar` is `[data-testid="status-bar"]` (added in
    Theme A) and `aside` is `aside[aria-label="Repositories"]`. Asserted with the panel open, shut,
    and after dragging the splitter — the doc's *"open, shut, and mid-slide"* verification line.
- [ ] Playwright `e2e/status-bar.spec.ts`: narrowing the window drives `compact` then `collapsed`,
      and the collapsed segments are all present inside the `…` popover. Uses
      `page.setViewportSize({ width, height })` mid-test, the pattern already at
      `terminal.spec.ts:507` and `:964`; the popover's selectors are `status-overflow` and
      `status-overflow-panel`, both stamped by `Popover` rather than hand-written.
- [x] Playwright `e2e/browser-pane.spec.ts`. ✅ landed with Theme F — the toggle (clicked rather
      than the `Mod+b` chord, to stay platform-independent) opens the pane over the repositories
      panel, the status bar stays visible and hit-testable beneath it (a bar control is clicked
      and asserted to have acted, not merely checked for visibility), `Escape` closes it and the
      state survives a reload, and the URL field's inert-but-wired Enter behaviour is covered too.
- [ ] Playwright [`e2e/terminal.spec.ts`](../packages/app/e2e/terminal.spec.ts): a maximized terminal
      still stops above the status bar — `frameBox.y + frameBox.height <= barBox.y + 1`. Regression
      guard for Theme A's measurement, and a genuinely new assertion: the existing maximize test at
      `:589` compares heights relatively (`toBeGreaterThan`, `toBeCloseTo`) and would pass with the
      bar entirely covered.
- [ ] [`e2e/footer-monitor.spec.ts`](../packages/app/e2e/footer-monitor.spec.ts) passes with selector
      updates only — no behavioural change to the monitor in this phase. **This is only true once
      Theme A has removed the `toContainText('main')` assertion at `:222`, which fails today.** Its
      keyboard assertions on the flyout (`:108-123`) double as the regression guard for Theme G's
      `useFocusTrap` extraction.
- [ ] **`footer-monitor.spec.ts:236` regenerates five committed PNGs on every run**, not just under
      `MGIT_SHOTS` — unlike `shots.spec.ts:178`, it is ungated. Two of them (`footer-before.png`,
      `footer-cluster.png`) are element shots of the footer and will change the moment Theme A lands.
      Review and commit them deliberately rather than letting a test run rewrite `docs/screenshots/`
      as a side effect; consider gating that block behind `MGIT_SHOTS` like every other shot block.
- [ ] Committed screenshots regenerated where the footer is in frame
      ([`e2e/shots.spec.ts`](../packages/app/e2e/shots.spec.ts) and friends). Expect churn: the bar
      moves in every full-window shot. `shots.spec.ts`'s four shots are viewport (not `fullPage`)
      captures at 1440×820, so the bar is incidentally in frame in all four; they are gated behind
      `MGIT_SHOTS=1` and are light-theme only. Dark shots follow the
      `document.documentElement.classList.add('dark')` pattern at `actions-shots.spec.ts:92-97`.

## Files this phase touches

| Area | Files |
|------|-------|
| Contract | [`shared/src/keybindings.ts`](../packages/shared/src/keybindings.ts) (`browser.open` → `browser.toggle` at `:17` and `:73`, label, and the now-false comment at `:67-72`; chord unchanged) — the phase's only shared-package edit. [`shared/src/domain/status.ts`](../packages/shared/src/domain/status.ts) (**unchanged**), load-bearing for Theme D's mid-operation segment. [`shared/src/domain/forge.ts`](../packages/shared/src/domain/forge.ts) (**unchanged**), load-bearing for `ForgeChecksRollup` and the `checks: … | null` nullability Theme D depends on |
| Main | [`desktop/src/main/menu.ts`](../packages/desktop/src/main/menu.ts) — **edited**, one new `item('browser.toggle')` in the View submenu after `:71`. The doc previously assumed a menu entry existed; it does not |
| Renderer — shell | [`app.tsx`](../packages/app/src/app.tsx) (the `<FooterBar />` move at `:773`, the stale comment at `:646-651`, `tabIndex={-1}` on the `<aside>` at `:624`, `relative` on the content row, the browser overlay mount). The `browser.open` placeholder handler lived in [`use-command-handlers.ts`](../packages/app/src/services/keybindings/use-command-handlers.ts) by the time Theme F landed — Phase 23 Theme B moved it out of `app.tsx` first |
| Renderer — status bar | new `features/status-bar/status-bar.tsx`, `segments.ts`, `density.ts`, `use-overflow.ts`, `overflow-popover.tsx`, `chord-hint.ts` and one file per segment; [`features/terminal/footer-bar.tsx`](../packages/app/src/features/terminal/footer-bar.tsx) (**moved away**, taking `chordFor`/`displayChord` with it); [`features/monitor/monitor-cluster.tsx`](../packages/app/src/features/monitor/monitor-cluster.tsx) (`FooterCluster` retired, `MonitorCluster` unchanged); [`features/diagnostics/diagnostics-segment.tsx`](../packages/app/src/features/diagnostics/diagnostics-segment.tsx) (metadata only); [`styles.css`](../packages/app/src/styles.css) — **edited** for Theme E, one `.status-label` rule gated on `[data-density]`; `repos-toggle.tsx`/`terminal-toggle.tsx`/`browser-toggle.tsx` each wrap their trailing text in that class |
| Renderer — browser | new `features/browser/browser-pane.tsx` and its chrome stub |
| Renderer — segment sources | [`services/use-status.ts`](../packages/app/src/services/use-status.ts) — **written to, not merely read**: `GitOpId`, `GIT_OP_LABEL`, `GIT_OP_RANK`, the `opId` parameter on `useGitOp`/`useTargetedGitOp` and the `mutationKey` at `:262`. [`services/queries.ts`](../packages/app/src/services/queries.ts) (**unchanged** — its eighteen mutations are forge/diagnostics/tests and cannot name a git write). [`features/graph/use-graph-actions.ts`](../packages/app/src/features/graph/use-graph-actions.ts), [`features/repos/use-repo-actions.ts`](../packages/app/src/features/repos/use-repo-actions.ts), [`features/status/sync-controls.tsx`](../packages/app/src/features/status/sync-controls.tsx) — each passes an `opId` at every call site. [`features/terminal/terminal-store.ts`](../packages/app/src/features/terminal/terminal-store.ts) (read; the session list and `states`), [`features/terminal/terminal-session-list.tsx`](../packages/app/src/features/terminal/terminal-session-list.tsx) (**unchanged**, and the source of the `live` predicate at `:121`), [`features/terminal/use-agents.ts`](../packages/app/src/features/terminal/use-agents.ts) (**unchanged and NOT used** — it is the installed-agent roster, not sessions), [`features/tests/tests-store.ts`](../packages/app/src/features/tests/tests-store.ts) (read), [`features/forge/forge-status.tsx`](../packages/app/src/features/forge/forge-status.tsx) (read; `checksStatus` and `StatusPill` reused), [`features/status/conflict-banner.tsx`](../packages/app/src/features/status/conflict-banner.tsx) (its label map at `:17-22` is **exported** so it can be reused) |
| Store | [`store/ui-store.ts`](../packages/app/src/store/ui-store.ts) — `browserOpen`, `toggleBrowser`, `setBrowserOpen`, `partialize`, and `PersistedUi`'s five pre-existing omissions fixed. **No `version` bump and no `migrate` arm**: the custom `merge` at `:712` already fills a missing key from the defaults |
| Components | [`components/popover.tsx`](../packages/app/src/components/popover.tsx) — **edited**, its inline trap at `:150-179` extracted; new `components/use-focus-trap.ts`; [`components/tooltip.tsx`](../packages/app/src/components/tooltip.tsx) and [`components/use-reveal.ts`](../packages/app/src/components/use-reveal.ts) (both **unchanged**, reused as-is) |
| Docs | [`docs/INITIAL_PLAN.md`](../docs/INITIAL_PLAN.md), [`CLAUDE.md`](../CLAUDE.md) (the `Ctrl+`` note gains a `Mod+b` sibling), [`todo/phase-23-command-palette.md`](phase-23-command-palette.md) (Theme H's focus-trap item shrinks to a retrofit once this phase extracts it) |
| Tests | new `features/status-bar/segments.test.ts`, `density.test.ts`, `e2e/status-bar.spec.ts`, `e2e/browser-pane.spec.ts`; [`e2e/footer-monitor.spec.ts`](../packages/app/e2e/footer-monitor.spec.ts) (selector updates **and** the failing `:222` assertion removed), [`e2e/terminal.spec.ts`](../packages/app/e2e/terminal.spec.ts), [`e2e/diagnostics.spec.ts`](../packages/app/e2e/diagnostics.spec.ts) (its `<footer>` locator at `:72`), [`e2e/shots.spec.ts`](../packages/app/e2e/shots.spec.ts), [`store/ui-store.test.ts`](../packages/app/src/store/ui-store.test.ts). [`packages/app/vitest.config.ts`](../packages/app/vitest.config.ts) stays **unchanged** — no `setupFiles`, which is why Theme E extracts a pure function instead of stubbing `ResizeObserver` |

## Verification

- [ ] `moon run :typecheck :lint :test` green.
- [ ] `moon run app:e2e` green — and note it is **not** part of the `:test` gate
      ([`moon.yml:50`](../packages/app/moon.yml) keeps it out deliberately, because it needs a
      chromium download). It must be run explicitly for this phase, which is how
      `footer-monitor.spec.ts:222` went red unnoticed in the first place.
- [ ] Boundary lint clean. This phase adds nothing to `git-engine`, and the one `desktop` edit is a
      menu entry naming an existing `CommandId`. Nothing in the renderer reaches past
      `window.midniteGit` — the browser pane in particular touches no Electron API, which is the main
      reason it is a stub this phase.
- [ ] The status bar's left edge sits at the content area's left edge with the repositories panel
      open, shut, and mid-slide — asserted as `barBox.x <= asideBox.x + 1` in `e2e/status-bar.spec.ts`.
- [ ] A maximized terminal covers the view and stops above the status bar, before and after a window
      resize — asserted as `frameBox.y + frameBox.height <= barBox.y + 1` in `e2e/terminal.spec.ts`.
- [ ] `FooterBar` returns no grep hits in `packages/*/src` or `packages/app/e2e`, and neither does
      `browser.open` — the two renames are complete rather than mostly complete.
- [ ] The browser pane covers view, terminal and repositories panel; the status bar and the nav rail
      stay visible and usable beneath and beside it. "Usable" is asserted by clicking a bar control
      while the pane is open and checking it acted, not by `toBeVisible()`.
- [ ] `Mod+b` toggles the pane and no longer opens a "coming soon" dialog anywhere in the app; the
      View menu's Browser item does the same thing with the same accelerator.
- [ ] `Escape` closes the pane, and `Ctrl+`` still toggles the terminal while the pane is open.
- [ ] Every new segment's absent state renders nothing at all — verified by opening a repository with
      no test runs, no checks, no agents and a clean tree, and seeing an unchanged bar. Asserted
      structurally too: the left zone's bounding-box width with all optional segments absent equals
      its width with only the three toggles, so an empty `gap-3` hole fails the test.
- [ ] A repository mid-rebase shows the mid-operation segment with the same wording
      `ConflictBanner` uses, and it survives the first status fetch rather than appearing late — the
      `isPlaceholderData` guard is what proves this rather than timing.
- [ ] Two concurrent operations render the higher-ranked verb with `+1`, and a `{ok:false}` result
      clears the segment without a red state.
- [ ] `useFocusTrap`'s extraction changed no behaviour: `e2e/footer-monitor.spec.ts`'s flyout
      keyboard assertions pass unmodified.
- [ ] Screenshot, per the visual-phase convention: the full-width bar with the repositories panel open
      and shut, `compact` and `collapsed` densities, the overflow popover open, and the browser pane
      open — all in both themes, via
      `document.documentElement.classList.add('dark')` as `actions-shots.spec.ts:92-97` does.
- [ ] The border junction at the repositories panel's right edge shows no doubled or T-shaped rule, at
      both panel states and with the terminal maximized.
- [ ] **Open, for a human:** drag the repositories splitter through both overflow thresholds and
      confirm segments do not flicker. Hysteresis is the kind of thing that passes a unit test and
      still looks broken under a real pointer.
- [ ] **Open, for a human:** VoiceOver over the bar — confirm the op-progress segment announces once
      per operation and the monitor announces never.
- [ ] **Open, for a human:** run a real `fetch` and a real `push` against a remote and confirm the
      centre segment names the operation and clears on completion, including on failure. The mock
      bridge cannot tell you what a slow network looks like.

## Not in this phase

- **A real web engine.** No `<webview>`, no `WebContentsView`, no `BrowserWindow`. Embedding remote
  content is a sandboxing, CSP, permissions and navigation-policy surface with a security review of
  its own, and hanging it off a layout phase is how a status-bar phase becomes a security incident.
  Theme F builds the shell so that phase only has to fill the body.
- **Moving branch and ahead/behind down from the title bar.** The rule `footer-bar.tsx` records
  stands. If it is ever revisited, it is by *removing* them from the title bar, not by having both.
- **Extracting `app.tsx`'s shell nesting into a layout module.** `app.tsx` is ~780 lines and this is
  a real debt, but Theme A moves one element and a phase that also rewrites the shell cannot tell you
  which change broke the terminal.
- **Store-backed segment registration.** A `useStatusSegment()` hook letting any mounted view push a
  segment is more powerful and brings unmount ordering, stale renders and a new store to test.
  Static composition covers every segment in Theme D. Revisit when a view genuinely needs to
  contribute something the bar cannot import.
- **Spanning under the nav rail.** `AppFrame`'s `<main>` padding is in `@bilo-io/shell`. Achievable
  only as an upstream change, and probably wrong anyway — a rail with a bar under it is a rail that
  no longer reaches the window edge.
- **Determinate progress bars.** No git command in this app reports percentage through its channel
  today. A real progress model means `--progress` parsing and a streaming channel per operation, and
  it belongs with whatever phase needs it.
- **A Settings ▸ Status bar page** for hiding individual segments. `hiddenMetrics` already exists for
  the monitor and a second hiding mechanism for segments would want to subsume it. Revisit when
  someone actually asks.
- **Per-agent activity in the count.** Phase 21 explicitly deferred per-agent activity detection; the
  segment counts sessions, and inherits whatever Phase 21's successor decides "busy" means.
- **`shell.openExternal` from the browser pane's URL field.** Enter is inert and the plate says so.
  Opening a typed string in the system browser is a real feature with URL validation and a security
  surface, and it would make the stub quietly useful enough that nobody finishes the engine.
- **A held "Push failed" state in the op-progress segment.** The segment clears silently; the surface
  that invoked the operation already reports the failure. A timed error state at the window's edge is
  a toast in all but name, and Phase 22 Theme H builds the real toast primitive.
- **Filtering op progress to the active worktree.** The sidebar acts on repositories the user has not
  selected, so a scoped bar would go silent during a real push. The verb describes the app.
- **A repo-wide checks rollup across every open pull request.** The segment follows the PR for the
  checked-out branch only. A red light for a colleague's branch is noise you cannot act on from a
  status bar, and "worst of everything" is a dashboard readout, not a status one.
- **Retrofitting `useFocusTrap` onto `ConfirmDialog` and `PromptDialog`.** This phase extracts the
  hook because the browser pane needs one; the retrofit onto the two dialogs that have no trap today
  stays Phase 23 Theme H's, which is where it was already written down.
- **Adding `setupFiles` to `vitest.config.ts`.** No package in the repo has one, and Theme E's pure
  `densityFor` removes the reason to start here. A `ResizeObserver` polyfill for the whole app suite
  is a convention worth setting deliberately, not as a side effect of one hook.

## Decisions / open questions

- **Resolved — the segment model is static composition.** Segments are components with
  `{id, zone, priority}` metadata in one exported array, each owning its own hooks and returning
  `null` when it has nothing to say. Chosen over a registration store because that is already how
  `DiagnosticsSegment` and `MonitorCluster` behave, and because every segment in Theme D is one the
  bar can import directly.
- **Resolved — overflow is two-stage.** Labels drop to icons, then lowest-priority segments collapse
  into a `…` popover. Not "no overflow": the bar is wider than it was, not unconditionally wide.
- **Resolved — the anti-duplication rule holds, with exactly one exception.** Mid-operation state
  (`merge`/`rebase`/`cherry-pick`/`revert`) is admitted because the title bar does not show it.
  Branch, ahead/behind and change counts stay title-bar-only.
- **Resolved — the browser overlay covers the whole content row**, repositories panel included,
  leaving the status bar visible. An overlay stopping at the repos panel's right edge would
  reintroduce the exact left-edge inconsistency Theme A exists to remove.
- **Resolved — the pane is a chrome stub.** Geometry, toggle, persistence, focus and a11y correct;
  no engine.
- **Resolved — the chord is `Mod+b`**, which turned out to be already reserved for precisely this by
  Phase 9's keymap comment. Noted risk: `Mod+b` is the conventional "toggle primary sidebar" chord in
  editors. This is a deliberate call — if a future phase wants it for the repositories panel,
  `browser.toggle` moves, not the other way, and the Phase 9 comment's promise ("the shortcut will
  not move under a user once the pane lands") is what is being honoured.
- **Resolved — rename `browser.open` to `browser.toggle`.** A command that toggles should not be
  called `.open`, nothing persists command ids, and Phase 23's registry reconciliation is easier
  against a registry that already tells the truth. **Three sites, and the native menu is not one of
  them** — the doc previously said "three sites plus the native menu", but `browser.open` appears
  nowhere in `packages/desktop`: the View submenu (`menu.ts:68-71`) carries only `view.refresh`,
  `repos.toggle` and `terminal.toggle`. Adding a Browser item is therefore new work, and cheap, since
  `item()` reads both label and accelerator from the keymap.
- **Resolved — op progress comes from an `opId` threaded through `useGitOp`, not `mutationKey`s in
  `queries.ts`.** The doc named the wrong file. Every git write funnels through one `useMutation` in
  `useTargetedGitOp` (`use-status.ts:262`) reached from 31 call sites, while `queries.ts`'s eighteen
  mutations are forge, diagnostics and test-run work that can never say "Fetching…". A required
  `opId` parameter puts the label at the one choke point and makes the compiler enumerate the call
  sites. `useIsMutating` is still the counter; it now has keys to count.
- **Resolved — concurrent ops rank, and say how many.** Highest-ranked verb plus `+N`, with history
  rewrites outranking network work outranking index work. "Most recent wins" would let a 200ms fetch
  visibly stomp a 30-second rebase's label; a generic "2 operations" drops the information in exactly
  the moment it is most wanted.
- **Resolved — a failed op clears the segment silently.** The bar is a progress indicator, not an
  error channel, and `sync-controls.tsx`, `ConflictBanner` and the dialogs already report
  `GitOpResult` failures where the user invoked them. A held error state at the far edge of the
  window is the anti-duplication rule again, and it is a toast — which is Phase 22 Theme H's.
- **Resolved — the agent count comes from `terminal-store.ts`, not `use-agents.ts`.** The doc named
  both; only one is right. `useAgents()` returns `{ agents, status }` off the query key `['agents']`
  — the *installed-agent roster*, a list of what is on the machine. Liveness exists only as
  `session.kind === 'agent'` joined with `states[id] === 'open' | 'starting'`, the predicate
  `terminal-session-list.tsx:121` already uses per row.
- **Resolved — the test verdict is a worst-of rollup across suites.** `tests-store.results` is keyed
  per suite, so there is no single "last outcome" to read, and `TestRunResult` has no pass/fail enum
  — `ok: true` means the runner ran and pass/fail is `failed === 0`. Any failing suite wins; a suite
  whose run could not start (`ok: false`) contributes **nothing** rather than a red light, because
  "we could not look" is not a verdict. That is `DiagnosticsSegment`'s own rule applied to tests.
- **Resolved — the checks verdict follows the PR for the checked-out branch, or renders nothing.**
  `ForgePull['checks']` is per-PR and nullable, where `null` means *no checks*, not "pending". A
  worst-of rollup across every open PR was rejected: a red light for someone else's branch is noise
  you cannot act on from a status bar. And because `useForgePulls` sets no `placeholderData`, the
  guard here is `data === undefined`, not `isPlaceholderData` — the two segments use different
  mechanisms and the difference is silent if got wrong.
- **Resolved — persist `browserOpen`, with no version bump and no `migrate` arm.** `terminalOpen` used
  to be excluded and the reasoning for reversing that is recorded at `ui-store.ts:636`. The bump the
  doc originally asked for is unnecessary: the store has a custom `merge` (`:712`) doing
  `{ ...current, ...saved }`, so a blob predating the key picks up the initial `false` on its own —
  precisely the argument `forgeWritesEnabled`'s comment makes at `:673-679`. The test therefore
  drives `merge`, following `ui-store.test.ts:247-259`, and a v3 arm that did nothing would imply a
  data change that is not happening.
- **Resolved — `PersistedUi`'s existing drift is fixed on the way past.** It already omits
  `reposOpen`, `terminalOpen`, `terminalMaximized`, `terminalSidebarSide` and `terminalListOpen`,
  which `partialize` returns; TypeScript misses it because `partialize`'s return is inferred. Adding
  `browserOpen` to a type that is already wrong would deepen the lie its own comment disclaims.
- **Resolved — overflow thresholds are content-measured, with no px constants.** Each zone's
  `scrollWidth` against the bar's `clientWidth`, not breakpoints. Fixed breakpoints are the "em-based
  guess" the doc already argued against: they break at a different zoom, a different font, a
  translated label, or the next segment added.
- **Resolved — hysteresis is an asymmetric 24px band, not a debounce.** Collapse the instant content
  overflows; restore only with 24px more room than the restore needs. Stateless in time and provable
  as a pure function, where a debounce makes the bar visibly lag the drag and compounds with the
  200ms panel slide. `densityFor` takes the current density as a parameter precisely so the band can
  be asymmetric.
- **Resolved — the overflow logic lives in a pure `densityFor()`, and that is what the tests drive.**
  `vitest.config.ts` declares no `setupFiles` (no package in the repo does), the environment is
  jsdom, and jsdom has no `ResizeObserver`. Extracting the decision from the observation makes every
  threshold and the hysteresis band testable with no DOM and no global stub — and keeps the hook
  down to the `typeof ResizeObserver === 'undefined'` guard `app.tsx:418` already models.
- **Resolved — segment absent-case tests are pure predicates, not rendered components.** All 52 test
  files are `.test.ts` and the repo has **zero** `render(<Component/>)` calls; the three files using
  `@testing-library/react` all use `renderHook`. `testVerdict`, `agentCount` and `opLabel` are
  functions the components are thin wrappers around, so the phase adds no rendering convention it
  would then be alone in following.
- **Resolved — this phase extracts `use-focus-trap.ts`; Phase 23 keeps the retrofit.** The doc said
  the pane "reuses the popover's" trap, which is impossible: it is an inline `useEffect` closed over
  `Popover`'s own `panelRef` and `open`, and no `use-focus-trap` file exists. The pane needs a real
  trap, so the extraction lands here and Phase 23 Theme H shrinks to retrofitting `ConfirmDialog` and
  `PromptDialog`. `footer-monitor.spec.ts`'s flyout keyboard assertions are the regression guard.
- **Resolved — the centre zone stays, as a three-column grid.** `grid-cols-[1fr_auto_1fr]` with
  `justify-self` per zone. A true centre that cannot drift as the left zone's text changes length,
  the right zone still hard against the edge for `MonitorCluster`, and an `auto` middle track that
  collapses to nothing when both centre segments are absent — which is most of the time, and costs
  nothing.
- **Resolved — all three panel toggles stay in the left zone, and Browser collapses first.** Three
  toggles is the widest that zone has been, which is what Theme E's overflow machinery is for: give
  Browser the lowest priority of the three and it is the first into the `…` popover on a narrow
  window. Repos and Terminal outrank it because both hold work and the browser pane holds nothing
  yet. An undiscoverable panel is how `Mod+b` became a "coming soon" dialog in the first place, so
  chord-and-menu-only was rejected.
- **Resolved — `useOverflow` measures the bar, not the window.** The window is cheaper and wrong: the
  repositories panel goes to 560px and the browser pane can cover the row entirely, so the window
  stops predicting the bar's width the moment either moves.
- **Resolved — Enter in the URL field is inert, and the plate names the typed URL.** *"No web engine
  yet — ‹url› would load here."* Proves the field is wired end to end and makes the missing half
  obvious; a field that silently swallows Enter is indistinguishable from a broken browser. Opening
  it via `shell.openExternal` was rejected as a real feature with a security surface.
- **Resolved — the test pre-work splits by nature, and none of it lands in Theme H.** Theme A carries
  the `data-testid="status-bar"` and the removal of `footer-monitor.spec.ts:222`'s failing
  `toContainText('main')` assertion, because A's own left-edge proof needs a selector and a green
  suite. Theme H carries the new specs. Nothing in H blocks on H, and the phase's stated landing
  order survives contact.
- **Resolved — `data-density` on the `<footer>` plus a `.status-label` CSS class, not a `density`
  prop threaded through every segment.** A segment opts in once by wrapping its trailing text; no
  segment (present or Theme D's future five) has to accept or branch on a prop to earn compact
  styling. The trade is that `collapsed` cannot be expressed the same way (removing a segment
  entirely is not a CSS concern), which is why `collapseFor` exists as a separate, JS-level step.
- **Resolved — one shared `…` overflow button for the whole bar, not one per zone.** Matches the
  doc's own singular `status-overflow` testId. A zone's segments still collapse independently of the
  other zones' (`collapseFor` runs per zone), they just land in one popover rather than each zone
  growing its own trigger and panel to manage.
- **Resolved — `collapsed` is all-or-nothing per zone, not a partial subset.** `collapseFor` has no
  per-segment widths to reason about — those live in the DOM, and it is a pure function — so there is
  no principled point to stop removing at once icon-only content no longer fits. `priority` still
  orders the popover list (ascending), so a future partial-collapse could read the same order without
  a second sort, but nothing in this phase implements one.
- **Resolved — the overflow popover auto-closes the instant density improves past `collapsed`.**
  Rather than behaving like every other `Popover` (closes only on click-outside/Escape/re-toggle), a
  widening bar closes it immediately so it can never keep listing segments that are already back in
  the bar itself.
- **Resolved — `collapseFor` is co-located in `density.ts`, not a separate file.** Both are pure
  functions over the same `Density`/`priority` concepts; one file answers "how does overflow decide
  anything."
