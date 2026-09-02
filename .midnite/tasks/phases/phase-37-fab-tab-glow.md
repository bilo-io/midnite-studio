# Phase 37 — A glow that knows which tab

The FAB panel wears a rotating rainbow border and nothing else. Inside that 1.5px ring the
surface is flat `bg-popover`, and the four loop tabs — Innovate, Automate, Watchdog, Medic —
announce themselves only through a highlighted button, a coloured icon and a 6px dot. This
phase gives the panel an **inner glow**: a soft, pulsating light hugging the inside edge,
falling off very smoothly to nothing well before the centre, painted from the same rainbow —
and it makes that glow **tab-reactive**, subtracting the half of the spectrum furthest from the
active tab's own hue so the panel edge reads as "the green one" without ever ceasing to be a
gradient.

**Builds on.** Phase 35 built the FAB console this decorates: the four tabs are data
([`DEFAULT_LOOPS`](../../../packages/shared/src/loops.ts)), the active one lives in
[`ui-store.ts`](../../../packages/app/src/store/ui-store.ts) as `activeFabTab`, and
`useAllLoopStatuses` is already called in
[`fab-panel.tsx:29`](../../../packages/app/src/components/fab-panel.tsx) — today only the dots
spend it. Phase 35 also shipped `.loop-run-glow`
([`styles.css:608-717`](../../../packages/app/src/styles.css)), which is the working precedent
for every technique here: a conic border through two-layer `background-clip`, a
`@property`-registered angle, a pulsing `box-shadow`, and an `.is-waiting` state that drops the
rainbow for a steady amber ring. Phase 13 gave the app `html[data-motion='reduced']`, and
Phase 36 Theme E gave it a reason to care what animates on an idle window.

**Scope guardrails.** **The FAB and its button only.** The `.breadcrumb-repo-pill`, popovers
and upstream's `.gradient-border` get the tokens (Theme A) but no glow and no arc — the full
`.rainbow-glow` retrofit of every gradient surface was considered and deliberately left out.
**No new DOM node**: the glow is a `::before` on the existing element, not a child, because a
child changes the panel's stacking and flex layout. **`position` is never set from
`styles.css`** — see [`styles.css:351-372`](../../../packages/app/src/styles.css), which
records at length why unlayered CSS here beat a `fixed` utility and mounted every popover a
viewport below the fold; the `relative` this phase needs is added as a **Tailwind class in the
JSX**. **Never animate `filter: blur()`** — the pulse animates mask stops and opacity, both
compositor-friendly; a per-frame blur re-rasterise is exactly what Phase 36's idle-CPU budget
exists to catch. **The seven-stop ramp is not redesigned** — `#f43f5e → #f59e0b → #10b981 →
#3b82f6 → #8b5cf6 → #ec4899` stays byte-identical; Theme A only moves it.

Effort tags: **S** ≈ an hour or two · **M** ≈ half a day · **L** ≈ a day plus.

## Deliverables

### A — One rainbow, six tokens (S)

Lands first, because Theme C does arithmetic against positions in this ramp and doing that
against five hard-coded copies guarantees drift. Purely mechanical: **no rendered pixel may
change.**

- [x] Declare the ramp once on `:root` in
      [`styles.css`](../../../packages/app/src/styles.css), above the gradient block:
      `--rainbow-0: #f43f5e` (rose, 0°), `--rainbow-1: #f59e0b` (amber, 60°),
      `--rainbow-2: #10b981` (emerald, 120°), `--rainbow-3: #3b82f6` (blue, 180°),
      `--rainbow-4: #8b5cf6` (violet, 240°), `--rainbow-5: #ec4899` (pink, 300°). Comment the
      degree each stop sits at in an even seven-stop conic — Theme C's arc table is derived
      from those numbers, not from eyeballing.
- [x] Replace all five verbatim copies in `styles.css` with `var(--rainbow-N)` references —
      they are at lines **409** (`.gradient-border`, the in-place override of upstream), **530**
      (`.breadcrumb-repo-pill`), **591** (`.fab-panel-gradient`), **653** (`.loop-run-glow`) and
      **698** (`.loop-run-glow.on-primary`). Each closes the loop by repeating
      `var(--rainbow-0)` as the seventh stop.
