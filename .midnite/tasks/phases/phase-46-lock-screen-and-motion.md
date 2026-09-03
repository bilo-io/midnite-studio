# Phase 46 — The lock screen, and a motion policy that holds

[`.midnite/_features.md`](../../_features.md) has three sections. The numbered list became Phases
40–44 and is spent. The **Improvements** list lost #2 to [Phase 36](phase-36-performance-diet.md)
and #1 to [Phase 45](phase-45-leak-audit.md). What is left is Improvements #3 and the whole **Lock
Screen** section — and those two are the same surface, so this phase takes both and empties the
file.

The lock screen is the app's densest animation and its least governed code. `features/screensaver/`
is **1 344 lines across seven files** that **no phase doc has ever named**: a scan of all 45 phase
docs returns zero hits for "lock screen", "screensaver", "weather" or "pills". That is precisely
where the FAB stood before [Phase 35](phase-35-fab-mission-control.md) — built ad hoc, working, and
untracked, which is how it drifts. This phase gives it an owner.

The motion half has the same problem for the same reason. Reduced motion has never been a theme of
its own; it is a *trailing* item on somebody else's phase — [37 F](phase-37-fab-tab-glow.md),
[39 G](phase-39-status-bar-shortcut-rail.md) (still `◐ PARTIAL`) and
[42 F](phase-42-councils-layout.md) each carry it as a final **(S)**. Three phases in a row ending
with the same unfinished small item is not three coincidences; it is a policy with no owner and no
test. The audit below is what that produced.

**What the audit already found, before any work starts.** These are read off the tree today, not
predicted:

- **`@keyframes pill-shimmer` and `.pill-shimmer` are each declared twice** in
  [`styles.css`](../../../packages/app/src/styles.css) — byte-identical rule bodies at **143/152**
  and **539/548** — and the two copies carry **different guards**. The first is
  `@media (prefers-reduced-motion: reduce) { html:not([data-motion='full']) … }`; the second is
  `html[data-motion='reduced'] …`. Later wins, so the effective guard is the second.
- **Two guard dialects coexist across 16 `@keyframes` and 18 guard rules**, and they are not
  equivalent. `html[data-motion='reduced'] .x` matches only a *resolved* attribute;
  `@media (prefers-reduced-motion: reduce) { html:not([data-motion='full']) .x }` honours the OS
  *and* lets an explicit `Motion: full` opt back in.
- **Two hooks write the same `data-motion` attribute, and only one resolves `'system'`.**
  `useMotionPreference` ([`app.tsx:1187`](../../../packages/app/src/app.tsx)) resolves the media
  query to a concrete `'reduced'`/`'full'`. `useAppearanceSync`
  ([`appearance-store.ts:120`](../../../packages/app/src/store/appearance-store.ts)) passes
  `state.motion` through raw, and its own comment says so — *"`motion: 'system'` is resolved by the
  shell itself via its per-effect media queries, so it is passed through rather than pre-resolved
  here"*. The store's default is `'system'`. Which value ends up on `<html>` is therefore
  **effect-order dependent**, and every `html[data-motion='reduced']` guard stops matching if
  `'system'` is the one that lands. Theme E's first job is to observe which it is — this is stated
  as a suspected interaction, not an asserted bug, because it has not been checked in a running DOM.
- **`NeuroCloudBackground` never consults the motion setting.** It takes an `animate` prop
  ([`neuro-cloud-background.tsx:3`](../../../packages/app/src/features/screensaver/neuro-cloud-background.tsx))
  and drives a `requestAnimationFrame` loop from it; the decision lives entirely in the caller. A
  canvas rAF loop is the one animation CSS guards cannot reach.

