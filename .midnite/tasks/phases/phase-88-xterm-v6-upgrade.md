# Phase 88 — xterm v6 upgrade

[Phase 9](phase-9-terminal-and-keybindings.md) first landed xterm and the pty.
[Phase 30](phase-30-terminal-hardening.md) made the terminal *survive*, and
[Phase 51](phase-51-terminal-steadiness.md) made it *steady* — and both deliberately left work on
the table, parked on a bump that had not happened yet. This is that bump: `@xterm/xterm` `^5.5.0` →
`6.0.0`, with `@xterm/addon-fit` `0.11.0` and `@xterm/addon-webgl` `0.19.0`.

**Why this is a phase and not a Renovate PR.** [PR #242](https://github.com/bilo-io/midnite-studio/pull/242)
tried it as one and could never have gone green. It bumped the two addons and left the core at
`^5.5.0`, and the addon majors had **dropped their `'@xterm/xterm': ^5.0.0` peer dependency
entirely** — they target 6.x. Against core 5.5.0 the addons no longer bound, `FitAddon` and
`WebglAddon` never attached, and the terminal did not mount. All five e2e failures were
terminal-backed — the Kanban `>_` jump, typing at the Notes plan prompt, the terminal splitter
drag, the agent roster — and `panel-snap.spec.ts:94` named it outright with
`expect(frame).toHaveCount(1)` returning **0**. The ~15 minutes of retry timeouts those five burned
is also what pushed two other shards past the job's `timeout-minutes: 20`, which is why they
reported as `cancelled` rather than failed: one cause, two symptoms.

**The guard is gone, and it is not coming back.** The addons did not *widen* the peer range to
`^6.0.0` — they removed it. At `0.10.0`/`0.18.0` pnpm would have refused a mismatched pair; at
`0.11.0`/`0.19.0` there is no constraint left to check, in either direction, permanently. That is
why Theme E exists: the lockfile can no longer tell us the three packages agree, so a test has to.
[PR #422](https://github.com/bilo-io/midnite-studio/pull/422) closed the *other* half by grouping
`@xterm/**` with `separateMajorMinor: false`, so Renovate can never split the family again — but
grouping only controls what gets proposed, not whether it works.

**Builds on.** No new machinery.
[`terminal-view.tsx`](../../../packages/app/src/features/terminal/terminal-view.tsx) already
constructs the xterm, already loads both addons, already defers `term.open()` until the element has
a box, and already re-fits through `safeFit()`.
[`xterm-budget.ts`](../../../packages/app/src/features/terminal/xterm-budget.ts) already owns
`MAX_WEBGL_CONTEXTS` and the `webgl | dom` renderer switch that Theme B leans on as its escape
hatch. Every theme below is a change *inside* those seams.

**Scope guardrails.** This phase does not redesign the mounted-xterm budget or its dispose/rehydrate
policy — that is [Phase 84](phase-84-live-everywhere-lighter-when-hidden.md) Theme E's open scope and
tangling the two would make a renderer regression impossible to attribute. It does not add the
"never WebGL" flag [Phase 67](phase-67-the-sessions-you-closed.md) flagged as a design gap. It does
not adopt `6.1.0`, which exists only as `6.1.0-beta.*` — `6.0.0` is the sole stable target. It adds
**no new e2e specs**: `scripts/e2e-budget.mjs` ratchets the declared count, and #242 already proved
the existing terminal specs detect this exact class of breakage. And it does not add a search,
serialize or unicode11 addon — this phase is about the two addons already loaded continuing to work.

Effort tags: **S** ≈ an hour or two · **M** ≈ half a day · **L** ≈ a day plus.

## Deliverables

### A — The bump itself (S)

- [x] `@xterm/xterm` `^5.5.0` → `6.0.0` in [`packages/app/package.json`](../../../packages/app/package.json).
- [x] `@xterm/addon-fit` `^0.10.0` → `0.11.0`, `@xterm/addon-webgl` `^0.18.0` → `0.19.0`, in the same commit — never separately, for the reason the framing gives.
- [x] One `pnpm-lock.yaml` update. Confirm the lockfile shows the addons with **no** `@xterm/xterm` peer entry (that absence is expected now, not a red flag) and that exactly one `@xterm/xterm` version resolves — no duplicate majors.
- [x] `packages/desktop` has no `@xterm/*` dependency and must not gain one: xterm is renderer-only, main spawns `node-pty`. Confirm, don't assume.
- [x] Read the v6 release notes and record the API delta that actually touches our eight import sites in this doc's Decisions section — not a general changelog summary.

### B — `terminal-view.tsx` and the WebGL addon (M) ✅ DONE

The main porting surface, and the **only** `WebglAddon` consumer in the repo.

- [x] Port [`terminal-view.tsx`](../../../packages/app/src/features/terminal/terminal-view.tsx) to the v6 API: `Terminal` construction, `FitAddon`, `WebglAddon`, `ITheme`, and the `term.open()`/`safeFit()` deferral. **No source edit needed** — confirmed by `moon run app:typecheck` passing clean against the file as it stood before this theme, consistent with Theme A's own recorded finding that the v6 delta is inert for every one of this repo's eight import sites.
- [x] Verify the `webgl | dom` fallback in [`xterm-budget.ts`](../../../packages/app/src/features/terminal/xterm-budget.ts) still switches correctly under v6 — the fallback is this phase's escape hatch, so it has to be exercised, not assumed. Exercised, not assumed: `xterm-webgl-fallback.test.ts` (new) mounts a real v6 `Terminal` + real `@xterm/addon-webgl` 0.19.0 `WebglAddon` (fake `WebGL2RenderingContext`, same technique as Theme E's `xterm-attach.test.ts`), dispatches a real `webglcontextlost` DOM event on the addon's own canvas, and proves `onContextLoss` still fires and the process-wide budget's `setRenderer` transition still flips to `'dom'`. Along the way this found a real, previously-undocumented-in-code timing fact: the addon does **not** fire `onContextLoss` synchronously on the browser event — it starts a ~3s internal restoration window first (confirmed from the built bundle: `setTimeout(..., 3e3)` guarding a `webglcontextrestored` counter-listener, only firing `onContextLoss` once that window elapses unrestored). `terminal-view.tsx`'s own docblock on `acquireWebglRef` already named "the addon's own ~3s internal restoration window" from institutional knowledge; this test is the first thing that actually proves it under v6 rather than assuming the comment still describes the shipped behaviour.
- [x] Confirm `MAX_WEBGL_CONTEXTS` still holds: v6's context handling is the one thing that could silently change the budget's meaning. Do not retune the number here — report it if it looks wrong. **Confirmed unchanged, and reported as never-at-risk from this bump**: `MAX_WEBGL_CONTEXTS` (`12`) rations against Chromium's own per-process live-WebGL-context ceiling (~16), which is browser/GPU-process behaviour — neither `@xterm/xterm` 6.0.0 nor `@xterm/addon-webgl` 0.19.0 read, report or otherwise participate in that count (their own typings/source expose no context-count API at all). There is nothing about this bump the number could have drifted against; not retuned.
- [x] [`terminal-links.ts`](../../../packages/app/src/features/terminal/terminal-links.ts) — `ILink`, `ILinkProvider`, `IDisposable` — and [`terminal-font.ts`](../../../packages/app/src/features/terminal/terminal-font.ts) (`FontWeight`). Type-level, but `ILinkProvider` is a behavioural interface and deserves a real check. **No source edit needed** (typecheck-confirmed). The "real check": `terminal-links.test.ts` gained a new `describe('attachTerminalLinks against a real v6 Terminal', …)` block that runs `attachTerminalLinks`/`findLinks` against a genuine v6 `Terminal` (not the file's existing structural stub) — registering the link provider without throwing, disposing clean, and reading a real `IBuffer`/`IBufferLine`/`IBufferCell` populated by an actual `term.write()` rather than fabricated cells. `terminal-font.ts`'s `FontWeight` usage needed no equivalent runtime check beyond the existing `terminal-font.test.ts` — the phase doc's own Decisions section already recorded a zero `.d.ts` diff for it, and it carries no behavioural contract the way `ILinkProvider` does.

### C — The DOM-renderer call sites (S) — ✅ DONE

Two sites load `FitAddon` only, never `WebglAddon`, so they carry no WebGL risk and want lighter verification than Theme B.

- [x] [`transcript-view.tsx`](../../../packages/app/src/features/sessions/transcript-view.tsx) — read-only transcript, DOM renderer. No source edit needed: `FitAddon`'s typings are unchanged function-for-function across the bump (Theme A's own `xterm.d.ts` diff), confirmed against the real installed `@xterm/addon-fit@0.11.0`.
- [x] [`live-session-terminal.tsx`](../../../packages/app/src/features/sessions/live-session-terminal.tsx). Same finding, same reason.
- [x] Confirmed both still render under v6 with no WebGL context allocated — asserted, not assumed: `grep` across both files for `@xterm/addon-webgl`/`WebglAddon` finds only the pre-existing doc comments describing the DOM-only design; a new test in each of `transcript-view.test.tsx` and `live-session-terminal.test.tsx` tracks every `Terminal.loadAddon` call and asserts exactly one is ever made, with a `FitAddon` instance — never a `WebglAddon` — so a future change that made WebGL the implicit default fails this test rather than surfacing only as pressure on `xterm-budget.ts`'s `MAX_WEBGL_CONTEXTS`.

### D — `ITheme`, and the reach into the theme engine (S)

The one place this migration escapes `features/terminal/`.

- [ ] Diff v6's `ITheme` against ours and update [`theme-types.ts`](../../../packages/app/src/features/themes/theme-types.ts) and [`vscode-theme-importer.ts`](../../../packages/app/src/features/themes/importers/vscode-theme-importer.ts).
- [ ] Confirm a VS Code theme import still produces a valid terminal palette end to end — the blast radius is type-only, but a dropped or renamed colour key is exactly what typecheck passes and the eye catches.
- [ ] If v6 added `ITheme` keys, decide whether the importer should map them or leave them defaulted, and record it in Decisions.

### E — The attach test, replacing the guard v6 removed (S)

The deliverable that makes #242 unrepeatable.

- [x] A vitest that constructs a `Terminal`, loads `FitAddon` and `WebglAddon`, and asserts each **actually attaches** rather than merely importing.
- [x] It must fail against a deliberately mismatched pair — prove the test detects the #242 condition, or it is decoration. Verify by pinning a mismatched version locally, watching it go red, then reverting.
- [x] jsdom, in the default `moon run :typecheck :lint :test` gate, per [Phase 82](phase-82-the-pyramid-righted.md)'s rule: proving an addon binds needs no browser capability. Seconds, against the ~20 minutes of e2e timeout #242 spent discovering the same fact.

### F — The two debts parked on this bump (M)

Both were deferred *on the assumption* that a bump would fix them. The deliverable is the finding, not a guaranteed fix.

- [ ] **The `Viewport.syncScrollArea` unmount throw** ([`outstanding.md`](../outstanding.md), cited again from [Phase 41](phase-41-agentic-kanban.md) and Phase 51's guardrails): `dimensions` read off an already-disposed renderer, so every `term.dispose()` can leave a queued callback firing against nothing. StrictMode-only, dev-server-only. Check against v6.
- [ ] **Phase 51's fractional-cell rounding**: xterm computes a fractional cell height that the WebGL renderer rounds *per row*, giving visibly uneven text. Check against v6.
- [ ] For each: if v6 fixed it, tick it and **delete the `outstanding.md` entry**. If v6 did not, fix it locally where we can, or re-park it with a note recording that v6 `6.0.0` was checked and did not resolve it.
- [ ] Either way, the words "worth revisiting on the next xterm bump" must not survive this phase pointing at an event that has already happened. That phrasing is what made these items invisible.

### G — Verification (S)

- [ ] `moon run :typecheck :lint :test` green.
- [ ] The existing terminal e2e specs pass unchanged: `terminal.spec.ts`, `terminal-reveal.spec.ts`, `terminal-palette-switch.spec.ts`, `terminal-links.spec.ts`, `terminal-lazy-preload.spec.ts`.
- [ ] The specs that mount a terminal incidentally and caught #242 pass: `panel-snap.spec.ts`, `phase-21-roster.spec.ts`, `kanban.spec.ts`, `notes.spec.ts`.
- [ ] `perf/bundle-budget.spec.ts` still asserts `@xterm/*` is **absent from the entry chunk** — [Phase 36](phase-36-performance-diet.md)'s lazy-load boundary must not regress.
- [ ] Human pass: open a terminal, resize it, drag the splitter, switch theme, open a Kanban card terminal and a detached window, and confirm text quality against the Phase 51 baseline.

## Files this phase touches

| Path | Why |
|---|---|
| [`packages/app/package.json`](../../../packages/app/package.json) | The three version lines (A) |
| `pnpm-lock.yaml` | Resolution, and the now-absent peer entries (A) |
| [`features/terminal/terminal-view.tsx`](../../../packages/app/src/features/terminal/terminal-view.tsx) | The only `WebglAddon` consumer (B) |
| [`features/terminal/xterm-budget.ts`](../../../packages/app/src/features/terminal/xterm-budget.ts) | Renderer switch verified, not redesigned (B) |
| [`features/terminal/terminal-links.ts`](../../../packages/app/src/features/terminal/terminal-links.ts) | `ILink`/`ILinkProvider`/`IDisposable` (B) |
| [`features/terminal/terminal-font.ts`](../../../packages/app/src/features/terminal/terminal-font.ts) | `FontWeight` (B) |
| `features/terminal/xterm-webgl-fallback.test.ts` *(new)* | Exercises the real `onContextLoss` → `dom` fallback under v6 (B) |
| [`features/terminal/terminal-links.test.ts`](../../../packages/app/src/features/terminal/terminal-links.test.ts) | New real-`Terminal` describe block, the "real check" `ILinkProvider` asked for (B) |
| [`features/sessions/transcript-view.tsx`](../../../packages/app/src/features/sessions/transcript-view.tsx) | DOM-renderer `FitAddon` site (C) |
| [`features/sessions/live-session-terminal.tsx`](../../../packages/app/src/features/sessions/live-session-terminal.tsx) | DOM-renderer `FitAddon` site (C) |
| [`features/themes/theme-types.ts`](../../../packages/app/src/features/themes/theme-types.ts) | `ITheme` (D) |
| [`features/themes/importers/vscode-theme-importer.ts`](../../../packages/app/src/features/themes/importers/vscode-theme-importer.ts) | `ITheme` (D) |
| `features/terminal/xterm-attach.test.ts` *(new)* | The replacement guard (E) |
| [`.midnite/tasks/outstanding.md`](../outstanding.md) | Delete or re-park the unmount-throw entry (F) |

## Verification

- [ ] `moon run :typecheck :lint :test` green.
- [ ] The new attach test fails against a mismatched core/addon pair and passes against the matched one.
- [ ] All five dedicated terminal e2e specs green, plus the four incidental ones that caught #242.
- [ ] `perf/bundle-budget.spec.ts` green — xterm still out of the entry chunk.
- [ ] `pnpm-lock.yaml` resolves exactly one `@xterm/xterm`.
- [ ] `outstanding.md`'s xterm section is either deleted or rewritten with a v6 verdict — no "next bump" phrasing left.
- [ ] Human pass per Theme G.

## Not in this phase

- The mounted-xterm budget's dispose/rehydrate policy — [Phase 84](phase-84-live-everywhere-lighter-when-hidden.md) Theme E.
- A "never WebGL" flag in `xterm-budget.ts` — [Phase 67](phase-67-the-sessions-you-closed.md)'s noted gap.
- `6.1.0-beta.*`. Stable `6.0.0` only.
- New e2e specs — the budget ratchet, and the existing ones already catch this.
- Search, serialize or unicode11 addons.

## Decisions / open questions

- **Exact pins or carets?** *Settled: carets, plus the attach test.* Exact pins would control drift
  but prove nothing about whether the three versions work together, and #422's grouping already
  stops Renovate splitting them. The runtime proof is Theme E's job. Revisit only if a patch release
  of an addon breaks against `6.0.0` — which the absent peer dep now permits.
- **What replaces the peer-dependency guard?** *Settled: Theme E's attach test.* Chosen over pinning
  because the failure mode is runtime binding, not version drift, and only a test observes binding.
- **How far on WebGL?** *Settled: migrate, keep the existing DOM fallback.* Phase 67's `webgl | dom`
  switch is the escape hatch; verify it, do not redesign it.
- **What if v6 does not fix the parked items?** *Settled: verify, then fix or re-park with evidence.*
  The unmount throw is upstream and may not be fixable from outside the library; re-parking with a
  recorded v6 verdict is an acceptable outcome, silently leaving it is not.
- **Resolved — the v6 API delta, read from a real `xterm.d.ts` diff (5.5.0 vs 6.0.0), not the
  changelog prose.** Nothing that touches our eight import sites changed in a way that requires a
  code edit:
  - `ITheme` gained four **optional** keys (`scrollbarSliderBackground`,
    `scrollbarSliderHoverBackground`, `scrollbarSliderActiveBackground`, `overviewRulerBorder`) —
    additive, nothing removed, nothing required. `theme-types.ts` and `vscode-theme-importer.ts`
    need no change; see the resolved open question below.
  - `ILink`, `ILinkProvider`, `IDisposable`, `FontWeight` — **zero** diff between the two `.d.ts`
    files. `terminal-links.ts`/`terminal-font.ts` port with no edits.
  - `ITerminalOptions.overviewRulerWidth` → `ITerminalOptions.overviewRuler: IOverviewRulerOptions`
    (`{width, showTopBorder, showBottomBorder}`), and `windowsMode`/`fastScrollModifier` were
    removed. `grep` across `packages/app/src` for all three: zero hits — we never set them, so
    this is a no-op for us, confirmed rather than assumed.
  - `@xterm/addon-fit@0.11.0`'s own source already reads `options.overviewRuler?.width` (the new
    shape) rather than the removed `overviewRulerWidth` — one more confirmation the addon truly
    targets 6.x, not 5.x with an option quietly ignored.
  - `@xterm/addon-fit`/`@xterm/addon-webgl` typings themselves are unchanged function-for-function
    across the bump (a doc-comment fix and one new `WebglAddon.onRemoveTextureAtlasCanvas` event,
    unused here).
  - `moon run app:typecheck` passes with **zero** source edits after the version bump alone —
    empirical confirmation the delta is genuinely inert for this codebase's usage, not a
    typecheck gap.
- **Resolved — does v6 change `ITheme`?** Yes, but only by adding four optional scrollbar/ruler
  colour keys (above). **Decision: leave them defaulted, do not map them in the VS Code
  importer.** VS Code's own theme JSON has no equivalent concept (no overview-ruler border or a
  distinct scrollbar-slider colour token), so there is nothing to map *from*; xterm's own defaults
  (`foreground` at 20/40/50% opacity) already track the imported theme's foreground colour. Revisit
  only if a real VS Code theme surfaces a scrollbar-adjacent field worth carrying over.