- [x] Add a `--rainbow-ramp` shorthand holding the whole seven-stop list, so a plain
      full-spectrum consumer writes `conic-gradient(from …, var(--rainbow-ramp))` instead of
      six references. Theme C's arc gradients keep listing stops individually — they need to
      omit some.
- [x] Leave `@bilo-io/ui`'s `tokens.css` alone. Its two copies are upstream and out of scope;
      note in the comment that our `:root` values are deliberately identical to them, so the
      day upstream is updated the delta is a one-line diff rather than a hunt.

### B — The inner glow (M)

The core of the seed: soft, pulsating, edge-hugging, smoothly transparent toward the centre.
Full-spectrum at this stage — Theme C makes it tab-reactive.

- [x] Add `relative` to the `className` in
      [`fab-panel.tsx:39`](../../../packages/app/src/components/fab-panel.tsx) — in the JSX, as
      a Tailwind utility. **Not** `position: relative` in `styles.css`; that class has exactly
      one call site, which makes the JSX the honest place for it, and it keeps this phase
      clear of the trap documented at `styles.css:351-372`.
- [x] Add `.fab-panel-gradient::before` in
      [`styles.css`](../../../packages/app/src/styles.css), directly under the existing
      `.fab-panel-gradient` block: `content: ''`, `position: absolute`, `inset: 0`,
      `border-radius: inherit`, `pointer-events: none`, and a `z-index` that keeps it under the
      tab bar and panes (the panel's children are in normal flow, so a `z-index: 0` on the
      pseudo-element and nothing on the children is enough — verify rather than assume).
- [x] Paint it with a conic gradient sharing the border's rotation:
      `conic-gradient(from var(--fab-panel-angle, 0deg), var(--rainbow-ramp))`, plus
      `filter: blur(20px)` as the softening. The border keeps its own `background-image`
      untouched — this is a second, independent layer.
- [x] Mask it to the edge with a radial alpha mask — this is what makes the falloff smooth and
      keeps the light near the rim:
      `mask-image: radial-gradient(ellipse 100% 100% at 50% 50%, transparent 0%, transparent
      var(--fab-glow-inner, 62%), rgba(0,0,0,0.55) 82%, #000 100%)`, with the `-webkit-`
      prefixed longhand alongside it (Electron's Chromium accepts the unprefixed form; the
      prefix costs one line and removes the question). Three stops rather than two — a linear
      two-stop mask has a visible inner rim.
- [x] Add `@keyframes fab-glow-pulse` animating **`--fab-glow-inner` and `opacity` only** —
      e.g. inner 62% → 56% and opacity 0.55 → 0.85 at the midpoint, `ease-in-out`, ~3.2s. This
      requires `@property --fab-glow-inner { syntax: '<percentage>'; inherits: false;
      initial-value: 62%; }` — an unregistered percentage in a mask stop will not interpolate,
      it will jump, the same reason `--fab-panel-angle` is registered today.
- [x] Run both animations on the pseudo-element: `animation: fab-panel-spin 4s linear infinite,
      fab-glow-pulse 3.2s ease-in-out infinite`. Deliberately co-prime-ish periods so the two
      do not visibly re-sync every cycle.
- [x] Tune blur radius, mask stops and pulse amplitude by eye against both themes. The written
      figures are a starting point, not a spec; record the values actually shipped in a comment
      next to the block, the way `.loop-run-glow`'s comment records *why* it pulses.

### C — The spectrum knows the tab (M)

Subtract the half of the ramp furthest from the active tab's hue. Border and glow share one arc,
so the two layers never disagree about colour at the same pixel row.

- [x] Set `data-fab-tab={activeFabTab}` on the gradient div in
      [`fab-panel.tsx:39`](../../../packages/app/src/components/fab-panel.tsx). The renderer's
      whole contribution is naming the active tab; every angle stays in CSS.
- [x] Register the two arc endpoints: `@property --fab-arc-from` and `@property --fab-arc-to`,
      both `syntax: '<angle>'`, `inherits: false`, initial `0deg` / `360deg` (a full ramp, which
      is also the sensible fallback if the attribute is ever missing).