**Scope guardrails.** **Renderer-only.** Nothing here touches `git-engine`, no new IPC channel, no
main-process change — battery already arrives on the metrics sample and weather is a `fetch`, so the
`shared ◀ git-engine ◀ desktop` boundary is not in play at all. **No new animation.** This phase
governs motion; a phase that adds a fifth glow while writing the motion policy is arguing with
itself. **Reuse before building** — `features/battery/` and `features/finance/` already solve two
of the four Lock Screen items, and the work is wiring, not invention. **No leak work** — Phase 45
owns retention, including the `setInterval` in `Screensaver` and the rAF in the cloud background;
if this phase touches them it is for motion, and it says so.

Effort tags: **S** ≈ an hour or two · **M** ≈ half a day · **L** ≈ a day plus.

## Deliverables

### A — Weather, top centre (M)

`_features.md`: *"Show weather top center"*. The only net-new data source in the phase, and it has
an exact precedent to copy rather than a design to invent.

- [ ] A `packages/app/src/features/weather/` shaped like
      [`features/finance/`](../../../packages/app/src/features/finance/) — `weather-api.ts`
      (transport), `weather-queries.ts` (react-query hooks), `weather-derive.ts` (formatting),
      `weather-store.ts` (the persisted location/unit preference).
- [ ] **Set `staleTime` and `refetchInterval` explicitly.** This is the one trap the finance module
      already documents and it applies verbatim: *"The global default (`app.tsx`) is
      `staleTime: Infinity`, which is wrong for live prices, so every finance query sets its own"*
      ([`finance-queries.ts:7`](../../../packages/app/src/features/finance/finance-queries.ts)).
      Weather is live data behind the same default. Refresh on the order of 15 minutes, not 60
      seconds — it is weather.
- [ ] **Open-Meteo as the provider, and therefore no API key.** Finance carries an `apiKey` and
      gates `enabled` on it for the stock path while the crypto path needs none, so both patterns
      exist in-tree; take the keyless one. A key would need a settings field, a secret store and an
      empty-state, for a widget on a lock screen.
- [ ] Location is a **stored preference with a manual entry**, not silent geolocation. Default to
      unset and render nothing until it is set — an unset widget must be invisible, not an error.
- [ ] Units (°C/°F) follow the same stored preference. One control, next to the location.
- [ ] A settings entry under
      [`settings-pages/screen-lock-page.tsx`](../../../packages/app/src/features/settings/settings-pages/screen-lock-page.tsx),
      using the existing `Field` primitive from
      [`controls.tsx`](../../../packages/app/src/features/settings/settings-pages/controls.tsx) —
      the lock screen's settings already live there and a second page would split them.
- [ ] The query is **gated on the lock screen being open**. `enabled: screensaverOpen` — a network
      request every 15 minutes for a surface nobody is looking at is the exact shape
      [Phase 36 Theme E](phase-36-performance-diet.md) was written about, and Theme F of this phase
      will check it.
- [ ] Fetch failure renders **nothing**, not a broken widget. No retry storm, no error toast: the
      lock screen is ambient.

### B — Battery, bottom right (S) — ✅ DONE (PR #53, 2026-09-03)

`_features.md`: *"Show battery in bottom right"*. Almost entirely reuse — the audit's happiest find.

- [x] Render battery from the **existing** `features/battery/` — `battery-icon.tsx`,
      `battery-device-icon.tsx`, `battery-style.ts` and `battery-panel.tsx` all already ship, and
      `BatteryReadingSchema` is already an optional field on the metrics sample
      ([`domain/metrics.ts:56`](../../../packages/shared/src/domain/metrics.ts)). **No new IPC, no
      new sampling, no new schema.** `LockScreenBatteryWidget` in `lock-screen-widgets.tsx`.
- [x] Resolve the **corner collision**, which is the only real decision in this theme:
      `LockScreenWidgets` already puts `LockScreenSysmonWidget` at `bottom-8 right-8`
      ([`lock-screen-widgets.tsx:31`](../../../packages/app/src/features/screensaver/lock-screen-widgets.tsx)).
      Battery joins that corner **above** the sysmon widget in the same stack rather than displacing
      it — the two are the same kind of thing (machine vitals) and the fintech widget on the left
      keeps the layout balanced. Both now render as two children of Theme D's `bottom-right`
      `LockScreenSlotIsland`, which stacks them with its own `gap-3` and needs neither widget to know
      the other exists.
