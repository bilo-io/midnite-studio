# Phase 39 — One rail, five chords and four loops

The status bar's left zone holds three toggles — Git Repos, Terminal, Browser — and each is a
hand-written copy of the same twenty lines: a `Tooltip`, a button with `aria-pressed`, an icon,
a `.status-label` name and a `.status-label` chord hint. All five pieces are identical across
the three files and nothing enforces that. This phase turns the zone into a **shortcut rail**:
one `StatusToggle` primitive behind every button, the name shown only when a surface is
actually open (or under the pointer) so the chord is what you read the rest of the time, the
command palette and Go-to-File relocated here from the title bar, diagnostics moved out of the
right-hand vitals cluster into its own group, and — after the agent count — **four loop
launchers** that open the FAB panel straight onto a tab and glow when that loop is running.

The point of items 1–3 is a single habit: if the bottom left always says `⌘K` next to the
palette glyph and `⌃\`` next to the terminal glyph, the chord is learned by looking at the app
rather than by reading a settings page.

```
◉⌘G   ▣⌃`   ◌⌘B   ⌘⌘K   ▤⌘P  │  ⚠2  │  ✲3 agents   ◑◑◑◑   ⏻Reattached 2
└──────────── shortcuts ────────────┘  health  └──────────── live work ────────────┘
```

**Builds on.** Phase 27 built the bar this reshapes: the zoned three-column grid in
[`status-bar.tsx`](../../../packages/app/src/features/status-bar/status-bar.tsx), the static
composition array in
[`segments.ts`](../../../packages/app/src/features/status-bar/segments.ts), the pure
`densityFor`/`collapseFor` pair in
[`density.ts`](../../../packages/app/src/features/status-bar/density.ts), and the one
`.status-label` opt-in class at
[`styles.css:340-343`](../../../packages/app/src/styles.css) that every segment's compact
behaviour already keys off. Phase 23 gave the app the command registry
([`keybindings.ts`](../../../packages/shared/src/keybindings.ts)) that `chordFor` reads and the
palette store this phase surfaces state from. Phase 35 built the FAB console the launchers
open: `DEFAULT_LOOPS` in [`loops.ts`](../../../packages/shared/src/loops.ts), `openFabTab` in
[`ui-store.ts`](../../../packages/app/src/store/ui-store.ts), `useAllLoopStatuses` in
[`loop-status.ts`](../../../packages/app/src/features/loops/loop-status.ts), the token→component
map in [`loop-icons.tsx`](../../../packages/app/src/features/loops/loop-icons.tsx), and
`.loop-run-glow` at [`styles.css:646-717`](../../../packages/app/src/styles.css) — the working
precedent for a coloured, pulsing, reduced-motion-aware glow on a small control. Phase 35
Theme H is the precedent for *how* the reduced-motion assertion is written.

**Scope guardrails.** **The left zone and the two title-bar buttons that move into it — nothing
else.** `test-verdict` and `checks-verdict` stay at the window's outer corner:
[`segments.ts`](../../../packages/app/src/features/status-bar/segments.ts) argues that position
deliberately ("a failing test outranks a CPU readout"), and emptying the right zone of
everything but machine vitals is a different phase's case. **No new commands and no new
chords** — every glyph in the rail names a `CommandId` that already exists in `COMMANDS`; a
launcher that has no chord shows none rather than inventing one. **Density stays the single
gate on labels**: `.status-label` keeps its current rule untouched, and the active-or-hover name
only decides what happens at `full`, so `useOverflow`'s two measurement passes keep measuring
the same two states. **The wire contract does not change** — `LoopDefinition` gains no field;
the launchers' glow colours live in a new renderer-side map, exactly as `loop-icons.tsx`
already resolves the icon token. **Phase 37 is untouched** — its `--rainbow-N` tokenisation and
this phase's `loop-glow.ts` are independent; see decision 6.

Effort tags: **S** ≈ an hour or two · **M** ≈ half a day · **L** ≈ a day plus.

## Deliverables

### A — One toggle, one rule (M)

Lands first: Themes C and D both register buttons through it, and writing them against three
divergent copies would mean five copies by the end of the phase.

- [ ] Add `packages/app/src/features/status-bar/status-toggle.tsx` exporting
      `StatusToggle` — props `{ testId, Icon, iconClassName?, name, chord, active, onToggle,
      tooltip }`. It renders exactly what
      [`repos-toggle.tsx`](../../../packages/app/src/features/status-bar/repos-toggle.tsx)
      renders today: a `Tooltip` wrapping a `button` with `aria-pressed={active}`, the icon,
      the name in `.status-label`, and the chord hint. Crib the chord-badge shape from
      [`IconButton`'s children slot](../../../packages/app/src/components/icon-button.tsx) —
      the title bar already renders `⌘`+bold-letter that way at
      [`app.tsx:751-763`](../../../packages/app/src/app.tsx).
- [ ] Add `status-toggle-label.ts` with a **pure** `showsName({ active, hovered, density })`
      returning a boolean, plus `showsChord({ density })`. Two independent axes both deciding
      whether text renders is the drift risk in this theme; one tested function is the answer.
      `density.test.ts` is the model for testing a pure layout decision with plain values.
- [ ] Implement the rule as decided: **the name renders when `active || hovered`, and only at
      `full` density.** At `compact`/`collapsed` nothing shows a name — `.status-label` already
      guarantees that and needs no carve-out, and an active toggle that grew a label in a
      narrow window could re-trigger the very overflow that produced the narrow state.
- [ ] The chord hint stops wearing `.status-label` and becomes **always visible at `full`,
      hidden at `compact`/`collapsed`** — same visibility as today, but expressed through
      `showsChord` rather than by borrowing the name's class, so the two can never be changed
      together by accident.
- [ ] Chord rendering goes through
      [`displayChord`](../../../packages/app/src/features/status-bar/chord-hint.ts) for every
      button. Today `repos-toggle` and `browser-toggle` hard-code `⌘`+`G`/`B` in JSX while
      `terminal-toggle` calls `displayChord` — the hard-coded pair is wrong on Linux and
      Windows, where the same commands are `Ctrl+G`/`Ctrl+B`.
- [ ] Track hover/focus in `StatusToggle` itself via `onPointerEnter`/`onPointerLeave` +
      `onFocus`/`onBlur` (not CSS `:hover`), because the name's presence changes layout width
      and the pure function has to be the one deciding it. Keyboard focus counts as hover, so
      tabbing the rail reveals names.
- [ ] Rewrite
      [`repos-toggle.tsx`](../../../packages/app/src/features/status-bar/repos-toggle.tsx),
      [`terminal-toggle.tsx`](../../../packages/app/src/features/status-bar/terminal-toggle.tsx)
      and
      [`browser-toggle.tsx`](../../../packages/app/src/features/status-bar/browser-toggle.tsx)
      as thin `StatusToggle` call sites — each keeps its own store selector, its own icon and
      its own `chordFor(...)` line and nothing else. `repos-toggle`'s `text-[#F05032]` Git
      orange passes through `iconClassName`; its long comment about why that colour is a
      literal rather than a token moves with it.
- [ ] `status-toggle.test.tsx`: `aria-pressed` follows `active`; the name is absent when
      inactive-and-unhovered and present when either is true; the chord is present in both
      states; a `data-density='compact'` ancestor hides the name in both states.

### B — The registry learns to group (M)

Three insertions and one zone move in
[`segments.ts`](../../../packages/app/src/features/status-bar/segments.ts) is where hand-editing
that array stops being reasonable, and the seed's layout is defined by *grouping*, which the
array cannot currently express.

- [ ] Add `group: string` to `StatusSegment` and give every entry one. Left zone:
      `'shortcuts'`, `'health'`, `'live'`. Right zone: `'repo'`, `'machine'`, `'alerts'` —
      naming what the existing hand-placed `right-delimiter` already separates, so the right
      zone gains a description of itself without changing a pixel.
- [ ] Render group boundaries as separators **derived from the data**, in
      [`status-bar.tsx`](../../../packages/app/src/features/status-bar/status-bar.tsx): a
      separator is emitted between two adjacent visible segments whose `group` differs. A
      trailing or leading separator must never appear — this is the same trap the existing
      header comment records about wrapping a `null`-returning segment in a `div` and leaving
      60px of unexplained `gap-3` space.
- [ ] Extract that decision into a pure `withSeparators(segments)` in
      `segments-groups.ts`, returning a render list of `{ kind: 'segment' } | { kind: 'sep' }`,
      and test it: no leading/trailing separator, no double separator, exactly one boundary
      between two differing groups, and — the case that actually bites — **no separator when
      every segment in the middle group returned `null`**. Since a segment's own emptiness is
      only knowable after render, this item must decide and document how the boundary avoids
      stranding a separator next to nothing (recommendation: groups whose members can all
      vanish declare `collapsible: true`, and the separator before such a group is rendered by
      the group itself, not by the boundary rule).
- [ ] Retire
      [`right-delimiter.tsx`](../../../packages/app/src/features/status-bar/right-delimiter.tsx)
      as a registered *segment* and keep only its markup as the shared `StatusSeparator`
      (`h-3 w-px bg-border shrink-0`, `aria-hidden`). Its `data-testid="right-delimiter"` is
      asserted by
      [`right-status-bar.test.tsx`](../../../packages/app/src/features/status-bar/right-status-bar.test.tsx)
      — update that test rather than keeping a dead id alive.
- [ ] Fix the priority inversion on `browser-toggle`: it is `priority: 5`, the **lowest** in
      the left zone, so it renders first and would be shed first. Renumber the shortcuts group
      to `10, 20, 30, 40, 50` in render order, leaving gaps as the array's own comment intends.
- [ ] Keep `collapseFor`'s contract exactly as it is — whole-zone collapse at `collapsed`
      density, priority-ascending. **Group-aware partial collapse is explicitly not in this
      phase** (see *Not in this phase*); the `group` field is added for layout now and is
      available to a later partial-collapse implementation without a second migration.
- [ ] Extend `segments.test.ts`: every segment has a `group`; groups within a zone are
      **contiguous** in array order (a segment cannot rejoin its group after another group's
      segment, which would render two separators for one logical break).

### C — The palette and Go-to-File join the rail (S)

A **move**, not an addition. Both buttons exist today at
[`app.tsx:749-764`](../../../packages/app/src/app.tsx) as `IconButton`s with `LuCommand`/`LuFile`
and a mono `K`/`P` badge.

- [ ] Add `palette-toggle.tsx` and `files-toggle.tsx` in
      [`features/status-bar/`](../../../packages/app/src/features/status-bar), both thin
      `StatusToggle` call sites. Names `Command Palette` / `Go to File`; chords via
      `chordFor('palette.open', 'Mod+k')` and `chordFor('palette.files', 'Mod+p')`.
- [ ] Icons: reuse the pair
      [`command-icons.ts`](../../../packages/app/src/features/palette/command-icons.ts) already
      maps for these two command ids (`LuSearch` for `palette.open`, `LuFile` for
      `palette.files`) **or** the title bar's `LuCommand`/`LuFile` — pick one pair and make the
      other match it, so a command's glyph is the same in the palette list and on the rail.
      Recommendation: `LuCommand`/`LuFile`, and update `command-icons.ts`'s `palette.open`
      entry, because `LuSearch` collides with `search.open`'s own meaning.
- [ ] Active state is real for both: `usePaletteStore` carries `isOpen` and
      `mode: 'all' | 'files'`
      ([`palette-store.ts:111-139`](../../../packages/app/src/store/palette-store.ts)).
      `palette-toggle` is active when `isOpen && mode !== 'files'`; `files-toggle` when
      `isOpen && mode === 'files'`. **Exactly one of the two may be active at a time** — assert
      it, because `setQuery` re-derives `mode` from a typed sigil and can flip which button
      lights up mid-typing, which is correct behaviour and easy to mistake for a bug.
- [ ] `onToggle` calls `palette.open()` / `palette.open('files')` when shut and
      `palette.close()` when that mode is already open — a control showing `aria-pressed` that
      cannot un-press is a lie about its own affordance.
- [ ] Register both in the `shortcuts` group of the left zone, after `browser-toggle`.
- [ ] Delete the two `IconButton`s from
      [`app.tsx`](../../../packages/app/src/app.tsx) and drop the now-unused `LuCommand` /
      `LuFile` imports and the module-scope `paletteChord` const if nothing else reads it.
      Check whether the adjacent `<span … w-px bg-border />` separator at
      [`app.tsx:764`](../../../packages/app/src/app.tsx) is still separating two things.
- [ ] Check the empty-workspace hint at
      [`empty-workspace.tsx:34-41`](../../../packages/app/src/features/empty/empty-workspace.tsx)
      still reads correctly — it teaches `⌘K`/`⌘P` and now points at the rail rather than the
      title bar.

### D — Diagnostics moves left (S)

It is a fact about *this repository*, and it now sits between two machine-vitals readouts. Its
own header comment already explains that it follows the sidebar selection, not the workbench
tab — which is a left-zone kind of statement.

- [ ] Change
      [`diagnostics-segment`](../../../packages/app/src/features/diagnostics/diagnostics-segment.tsx)'s
      registration in `segments.ts` to `zone: 'left'`, `group: 'health'`, priority above the
      shortcuts group and below `live`.
- [ ] Flip its `Popover` from `align="end"` to `align="start"`
      ([`diagnostics-segment.tsx:173-177`](../../../packages/app/src/features/diagnostics/diagnostics-segment.tsx)).
      `align="end"` right-aligns the panel against the trigger, which was correct hard against
      the window's right edge and puts the panel off-screen-left at the window's left edge.
      `Popover` clamps to the viewport
      ([`popover.tsx:100-113`](../../../packages/app/src/components/popover.tsx)), so the bug is
      a panel that visually detaches from its trigger rather than one that disappears — verify
      by eye, not only by test.
- [ ] Same flip for the `ConfirmDialog` trust prompt if it is anchored rather than centred.
- [ ] Update
      [`right-status-bar.test.tsx`](../../../packages/app/src/features/status-bar/right-status-bar.test.tsx)
      and any test asserting `status-bar-right` contains diagnostics.
- [ ] Confirm the right zone still reads as a group after the move: `finance` is now the
      leftmost member of `'repo'` and the `right-delimiter` boundary must still fall in the
      right place under Theme B's derived rule.
- [ ] Leave the `ProblemList` popover contents entirely alone. This is a relocation.

### E — Four launchers (M)

- [ ] Add `packages/app/src/features/loops/loop-glow.ts`: a `Record<string, string>` from loop
      id to a **CSS colour**, sitting beside
      [`loop-icons.tsx`](../../../packages/app/src/features/loops/loop-icons.tsx) and justified
      by the same comment — `packages/shared` is the wire contract and cannot carry
      presentation. Values match the Tailwind classes `DEFAULT_LOOPS` already declares, so the
      launcher and the FAB tab are the same colour by construction: `innovate` `#3b82f6`
      (blue-500), `automate` `#22c55e` (green-500), `watchdog` `#eab308` (yellow-500), `medic`
      `#ef4444` (red-500). An unknown id falls back to `currentColor`, mirroring
      `loopIcon`'s neutral-dot fallback — a wrong colour is cosmetic, a crash is not.
- [ ] Add `packages/app/src/features/status-bar/fab-launchers.tsx` — one segment rendering four
      buttons from `DEFAULT_LOOPS` in declaration order, glyph via `loopIcon(loop.icon)`.
      **One segment, not four**, so the four never separate across an overflow boundary and the
      group rule sees them as one unit.
- [ ] At rest each launcher is **semi-transparent** (`opacity: .45`) and monochrome-ish — the
      loop colour is present but muted, so four resting launchers do not compete with the agent
      count beside them.
- [ ] Click calls `useUiStore.getState().openFabTab(loop.id as FabTab)` — which already sets
      `fabPanelOpen: true` and `activeFabTab` in one action
      ([`ui-store.ts:986`](../../../packages/app/src/store/ui-store.ts)), so no new store
      action is needed. Clicking the launcher for the tab that is already open and focused
      **closes the panel**, matching every other toggle in the rail.
- [ ] Accessibility: each button gets `aria-label={`Open ${loop.label} loop`}`, a `Tooltip`
      carrying label + live state, and `aria-pressed` reflecting *open-tab*, not *running* —
      pressed is about this control's own surface.
- [ ] Register as `{ id: 'fab-launchers', zone: 'left', group: 'live', priority: 35 }`, between
      `agent-count` (30) and `reattached-note` (40), as the seed specifies.
- [ ] Density behaviour: the launchers are icons with no label, so `full` and `compact` look
      identical. Give the row `gap-1` rather than inheriting the zone's `gap-3` — four glyphs
      that read as one cluster, not four unrelated segments.

### F — The strip is mission control (M)

Two independent facts, two visual channels. **This supersedes the seed's original wording**,
which put the glow on the active tab: the glow means *running*.

- [ ] Read `useAllLoopStatuses(LOOP_IDS)` in `fab-launchers.tsx` — the same call
      [`fab-panel.tsx:29`](../../../packages/app/src/components/fab-panel.tsx) and
      [`fab-loop-dots.tsx`](../../../packages/app/src/features/loops/fab-loop-dots.tsx) already
      make, so all three surfaces agree by construction.
- [ ] **Glow = running.** A running loop's launcher goes fully opaque and takes a
      `box-shadow` in its own colour plus a slow opacity pulse. Drive the colour through a
      `--loop-glow-color` custom property set inline from `loop-glow.ts`, so the CSS is one
      rule rather than four — the technique `.loop-run-glow` uses for `--loop-glow-angle`.
- [ ] **Ring = the open tab.** A subtle `ring-1` / outline in the loop's colour marks which tab
      the FAB is currently showing, and it is legible *with or without* the glow: a loop can be
      open and idle, running and unopened, or both at once, and all three states must be
      distinguishable at a glance.
- [ ] **Amber outranks the loop colour when waiting** — `#f59e0b`, steady, no pulse. Established
      three times already: `.loop-run-glow.is-waiting` in
      [`styles.css:677-683`](../../../packages/app/src/styles.css), the tab dot in
      `fab-panel.tsx`, and `fab-loop-dots.tsx`. A loop with a question on screen is the one you
      need, and it must look the same wherever it is shown.
- [ ] `is-thinking` is *not* given a fourth state here. The launcher is 14px; `running` vs
      `waiting` is as much as it can carry honestly. Note the decision in the file so nobody
      re-derives it.
- [ ] Add the CSS to [`styles.css`](../../../packages/app/src/styles.css) as
      `.loop-launcher` + `.is-running` / `.is-waiting` / `.is-open`, adjacent to the
      `.loop-run-glow` block so the two families are read together. Keyframes animate
      **opacity only** — never `box-shadow` spread and never `filter` — for the reason Phase 36
      Theme E documents: this is a permanently-running animation on a window that is often
      blurred.
- [ ] Decide whether `FabLoopDots` on the collapsed FAB is now redundant. Recommendation:
      **keep it.** The FAB is visible when the status bar is scrolled past nothing but is a
      different surface at a different moment, and the dots already handle the four-cap by
      construction. Record the call either way.
- [ ] `fab-launchers.test.tsx`: four buttons in `DEFAULT_LOOPS` order; a click calls
      `openFabTab` with the right id; running adds `is-running`; waiting adds `is-waiting` and
      *removes* the loop colour; the open tab adds `is-open`; running+open carries both.

### G — Reduced motion, and proof (S)

- [ ] `html[data-motion='reduced'] .loop-launcher` resolves to a computed
      `animation-name: none` — **not** `animation-play-state: paused`. A paused animation still
      holds a compositor layer, and Phase 35 Theme H's assertion reads the computed value
      through the cascade rather than out of the stylesheet, precisely so a later `!important`
      elsewhere cannot silently defeat it. Reuse that test's shape.
- [ ] Under reduced motion a running launcher keeps its full opacity and its coloured
      `box-shadow` and loses only the pulse — the state stays legible, which is what reduced
      motion asks for and what `html[data-motion='reduced'] .loop-run-glow` already does.
- [ ] Playwright shots of the left zone across the states that actually differ: `full`
      inactive, `full` with one toggle active, `full` hovered, `compact`, `collapsed` (the
      whole zone in the overflow popover), and the launcher strip at rest / one running / one
      waiting / one open-and-running.
- [ ] Assert the collapsed state end to end: at `collapsed` the entire left zone including the
      launcher strip moves into `OverflowPopover`, which mounts its children only while open —
      confirm the four launchers still work from inside it, and that a group separator does not
      travel there as a stray `w-px` div.
- [ ] Run `moon run app:perf` and confirm the entry chunk stays inside
      [`budgets.json`](../../../packages/app/budgets.json)'s 1.13× byte budget. Four icons and
      one CSS block should be noise; Phase 36's rule is that the claim comes with a number.
- [ ] Measure blurred idle CPU with `node scripts/perf/idle-cpu.mjs --blurred` against a
      packaged-equivalent build with one loop running, and record it. This phase adds a
      permanently-running opacity animation to a surface that is always mounted — the one thing
      Phase 36 Theme E exists to catch.
- [ ] `moon run :typecheck :lint :test` green.

## Files this phase touches

| Path | Change |
|---|---|
| [`features/status-bar/status-toggle.tsx`](../../../packages/app/src/features/status-bar) | **new** — the shared primitive (A) |
| [`features/status-bar/status-toggle-label.ts`](../../../packages/app/src/features/status-bar) | **new** — pure `showsName`/`showsChord` (A) |
| [`features/status-bar/repos-toggle.tsx`](../../../packages/app/src/features/status-bar/repos-toggle.tsx) | rewritten as a `StatusToggle` call site (A) |
| [`features/status-bar/terminal-toggle.tsx`](../../../packages/app/src/features/status-bar/terminal-toggle.tsx) | rewritten as a `StatusToggle` call site (A) |
| [`features/status-bar/browser-toggle.tsx`](../../../packages/app/src/features/status-bar/browser-toggle.tsx) | rewritten; `displayChord` instead of hard-coded `⌘B` (A) |
| [`features/status-bar/segments.ts`](../../../packages/app/src/features/status-bar/segments.ts) | `group` field, three registrations, one zone move, priority fix (B–E) |
| [`features/status-bar/segments-groups.ts`](../../../packages/app/src/features/status-bar) | **new** — pure `withSeparators` (B) |
| [`features/status-bar/status-bar.tsx`](../../../packages/app/src/features/status-bar/status-bar.tsx) | renders the derived separators (B) |
| [`features/status-bar/right-delimiter.tsx`](../../../packages/app/src/features/status-bar/right-delimiter.tsx) | becomes `StatusSeparator`, deregistered as a segment (B) |
| [`features/status-bar/palette-toggle.tsx`](../../../packages/app/src/features/status-bar) | **new** (C) |
| [`features/status-bar/files-toggle.tsx`](../../../packages/app/src/features/status-bar) | **new** (C) |
| [`features/status-bar/fab-launchers.tsx`](../../../packages/app/src/features/status-bar) | **new** — the four launchers (E, F) |
| [`features/loops/loop-glow.ts`](../../../packages/app/src/features/loops) | **new** — loop id → CSS colour (E) |
| [`features/diagnostics/diagnostics-segment.tsx`](../../../packages/app/src/features/diagnostics/diagnostics-segment.tsx) | `Popover align` flip only (D) |
| [`features/palette/command-icons.ts`](../../../packages/app/src/features/palette/command-icons.ts) | `palette.open` glyph aligned with the rail (C) |
| [`app.tsx`](../../../packages/app/src/app.tsx) | the two `IconButton`s and their imports removed (C) |
| [`styles.css`](../../../packages/app/src/styles.css) | `.loop-launcher` family + reduced-motion rule (F, G) |
| [`features/status-bar/right-status-bar.test.tsx`](../../../packages/app/src/features/status-bar/right-status-bar.test.tsx) | diagnostics + delimiter assertions updated (B, D) |
| [`features/status-bar/segments.test.ts`](../../../packages/app/src/features/status-bar/segments.test.ts) | group contiguity + uniqueness (B) |

Untouched on purpose: [`density.ts`](../../../packages/app/src/features/status-bar/density.ts)
and [`use-overflow.ts`](../../../packages/app/src/features/status-bar/use-overflow.ts) —
the density decision and its two measurement passes are unchanged, which is the whole reason
the label rule was scoped to `full` only.
[`loops.ts`](../../../packages/shared/src/loops.ts) — no wire-contract change.

## Verification

- [ ] Every left-zone button shows its chord and no name at rest; toggling a panel on reveals
      that button's name; hovering any button reveals its name without changing its state.
- [ ] Narrowing the window to `compact` hides every name including the active one, and no
      button changes width when hovered at `compact`.
- [ ] Narrowing further to `collapsed` moves the whole left zone into the overflow popover, and
      every control in it — including the four launchers — still works.
- [ ] `⌘K` and `⌘P` are gone from the title bar and present in the rail; both still open the
      palette in the right mode, both close it on a second press, and exactly one of them is
      ever lit.
- [ ] Diagnostics sits in the left zone between two separators; its popover opens flush with
      its trigger and fully on screen at the window's left edge; the trust prompt still reads
      correctly.
- [ ] Clicking each of the four launchers opens the FAB panel on that loop's tab; clicking the
      already-open one closes the panel.
- [ ] Start a loop from the FAB: its launcher goes opaque, glows in the loop's own colour and
      pulses. Switch tabs: the ring moves, the glow stays on the running loop.
- [ ] Drive a loop to a waiting prompt: its launcher goes steady amber, the loop colour drops,
      and the FAB tab dot and the collapsed-FAB dot agree with it.
- [ ] Two loops running at once, one of them the open tab: three states distinguishable at a
      glance without hovering.
- [ ] Quit and relaunch with a loop persisted asleep: the launcher is at rest, not glowing.
      (Phase 35 Theme I's hydration is what makes this true; this only has to not break it.)
- [ ] `html[data-motion='reduced']`: no pulse anywhere in the rail; running launchers still
      opaque and still coloured; computed `animation-name` is `none`.
- [ ] Full keyboard pass: tab through the rail, every control reachable, focus visible, names
      revealed on focus, `aria-pressed` correct on all six toggles.
- [ ] `moon run :typecheck :lint :test` green; `moon run app:perf` inside budget; a recorded
      blurred idle-CPU number with one loop running.
- [ ] A human-eye pass at `full` on a wide window: the rail reads as three groups, and four
      resting launchers do not shout.

## Not in this phase

- **Group-aware partial collapse.** `collapseFor` still moves a whole zone at `collapsed`
  density. The `group` field makes per-group collapse expressible later, but implementing it
  needs per-segment widths, which live in the DOM and not in the pure function that would
  decide — the same reason `density.ts`'s own comment gives for whole-zone collapse today.
- **Moving `test-verdict` / `checks-verdict` left.** They are repo facts, so the consistency
  argument is real, but `segments.ts` parks them at the outer corner deliberately and moving
  them empties the right zone of everything but machine vitals. A separate case.
- **New chords, or a chord for the launchers.** Four loops would want four bindings and there
  is no obvious unclaimed set; the launchers stay mouse-and-keyboard-focus reachable.
- **User-editable rail order or a "customise status bar" surface.** `segments.ts` stays static
  composition, as its own header comment insists.
- **A fifth loop.** `DEFAULT_LOOPS` is fixed at four and `loop-glow.ts` gains a row when it is
  not — the same accepted cost `loop-icons.tsx` already carries.
- **Touching Phase 37's rainbow tokens.** See decision 6.
- **`is-thinking` as a launcher state.** Decided against in Theme F: 14px carries two states
  honestly, not three.

## Decisions

Settled during the brainstorm; recorded with the reasoning so a later phase can reopen one
knowingly.

1. **Density wins over active.** When the window is narrow and a toggle is active, no name
   renders. The alternative — an active toggle keeping its name at `compact` — needs a carve-out
   in the one `.status-label` rule that currently makes every segment's compact behaviour free,
   and a label that appears in a narrow window can re-trigger the overflow that produced the
   narrow window. Active-or-hover therefore only decides the `full` case.
2. **Glow means *running*; a ring means *this tab is open*.** This **inverts the phase's own
   seed**, which asked for the glow on the active tab. Running is the more urgent fact and the
   one you cannot otherwise see with the FAB collapsed; "which tab is open" is already obvious
   the moment the panel is on screen. Both states can be true at once, so they had to be two
   channels rather than one.
3. **The launcher colours live in a renderer-side map, not on `LoopDefinition`.**
   `packages/shared` imports zod and nothing else, and `DEFAULT_LOOPS.color` is a Tailwind
   `text-*` class a `box-shadow` cannot read. `loop-glow.ts` is the exact shape
   `loop-icons.tsx` already uses for the same reason, and it keeps a presentation hex out of
   the wire contract. Adding a `glow`/`hex` field beside `color` was the alternative and was
   rejected on that boundary.
4. **⌘K and ⌘P move rather than duplicate.** One control, one home.
   [`status-bar.tsx`](../../../packages/app/src/features/status-bar/status-bar.tsx)'s own header
   comment makes this argument about git status: "two readings of the same thing, one at each
   edge of the window, is one more place to disagree and no more information."
5. **Three groups, two separators.** Shortcuts · health · live work. The seed asked for one
   separator before diagnostics; the second one costs nothing once Theme B derives them from
   `group`, and without it diagnostics runs straight into the agent count and reads as part of
   the live-work cluster.
6. **Phase 37 and this phase stay independent.** 37 Theme A tokenises the seven-stop *rainbow
   ramp* (`--rainbow-0…5`) shared by five gradient surfaces; `loop-glow.ts` is a four-row
   *per-loop* map. They overlap in that Innovate's blue and the ramp's `#3b82f6` are the same
   colour, but the ramp is an ordered spectrum and the loop map is a lookup — merging them would
   make each loop's colour a function of its position in `DEFAULT_LOOPS`, which 37's own
   decision 1 already rejects. Either phase can land first.
7. **Only diagnostics moves left.** See *Not in this phase*.
8. **Diagnostics keeps `side="top"` and changes only `align`.** The popover already clamps to
   the viewport, so the failure mode of leaving `align="end"` is a panel that detaches from its
   trigger rather than one that vanishes — which is why this needs an eye, not just a test.

## Open questions

- **Does a stranded separator actually occur in practice?** The `health` group has exactly one
  member and `DiagnosticsSegment` returns `null` for a repo nobody has measured — so the
  common first-run state is a group with no visible members sitting between two that have some.
  Theme B carries the item; the recommendation (a `collapsible` group owning its own leading
  separator) should be confirmed against the real render rather than adopted on paper.
- **Which glyph pair wins for the palette — `LuCommand`/`LuFile` or `command-icons.ts`'s
  `LuSearch`/`LuFile`?** Recommendation is `LuCommand`, with `command-icons.ts` updated to
  match, because `LuSearch` is what `search.open` should own. Cheap either way; decide when the
  two are on screen together.
- **Does the always-mounted opacity pulse cost measurable blurred idle CPU?** Left to Theme G's
  measurement rather than pre-decided or pre-gated, per Phase 36's rule. If it does, the gate
  to reach for is the visibility gate `useNow()` and the activity tick already use, not a
  redesign of the glow.
- **Should the launcher strip render at all when no loop has ever run?** `FabLoopDots` renders
  nothing when nothing is running, on the argument that the FAB should look untouched. The rail
  is a different case — the launchers are *how you start* a loop, so hiding them until one runs
  is circular. Recommendation: always render. Flagged because it is the one place this phase
  and Phase 35's stated instinct differ.