- [x] Add the four-row arc table in `styles.css`. **180° spans centred on each tab's own ramp
      anchor**, which land exactly on existing stops because the tab colours and the ramp are
      the same sequence:

      | Tab | Tailwind | Anchor | Arc |
      |-----|----------|--------|-----|
      | `medic` | `text-red-500` | rose 0° | 270° → 90° |
      | `watchdog` | `text-yellow-500` | amber 60° | 330° → 150° |
      | `automate` | `text-green-500` | emerald 120° | 30° → 210° |
      | `innovate` | `text-blue-500` | blue 180° | 90° → 270° |

- [x] Build the arc gradient so it has no seam: the lit span runs from `--fab-arc-from` to
      `--fab-arc-to` with the ramp stops that fall inside it, and the outer ~30° at each end
      eases to `transparent` rather than ending on a hue. A hard stop against the unlit
      remainder reads as a rendering artefact, not as a decision.
- [x] Apply the arc to **both** layers — the border's `conic-gradient` in `.fab-panel-gradient`
      and the glow's in `::before` — from the one pair of vars.
- [x] Sweep between tabs: `transition: --fab-arc-from 0.5s ease, --fab-arc-to 0.5s ease` on
      `.fab-panel-gradient`. Registered properties are what make this interpolate; confirm the
      transition inherits to the pseudo-element or declare it there too (pseudo-elements do
      inherit custom properties from their originating element, but the *transition* runs where
      the property changes — verify which, and comment the answer).
- [x] Check the wrap-around cases by hand. `medic` (270° → 90°) crosses 0°, and a naive
      `from`/`to` interpolation between `medic` and `automate` may sweep the long way round.
      Pick consistent unwrapped values (e.g. medic as `-90° → 90°`) if so, and say why in a
      comment.

### D — Collapsed FAB continuity (S)

Collapsing the panel should not change its colour. The button already has the three-state glow
machinery; this is one more variable through it.

- [x] Give the collapsed FAB button the active tab's arc. It wears
      `loop-run-glow on-primary` in
      [`app.tsx:1073-1094`](../../../packages/app/src/app.tsx); the arc vars can ride in as
      `data-fab-tab` on the same button, reusing Theme C's table by adding
      `.loop-run-glow[data-fab-tab='…']` selectors, or by hoisting the table to an attribute
      selector that is not tied to `.fab-panel-gradient`. Prefer the hoist — one table, two
      consumers.
- [x] Make `.loop-run-glow`'s conic honour `--fab-arc-from`/`--fab-arc-to` when they are set
      and stay full-spectrum when they are not — the Start/Stop button inside a tab
      ([`loop-composer.tsx:145-150`](../../../packages/app/src/features/loops/loop-composer.tsx))
      also wears this class and should pick the arc up for free from its tab's subtree, which
      is a bonus rather than a requirement.
- [x] Confirm the four loop dots in
      [`fab-loop-dots.tsx`](../../../packages/app/src/features/loops/fab-loop-dots.tsx) still
      read against the narrowed ring. They are per-loop colours sitting on a now-tinted glow;
      if a dot disappears into its own hue, the dots win — they carry status, the glow carries
      identity.

### E — Pulse follows the loop (M)

A slice of the "glow as state language" direction, kept to cadence rather than a new visual
vocabulary. Everything it needs is already read by the panel.

- [x] Drive a `data-loop-state` attribute on the gradient div from the existing
      `useAllLoopStatuses(LOOP_IDS)` call in
      [`fab-panel.tsx:29`](../../../packages/app/src/components/fab-panel.tsx), reporting the
      **active tab's** status: `idle` | `running` | `thinking` | `waiting`.
- [x] Map it to pulse cadence in CSS only — `idle` ~4.0s and low amplitude, `running` ~2.6s,
      `thinking` ~1.8s with a brighter peak. One keyframe, three durations, no new keyframes
      per state.
- [x] **`waiting` overrides the arc entirely**: a steady amber glow (`#f59e0b`), rotation
      stopped. This is the established precedent, not a new idea —
      `.loop-run-glow.is-waiting` already does exactly this on the button, and
      [`fab-panel.tsx`](../../../packages/app/src/components/fab-panel.tsx)'s own dot comment
      states the rule: *"Amber outranks the loop colour: a loop with a question on screen is
      the one you need."*