- [x] Honour the same absent-state rule as the status bar segment: a desktop with no battery renders
      **nothing**, and `BatteryReadingSchema`'s percentage is already documented as *"undefined if
      not battery-powered"*.
- [x] `battery-flash-slow`/`-medium`/`-fast` are already motion-guarded at
      [`styles.css:232`](../../../packages/app/src/styles.css) — in the `html[data-motion='reduced']`
      dialect, so Theme E's unification covers them and this theme must not add a third copy.
      Converted alongside every other guard in Theme E; untouched by this theme itself.

### C — Pills that navigate (M)

`_features.md`: *"Make pills clickable, navigating to the respective view or revealing the terminal,
etc."* The most interesting theme, because the destination is the easy half.

- [ ] The four `PILLS`
      ([`screensaver.tsx:210`](../../../packages/app/src/features/screensaver/screensaver.tsx)) each
      gain a destination, and each already has a real one to go to:
      - `repos` → `setActiveView('repos')`
      - `agents` → close the lock screen and reveal the terminal panel
      - `myPrs` / `teamPrs` → `setActiveView('reviews')`
- [ ] They become **buttons, not `<span>`s** — keyboard-reachable, with a focus ring and an
      `aria-label` that reads the count and the destination together. A clickable `<span>` on the
      one surface a user reaches by keyboard is not acceptable.
- [ ] **The click must not be swallowed.** `LockScreen`'s root div carries an `onClick` that either
      dismisses the screensaver or opens the passcode pad
      ([`lock-screen.tsx:71`](../../../packages/app/src/features/screensaver/lock-screen.tsx)), and a
      keydown listener on `window` does the same. `LockScreenWidgets` already shows the pattern —
      `pointer-events-none` on the container, `pointer-events-auto` on each island, and a
      `stopPropagation` on the wrapper. Follow it; do not add a second mechanism.
- [ ] **Intent must survive the passcode pad.** With `requirePasscode` on, clicking a pill has to
      unlock *first* and navigate *after* — so the destination is held while `PasscodeUnlockDialog`
      runs and applied in `onUnlock`, and **dropped on `onCancel`**. A navigation that fires after a
      cancelled unlock is a lock-screen bypass, and it is the one thing in this phase that must not
      ship wrong.
- [ ] Navigating **closes the screensaver** via `setScreensaverOpen(false, false)`
      ([`ui-store.ts:883`](../../../packages/app/src/store/ui-store.ts)) and then calls
      `setActiveView`, which already maintains the title bar's back/forward stack
      ([`ui-store.ts:987`](../../../packages/app/src/store/ui-store.ts)) — so the pill's jump is
      undoable by the existing Back button for free.
- [ ] A pill whose count is **zero** still navigates. "0 my PRs" going to Reviews is correct; a
      disabled control that looks live is worse than an empty destination.

### D — The corner layout becomes data (S) — ✅ DONE (PR #53, 2026-09-03)

Three hard-coded `absolute` positions across two files, and this phase adds two more surfaces to
them. Make the slots declared before that happens, not after.

- [x] A single slot map, `lock-screen-slots.tsx` *(new)* — `top-left`, `top-centre`, `top-right`,
      `bottom-left`, `bottom-right` — replacing the inline `absolute bottom-8 left-8` /
      `bottom-8 right-8` pairs (`lock-screen-widgets.tsx`) and the clock's own inline block
      (`lock-screen-chrome.tsx`). `top-centre` is declared and unused in this batch — Theme A (not
      in this batch) is its first consumer.
- [x] `LockScreen`'s existing `corners` prop
      ([`lock-screen.tsx:34`](../../../packages/app/src/features/screensaver/lock-screen.tsx)) is
      already the right seam — this theme fills it properly rather than replacing it. Untouched.