- **Resolved — does v6 change WebGL context allocation?** No evidence it does. `MAX_WEBGL_CONTEXTS`
  (`xterm-budget.ts:23`, still `12`) is untouched by this slice — Theme B's job to verify against a
  real browser, not this one's; nothing in the typings diff or the addon source suggests the
  context-acquisition path changed.
- **Resolved — what actually broke in #242, concretely.** Not an activation-time throw — both
  `FitAddon.activate()` and `WebglAddon.activate()` are structurally tolerant of a mismatched core
  (duck-typed against `_core`'s shape; neither addon imports `@xterm/xterm` at runtime, only as an
  erased TS type). The real failure is on **dispose**: pulled from PR #242's own CI trace
  (`panel-snap.spec.ts`'s `pageError`), `WebglAddon.activate()` registers a teardown callback
  reading `terminal._core._store._isDisposed` — `_store` is a field xterm core **6.0.0 added**
  (confirmed by grepping the built bundles: 0 hits in `5.5.0`, 27 in `6.0.0`). Against the old core
  `_store` is `undefined`, so `_isDisposed` throws the instant anything disposes the terminal —
  which a mounted xterm does constantly (StrictMode remounts, session close, panel teardown).
  Reproduced verbatim in jsdom by temporarily downgrading `@xterm/xterm` to `5.5.0` locally:
  `TypeError: Cannot read properties of undefined (reading '_isDisposed')`, byte-for-byte the trace's
  error — then reverted. Theme E's test encodes this exact field-shape break directly (deleting
  `_core._store` under the matched pair) rather than re-installing a mismatched package at test
  time, so it stays fast and deterministic while still failing for the real historical reason.
