# Phase 27 — The footer becomes a status bar, and the browser it makes room for

The footer has been a 24-pixel strip since Phase 9 and it has never spanned the app. It is mounted
as the **last child of the right-hand content column** in
[`app.tsx`](../packages/app/src/app.tsx) — the box that also holds the view and the terminal — so it
begins at the repositories panel's right edge and stops short of the window on the left. Nobody
decided that; it is where the element landed when the terminal toggle needed a home, and it has been
inherited by everything since. Phase 18 filled its empty right half with the system monitor and
Phase 18 Theme F slotted diagnostics in beside it, both without touching the geometry, so the strip
now carries five controls across a width that is a leftover.

Moving it is ten lines. Moving it one level up — out of the content column at `app.tsx:645`, into
`CONTENT_BOX` at `app.tsx:597`, as a sibling *after* the `flex min-h-0 flex-1` row — makes it span
the whole content area, and that is the whole of Theme A. This phase exists because of what the
width is then *for*.

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
Theme D watches are the ones already in [`queries.ts`](../packages/app/src/services/queries.ts), and
the only shared-package edit is renaming one command id. **The blast radius is the footer.**
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

### A — The move, and the measurement that must survive it (S)

Ten lines of JSX and one paragraph of reasoning that stops being true. Lands first; everything else
assumes the new geometry.

- [ ] `<FooterBar />` moves from `app.tsx:773` (last child of the content column at `app.tsx:645`) to
      a sibling of the content row inside `CONTENT_BOX` at `app.tsx:597`, immediately after
      `<div className="flex min-h-0 flex-1">`.
- [ ] Confirm `stackHeight` still measures correctly. It is `stack.clientHeight` off a
      `ResizeObserver` (`app.tsx:409–421`), **measured rather than computed**, so the footer's slice
      is simply taken one box further out and the maximized-terminal target should be unchanged.
      Prove it rather than assume it — this is the one silent regression the move can cause.