- [x] The `pointer-events-none` container / `pointer-events-auto` island rule becomes a property of
      the slot, so Theme C cannot get it wrong per-widget. `LockScreenSlotIsland` owns
      `pointer-events-auto`; the existing outer `pointer-events-none` wrappers (one in
      `lock-screen-widgets.tsx`, unchanged) are what it renders inside of.
- [x] Keep it a map, **not** a drag-and-drop layout editor. That is a different phase and nobody
      asked for it. `Record<LockScreenSlot, string>` of Tailwind position classes; no runtime
      reordering exists.

### E — The motion audit (M) — ✅ DONE (PR #53, 2026-09-03)

The findings in the framing, resolved. This is the theme the last three phases each punted.

- [x] **Observe which value actually lands on `<html>`, confirmed.** `useMotionPreference`
      (`app.tsx`) and `useAppearanceSync` (`appearance-store.ts`) both wrote the attribute
      unconditionally; `useAppearanceSync` runs second (declaration order in `App()`) and passed the
      literal `state.motion` through — so on the default `'system'` preference, `data-motion`
      literally read `'system'`, matching **none** of this file's `html[data-motion='reduced']`
      guards regardless of the OS setting. Fixed at the source: both writers now resolve `'system'`
      via a shared `resolveSystemMotion()` (`appearance-store.ts`) before it ever reaches
      `applyMotion`, and `useMotionPreference`'s OS listener now no-ops once the stored preference is
      an explicit `'full'`/`'reduced'` — the two writers agree instead of racing. Two new unit tests
      (`appearance-store.test.ts`) confirmed to fail against the unfixed code first.
- [x] **One dialect, everywhere.** Standardised on
      `@media (prefers-reduced-motion: reduce) { html:not([data-motion='full']) .x }` across every
      guard this phase found in the old `html[data-motion='reduced']` form (14 rules, `styles.css`).
      **One exception, left alone on purpose:** `panel-stack-pane`'s guard (Phase 42) already carries
      *both* forms as a deliberate belt-and-suspenders pair — its own comment explains why the plain
      form is still load-bearing for "explicit `Motion: reduced` while the OS itself prefers full
      motion," a real combination the pure `@media` form cannot reach (an `@media` block never
      evaluates its contents unless the OS condition is independently true, however
      `data-motion` reads). That is prior art from a different phase's PR, not a gap this pass
      introduced — left untouched rather than re-litigated.
- [x] **Deleted the duplicated `pill-shimmer` block** (byte-identical `@keyframes` + `.pill-shimmer`
      at old lines 143/152 and 567/579, two different guards). `.tab-loop-shimmer` still resolves the
      keyframe by name against the one remaining declaration.
- [x] **`NeuroCloudBackground` now consults the motion setting itself** via a new `useResolvedMotion()`
      hook (`appearance-store.ts`) — live against OS changes while the stored preference is
      `'system'`, ANDed with the existing `animate` prop rather than replacing it.
      `screensaver.tsx`'s own `animateBackground={motion !== 'reduced'}` — which had the identical
      'system'-treated-as-full-motion bug — is deleted; the component no longer needs the caller to
      resolve this correctly on its behalf.
- [x] Walked the other rAF users: [`spinner.tsx`](../../../packages/app/src/components/spinner.tsx)
      reads the live OS query directly (`window.matchMedia`, bypassing `data-motion` entirely) — it
      does not have this phase's bug (no `'system'` ever reaches it) but it also does not let an
      explicit `Motion: full` override the OS, an inconsistency with the rest of the app's posture.
      Noted rather than fixed: it is a minor, narrow effect (a loading spinner) and changing an
      imperative rAF component's motion source is a large enough shift in shape to deserve its own
      pass rather than a drive-by in this phase.
      [`use-reveal.ts`](../../../packages/app/src/components/use-reveal.ts)'s `motionMs()` reads
      `data-motion` directly (`=== 'reduced'`), so it inherited the **same bug** this theme just
      fixed — every size-tweened panel in the app (terminal, session list, repos sidebar) is a real,
      previously-silent beneficiary of the `useAppearanceSync` fix above, not just the lock screen.
      `screensaver-host.tsx`'s coalescer is an activity-timeout re-armer, not an animation — recorded
      as audited, left alone.