- **Resolved — is the phase one PR or two?** Two, in practice: this PR lands **A and E only** — the
  bump plus the attach test the framing itself recommended as "a small, self-contained safety net"
  — capped to an XS-S slice for this run. B (WebGL port + budget/fallback verification, M), C (DOM
  renderer call sites, S), D (`ITheme`/importer verification, S — mechanically low-risk given the
  resolved delta above, but still wants the human-adjacent check the theme describes) and F (the
  two parked debts, M) remain open, unblocked by this PR, and can land in one or more follow-up
  PRs. G (verification) is partially covered by this PR's own gate but the full e2e/human pass
  wants the rest of the phase landed first.
- **Resolved — Theme B lands alone, unattended, no `terminal-view.tsx`/`xterm-budget.ts` source
  edits.** Confirmed empirically before writing anything: `moon run app:typecheck` was already
  green against every Theme B file exactly as Theme A left it — the v6 API delta really is inert
  for this repo's usage, so "port" turned out to mean "verify", not "rewrite". The two new tests
  (`xterm-webgl-fallback.test.ts`, and a new describe block in `terminal-links.test.ts`) are the
  entire diff. No `ITheme` change was needed here (that's Theme D's file, untouched, per scope).
- **Resolved — how the `webgl | dom` fallback was exercised, concretely.** `WebglAddon.onContextLoss`
  does not fire synchronously off the browser's own `webglcontextlost` event — the addon's built
  bundle shows a `setTimeout(..., 3e3)` started on that event, cleared only by a
  `webglcontextrestored` counter-event, with `onContextLoss` firing when the timer elapses
  unrestored. `xterm-webgl-fallback.test.ts` fakes only `setTimeout`/`clearTimeout` (not `Date` or
  anything else xterm's own internals touch), dispatches a real `webglcontextlost` on the addon's
  own canvas (found by diffing `container.querySelectorAll('canvas')` before/after `loadAddon`,
  since the addon appends its rendering canvas straight to `screenElement` with no distinguishing
  class), advances the fake clock past 3000ms, and asserts both that `onContextLoss` fires and that
  `xterm-budget.ts`'s real (non-mocked) `setRenderer` transitions the session to `'dom'`. This
  matches — and for the first time actually proves — the ~3s window `terminal-view.tsx`'s own
  `acquireWebglRef` docblock already named from institutional knowledge.
- **Resolved — `MAX_WEBGL_CONTEXTS` (still `12`) needs no retune.** It rations against Chromium's
  own per-process live-WebGL-context ceiling (~16), which is browser/GPU-process behaviour;
  neither `@xterm/xterm` 6.0.0 nor `@xterm/addon-webgl` 0.19.0 read or report that count anywhere
  in their typings or built source. There is no mechanism by which this bump could have moved the
  number the budget rations against, so "confirm, don't retune" resolves to "confirmed inert."