- [x] Decide and document what the glow shows while the *active* tab is idle but **another**
      tab is waiting. Recommendation: the arc stays with the active tab and the amber override
      does not fire — the FAB button (Theme D) and the tab's own dot already carry
      cross-tab attention, and hijacking the panel edge for a tab you are not looking at makes
      the edge lie about which pane is on screen.

### F — Reduced motion, and proof (S)

- [x] Add `html[data-motion='reduced']` rules for the new surfaces:
      `animation-name: none !important` on `.fab-panel-gradient::before` (and the element, which
      already has its own rule) — **not** a duration override. `@bilo-io/shell/appearance.css`
      forces `animation-duration: 0.001ms !important` *and*
      `animation-fill-mode: forwards !important`, which pins a keyframe to its final frame; the
      existing treatment at [`styles.css:324-338`](../../../packages/app/src/styles.css)
      documents this and removes the animation outright.
- [x] Suppress the 0.5s arc sweep too under reduced motion (`transition: none`). The glow keeps
      the active tab's colour and swaps instantly — identity survives, movement does not.
- [x] Confirm the pulse holds at a *sensible* frame when stopped. With the animation removed,
      `--fab-glow-inner` falls back to its `@property` initial value, so the resting look is the
      un-pulsed mask rather than whatever frame the animation died on. Assert the resting value.
- [x] Extend [`fab-loops.spec.ts`](../../../packages/app/e2e/fab-loops.spec.ts) — it already
      asserts reduced motion through `getComputedStyle(...).animationName`, which is the pattern
      to follow rather than grepping the stylesheet.
- [x] Assert the arc actually changes: click each of the four tabs and read
      `--fab-arc-from`/`--fab-arc-to` off the computed style, checking they match the table.
      Computed custom properties are the testable seam here — the rendered gradient is not.
- [x] Add before/after screenshots per tab to
      [`fab-loops-shots.spec.ts`](../../../packages/app/e2e/fab-loops-shots.spec.ts), in both
      light and dark.
- [x] Re-run [`panel-glow.spec.ts`](../../../packages/app/e2e/panel-glow.spec.ts) deliberately.
      It guards the popover-positioning regression that this exact CSS block has a documented
      history of causing; Theme A edits `.gradient-border`, so this spec is not incidental.
- [ ] Check the idle cost. The panel is a persistent blurred-window animation, which is the
      category Phase 36 Theme E spent itself on: run
      `node scripts/perf/idle-cpu.mjs --blurred` with the panel open and record the number here.
      If the blurred cost is material, gate the pulse on window focus. **Pre-empted rather than
      measured-then-decided**: gated both the pulse and the rotation on window focus (Theme B's
      `::before`) unconditionally, so the mitigation ships regardless of what the number would
      have said. The number itself stays open — attempted against a packaged build in this
      session's sandbox and blocked twice over: the sandbox has no Accessibility permission for
      the UI-scripted click `idle-cpu.mjs` would need to open the panel first, and even the
      panel-closed baseline swung 22% → 55% of a core across two back-to-back runs of *identical*
      unmodified `main`, too noisy in this environment to attribute a delta to anything. Open for
      a human pass on real hardware.

## Files this phase touches

| Area | Files |
|------|-------|
| app — styles | [`styles.css`](../../../packages/app/src/styles.css) — `:root` ramp tokens (A), `.fab-panel-gradient` + new `::before` (B), arc table + `@property` registrations (C), `.loop-run-glow` arc support (D), pulse cadence (E), reduced-motion rules (F) |
| app — FAB | [`components/fab-panel.tsx`](../../../packages/app/src/components/fab-panel.tsx) (`relative`, `data-fab-tab`, `data-loop-state`), [`app.tsx`](../../../packages/app/src/app.tsx) (collapsed FAB button), [`features/loops/fab-loop-dots.tsx`](../../../packages/app/src/features/loops/fab-loop-dots.tsx) (contrast check only) |
| app — loops | [`features/loops/loop-composer.tsx`](../../../packages/app/src/features/loops/loop-composer.tsx) (Start/Stop glow inherits the arc), [`features/loops/loop-status.ts`](../../../packages/app/src/features/loops/loop-status.ts) (read-only) |
| app — e2e | [`e2e/fab-loops.spec.ts`](../../../packages/app/e2e/fab-loops.spec.ts), [`e2e/fab-loops-shots.spec.ts`](../../../packages/app/e2e/fab-loops-shots.spec.ts), [`e2e/panel-glow.spec.ts`](../../../packages/app/e2e/panel-glow.spec.ts) |
| shared | **none** — [`shared/src/loops.ts`](../../../packages/shared/src/loops.ts) is read for the tab ids only; no contract change |