- [x] Audited all keyframes against the guard rules — table below, in the same convention
      [Phase 45](phase-45-leak-audit.md) Theme B's sweep used, and in the PR description: every
      keyframe is now guarded except `shake`, allowlisted in Theme F's own test with its reason (a
      single ~0.4s shake on an invalid action, never a loop).

#### The keyframes table

| Keyframe | Verdict | Guard |
|---|---|---|
| `pill-shimmer` | GUARDED | `@media` dialect (already correct pre-phase; its byte-identical duplicate, with a second, non-firing guard, is deleted) |
| `repo-row-shimmer` | GUARDED | Converted to `@media` this phase |
| `battery-flash-{slow,medium,fast}` | GUARDED | Converted to `@media` this phase |
| `shake` | **UNGUARDED, allowlisted** | Single ~0.4s run on an invalid action, never a loop |
| `code-preview-hit-fade` | GUARDED | Already `@media`; widened to the full `html:not([data-motion='full'])` form this phase |
| `screensaver-sheen` | GUARDED | Converted to `@media` this phase |
| `breadcrumb-spin` | GUARDED | Converted to `@media` this phase (via `.breadcrumb-repo-pill`) |
| `landing-slide-out` / `landing-slide-in` | GUARDED | Converted to `@media` this phase |
| `fab-panel-spin` | GUARDED | `.gradient-frame` — already `@media`-adjacent; unified this phase |
| `fab-glow-pulse` | GUARDED | `.gradient-frame::before` — same rule as `fab-panel-spin` |
| `loop-glow-spin` / `loop-glow-pulse` | GUARDED | `.loop-run-glow` — converted to `@media` this phase |
| `card-glow-pulse` | GUARDED | `.card-run-glow.is-running` — converted to `@media` this phase |
| `fab-halo-pulse` | GUARDED | `.fab-loop-halo` — converted to `@media` this phase |
| `loop-launcher-pulse` | GUARDED | `.loop-launcher`/`.loop-launcher.is-running.is-pulsing` — converted to `@media`, specificity arithmetic preserved |
| `graph-lane-glow` / `graph-rail-glow` | GUARDED | Already correct `@media` dialect pre-phase |
| `[data-activity]` (`caret-blink`/`dot-wave`/spinner glyphs) | GUARDED | Converted to `@media` this phase |

`.panel-stack-pane` (Phase 42) is transition-driven, not `@keyframes`-driven, and carries its own
deliberate two-form guard — audited, out of this table's scope, left unchanged (see Theme E above).
- [x] **[Phase 39 Theme G](phase-39-status-bar-shortcut-rail.md)'s motion remainder is closed by
      this fix.** That item's own root cause — a reduced-motion rule losing on specificity — was
      already fixed in PR #7; what stayed open was the same class of "does `'system'` actually
      resolve" question this theme answers for the whole app. See `done.md`.

### F — A guard that can't be forgotten (S) — ✅ DONE (PR #53, 2026-09-03)

The highest-leverage item here, and the reason the phase is worth writing rather than fixing the
CSS in a drive-by. Three phases ended with an unfinished motion item because nothing failed when
they did.

- [x] A test over [`styles.css`](../../../packages/app/src/styles.css) asserting **every
      `@keyframes` name is either referenced by a motion-guarded rule or listed in an explicit
      allowlist with a reason**. Model it on
      [`components/icons/icon-names.test.ts`](../../../packages/app/src/components/icons/icon-names.test.ts),
      which does exactly this job for `react-icons/lu` names and is the in-repo precedent for
      "a convention with a test behind it". `styles-motion-guards.test.ts`, reading the stylesheet
      through the existing `virtual:midnite-styles-raw` module (`vitest.config.ts`) rather than a
      glob, since Vitest stubs a CSS import's content regardless of a `?raw` query.
