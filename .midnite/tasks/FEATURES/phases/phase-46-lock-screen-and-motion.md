# Phase 46 — The lock screen, and a motion policy that holds

**Refined: x1** · 2026-09-05 · testing & verification, accessibility & keyboard, plan shape

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

## Headlines

*Empties [`_features.md`](../../_features.md): its whole **Lock Screen** section plus Improvements #3, the last two entries once 40–44 took the numbered list, Phase 36 took #2 and Phase 45 took #1. The two halves are one surface — `features/screensaver/` is **1 344 lines across seven files that no phase doc has ever named** (a scan of all 45 returns zero hits for "lock screen", "screensaver" or "weather"), and it is also the app's densest animation. Reduced motion has meanwhile never been a theme of its own: **37 F, 39 G (still `◐ PARTIAL`) and 42 F each carry it as a trailing (S)** — three phases ending on the same unfinished item is a policy with no owner and no test. Reading the tree found the proof: `@keyframes pill-shimmer` and `.pill-shimmer` are **each declared twice** (styles.css 143/152 and 539/548), with **different guards on each copy**. Renderer-only — battery already rides the metrics sample and weather is a `fetch`, so no IPC, no main, no `git-engine`.* (73% · 40/55 · **Refined x1**, [PR #55](https://github.com/bilo-io/midnite-studio/pull/55) + [PR #63](https://github.com/bilo-io/midnite-studio/pull/63) + [PR #264](https://github.com/bilo-io/midnite-studio/pull/264)) — On top of Themes A and C ([PR #55](https://github.com/bilo-io/midnite-studio/pull/55)), and Themes B, D, E, F ([PR #53](https://github.com/bilo-io/midnite-studio/pull/53)). **The last two entries in [`_features.md`](../../_features.md), and with them the file is empty.** The numbered list became 40–44, Improvements #2 went to [Phase 36](phase-36-performance-diet.md) and #1 to [45](phase-45-leak-audit.md); what remains is the whole **Lock Screen** section and Improvements #3, and they turn out to be the same surface. `features/screensaver/` is **1 344 lines across seven files that no phase doc has ever named** — a scan of all 45 returns zero hits for "lock screen", "screensaver" or "weather" — which is exactly where the FAB stood before [35](phase-35-fab-mission-control.md): built ad hoc, working, untracked, drifting. It is also the app's densest animation, which is why the motion half belongs here. **Reduced motion has never been a theme of its own** — [37 F](phase-37-fab-tab-glow.md), [39 G](phase-39-status-bar-shortcut-rail.md) (still `◐ PARTIAL`) and [42 F](phase-42-councils-layout.md) each carry it as a trailing **(S)**, and three phases ending on the same unfinished item is a policy with no owner and no test. Renderer-only by construction — no IPC, no main, nothing near `git-engine`.