## Verification

- [x] `moon run :typecheck :lint :test` green.
- [x] Theme A changes **nothing visible**: screenshot-diff the FAB panel, the breadcrumb pill, a
      popover and the collapsed FAB button before and after tokenising. Any delta is a
      transcription error in one of the five copies.
- [x] Open the FAB panel: a soft rainbow light hugs the inside edge, fades to nothing well
      before the centre with no visible inner rim or banding, and breathes slowly.
- [x] Click through all four tabs: the glow **and** the border narrow to that tab's half of the
      spectrum, agreeing with each other, and travel around the perimeter over ~0.5s rather than
      cutting. Medic's wrap across 0° sweeps the short way like the rest.
- [x] The narrowed arc reads as the tab's colour at a glance from normal viewing distance —
      "the green one" — while still visibly being a gradient rather than a flat ring.
- [x] Collapse the panel with a tab active: the FAB button carries the same arc, so the colour
      does not jump.
- [x] Start a loop: the pulse quickens. Drive it to a prompt awaiting input: the glow goes
      steady amber and stops rotating, overriding the tab arc. Stop it: the arc returns.
- [ ] Both themes, light and dark, at the panel's minimum and maximum width — the mask is
      percentage-based, so a very wide panel must not push the glow away from the short edges.
      Not empirically resized in this pass — a Playwright attempt at driving the width directly
      (rather than through the real resize handle) only widened `FabPanel`'s own inner wrapper,
      not the `overflow-hidden` tween wrapper `app.tsx` puts around it, and clipped the result
      rather than testing it. Open for a human drag of the resize handle to its bounds (240 /
      640, `LAYOUT_BOUNDS.fabPanelWidth`).
- [x] `html[data-motion='reduced']`: no rotation, no pulse, no sweep — and the glow still shows
      the active tab's colour, resting on the `@property` initial mask value rather than a
      frozen frame.
- [ ] `node scripts/perf/idle-cpu.mjs --blurred` with the panel open, number recorded above.
      See the same item under Theme F: pre-empted by an unconditional focus gate rather than a
      measured one; the number itself is open for a human pass on real hardware.
- [x] `panel-glow.spec.ts` still green — popovers mount at their intended coordinates.

## Not in this phase

- The `.rainbow-glow` utility that would unify `.gradient-border`, `.breadcrumb-repo-pill`,
  `.fab-panel-gradient` and `.loop-run-glow` behind one class with `--glow-arc` /
  `--glow-inset` / `--glow-pulse` knobs. Theme A takes the colour half of that consolidation;
  the structural half is a bigger, riskier retrofit and would drag `@bilo-io/ui` into it.
- The two ramp copies in `@bilo-io/ui`'s `tokens.css` — upstream.
- Any glow on surfaces other than the FAB panel and its button.
- User-configurable per-loop colours, or arcs derived from a fifth loop. `DEFAULT_LOOPS` is
  fixed at four; a fifth would need a CSS row, which is the accepted cost of keeping the angles
  out of the wire contract (see decision 1).
- Stacked `box-shadow: inset` as the glow technique. Considered and rejected: insets take flat
  colours, so a rainbow means N offset shadows that band into corners rather than blending, and
  "close to the edges" fights the blur radius.

## Decisions

All settled during the brainstorm; recorded with the reasoning so a later phase can reopen one
knowingly.

1. **Arc angles live in a CSS table keyed by `data-fab-tab`, not on `LoopDefinition`.**
   `styles.css` carries four rows; `fab-panel.tsx` only names the active tab. Adding an
   `arcFrom`/`arcTo` (or `hueAnchor`) field beside the existing `color` in
   [`loops.ts`](../../../packages/shared/src/loops.ts) was the alternative and would make a
   fifth loop self-describing — rejected because it puts a presentation angle in the wire
   contract for a set of four that has not changed since Phase 35. Deriving the arc from array
   index was also rejected: it silently recolours every tab if `DEFAULT_LOOPS` is reordered, and
   it breaks the deliberate match between `text-green-500` and `#10b981`.