- [x] The allowlist entries carry their reason **in the test file**, so adding one is a visible
      decision rather than a silent skip. One entry: `shake`.
- [x] A second assertion catching the duplicate class that Theme E deletes: **no `@keyframes` name
      declared twice**. That is the bug this phase found by reading, and a two-line test means the
      next one is found by CI.
- [ ] Also assert the **query gating** Theme A relies on — that the weather query is not enabled
      when the lock screen is closed. Phase 36 Theme E's absence assertions are the model: a test
      that fails the day someone removes the gate.

### G — Verification and screenshots (S)

- [ ] Playwright shots of the lock screen in **both motion modes** and both themes, following the
      existing screenshot specs' conventions.
- [ ] Note the known hazard before adding shots: `outstanding.md` records that **screenshot PNGs are
      not byte-reproducible** and a full `app:e2e` run rewrites ~40 committed images. Commit only
      this phase's shots and `git checkout --` the rest.
- [ ] Specs press **`ControlOrMeta`, never a hard-coded `Meta`** — the Phase 38 lesson that cost a
      shard 22 minutes.
- [ ] Unit tests alongside the existing
      [`lock-screen-widgets.test.tsx`](../../../packages/app/src/features/screensaver/lock-screen-widgets.test.tsx)
      and `screensaver-host.test.ts`, covering: pill → destination mapping, the cancelled-passcode
      case from Theme C, weather's unset-location empty state, and battery's absent state.

## Files this phase touches

| Path | Why |
|---|---|
| [`features/screensaver/screensaver.tsx`](../../../packages/app/src/features/screensaver/screensaver.tsx) | `PILLS` gain destinations and become buttons (C); clock moves into a slot (D) |
| [`features/screensaver/lock-screen.tsx`](../../../packages/app/src/features/screensaver/lock-screen.tsx) | Click/keydown must not swallow pill clicks; unlock carries a pending destination (C) |
| [`features/screensaver/lock-screen-widgets.tsx`](../../../packages/app/src/features/screensaver/lock-screen-widgets.tsx) | The slot map (D); battery joins the right stack (B); weather lands top-centre (A) |
| [`features/screensaver/neuro-cloud-background.tsx`](../../../packages/app/src/features/screensaver/neuro-cloud-background.tsx) | The canvas rAF loop learns the motion setting (E) |
| [`features/screensaver/passcode-pad.tsx`](../../../packages/app/src/features/screensaver/passcode-pad.tsx) | `onUnlock`/`onCancel` carry the deferred navigation (C) |
| `features/weather/` *(new)* | The only net-new module (A) |
| [`features/battery/`](../../../packages/app/src/features/battery/) | Reused as-is; no change expected (B) |
| [`features/settings/settings-pages/screen-lock-page.tsx`](../../../packages/app/src/features/settings/settings-pages/screen-lock-page.tsx) | Location + units fields (A) |
| [`styles.css`](../../../packages/app/src/styles.css) | One guard dialect; the duplicate block deleted (E) |
| [`store/appearance-store.ts`](../../../packages/app/src/store/appearance-store.ts) · [`app.tsx`](../../../packages/app/src/app.tsx) | Whichever of the two `data-motion` writers is wrong (E) |
| [`store/ui-store.ts`](../../../packages/app/src/store/ui-store.ts) | Read-only: `setActiveView`, `setScreensaverOpen` (C) |

## Verification

- [ ] `moon run :typecheck :lint :test` green.
- [ ] Weather renders top-centre with a location set, renders nothing without one, and its query is
      **not enabled** while the lock screen is closed.