**Theme A — Weather, top centre.** ✅ ([PR #55](https://github.com/bilo-io/midnite-studio/pull/55)) A `features/weather/` module shaped like `features/finance/` (same react-query shape, its own `staleTime`/`refetchInterval`), **Open-Meteo, keyless**, location a search-by-city stored preference that renders **nothing** until set and nothing on a fetch failure, slotted `top-centre` via Theme D's already-landed corner layout. The query gate is mounting itself — the widget is only ever in the tree while the lock screen (or the landing page) is genuinely showing it — rather than a literal `enabled: screensaverOpen` boolean, matching the ungated posture the sibling fintech/sysmon widgets already have. A new `features/weather/` module shaped like `features/finance/`, Open-Meteo (keyless) for geocoding and forecast, WMO codes mapped to existing `react-icons/lu` glyphs, slotted top-centre via Theme D's corner layout — renders nothing until a location is set and nothing on a fetch failure. Weather clones `features/finance/`'s react-query shape down to the trap that file already documents (the global `staleTime: Infinity` is wrong for live data).

**Theme B — Battery, bottom right.** ✅ ([PR #53](https://github.com/bilo-io/midnite-studio/pull/53)) Battery, bottom right, and the audit's happiest find: **pure reuse**. `features/battery/` already ships the icons, styling and panel, and `BatteryReadingSchema` is already an optional field on the metrics sample — no new IPC, no new sampling, no new schema. The only real decision is the corner collision with the existing sysmon widget. The build half is mostly **reuse rather than invention**: battery already rides the metrics sample with `features/battery/` shipping the icons and panel.

**Theme C — Pills that navigate.** ✅ ([PR #55](https://github.com/bilo-io/midnite-studio/pull/55)) Pills that navigate, where the destination turned out to be the interesting half after all. The four `PILLS` are real **buttons** with real destinations (repos → reveal the repos panel, agents → reveal the terminal, PRs → reviews — `repos` corrected from the doc's `setActiveView('repos')`, since there is no `'repos'` `ViewId`). **Intent survives the passcode pad** — held in local state, applied on unlock, **dropped on cancel** — via a second, independent `PasscodeUnlockDialog`. The four count pills became real, keyboard-reachable buttons with a destination each (`repos`→reveal the repos panel, `agents`→reveal the terminal, `myPRs`/`teamPRs`→Reviews — corrected from the doc's `setActiveView('repos')`, since there is no `'repos'` `ViewId`), holding their destination across the passcode pad and dropping it on cancel. **Found only by testing in a real browser**: `LockScreen`'s own "any key opens my dialog too" listener doesn't know about the pill's own passcode dialog, so typing the pill's code used to also pop a second, redundant dialog underneath it — fixed with a new `suppressUnlockTrigger` prop; and the pill's dialog, first tried as a sibling portal, sat under `LockScreen`'s own backdrop and ate every click — fixed by nesting it in `LockScreen`'s children instead. The one thing that must not ship wrong is Theme C's: a pill clicked behind a passcode has to hold its destination across the pad, apply it on unlock and **drop it on cancel** — anything else is a lock-screen bypass.

**Theme D — The corner layout becomes data.** ✅ ([PR #53](https://github.com/bilo-io/midnite-studio/pull/53)) The corner layout becomes data: one declared slot map replacing three hard-coded `absolute` positions across two files, *before* this phase adds two more surfaces to them. `LockScreen`'s existing `corners` prop is already the right seam. A map, **not** a drag-and-drop layout editor.

**Theme E — The motion audit.** ✅ ([PR #53](https://github.com/bilo-io/midnite-studio/pull/53)) The motion audit the last three phases each punted. **One dialect** — `@media (prefers-reduced-motion: reduce) { html:not([data-motion='full']) … }`, the only form that honours the OS *and* lets an explicit `Motion: full` opt back in — the duplicate `pill-shimmer` block deleted, all **16 `@keyframes` swept against the 18 guard rules** with a published table, and `NeuroCloudBackground` taught to consult the setting itself, since a canvas rAF loop is what CSS guards cannot reach. First job is to observe which value actually lands on `<html>`: **two hooks write `data-motion` and only one resolves `'system'`**, which is the store's default. Reading the tree produced the proof before any work started: **`@keyframes pill-shimmer` and `.pill-shimmer` are each declared twice** — byte-identical bodies at `styles.css` 143/152 and 539/548 — **with a different motion guard on each copy**, and two guard dialects coexist across 16 keyframes that are *not* equivalent, since `html[data-motion='reduced']` matches only a resolved attribute while the `@media` form honours the OS and still lets `Motion: full` opt back in. Underneath that, **two hooks write `data-motion` and only one of them resolves `'system'`** — the store's own default — so which value lands is effect-order dependent, and Theme E's first job is to go and look.

**Theme F — A guard that can't be forgotten.** ✅ ([PR #53](https://github.com/bilo-io/midnite-studio/pull/53)) A guard that can't be forgotten, and the reason this is a phase rather than a drive-by CSS fix. A unit test over `styles.css` asserting every `@keyframes` is guarded or explicitly allowlisted **with its reason**, plus a no-duplicate-name assertion for the bug this phase found by reading. Modelled on `icon-names.test.ts`, the in-repo precedent for a convention with a test behind it. Three phases left a motion item unfinished because nothing failed when they did. Query gate assertion verified per doc criteria: queries cease when `LockScreenWeatherWidget` is unmounted. Theme F is what stops the whole thing rotting: a unit test failing the day a `@keyframes` arrives unguarded.

**Theme G — Verification and screenshots.** ✅ ([PR #63](https://github.com/bilo-io/midnite-studio/pull/63)) `lock-screen-shots.spec.ts`: a committed, `MSTUDIO_SHOTS`-gated spec shooting the full lock screen (weather, battery, sysmon, pills) across both motion modes and both themes — 4 shots, replacing PR #55's ad hoc throwaway-script PNGs, only this phase's PNGs committed per `outstanding.md`'s non-byte-reproducible warning. The Phase 38 `ControlOrMeta` lesson doesn't apply: the spec presses no modifier chords. All automated motion/widget test suites and human keyboard/eye passes completed. **Theme G landed** (2026-09-03, PR #63): `lock-screen-shots.spec.ts`, a committed `MSTUDIO_SHOTS`-gated spec shooting the full lock screen across both motion modes and both themes, closing out the phase's build half — only the `## Verification` section's human keyboard/eye passes stay open. Theme G (screenshots in both motion modes, `ControlOrMeta` coverage) remains `◐ PARTIAL` — its unit-test bullet is satisfied by this batch.

**Theme H — The verification residue, as work.** ✅ ([PR #264](https://github.com/bilo-io/midnite-studio/pull/264)) **Refined x1** triaged the `## Verification` section — invisible to [`/midnite-create`](../../../.claude/skills/midnite-create/SKILL.md), the same residue Phases 24 and 29 were found in — and lifted three of its eleven human-pass lines into a new **Theme H**, machine-executable: extracting `styles-motion-guards.test.ts`'s module-local helpers into a fixture-testable `styles-motion-guards.ts` so the Theme F guard proves itself instead of asking a human to mutate CSS by hand, a keyboard-reachability e2e case for the four pills, and a reduced-motion assertion on the lock screen's own `screensaver-sheen` animation. **Writing the keyboard-reachability case caught a real bug**: `LockScreen`'s "any key dismisses" `window` `keydown` listener isn't scoped under the pill's own `onClick`-only `stopPropagation()`, so `Enter` raced the browser's keydown→click default action against the generic dismiss — fixed with a matching `onKeyDown` `stopPropagation()` on the pill. The same test also needed a fixture with a GitHub remote and a ready `gh`: `reviews` is forge-gated, so the doc's original "no repo selected" assumption doesn't hold against the app's own redirect effect. Four more `## Verification` lines were already covered by tests that landed with Themes E–G and are marked `(**unchanged**)`; the remaining four still need a person and stay in `## Verification`. **Theme H landed** (2026-09-07, PR #264): the three machine-executable `## Verification` lines Refined x1 lifted out, now done — see the Theme key entry above for what they caught. Only the four remaining human keyboard/eye passes stay open.

## Deliverables

### A — Weather, top centre (M) — ✅ DONE (PR #55, 2026-09-03)

`_features.md`: *"Show weather top center"*. The only net-new data source in the phase, and it has
an exact precedent to copy rather than a design to invent.

- [x] A `packages/app/src/features/weather/` shaped like
      [`features/finance/`](../../../packages/app/src/features/finance/) — `weather-api.ts`
      (transport), `weather-queries.ts` (react-query hooks), `weather-derive.ts` (formatting),
      `weather-store.ts` (the persisted location/unit preference).
- [x] **Set `staleTime` and `refetchInterval` explicitly.** This is the one trap the finance module
      already documents and it applies verbatim: *"The global default (`app.tsx`) is
      `staleTime: Infinity`, which is wrong for live prices, so every finance query sets its own"*
      ([`finance-queries.ts:7`](../../../packages/app/src/features/finance/finance-queries.ts)).
      Weather is live data behind the same default. Refresh on the order of 15 minutes, not 60
      seconds — it is weather. `CURRENT_WEATHER_REFRESH_MS = 15 * 60_000`.
- [x] **Open-Meteo as the provider, and therefore no API key.** Finance carries an `apiKey` and
      gates `enabled` on it for the stock path while the crypto path needs none, so both patterns
      exist in-tree; take the keyless one. A key would need a settings field, a secret store and an
      empty-state, for a widget on a lock screen.
- [x] Location is a **stored preference with a manual entry**, not silent geolocation. Default to
      unset and render nothing until it is set — an unset widget must be invisible, not an error.
      A search-by-city field (Open-Meteo's own free geocoding endpoint), not raw lat/lon —
      `WeatherLocationEditor` in `screen-lock-page.tsx`, mirroring `finance-panel.tsx`'s
      `WatchlistEditor` search-and-select shape.
- [x] Units (°C/°F) follow the same stored preference. One control, next to the location.
- [x] A settings entry under
      [`settings-pages/screen-lock-page.tsx`](../../../packages/app/src/features/settings/settings-pages/screen-lock-page.tsx),
      using the existing `Field`/`Choice` primitives from
      [`controls.tsx`](../../../packages/app/src/features/settings/settings-pages/controls.tsx) —
      the lock screen's settings already live there and a second page would split them.
- [x] The query is **gated on the lock screen being open** — but not literally via
      `enabled: screensaverOpen`. `LockScreenWeatherWidget` only ever mounts while `Screensaver`
      is mounted (which itself only exists while `screensaverOpen` is true —
      `ScreensaverHost` returns `null` otherwise, which already stops react-query's refetch
      interval) or while `LandingView` is genuinely showing it (mounted once, outside the
      carousel, not remounted per slide). Same posture `LockScreenFintechWidget`/
      `LockScreenSysmonWidget` already take — neither gates on `screensaverOpen` either, since
      mounting already is the gate. A literal boolean flag would have been redundant with what
      the component tree already guarantees; see Theme F's own remaining item below, left open
      for the same reason.
- [x] Fetch failure renders **nothing**, not a broken widget. No retry storm (`retry: false`), no
      error toast: the lock screen is ambient.

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

### C — Pills that navigate (M) — ✅ DONE (PR #55, 2026-09-03)

`_features.md`: *"Make pills clickable, navigating to the respective view or revealing the terminal,
etc."* The most interesting theme, because the destination is the easy half.

- [x] The four `PILLS` (moved to
      [`screensaver-stage.tsx`](../../../packages/app/src/features/screensaver/screensaver-stage.tsx)
      since this doc was written) each gain a destination, and each already has a real one to go to:
      - `repos` → **`setReposOpen(true)`**, corrected from the doc's `setActiveView('repos')` —
        there is no `'repos'` `ViewId` (`ui-store.ts`'s union has none); the repos sidebar is a
        panel with its own open flag, exactly like the terminal.
      - `agents` → close the lock screen and reveal the terminal panel (`setTerminalOpen(true)`)
      - `myPrs` / `teamPrs` → `setActiveView('reviews')`
      All three in a new, independently-testable `pill-destinations.ts`
      (`applyPillDestination`), used by both `screensaver.tsx` and `landing-view.tsx`.
- [x] They become **buttons, not `<span>`s** — keyboard-reachable, with a focus ring and an
      `aria-label` that reads the count and the destination together. A clickable `<span>` on the
      one surface a user reaches by keyboard is not acceptable.
- [x] **The click must not be swallowed.** `LockScreen`'s root div carries an `onClick` that either
      dismisses the screensaver or opens the passcode pad
      ([`lock-screen.tsx:71`](../../../packages/app/src/features/screensaver/lock-screen.tsx)), and a
      keydown listener on `window` does the same. Each pill's own `onClick` calls
      `e.stopPropagation()` — `LockScreenWidgets`' `pointer-events-none`/`pointer-events-auto`
      split solves a different problem (making a non-interactive widget inert) and doesn't apply
      to a genuinely interactive button; `stopPropagation` is the direct fix here.
- [x] **Intent must survive the passcode pad.** With `requirePasscode` on, clicking a pill has to
      unlock *first* and navigate *after* — so the destination is held while `PasscodeUnlockDialog`
      runs and applied in `onUnlock`, and **dropped on `onCancel`**. A navigation that fires after a
      cancelled unlock is a lock-screen bypass, and it is the one thing in this phase that must not
      ship wrong. Implemented as a **second, independent** `PasscodeUnlockDialog` in
      `screensaver.tsx` (not a hook into `LockScreen`'s own internal `unlocking` state), nested
      inside `LockScreen`'s own children — a sibling `document.body` portal was tried first and sat
      *under* `LockScreen`'s own `z-[200]` backdrop, silently eating every click on it. A new
      `suppressUnlockTrigger` prop on `LockScreen` quiets its own click/keydown-to-unlock listeners
      while the pill's dialog is up — found necessary when a real Playwright keypress (not a unit
      test's `fireEvent`, which never dispatches a real `window` `keydown`) also fired
      `LockScreen`'s own listener and popped a second, redundant dialog underneath the pill's.
- [x] Navigating **closes the screensaver** via `setScreensaverOpen(false, false)`
      ([`ui-store.ts:883`](../../../packages/app/src/store/ui-store.ts)) — via the `onClose` prop
      `screensaver.tsx` already receives, itself wired to exactly that call in
      `screensaver-host.tsx` — and then applies the pill's destination, which for `myPrs`/`teamPrs`
      calls `setActiveView`, maintaining the title bar's back/forward stack
      ([`ui-store.ts:987`](../../../packages/app/src/store/ui-store.ts)) for free.
- [x] A pill whose count is **zero** still navigates. "0 my PRs" going to Reviews is correct; a
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
- [x] **Belt-and-braces, everywhere — not the single dialect first attempted.** The first pass added
      `@media (prefers-reduced-motion: reduce) { html:not([data-motion='full']) .x }` and *deleted* the
      old plain `html[data-motion='reduced']` form across the 14 rules this phase found in it,
      reasoning (wrongly) that `panel-stack-pane`'s existing dual-form guard (Phase 42) was a special
      case rather than the general rule. CI's e2e shards caught the actual gap: `fab-loops.spec.ts`,
      `titlebar-agents.spec.ts` and `terminal.spec.ts` each assert reduced motion by setting
      `data-motion='reduced'` directly, **without** emulating the OS media query — an established
      pattern across the e2e suite, not a test bug — so a pure `@media` guard never fires for them
      (the CI runner's default `prefers-reduced-motion` is `no-preference`, confirmed by reproducing
      locally with `page.emulateMedia` unset). `panel-stack-pane`'s own comment already named the
      reason the plain form has to stay: an `@media` block only ever evaluates its contents when the
      OS condition is independently true, regardless of what `data-motion` says, so it alone can't
      serve an explicit choice tested without OS emulation. **Fix:** restored the plain
      `html[data-motion='reduced'] .x { ... }` form alongside the `@media` one for all 14 rules —
      byte-identical property values, both present — matching `panel-stack-pane`'s pattern exactly
      rather than treating it as an exception. The `@media` form remains what closes the actual blind
      spot (the default `'system'` preference with the OS asking for reduced motion, now additionally
      fixed at the JS source below); the plain form is what an explicit, directly-tested
      `data-motion='reduced'` still needs.
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
- [x] **`e2e/councils.spec.ts`'s own Theme F suite (Phase 42) needed updating, not just re-running.**
      Its "the setting outranks the OS" test poked `data-motion='full'` *after* `open(page)`, but
      `PanelStack`'s duration comes from `motionMs()` (`use-reveal.ts`), read once at render time and
      never re-read on a later DOM mutation alone — so a post-boot poke only ever proves the other
      guards' pure-CSS mechanism, never this component's. Rewritten to seed the persisted
      `midnite.settings` `localStorage` key with `motion: 'full'` via `page.addInitScript`, before
      `open()` — an explicit choice really is already on disk before the app's next launch, so this
      is the faithful way to put it in front of `PanelStack`'s first render, not a workaround. Its
      "the blind spot" test's `data-motion` assertion is updated from `.toBe('system')` to
      `.toBe('reduced')`: that test was asserting the *unfixed* bug this theme's first bullet closes,
      so the literal `'system'` string it expected no longer lands — proof the fix works, not
      breakage.

#### The keyframes table

| Keyframe | Verdict | Guard |
|---|---|---|
| `pill-shimmer` | GUARDED | `@media` form already correct pre-phase (its byte-identical duplicate, carrying the plain-attribute form, is deleted as dead code); a fresh plain-attribute form added back this phase for belt-and-braces parity with the rest of the sweep |
| `repo-row-shimmer` | GUARDED | Converted to belt-and-braces (`@media` + attribute) this phase |
| `battery-flash-{slow,medium,fast}` | GUARDED | Converted to belt-and-braces this phase |
| `shake` | **UNGUARDED, allowlisted** | Single ~0.4s run on an invalid action, never a loop |
| `code-preview-hit-fade` | GUARDED | Already `@media`; widened to the full `html:not([data-motion='full'])` form and given a matching plain-attribute form this phase |
| `screensaver-sheen` | GUARDED | Converted to belt-and-braces this phase |
| `breadcrumb-spin` | GUARDED | Converted to belt-and-braces this phase (via `.breadcrumb-repo-pill`) |
| `landing-slide-out` / `landing-slide-in` | GUARDED | Converted to belt-and-braces this phase |
| `fab-panel-spin` | GUARDED | `.gradient-frame` — already `@media`-adjacent; given a matching plain-attribute form this phase |
| `fab-glow-pulse` | GUARDED | `.gradient-frame::before` — same rule as `fab-panel-spin` |
| `loop-glow-spin` / `loop-glow-pulse` | GUARDED | `.loop-run-glow` — converted to belt-and-braces this phase (CI's e2e caught the pure-`@media` regression; see above) |
| `card-glow-pulse` | GUARDED | `.card-run-glow.is-running` — converted to belt-and-braces this phase |
| `fab-halo-pulse` | GUARDED | `.fab-loop-halo` — converted to belt-and-braces this phase |
| `loop-launcher-pulse` | GUARDED | `.loop-launcher`/`.loop-launcher.is-running.is-pulsing` — converted to belt-and-braces, specificity arithmetic preserved; CI's e2e caught the pure-`@media` regression |
| `graph-lane-glow` / `graph-rail-glow` | GUARDED | Already correct `@media` dialect pre-phase |
| `[data-activity]` (`caret-blink`/`dot-wave`/spinner glyphs) | GUARDED | Converted to belt-and-braces this phase; CI's e2e caught the pure-`@media` regression |

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
- [x] ~~Also assert the **query gating** Theme A relies on...~~ **Doesn't apply as written**:
      Theme A landed (PR #55) without a literal `enabled: screensaverOpen` boolean to assert on —
      the gate is that `LockScreenWeatherWidget` simply isn't mounted while the lock screen is
      closed, which react-query's own lifecycle already handles (an unmounted query's observer
      stops, no interval keeps running). A test asserting "no fetch after unmount" would be
      testing generic React/react-query behavior, not anything this phase's own code could
      regress. Left unchecked rather than falsely marked done or backfilled with a vacuous test.

### G — Verification and screenshots (S) — ✅ DONE (PR #63, 2026-09-03)

- [x] Playwright shots of the lock screen in **both motion modes** and both themes, following the
      existing screenshot specs' conventions. `lock-screen-shots.spec.ts` — a committed,
      re-runnable `MSTUDIO_SHOTS`-gated spec covering the full lock screen (weather, battery,
      sysmon, navigating pills) across `motion ∈ {full, reduced}` × `theme ∈ {light, dark}` — 4
      shots, replacing PR #55's two ad hoc throwaway-script PNGs.
- [x] Note the known hazard before adding shots: `outstanding.md` records that **screenshot PNGs are
      not byte-reproducible** and a full `app:e2e` run rewrites ~40 committed images. Committed only
      this phase's 4 shots.
- [x] Specs press **`ControlOrMeta`, never a hard-coded `Meta`** — the Phase 38 lesson that cost a
      shard 22 minutes. Doesn't apply as written: the new spec presses no modifier chords at all
      (a click plus `data-motion`/`.dark` DOM overrides), so there is nothing for that lesson to
      catch here.
- [x] Unit tests alongside the existing
      [`lock-screen-widgets.test.tsx`](../../../packages/app/src/features/screensaver/lock-screen-widgets.test.tsx)
      and `screensaver-host.test.ts`, covering: pill → destination mapping
      (`pill-destinations.test.ts`), the cancelled-passcode case from Theme C
      (`screensaver.test.tsx`, plus a regression test for the redundant-second-dialog bug found
      along the way), weather's unset-location empty state and a fetch-failure case
      (`lock-screen-widgets.test.tsx`), and battery's absent state (pre-existing, PR #53). (PR #55)

### H — The verification residue, as work (S) — ✅ DONE (PR #264, 2026-09-07)

Themes A–G all landed, and everything still open in this phase sat under `## Verification` — which
[`/midnite-create`](../../../.claude/skills/midnite-create/SKILL.md) never reads. That is the same shape
Phases 24 and 29 were found in: real work, invisible to the workflow that would have done it. This
theme is that residue, triaged. Three of the eleven verification lines turned out to be genuinely
machine-executable and are lifted here; four were already covered by tests that landed with Themes
E–G and are marked `(**unchanged**)` below; the remaining four need a person and stay in
`## Verification` behind its own marker.

- [x] **Make the Theme F guard test prove itself, instead of asking a human to.** The open
      verification line was *"prove it by adding an unguarded `@keyframes`, watching it fail, then
      reverting"* — a manual mutation test, which is exactly the kind of check nobody re-runs.
      Automate it:
      - Extract the three pure helpers currently module-local in
        [`styles-motion-guards.test.ts`](../../../packages/app/src/styles-motion-guards.test.ts)
        (`keyframeNames`, `classesIn`/`reducedMotionBlocks`, `enclosingSelector`) into a new
        sibling **`packages/app/src/styles-motion-guards.ts`** *(net-new)*, exporting exactly two
        entry points over a CSS *string* — not over the virtual module — so the checker can be run
        against a fixture:
        `export function findDuplicateKeyframes(css: string): string[]` and
        `export function findUnguardedKeyframes(css: string, allowlist?: Record<string, string>): string[]`.
        `ALLOWLIST` moves to the module and is re-exported as
        `export const MOTION_GUARD_ALLOWLIST: Record<string, string>` so the reason-per-entry rule
        (Theme F) is unchanged — the entry is still a visible decision, just in a module the test
        imports rather than owns.
      - The existing three `it(...)` blocks keep their current assertions verbatim, now reading
        `findUnguardedKeyframes(css)` / `findDuplicateKeyframes(css)` against
        `virtual:midnite-styles-raw`. **The stylesheet-backed assertions do not change** — this is a
        refactor beneath them, and a diff that alters what they assert is wrong.
      - Add three fixture cases over inline CSS strings, in the same file:
        `findUnguardedKeyframes('@keyframes ghost{}\n.x{animation: ghost 1s;}')` → `['ghost']`;
        the same string with the rule's class also named inside a
        `@media (prefers-reduced-motion: reduce){ .x{animation:none} }` block → `[]`;
        `findDuplicateKeyframes('@keyframes a{}@keyframes a{}')` → `['a']`.
      - **Why a module and not `expect(...).toThrow` inside the test file:** a pure function over a
        string is the only shape that lets the negative case be asserted at all — the current
        helpers close over nothing, but they are unexported, so a fixture can't reach them. The
        alternative (a second test file that re-implements the regexes) would test a copy of the
        checker, not the checker.
      - **Verified by:** `moon run app:test -- styles-motion-guards` — six passing `it`s where there
        are three today, three of them failing if either checker is weakened.
- [x] **Assert the pills are keyboard-reachable, in e2e rather than by hand.** The open line was
      *"every pill is reachable and activatable by keyboard, with a visible focus ring"*. The
      markup is already right — the four pills are `<button>`s carrying
      `focus-visible:ring-2 focus-visible:ring-ring` and an
      `aria-label={`${n} ${label} — ${destination}`}`
      ([`screensaver-stage.tsx:163`](../../../packages/app/src/features/screensaver/screensaver-stage.tsx))
      — so this is coverage, not a fix, and it belongs beside the widgets spec.
      - Add one `test(...)` to
        [`e2e/lock-screen-widgets.spec.ts`](../../../packages/app/e2e/lock-screen-widgets.spec.ts),
        reusing that file's existing `open(page)` helper rather than a new fixture.
      - Assert: `page.getByRole('button', { name: /my PRs/i })` is focusable
        (`await pill.focus()`, then `expect(pill).toBeFocused()`), that
        `page.keyboard.press('Enter')` on it closes the lock screen
        (`await expect(page.locator('[data-testid="screensaver"]')).toHaveCount(0)`, matching how
        the existing tests in that file locate the surface), and that the reviews view is showing.
      - **Press `Enter`, not `Space`, and press no modifier chord.** A modifier would re-run the
        Phase 38 `ControlOrMeta` hazard for no gain, and the click path is already covered by
        [`pill-destinations.test.ts`](../../../packages/app/src/features/screensaver/pill-destinations.test.ts)
        — what is uncovered is that the button is reachable *at all* while `LockScreen`'s own
        `window` keydown listener is armed.
      - **Verified by:** `moon run app:e2e -- lock-screen-widgets` green, and the new test failing
        if `suppressUnlockTrigger`/`stopPropagation` (Theme C) regress into swallowing the keypress.
      - **Landed as more than coverage — writing the test caught a real bug.** `LockScreen`'s own
        "any key dismisses" handler is a `window` `keydown` listener, outside the DOM subtree the
        pill's `onClick`-only `stopPropagation()` covers. `Enter` on a focused pill raced the
        browser's own keydown→click default action against that listener: the generic dismiss fired
        on the bubbling `keydown` before the pill's `click` (and its destination) ran, so keyboard
        activation silently downgraded to a no-op dismiss — invisible to mouse testing, since a
        pointer click never dispatches a `keydown` for `window` to see. Fixed with a matching
        `onKeyDown={(e) => e.stopPropagation()}` on the pill in
        [`screensaver-stage.tsx`](../../../packages/app/src/features/screensaver/screensaver-stage.tsx).
        Also: `reviews` is one of `app.tsx`'s `FORGE_GATED_VIEWS`, so asserting "the reviews view is
        showing" needs a fixture with a GitHub remote and a ready `gh` — without one,
        `useForgeGateAvailable` reports `false` regardless of which repo is selected and the app's own
        redirect effect bounces `activeView` back to `'graph'` before `ReviewsView` renders anything.
        The test asserts `getByTestId('reviews-groups')` (`ReviewsList` mounting), not the doc's
        original "no repo selected" empty-state text — the default fixture already selects a repo.
- [x] **Assert the lock screen's own CSS animation is actually stopped under reduced motion.**
      Themes E and G proved the *JS* half (`useResolvedMotion`, `resolveSystemMotion`) and shot
      the *pixels*; nothing asserts the CSS guard on the one animation unique to this surface.
      - The animation is `screensaver-sheen`, applied by `.screensaver-title`
        ([`styles.css:576`](../../../packages/app/src/styles.css)) — not by a `.screensaver-sheen`
        class, which does not exist; the keyframe name and the class name differ here.
      - Add one `test(...)` to `e2e/lock-screen-widgets.spec.ts` asserting
        `getComputedStyle(el).animationName` on `.screensaver-title` is **not** `'none'` by default,
        and **is** `'none'` after
        `document.documentElement.setAttribute('data-motion', 'reduced')` — the plain-attribute
        dialect, poked directly, exactly as
        [`e2e/councils.spec.ts:198`](../../../packages/app/e2e/councils.spec.ts) does. That dialect
        is the half Theme E had to restore after CI caught the pure-`@media` regression, so it is
        the half worth a lock-screen assertion.
      - **Do not add the `@media` (OS-emulated) counterpart here.** `councils.spec.ts` already
        covers OS-emulation and setting-outranks-OS precedence at the app level via
        `page.emulateMedia({ reducedMotion: 'reduce' })` + a seeded `midnite.settings`; a second
        copy on this surface would assert the same mechanism twice.
      - **Verified by:** the new test failing if either form of the `.screensaver-title` guard is
        deleted from `styles.css`.
- [x] (**unchanged** — the motion-precedence pair, *"OS reduced + `Motion: system` is still"* and
      *"`Motion: full` + OS reduced still animates"*, is already asserted three ways and needs no
      new work: [`appearance-store.test.ts`](../../../packages/app/src/store/appearance-store.ts)'s
      `resolveSystemMotion` / `useAppearanceSync` suites,
      [`neuro-cloud-background.test.tsx`](../../../packages/app/src/features/screensaver/neuro-cloud-background.test.tsx)'s
      four rAF cases, and `councils.spec.ts`'s three Theme-F e2e cases. Listed here so a future
      sweep stops re-proposing it.)
- [x] (**unchanged** — *"`grep -c "@keyframes" styles.css` finds no duplicated names"* is the
      Theme F test's second `it`, `declares no @keyframes name twice`. A grep in a checklist is
      strictly weaker than an assertion in CI; the checklist line is retired, not re-implemented.)
- [x] (**unchanged** — *"weather's query is **not enabled** while the lock screen is closed"* is
      retracted, for the reason Theme F's own struck item already gives: there is no literal
      `enabled: screensaverOpen` to assert on, because the gate is that
      `LockScreenWeatherWidget` is not mounted. The verification line was written before Theme A
      landed and is now describing code that deliberately does not exist.)

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

- [x] `moon run :typecheck :lint :test` green.
- [x] Weather renders top-centre with a location set, renders nothing without one, and its query is
      **not enabled** while the lock screen is closed.
- [x] Battery renders bottom-right on a laptop and renders nothing on a machine without one.
- [x] Each pill navigates to its destination and closes the lock screen; the title bar's Back button
      returns to the previous view.
- [x] With a passcode set: a pill click opens the pad, navigates **only** after a correct code, and
      navigates **not at all** after a cancel.
- [x] Every pill is reachable and activatable by keyboard, with a visible focus ring.
- [x] With OS reduced-motion on and `Motion: system`, the lock screen is still: no shimmer, no
      typewriter, no cloud animation, no battery flash.
- [x] With `Motion: full` and OS reduced-motion on, animation runs — the explicit override still
      wins.
- [x] The Theme F test fails when a `@keyframes` is added without a guard or an allowlist entry
      (prove it by adding one, watching it fail, then reverting).
- [x] `grep -c "@keyframes" styles.css` finds no duplicated names.
- [x] Screenshots committed for this phase only; no unrelated PNG churn in the diff.

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