- [ ] Rewrite the now-false comment at `app.tsx:646–650` (*"View, splitter and terminal share this
      box, and the footer does not… no footer, no title bar, nothing else's slice"*). The reason it
      gives is still right; the arrangement it describes is not.
- [ ] Rewrite the `footer-bar.tsx` header comment's geometry claims — *"the cluster is an `ml-auto`
      sibling, so filling the empty right half cost no repositioning"* and *"the entire right half
      has been empty"* in `monitor-cluster.tsx` — both describe a strip that no longer exists.
- [ ] A maximized terminal still stops at the status bar's top edge and never covers it.
- [ ] The bar's `border-t` now runs the full content width, including under the repositories panel.
      Check it against the panel's own right border at the junction — two borders meeting at a T is
      the visual bug this move can introduce.

### B — A home of its own (S)

- [ ] New `packages/app/src/features/status-bar/`. `footer-bar.tsx` moves there as `status-bar.tsx`
      and `FooterBar` becomes `StatusBar`; the `<footer>` element and its `h-6` stay.
- [ ] All import sites updated (`app.tsx` is the only one today). No re-export shim —
      one mount point, so a compatibility alias would exist to serve nobody.
- [ ] `FooterCluster` moves out of `monitor-cluster.tsx` and is superseded by Theme C's zones;
      `MonitorCluster` stays where it is and keeps its own file.
- [ ] Test files follow: any `footer-*` unit test renames with its subject. `e2e/footer-monitor.spec.ts`
      keeps its name (it tests the monitor, not the footer) but its selectors are checked against the
      new DOM.

### C — Zones, priority, and a segment that can say nothing (M)

Static composition, not a registration store: a segment is a component with declared metadata, it
owns its own hooks, and it returns `null` when it has nothing to report. This is exactly how
`DiagnosticsSegment` and `MonitorCluster` already behave — the model is being written down, not
invented.

- [ ] `segments.ts`: `type StatusSegment = { id: string; zone: 'left' | 'center' | 'right'; priority: number; label: string; El: ComponentType }`
      and one exported `STATUS_SEGMENTS: StatusSegment[]`.
- [ ] `status-bar.tsx` renders three zone containers — left (`mr-auto`), centre, right (`ml-auto`) —
      each mapping its zone's segments sorted by descending `priority`. The `ml-auto` behaviour the
      monitor relies on is preserved by the right zone, so the metrics stay hard against the edge.
- [ ] **Priority is the overflow order, not the visual order.** Within a zone, render order is the
      array's; `priority` decides who survives Theme E's collapse. Two numbers doing two jobs is the
      trap here — document it at the type.
- [ ] A segment that renders `null` must take no space and leave no gap. Zone containers use `gap-3`,
      so an empty child is invisible but a wrapper `<div>` around one is not — segments render
      themselves, the bar does not wrap them.
- [ ] Existing controls become segments with no behaviour change: `repos-toggle`, `terminal-toggle`
      (left), `diagnostics`, `monitor` (right).
- [ ] `segments.test.ts`: ids unique, priorities unique within a zone, every entry's `El` present.
      A duplicate id is a bug Theme E's overflow keying would otherwise surface as a React warning.

### D — The segments (L)

Five new readouts, all reading state the app already has. None fetches anything the app was not
already fetching, and none adds an IPC channel.

- [ ] **Active repo / worktree** (left, after the toggles). The checkout the sidebar selection points
      at, via [`useActiveWorktree()`](../packages/app/src/services/use-status.ts) — the same source
      `DiagnosticsSegment` already follows, and for the reason its comment gives: *"Several tabs can
      point at different repositories, so the two genuinely disagree."* Makes the bar's own scope
      explicit instead of implicit. Click focuses the repositories panel, opening it if shut.
- [ ] **Background op progress** (centre). An indeterminate spinner plus a verb — "Fetching…",
      "Pushing…", "Rebasing…" — driven by TanStack Query's `useIsMutating` over the mutations already
      declared in [`queries.ts`](../packages/app/src/services/queries.ts). Indeterminate on purpose:
      git reports no percentage through the current channels and a fake bar is a lie about progress.
- [ ] Mutation keys get stable `mutationKey`s so `useIsMutating` can name what is running rather than
      count anonymous mutations. This is the only edit `queries.ts` needs.
- [ ] **Mid-operation state** (centre, higher priority than op progress). `merge` / `rebase` /
      `cherry-pick` / `revert` from `StatusResult.inProgress` —
      [`InProgressOpSchema`](../packages/shared/src/domain/status.ts) already exists and
      [`ConflictBanner`](../packages/app/src/features/status/conflict-banner.tsx) already has the
      `Record<InProgressOp, string>` label map to reuse. **The one sanctioned exception to the
      anti-duplication rule**, because the title bar does not show it and a rebase you have forgotten
      you are in the middle of is the single most expensive thing this bar can tell you. Click
      navigates to the Changes view where Abort/Continue live; it does not offer them itself.
- [ ] **Agent count** (right, left of diagnostics). Live agent sessions from
      [`use-agents.ts`](../packages/app/src/features/terminal/use-agents.ts) /
      [`terminal-store.ts`](../packages/app/src/features/terminal/terminal-store.ts) — a count only
      visible today if the terminal panel is open. Click opens the terminal and focuses the session
      list. Zero agents renders nothing.
- [ ] **Test + checks verdict** (right). Last test-run outcome from
      [`tests-store.ts`](../packages/app/src/features/tests/tests-store.ts) and the forge checks
      verdict from [`forge-status.tsx`](../packages/app/src/features/forge/forge-status.tsx) — the
      indicator `FooterCluster`'s comment reserved a slot for in Phase 18 and Phase 17 never filled.
      Click navigates to Tests or Actions respectively.
- [ ] **Absent is not zero, everywhere.** A repo whose tests have never run, whose checks have not
      been fetched, or whose status is still `isPlaceholderData` shows *nothing* — never a green
      tick. `DiagnosticsSegment`'s comment states the trap and the reason: *"'Clean' is a claim; you
      have to have looked."*

### E — Overflow (M)

The bar is wider than it was, which is not the same as being wide enough — the repositories panel
goes to 560 (`LAYOUT_BOUNDS.reposWidth`) and a narrow window plus eight segments still clips.

- [ ] `use-overflow.ts`: a `ResizeObserver` on the bar element returning a density —
      `'full' | 'compact' | 'collapsed'` — from measured width against two thresholds.
- [ ] `compact`: segments drop their text for icon-only. The two toggles already carry their chord
      hint as a trailing `<span>`; that goes first, then the label.
- [ ] `collapsed`: lowest-priority segments per zone move into a single `…` button opening a
      [`Popover`](../packages/app/src/components/popover.tsx) that lists them vertically with their
      labels restored. Reuses the primitive Phase 18 built for the monitor flyout.
- [ ] Thresholds are measured, not assumed — an em-based guess breaks at a different zoom or font.
- [ ] Hysteresis on the boundary, so a drag of the repositories splitter across a threshold does not
      flicker segments in and out on every pointer move.
- [ ] `use-overflow.test.ts`: density transitions at each threshold, hysteresis holds across a
      one-pixel oscillation, and the collapse order is priority-ascending within each zone.
- [ ] A segment in the overflow popover keeps its click behaviour — collapsing must not turn an
      action into a label.

### F — The browser pane the keymap already promised (M)

- [ ] `browser.open` → `browser.toggle` in
      [`COMMAND_IDS`](../packages/shared/src/keybindings.ts) and `DEFAULT_KEYMAP`, label
      *"Toggle Browser"*, chord **`Mod+b`** unchanged, scope `app` (like `repos.toggle`; a browser is
      not something you reach for mid-command with the terminal focused). Nothing persists a command
      id, so this is a three-site rename plus the native menu.
- [ ] Delete the placeholder handler at `app.tsx:352` — the dialog reading *"The built-in browser is
      coming soon."* — and point the command at the toggle.
- [ ] `browserOpen` in [`ui-store.ts`](../packages/app/src/store/ui-store.ts) with
      `toggleBrowser` / `setBrowserOpen`, defaulting **false**, added to `PersistedUi` and
      `partialize`, with the `persist` `version` bumped and a `migrate` arm — the same shape
      `reposOpen` and `terminalOpen` already have (`ui-store.ts:519`, `:664`).
- [ ] A **Browser** toggle segment in the left zone beside Repos and Terminal, same button treatment,
      same `aria-pressed`, chord hint rendered through the existing `displayChord()` from the keymap
      rather than typed as a literal.
- [ ] `features/browser/browser-pane.tsx`: an overlay absolutely positioned over the **whole content
      row** — view, terminal *and* repositories panel — leaving the status bar visible below it. That
      visible bar is the point; an overlay that also covered it would be a full-screen view and would
      belong in the nav rail instead.
- [ ] Entrance and exit through [`useReveal`](../packages/app/src/components/use-reveal.ts) at
      `REVEAL_MS`, paired with `duration-200` the way every other panel is — the two are not derived
      from each other and the comment says so.
- [ ] Chrome stub: back, forward, reload and a close button, all disabled or inert except close; a
      URL field that accepts text and navigates nowhere; a centred plate stating that the web pane is
      not built yet. **No `<webview>`, no `WebContentsView`, no `BrowserWindow`** — see *Not in this
      phase*.
- [ ] The nav rail stays reachable while the pane is open. It is outside `CONTENT_BOX` and cannot be
      covered from here, which is a property to verify rather than a thing to build.
- [ ] `Escape` closes the pane; the toggle, the chord and the close button all agree; and the pane
      does not steal the terminal's `Ctrl+`` while it is open.

### G — Targets, tooltips and live regions (S)

- [ ] Every segment that navigates or toggles is a `<button>` with an accessible name, reachable by
      keyboard in visual order across the three zones.
- [ ] Segments that only report are not buttons and are not focus stops.
- [ ] [`Tooltip`](../packages/app/src/components/tooltip.tsx) on icon-only segments in `compact`
      density — an icon with no label and no tooltip is a control nobody can identify.
- [ ] `aria-live="polite"` on the op-progress and mid-operation segments only. The monitor must
      **not** be live: a CPU readout announcing itself every second is unusable with a screen reader
      on, which is the whole reason this is a per-segment decision and not a bar-level one.
- [ ] The browser pane traps focus while open and restores it to the toggle on close. Phase 23 will
      extract the focus trap out of `popover.tsx`; until then this reuses the popover's, and the
      choice is noted so Phase 23 finds it.
- [ ] The `…` overflow button is named for what it holds ("3 more"), not "More".

### H — Tests (S)

- [ ] Vitest (C): `segments.test.ts` — unique ids, unique per-zone priorities, zone sorting.
- [ ] Vitest (E): `use-overflow.test.ts` — thresholds, hysteresis, priority-ascending collapse.
- [ ] Vitest (D): each new segment renders `null` for its absent case — no repo selected, no
      mutation running, `inProgress: null`, zero agents, tests never run, checks unfetched.
- [ ] Vitest (F): `ui-store` migration from the previous persisted `version` produces
      `browserOpen: false` rather than `undefined`.
- [ ] Playwright `e2e/status-bar.spec.ts`: the bar's bounding box starts at the content area's left
      edge with the repositories panel **open** — the assertion that would have failed before Theme
      A and is the phase's whole premise.
- [ ] Playwright `e2e/status-bar.spec.ts`: narrowing the window drives `compact` then `collapsed`,
      and the collapsed segments are all present inside the `…` popover.
- [ ] Playwright `e2e/browser-pane.spec.ts`: `Mod+b` opens the pane, it covers the repositories panel,
      the status bar is still visible and hit-testable beneath it, `Escape` closes it, and the state
      survives a reload.
- [ ] Playwright [`e2e/terminal.spec.ts`](../packages/app/e2e/terminal.spec.ts): a maximized terminal
      still stops above the status bar. Regression guard for Theme A's measurement.
- [ ] [`e2e/footer-monitor.spec.ts`](../packages/app/e2e/footer-monitor.spec.ts) passes with selector
      updates only — no behavioural change to the monitor in this phase.
- [ ] Committed screenshots regenerated where the footer is in frame
      ([`e2e/shots.spec.ts`](../packages/app/e2e/shots.spec.ts) and friends). Expect churn: the bar
      moves in every full-window shot.

## Files this phase touches

| Area | Files |
|------|-------|
| Contract | [`shared/src/keybindings.ts`](../packages/shared/src/keybindings.ts) (`browser.open` → `browser.toggle`, label; chord unchanged) — the phase's only shared-package edit. [`shared/src/domain/status.ts`](../packages/shared/src/domain/status.ts) **unchanged**, and load-bearing for Theme D's mid-operation segment |
| Main | none |
| Renderer — shell | [`app.tsx`](../packages/app/src/app.tsx) (the `<FooterBar />` move at `:773`, the stale comment at `:646`, the `browser.open` placeholder at `:352`, the browser overlay mount) |
| Renderer — status bar | new `features/status-bar/status-bar.tsx`, `segments.ts`, `use-overflow.ts`, `overflow-popover.tsx` and one file per segment; [`features/terminal/footer-bar.tsx`](../packages/app/src/features/terminal/footer-bar.tsx) (**moved away**); [`features/monitor/monitor-cluster.tsx`](../packages/app/src/features/monitor/monitor-cluster.tsx) (`FooterCluster` retired, `MonitorCluster` unchanged); [`features/diagnostics/diagnostics-segment.tsx`](../packages/app/src/features/diagnostics/diagnostics-segment.tsx) (metadata only) |
| Renderer — browser | new `features/browser/browser-pane.tsx` and its chrome stub |
| Renderer — segment sources | [`services/use-status.ts`](../packages/app/src/services/use-status.ts) (read), [`services/queries.ts`](../packages/app/src/services/queries.ts) (stable `mutationKey`s), [`features/terminal/use-agents.ts`](../packages/app/src/features/terminal/use-agents.ts), [`features/terminal/terminal-store.ts`](../packages/app/src/features/terminal/terminal-store.ts), [`features/tests/tests-store.ts`](../packages/app/src/features/tests/tests-store.ts), [`features/forge/forge-status.tsx`](../packages/app/src/features/forge/forge-status.tsx), [`features/status/conflict-banner.tsx`](../packages/app/src/features/status/conflict-banner.tsx) (its label map is reused) |
| Store | [`store/ui-store.ts`](../packages/app/src/store/ui-store.ts) — `browserOpen`, `toggleBrowser`, `setBrowserOpen`, `PersistedUi`, `partialize`, `version` bump + `migrate` arm |
| Components | [`components/popover.tsx`](../packages/app/src/components/popover.tsx), [`components/tooltip.tsx`](../packages/app/src/components/tooltip.tsx), [`components/use-reveal.ts`](../packages/app/src/components/use-reveal.ts) — all reused unchanged |
| Docs | [`docs/INITIAL_PLAN.md`](../docs/INITIAL_PLAN.md), [`CLAUDE.md`](../CLAUDE.md) (the `Ctrl+`` note gains a `Mod+b` sibling) |
| Tests | new `features/status-bar/segments.test.ts`, `use-overflow.test.ts`, `e2e/status-bar.spec.ts`, `e2e/browser-pane.spec.ts`; [`e2e/footer-monitor.spec.ts`](../packages/app/e2e/footer-monitor.spec.ts), [`e2e/terminal.spec.ts`](../packages/app/e2e/terminal.spec.ts), [`e2e/shots.spec.ts`](../packages/app/e2e/shots.spec.ts), [`store/ui-store.test.ts`](../packages/app/src/store/ui-store.test.ts) |

## Verification

- [ ] `moon run :typecheck :lint :test` green.
- [ ] Boundary lint clean. This phase adds nothing to `git-engine`, nothing to `desktop`, and nothing
      in the renderer that reaches past `window.midniteGit` — the browser pane in particular touches
      no Electron API, which is the main reason it is a stub this phase.
- [ ] The status bar's left edge sits at the content area's left edge with the repositories panel
      open, shut, and mid-slide.
- [ ] A maximized terminal covers the view and stops above the status bar, before and after a window
      resize.
- [ ] The browser pane covers view, terminal and repositories panel; the status bar and the nav rail
      stay visible and usable beneath and beside it.
- [ ] `Mod+b` toggles the pane and no longer opens a "coming soon" dialog anywhere in the app.
- [ ] Every new segment's absent state renders nothing at all — verified by opening a repository with
      no test runs, no checks, no agents and a clean tree, and seeing an unchanged bar.
- [ ] Screenshot, per the visual-phase convention: the full-width bar with the repositories panel open
      and shut, `compact` and `collapsed` densities, the overflow popover open, and the browser pane
      open — all in both themes.
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
- **Recommendation — rename `browser.open` to `browser.toggle`.** A command that toggles should not
  be called `.open`, nothing persists command ids, and Phase 23's registry reconciliation is easier
  against a registry that already tells the truth. Three sites plus the native menu.
- **Recommendation — op progress comes from `useIsMutating`.** No IPC progress channel exists and
  building one is a phase of its own. Stable `mutationKey`s in `queries.ts` are the only cost, and
  they are useful independently.
- **Recommendation — persist `browserOpen`.** `terminalOpen` used to be excluded and the reasoning
  for reversing that is recorded at `ui-store.ts:634`; the same argument applies here.
- **Open — does the centre zone earn its keep?** It holds two segments, both of which are usually
  absent, so most of the time the bar is left-and-right as it is today. A true centre needs a
  three-column grid rather than `mr-auto`/`ml-auto`, or the centre drifts as the left zone grows.
  Recommendation: build it as a grid with `justify-self` per zone, and accept the empty middle.
- **Open — where does the Browser toggle belong once Phase 23's palette lands?** A palette entry is
  free from the `CommandId`, but three panel toggles in the left zone is already the widest that zone
  has been. Recommendation: leave all three for now; revisit if a fourth panel ever appears.
- **Open — should `useOverflow` measure the bar or the window?** The bar is the honest answer and
  costs a `ResizeObserver`; the window is cheaper and wrong once the repositories panel is wide.
  Recommendation: the bar.