- [ ] Battery renders bottom-right on a laptop and renders nothing on a machine without one.
- [ ] Each pill navigates to its destination and closes the lock screen; the title bar's Back button
      returns to the previous view.
- [ ] With a passcode set: a pill click opens the pad, navigates **only** after a correct code, and
      navigates **not at all** after a cancel.
- [ ] Every pill is reachable and activatable by keyboard, with a visible focus ring.
- [ ] With OS reduced-motion on and `Motion: system`, the lock screen is still: no shimmer, no
      typewriter, no cloud animation, no battery flash.
- [ ] With `Motion: full` and OS reduced-motion on, animation runs — the explicit override still
      wins.
- [ ] The Theme F test fails when a `@keyframes` is added without a guard or an allowlist entry
      (prove it by adding one, watching it fail, then reverting).
- [ ] `grep -c "@keyframes" styles.css` finds no duplicated names.
- [ ] Screenshots committed for this phase only; no unrelated PNG churn in the diff.

## Not in this phase

- **Memory leaks.** [Phase 45](phase-45-leak-audit.md) owns retention, including the
  `setInterval` in `Screensaver` and the cloud background's rAF loop.
- **Broader accessibility.** Motion is an a11y concern and this phase takes it; contrast, focus
  order across the whole app, and screen-reader labelling outside the lock screen are not scoped
  here. The scan is right that a11y has no owner — that is a phase, and it is not this one.
- **Responsive layout / breakpoints.** [Phase 42 Theme B](phase-42-councils-layout.md) records that
  the app has no breakpoint mechanism at all. Out of scope; noted so the next phase can claim it.
- **A drag-and-drop lock-screen layout editor.** Theme D stops at a declared slot map.
- **New animation of any kind.** The phase writes the motion policy; it does not add to the pile.
- **Anything in `git-engine`, `desktop` or `shared`.** Renderer-only, by construction.

## Decisions / open questions

- **Settled — renderer-only, no new IPC.** Battery is already on the metrics sample and weather is a
  `fetch`; nothing here needs main. This is what makes the phase safe to run alongside the open
  Phase 38/40 work.
- **Settled — Open-Meteo, keyless.** Both an API-keyed path and a keyless one already exist in
  `features/finance/`; a lock-screen widget does not justify a secret.
- **Settled — the weather query is gated on the lock screen being open.** An ungated 15-minute
  poll for an unseen surface is exactly what Phase 36 Theme E measured and removed.
- **Settled — the `@media` dialect wins.** It is the only one that honours the OS *and* respects an
  explicit `Motion: full`.
- **Settled — a cancelled passcode drops the pending navigation.** Anything else is a lock bypass.
- **Open — does battery stack above the sysmon widget, or replace it?** *Recommendation:* stack
  above, in the same bottom-right island. They are both machine vitals, the fintech widget balances
  the left corner, and displacing a working widget to satisfy a one-line feature request is a bad
  trade. Revisit if the corner looks crowded once it is on screen.
- **Open — should the weather widget be clickable too, like the pills?** *Recommendation:* no. There
  is no in-app destination for it, and a widget that looks interactive and does nothing is worse
  than a static one.
- **Open — does Theme E's dialect conversion belong in this phase or in a standalone CSS pass?**
  *Recommendation:* here. The conversion is only safe with Theme F's test landing beside it, and
  splitting them recreates the exact pattern — an unenforced motion item on somebody else's
  phase — that this phase exists to end.
- **Open — should the `styles.css` guard test run in the e2e suite or the unit suite?**
  *Recommendation:* unit. It reads a file and parses it; it needs no browser, and the e2e suite is
  under repair in [Phase 38](phase-38-e2e-suite-repair.md) and should not grow while that is true.
- **Open — is `screensaver-host.tsx`'s rAF coalescer in scope for the motion audit?**
  *Recommendation:* no — record it as audited and leave it. It coalesces activity events to re-arm
  a timeout; it animates nothing, and Phase 36 Theme E deliberately built it that way.