2. **Subtract the far half of the spectrum (180° arc), don't narrow to a single hue.** A ~90°
   arc identifies the tab most strongly but stops reading as a ring — it becomes a bright patch
   travelling around the edge. Weighting the full ramp toward the tab was too subtle to register
   on a 1.5px border plus a soft glow. 180° keeps two or three hues blending while still being
   unmistakably one colour family.
3. **The border follows the glow's arc.** One pair of vars drives both layers, so the panel
   reads as a single light source. Leaving the border full-rainbow would have put two different
   hues on the same pixel row and read as a bug.
4. **Tab changes sweep the arc over ~0.5s** rather than crossfading two stacked layers or
   snapping. The sweep is what makes the effect legible *as* a spectrum being subtracted; a
   crossfade goes muddy midway between opposite tabs (Medic rose ↔ Automate emerald), and an
   instant swap throws away the one moment the mechanism is visible.
5. **Under reduced motion the glow stays, tab-coloured and static.** Rotation, pulse and the
   0.5s sweep all go; the arc still tracks the active tab and changes instantly. Removing the
   glow entirely was simpler to test but strips more than reduced-motion asks for; keeping it
   full-rainbow would drop the tab-reactive feature for exactly the users who benefit from a
   second, non-motion cue.
6. **Amber-waiting outranks the tab arc**, for the active tab only. Established by
   `.loop-run-glow.is-waiting` and by the dot comment in `fab-panel.tsx`. A *non-active* tab
   waiting does not hijack the panel edge — see Theme E's last item.
7. **The pulse animates mask stops and opacity, never `filter: blur()`.** Blur is re-rasterised
   per frame; this is a permanently-running animation on a window that is often blurred, which
   is the precise shape Phase 36 Theme E was written about.
8. **`position: relative` is added in the JSX, not in `styles.css`.** The gradient block is
   unlayered CSS after `@tailwind utilities` and beats utilities at equal specificity — the
   documented cause of the popover-below-the-fold bug at `styles.css:351-372`.

## Open questions — resolved during implementation

- **Does the transition on a registered custom property inherit to the pseudo-element, or must
  it be declared there?** Neither, as it turned out — the transition is declared on both
  `.fab-panel-gradient` and `.fab-panel-gradient::before` in the shipped CSS, and that redundancy
  is load-bearing rather than defensive. The harder lesson came from a different corner of the
  same mechanism: an *unregistered* custom property (`--fab-arc-mask`, factored onto `:root` in
  an earlier draft) that references a registered one via `var()` resolves against the value in
  force **where it is declared**, not where it is consumed — so a shared `:root` definition baked
  in `:root`'s own `--fab-arc-from` (the untouched `0deg` initial value) and every tab rendered
  full-spectrum. The fix was to stop sharing the formula: the same `conic-gradient()` is now
  written out directly on each of the three consuming properties (the border's `mask-image`, the
  glow's, `.loop-run-glow`'s), so `var()` resolves against that element's own local override.
  Documented at length in `styles.css` next to the mask, since the failure mode is easy to
  reintroduce by "cleaning up" the duplication back into a shared variable.
- **Wrap-around interpolation for `medic` (270° → 90°).** Sidestepped rather than answered:
  instead of normalising each tab's arc into `[0deg, 360deg)` and then special-casing medic's
  crossing of the seam, all four rows sit on one continuous, never-wrapping number line —
  `anchor - 90deg` to `anchor + 90deg` against each tab's own ramp anchor (medic `-90° → 90°`,
  watchdog `-30° → 150°`, automate `30° → 210°`, innovate `90° → 270°`). No pair of these four
  values is ever more than 180° apart, so a registered-angle transition between any two of them
  always interpolates through the shorter arc — there was no seam left to cross, so watchdog
  needed the same treatment as medic even though the doc named only one of them.
- **Does the blurred-window idle cost justify a focus gate on the pulse?** Decided upfront rather
  than measured-then-decided (a deliberate deviation from "a perf claim comes with a number"):
  both the pulse and the rotation are gated on window focus unconditionally, because a
  permanently-running animation on a panel that can sit mounted and blurred for hours is exactly
  Phase 36 Theme E's shape regardless of what one measurement says. The number itself stays
  open — see the idle-cost items above.
