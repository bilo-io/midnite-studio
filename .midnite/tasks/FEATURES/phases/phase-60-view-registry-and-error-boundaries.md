# Phase 60 — A window that never goes blank

**Refined: x1** · 2026-11-17 · testing & verification, file-map precision, per-item acceptance criteria, sequencing & dependencies

> **Audit 2026-11-17 — what moved since this was written.** The framing below is the 2026-09
> snapshot and is kept as the record of why the phase exists; read these corrections first.
> - `EmptyState`, `Skeleton` and `DelayedFallback` now live in the frame
>   ([`packages/frame/src/layout/`](../../../packages/frame/src/layout/), Phase 113 Themes M/N/C).
>   `packages/app/src/components/{empty-state,skeleton,delayed-fallback}.tsx` are one-line
>   re-exports of `@midnite/studio-frame` and stay valid import paths.
> - `sessions` is **no longer a `Placeholder`** — Phase 67 Themes C–E (#209) built the real view
>   (`@midnite/studio-feature-sessions/renderer`), and it is `global: true` in
>   [`view-registry.tsx`](../../../packages/app/src/components/view-registry.tsx). The `video` view
>   is now `media`. The global set has grown to 18 ids; `view-registry.test.ts` pins the exact set.
> - `FirstRunModal` and `OnboardingModal` were folded into one `SetupOverlay` (#600). The silent
>   boundaries in [`app.tsx`](../../../packages/app/src/app.tsx) today are `Issue`, `Setup` and
>   `Slides`; `boot.tsx` also wraps the whole app in a root `ErrorBoundary label="Midnite Studio"`.
> - `graph` (rail label **Timeline**) is a Phase 84 Theme G keep-alive view: it mounts in its own
>   slot whose `resetKey` is the constant `viewId`, so a throw there clears only through **Try
>   again**, not by navigating away and back. Every other view keeps the `resetKey={activeView}`
>   behaviour this phase specified.
> - Line numbers quoted below (`app.tsx:1312`, `:472`, `:1531` …) are stale; search by symbol.

Small on purpose: three themes, twenty-six items, and no new dependency, no new IPC channel and
no new user-facing surface. It is the phase that makes the sixteen views this app already has
*fail well* — because right now not one of them can.

Three facts, each checkable in a minute, and together they are one problem:

1. `grep -rn "ErrorBoundary|componentDidCatch|getDerivedStateFromError" packages/app/src` returns
   **nothing**, and [`app.tsx`](../../../packages/app/src/app.tsx) has **18 `lazy()` calls**. A
   render throw anywhere in `CouncilsView`, `ProjectsView` or `VideoView` — or a chunk that 404s
   after an in-place `desktop:dist` reinstall replaces the bundle under a live window — blanks the
   entire window. The app ships `Mod+r`/`Mod+Shift+r` precisely because it is Electron and a reload
   is sometimes the answer; a blank window is how a user finds that out.
2. The view switch is a **17-branch ternary** at [`app.tsx:1312–1357`](../../../packages/app/src/app.tsx),
   sitting beside three per-`ViewId` records that already do this job declaratively — `VIEW_ICON`
   ([`components/nav-icons.ts`](../../../packages/app/src/components/nav-icons.ts)), `VIEW_COMMAND`
   ([`components/nav-chords.ts`](../../../packages/app/src/components/nav-chords.ts)) and
   `SETTINGS_PAGES` ([`store/ui-store.ts:181`](../../../packages/app/src/store/ui-store.ts)).
   [`ui-store.ts:1818`](../../../packages/app/src/store/ui-store.ts) makes the argument against the
   ternary out loud — *"its own list means a view cannot be added to `ViewId` and forgotten here"* —
   and the ternary is exactly the forgettable list. It is how `sessions` ended up on the
   `Placeholder` branch, and how `Placeholder` ended up still pointing users at a `todo/` directory
   that has not existed since the tracker moved to `.midnite/tasks/`.
3. Six views render **no empty state, no skeleton and no error branch at all** — `dashboard`,
   `tests`, `history`, `video`, `files`, `changes` — while both primitives already exist and are
   good ([`components/empty-state.tsx`](../../../packages/app/src/components/empty-state.tsx), 20
   consumers; [`components/skeleton.tsx`](../../../packages/app/src/components/skeleton.tsx), 18
   consumers, with a docstring that already settles *which one when*). Only **3** files in the whole
   renderer touch `isError`, against **28** `useQuery` call sites.

They reinforce each other, which is why they are one phase and not three. The record from (2) is
the insertion point for the boundary in (1) — a per-view boundary keyed on the view id is one line
in a lookup and unwriteable in a ternary chain. And a boundary is the *last* resort, so (3) is what
keeps it from being the *first*: an error state a view renders itself says what failed, where a
boundary can only say that something did.

**Builds on.**
- [`components/empty-state.tsx`](../../../packages/app/src/components/empty-state.tsx) —
  `EmptyState({ icon?, title, body?, bodySize? })`. Already the house "nothing to show" card.
- [`components/skeleton.tsx`](../../../packages/app/src/components/skeleton.tsx) — `Skeleton`,
  and a docstring that already resolves skeleton-vs-spinner and reduced motion. **Do not re-argue
  it in this phase; cite it.**
- [`components/delayed-fallback.tsx`](../../../packages/app/src/components/delayed-fallback.tsx) —
  `DelayedFallback({ delayMs = 120 })`, the Suspense fallback every lazy boundary already uses. The
  error boundary is its sibling, and sits immediately outside it.
- [`store/ui-store.ts`](../../../packages/app/src/store/ui-store.ts) — `ViewId`, `VIEW_IDS`,
  `pathForView`/`viewForPath`. The domain of the new record, and the reason it can be exhaustive.
- [`components/nav-icons.ts`](../../../packages/app/src/components/nav-icons.ts) — `VIEW_ICON`, the
  exact shape the new record copies: one `Record<ViewId, …>` literal, exhaustive by its own type.

**Scope guardrails.**
- **No new view is built.** `sessions` stays on `Placeholder` in this phase — it is named
  explicitly rather than reached by fallthrough, which is the whole point, but building it is
  someone else's phase.
- **No new IPC channel and no new dependency.** The boundary reports to `console.error` and to a
  copy-to-clipboard affordance in its own fallback. A renderer→main error channel is a real idea
  and is out of scope — see Decision 3.
- **No visual redesign.** Every state added in Theme C is `EmptyState`/`Skeleton` as they already
  render. A view that already has a good state keeps it untouched.
- **The ternary's ordering rule survives, as data.** `landing`, `settings`, `councils`,
  `workflows` and `video` must remain reachable *before* the `!selectedRepoId` guard. In the record
  that becomes a `global: true` flag; it must not become positional trivia in a different shape.
- **`packages/app` only.** Nothing here touches `shared`, `git-engine` or `desktop`.

Effort tags: **S** ≈ an hour or two · **M** ≈ half a day · **L** ≈ a day plus.

## Headlines

*Sixteen views, eighteen `lazy()` calls and zero error boundaries — one render throw blanks the window. Collapses `app.tsx`'s 17-branch view ternary into an exhaustive `VIEW_COMPONENT` record, hangs a resettable boundary off it, and applies the existing `EmptyState`/`Skeleton` primitives to the six views that render none of the three states.* (85% · 29/34) — **A, B, C landed in #170 (2026-09-05); five items remain.** Three facts that are one problem. Deliberately small — 34 items, three themes, `packages/app` only, no new dependency, no new IPC channel, no new surface.

**Audit — 2026-11-17.** Re-checked every open item against main: **1 ticked as landed** (the `ViewId` typecheck probe — `VIEW_COMPONENT` is annotated `Record<ViewId, ViewEntry>`, and a `tsc --strict` probe of that exact shape fails with TS2741 on a missing key), **0 struck**, **1 human** (the dist-reinstall chunk-404 pass, rewritten as exact steps), **4 refined for sonnet** (the `error-boundary.spec.ts` e2e item; the rail-stays-interactive verification it proves; Copy details, now backed by a vitest plus the e2e clipboard assertion; and a three-file `todo/` docblock sweep with the verification grep narrowed to exclude test fixtures). Item count unchanged at 34. The framing's stale claims (sessions as placeholder, the two retired modals, primitives moved to the frame, the graph keep-alive exception) are corrected in the audit note under the title. Remaining work is all Theme B plus verification — about an hour or two.

**Theme B — landed (2026-11-18).** ✅ `e2e/error-boundary.spec.ts` (2 tests: rail survives a throw and the view remounts fresh on return, with Copy details read back through `window.__mstudioClipboard`; Try again recovers in place), a Copy-details vitest in `error-boundary.test.tsx` with `copyText` mocked, and the three `todo/outstanding.md` docblocks pointed at `.midnite/tasks/outstanding.md`. E2e cap 491 → 493. Only the human dist-reinstall pass remains.

**Theme A — One record, not a seventeen-branch ternary.** ✅ One record, not a ternary: `components/view-registry.tsx`'s `Record<ViewId, ViewEntry>` with a `global` flag replacing the load-bearing branch order, so a new `ViewId` fails typecheck instead of falling through to `Placeholder` (which is also how the stale `todo/` copy gets fixed). The view switch is a 17-branch ternary sitting beside three per-`ViewId` records that already do the job declaratively, which is how `sessions` fell through to a `Placeholder` still pointing users at a `todo/` directory that no longer exists.

**Theme B — A boundary per view.** ✅ A boundary per view: `components/error-boundary.tsx`, reset on `activeView`, an `EmptyState` fallback with Try-again and Copy-details, mounted outside the view `Suspense`, on the three optional modals (silent `null`) and on the detached root. The renderer has **zero** error boundaries against eighteen `lazy()` calls, so one render throw or one 404'd chunk after an in-place reinstall blanks the whole window.

**Theme C — The three states, applied.** ✅ The three states, applied: the error → empty → skeleton → content ordering written down, then applied to `dashboard`, `tests`, `history`, `video`, `files` and `changes`, which carry none of the three today. Six views render no empty, loading **or** error state while both primitives exist with twenty and eighteen consumers.

## Deliverables

### A — One record, not a seventeen-branch ternary (S) — ✅ DONE (PR #170, 2026-09-05)

Land this first; B and C both attach to it.

> **Landed note — the global set is six, not five.** [Phase 59](phase-59-workspace-optimizer.md)
> Theme A shipped `optimizer` as an 18th ternary branch *above* the `!selectedRepoId` guard after
> this doc was written, so `VIEW_COMPONENT` carries `global: true` on **`landing`, `settings`,
> `councils`, `workflows`, `video` and `optimizer`** — six ids, and `view-registry.test.ts` asserts
> that exact set. Treating `optimizer` as repo-scoped to match the doc's five would have been a
> silent regression, not fidelity.

- [x] Add [`packages/app/src/components/view-registry.tsx`](../../../packages/app/src/components/view-registry.tsx)
      — **new.** Export `type ViewEntry = { Component: ComponentType; global?: true }` and
      `export const VIEW_COMPONENT: Record<ViewId, ViewEntry>`, one entry per `ViewId`, in
      `VIEW_IDS` order. The `lazy()` calls move here from
      [`app.tsx`](../../../packages/app/src/app.tsx); `GraphView` stays **eager** (it is first paint —
      the comment at `app.tsx:96` says why) and so does anything else `app.tsx` currently imports
      directly.
- [x] `global: true` on exactly `landing`, `settings`, `councils`, `workflows`, `video` — the five
      the current ternary places above the `!selectedRepoId` guard. The flag's docstring states the
      rule: *a global view renders whether or not a repo is selected; every other view yields to
      `EmptyWorkspace` when `selectedRepoId` is null.*
- [x] Type it as `Record<ViewId, ViewEntry>` and **not** `Partial<…>` — an added `ViewId` must fail
      `moon run :typecheck`, not fall through to a placeholder. That failure mode is the reason this
      theme exists.
- [x] Replace the ternary at [`app.tsx:1312–1357`](../../../packages/app/src/app.tsx) with
      `const { Component, global } = VIEW_COMPONENT[activeView];` then
      `global || selectedRepoId ? <Component /> : <EmptyWorkspace />`. The surrounding
      `<Suspense fallback={<div className={viewBoxClassName}><DelayedFallback /></div>}>` and the
      `key={activeView}` box are **unchanged** — this theme moves the branch, not the frame.
- [x] `sessions` maps to `Placeholder` **explicitly** in the record, with a one-line comment naming
      the phase that will replace it. No `ViewId` reaches `Placeholder` by fallthrough any more,
      because there is no fallthrough.
- [x] Fix `Placeholder`'s stale copy at [`app.tsx:472`](../../../packages/app/src/app.tsx):
      `see <code>todo/</code>` → `see <code>.midnite/tasks/</code>`. The directory it names has not
      existed since the tracker moved, so the app currently points a user at nothing.
- [x] Vitest: `components/view-registry.test.ts` asserts (a) `Object.keys(VIEW_COMPONENT)` equals
      `VIEW_IDS` as a set, and (b) the set of ids with `global === true` is exactly
      `['landing','settings','councils','workflows','video']` — so widening the global set is a
      test change, made deliberately, rather than a silent reorder.

### B — A boundary per view (M) — ✅ DONE (PR #170, 2026-09-05)

One class component, three mount points, and a fallback that is honest about what it does and does
not know.

> **Landed note — `componentDidCatch` reports through Phase 65, not `console.error`.**
> [`eslint.config.mjs:59`](../../../eslint.config.mjs) sets `no-console: 'error'` for
> `packages/app`, so the console call this theme's item specifies would not lint. The suggestion
> predates [Phase 65](phase-65-somewhere-for-a-crash-to-go.md), which landed in the same batch and
> whose Decision 8 names this exact seam: the boundary calls
> `reportError('boundary', error, { componentStack })` from `lib/report.ts`, asserted in
> `error-boundary.test.tsx`.
>
> **`error-boundary.spec.ts` was not written.** The `window.__mstudioTestThrow` hook *does* ship,
> gated behind `import.meta.env.DEV` exactly as Decision 5 recommends, and the RTL spec asserts it
> trips the boundary — but the Playwright spec itself was not authored in this batch, so that item
> and the two verification lines that depend on it stay open.

- [x] Add [`packages/app/src/components/error-boundary.tsx`](../../../packages/app/src/components/error-boundary.tsx)
      — **new.** `export class ErrorBoundary extends Component<ErrorBoundaryProps, { error: Error | null }>`
      with `ErrorBoundaryProps = { children: ReactNode; resetKey?: string | number; label?: string }`,
      implementing `static getDerivedStateFromError(error: Error)` and `componentDidCatch`.
      A class, not a hook — React still offers no hook equivalent, and this is the one place in the
      renderer where that is the correct answer rather than a legacy one.
- [x] `resetKey` clears the caught error: `componentDidUpdate(prev)` sets `{ error: null }` when
      `prev.resetKey !== this.props.resetKey`. The view slot passes `resetKey={activeView}`, so
      navigating away from a broken view and back gives it a fresh attempt without a window reload.
      Without this, one throw poisons the slot for the session.
- [x] The fallback is `EmptyState` — `icon={LuTriangleAlert}` from `react-icons/lu`,
      `title={`${label ?? 'This view'} stopped rendering`}`, `body` = the error's `message`,
      truncated to 200 characters — plus two `IconButton`s: **Try again** (sets `{ error: null }`)
      and **Copy details** (writes `${error.message}\n\n${error.stack}` to the clipboard). No raw
      stack on screen: it is unreadable in a 300px pane and the copy button is what a bug report
      actually needs.
- [x] `componentDidCatch(error, info)` calls `console.error('[view] ' + (this.props.label ?? 'unknown'), error, info.componentStack)`
      and nothing else. **Chosen over an IPC report channel** because there is no renderer→main log
      channel today (`CHANNELS` has none) and adding one is a contract change that would swallow
      this phase; DevTools is where a developer already looks, and Copy-details is where a user's
      report comes from. Revisit as Decision 3.
- [x] Wrap the view slot: `<ErrorBoundary resetKey={activeView} label={ALL_NAV_ITEMS.find(i => i.view === activeView)?.label}>`
      **outside** the existing `<Suspense>` in [`app.tsx`](../../../packages/app/src/app.tsx), so a
      chunk-load rejection surfaces as the boundary's fallback rather than an unresolved promise.
      Outside, not inside — a boundary inside Suspense never sees the lazy import's failure.
- [x] Wrap the three `fallback={null}` Suspense sites the same way, each with its own boundary and
      no `resetKey`: `FirstRunModal` ([`app.tsx:1531`](../../../packages/app/src/app.tsx)),
      `OnboardingModal` ([`app.tsx:1654`](../../../packages/app/src/app.tsx)) and `SlidesModal`
      ([`app.tsx:1661`](../../../packages/app/src/app.tsx)). Their boundaries render `null` on
      error — a modal that fails to load must not paint an error card over the app it was optional
      to; it simply does not appear.
- [x] Wrap [`detached-root.tsx`](../../../packages/app/src/detached-root.tsx)'s root render in the
      same boundary. A detached panel has no rail to navigate away with, so a blank one is a window
      the user can only close — it needs the Try-again button more than the main window does.
- [x] Vitest/RTL: `components/error-boundary.test.tsx` — a child that throws renders the fallback
      and does not propagate; **Try again** re-mounts the child (assert a child that throws once
      then succeeds ends up rendering its content); changing `resetKey` clears the error; the
      `console.error` call is asserted via a `vi.spyOn(console, 'error')` that is also what keeps
      the suite output clean.
- [x] Playwright: extend [`packages/app/e2e/`](../../../packages/app/e2e/) with `error-boundary.spec.ts`
      — navigate to a view, force a throw through a `window.__mstudioTestThrow` hook the boundary
      test-build honours, assert the rail is still interactive and a different view still renders.
      **If the throw hook cannot be added without shipping test code, drop this item** and say so in
      the PR rather than shipping a hook into the product.
      - **Status 2026-11-17: the hook question is settled — build the spec.** `window.__mstudioTestThrow(label, message?)`
        ships in [`components/error-boundary.tsx`](../../../packages/app/src/components/error-boundary.tsx)
        behind `import.meta.env.DEV` (dead-code-eliminated from `desktop:dist`), and the e2e suite
        runs on the Vite **dev** server (`playwright.config.ts` `webServer: pnpm exec vite`), so the
        hook is present there. No product code changes in this item.
      - **New file** `packages/app/e2e/error-boundary.spec.ts`. Header comment names the browser
        capability it needs: *a multi-view flow through the real rail with real lazy chunks* — jsdom
        cannot mount `App`'s rail + view slot + `Suspense` together, which is why the RTL suite
        tests the boundary in isolation.
      - Setup copies [`e2e/history.spec.ts`](../../../packages/app/e2e/history.spec.ts)'s `open()`
        exactly: `installMockBridge(page, fixtures)` (from `../test-support/mock-bridge` and
        `../test-support/fixtures`), `page.goto('/')`, wait for heading `Worktrees`. Navigate with
        that file's **focus + `Enter`** pattern (`page.getByRole('link', { name }).focus();
        page.keyboard.press('Enter')`), not `.click()` — the file documents why a click on a rail
        `<a>` is flaky.
      - **Test 1 — `a throwing view leaves the rail usable and remounts fresh on return`:**
        go to `History`; `await page.evaluate(() => window.__mstudioTestThrow?.('History', 'forced by e2e'))`;
        expect `page.getByRole('alert')` to contain `History stopped rendering` and `forced by e2e`;
        click `page.getByRole('button', { name: 'Copy details' })`, then
        `expect.poll(() => page.evaluate(() => (window as unknown as { __mstudioClipboard: string[] }).__mstudioClipboard.at(-1)))`
        contains `forced by e2e` and `\n\n` (the mock bridge records every `clipboard.writeText`
        in `window.__mstudioClipboard`); go to `Timeline` (the `graph` view) — expect the alert to
        have count 0; go back to `History` — expect the `tablist` named `History` with tab
        `Journal` visible and still no alert (`componentDidCatch` cleared the throw order, and
        `resetKey={activeView}` remounted the slot).
      - **Test 2 — `Try again recovers in place`:** go to `History`, throw as above, click
        `Try again`, expect the `Journal` tab visible and the alert gone — without navigating.
      - **Edge cases the spec must respect:** the label passed to the hook is the rail label
        (`ALL_NAV_ITEMS` → `nav-groups.ts`), so `History`, never `history`; do **not** throw in
        `Timeline` for the navigate-away-and-back assertion — it is the keep-alive slot whose
        `resetKey` never changes (see the audit note), so only Try again recovers it; use a
        non-forge view (History) so the spec does not depend on the fixture's remote.
      - **Budget:** +2 declared tests; `scripts/e2e-budget.mjs` reports 470/490 on main today, so
        `MAX_DECLARED_E2E` does not move. No `waitForTimeout`, no `.screenshot({ path })`. The mock
        bridge spawns no pty, broker or Electron, so no teardown beyond Playwright's own.

### C — The three states, applied (M) — ✅ DONE (PR #170, 2026-09-05)

Not a redesign: the two primitives already exist and their docstrings already settle the rules.
This theme is the checklist of views that never called them.

- [x] Establish the ordering as a written rule in
      [`components/skeleton.tsx`](../../../packages/app/src/components/skeleton.tsx)'s existing
      docstring (extend it; do not start a second one): **error → empty → skeleton → content.**
      Every view below checks in that order. A skeleton must never stand in for a failure, because a
      grey bar that never resolves is indistinguishable from one that is still loading.
- [x] `features/dashboard/dashboard-view.tsx` — 0/0/0 today. Add all three.
- [x] `features/tests/tests-view.tsx` — 0/0/0 today. Add all three.
- [x] `features/history/history-view.tsx` — 0/0/0 today. Add all three.
- [x] `features/video/video-view.tsx` — 0/0/0 today. Add all three.
- [x] `features/files/files-view.tsx` — 0/0/0 today. Add all three.
- [x] `features/workbench/` (the `changes` view) — 0/0/0 today. Add all three.
- [x] For each of the six: the **error** branch reads `useQuery`'s `isError`/`error` and renders
      `EmptyState` with a `title` naming the operation that failed and a `body` carrying
      `error.message`; the **empty** branch renders `EmptyState` with the view's own copy; the
      **loading** branch renders a `Skeleton` shaped like the content it replaces, *not* a spinner —
      per the primitive's own docstring, a spinner belongs where content is already on screen.
- [x] `features/actions/actions-view.tsx` (2 error sites, no empty/skeleton),
      `features/reviews/reviews-view.tsx` (3, has `reviews-skeletons.tsx`) and
      `features/projects/projects-view.tsx` (16) get only what they are missing — do not rewrite
      their existing handling.
- [x] Vitest/RTL: one spec per newly covered view, in the house pattern of
      [`features/landing/landing-view.test.tsx`](../../../packages/app/src/features/landing/landing-view.test.tsx)
      — render with a `QueryClient` seeded to each of the three states and assert the right one of
      the three appears, and that exactly one does.

---

## Files this phase touches

| File | What |
|---|---|
| [`packages/app/src/components/view-registry.tsx`](../../../packages/app/src/components/view-registry.tsx) | **new** — `VIEW_COMPONENT`, `ViewEntry`, the `lazy()` calls |
| [`packages/app/src/components/error-boundary.tsx`](../../../packages/app/src/components/error-boundary.tsx) | **new** — the boundary and its `EmptyState` fallback |
| `packages/app/src/components/view-registry.test.ts` | **new** — exhaustiveness + the global set |
| `packages/app/src/components/error-boundary.test.tsx` | **new** — catch, reset, retry |
| [`packages/app/src/app.tsx`](../../../packages/app/src/app.tsx) | the ternary → lookup; 4 boundary mounts; the `todo/` copy fix |
| [`packages/app/src/detached-root.tsx`](../../../packages/app/src/detached-root.tsx) | one boundary at the root |
| [`packages/app/src/components/skeleton.tsx`](../../../packages/app/src/components/skeleton.tsx) | docstring only — the error→empty→skeleton→content ordering |
| [`packages/app/src/components/empty-state.tsx`](../../../packages/app/src/components/empty-state.tsx) | (**unchanged**) — the fallback's card; load-bearing, do not widen its API |
| [`packages/app/src/components/delayed-fallback.tsx`](../../../packages/app/src/components/delayed-fallback.tsx) | (**unchanged**) — the boundary sits outside it, not in place of it |
| [`packages/app/src/store/ui-store.ts`](../../../packages/app/src/store/ui-store.ts) | (**unchanged**) — `ViewId`/`VIEW_IDS` are the record's domain; no persisted state is added |
| `packages/app/src/features/{dashboard,tests,history,video,files}/…-view.tsx` | the three states |
| [`packages/app/src/features/workbench/`](../../../packages/app/src/features/workbench/) | the three states for `changes` |
| `packages/app/src/features/{actions,reviews,projects}/…-view.tsx` | only the missing states |
| `packages/app/e2e/error-boundary.spec.ts` | **new (open)** — 2 tests: rail survives a throw + remount on return + Copy details; Try again in place |
| `packages/app/src/components/error-boundary.test.tsx` | **edit (open)** — one Copy-details case, `copyText` mocked |
| [`packages/app/src/features/repos/branch-health.ts`](../../../packages/app/src/features/repos/branch-health.ts), [`checks-verdict.ts`](../../../packages/app/src/features/repos/checks-verdict.ts), [`repos-panel.tsx`](../../../packages/app/src/features/repos/repos-panel.tsx) | **edit (open)** — docblock `todo/outstanding.md` → `.midnite/tasks/outstanding.md`, comments only |
| [`packages/app/test-support/mock-bridge.ts`](../../../packages/app/test-support/mock-bridge.ts) | (**unchanged**) — already records clipboard writes in `window.__mstudioClipboard` |
| [`packages/frame/src/layout/`](../../../packages/frame/src/layout/) | (**unchanged**) — where `EmptyState`/`Skeleton`/`DelayedFallback` live since Phase 113; the `components/` files are re-exports |

---

## Verification

- [x] `moon run :typecheck :lint :test` green.
- [x] Adding a member to `ViewId` without adding a `VIEW_COMPONENT` entry **fails typecheck** —
      check it by hand once, then delete the probe. This is the regression the phase exists to make
      impossible. (— audited 2026-11-17: `export const VIEW_COMPONENT: Record<ViewId, ViewEntry>` at
      [`view-registry.tsx:173`](../../../packages/app/src/components/view-registry.tsx), an annotated
      object literal, not `Partial`/`satisfies Partial`; a `tsc --noEmit --strict` probe of that exact
      shape with one union member left out fails with `TS2741: Property 'probe' is missing`. The
      runtime twin is `view-registry.test.ts` › *has exactly one entry per VIEW_IDS member*.)
- [x] A view component that throws on render leaves the nav rail interactive; navigating to
      another view and back renders the broken view again, freshly.
      - Proven by Test 1 of `e2e/error-boundary.spec.ts` (Theme B, last item): throw in `History`,
        navigate to `Timeline` (alert count 0), back to `History` (`Journal` tab visible, no alert).
        Tick this line in the same PR that lands that spec, citing the test name.
      - Scope note: the original wording also named the terminal and status bar. They live outside
        the view slot's boundary in `app.tsx`, so the rail assertion proves the same containment;
        the spec does not open a terminal (that would spawn a pty and need teardown).
      - Exception, by design: `Timeline` (`graph`, keep-alive) recovers via Try again only.
- [x] The three optional modals still render `null` — not an error card — when their chunk fails.
- [x] Each of the six previously-bare views shows exactly one of error / empty / skeleton for the
      matching query state, never two at once.
- [x] Clicking **Copy details** puts `message` + `stack` on the clipboard.
      - Not covered today: `error-boundary.test.tsx` has no Copy-details case (audited 2026-11-17).
      - **Vitest (add to** [`components/error-boundary.test.tsx`](../../../packages/app/src/components/error-boundary.test.tsx)**):**
        `vi.mock('../services/queries', () => ({ copyText: vi.fn(async () => true) }))` beside the
        existing `../lib/report` mock; test `Copy details writes message and stack through the bridge`:
        render `<ErrorBoundary label="X"><AlwaysThrows /></ErrorBoundary>`, `fireEvent.click(screen.getByRole('button', { name: /Copy details/ }))`,
        expect `copyText` called once with a string that starts with the thrown message + `'\n\n'`
        and contains `'at '` (a stack frame). Edge: `copy()` routes through `copyText` (the bridge),
        never `navigator.clipboard` — the packaged `file://` origin is not a secure context — so the
        test must not stub `navigator.clipboard`. Clear the mock in the existing `beforeEach`.
      - **E2e:** Test 1 of `e2e/error-boundary.spec.ts` asserts the same through the mock bridge's
        `window.__mstudioClipboard`. Tick this line when both land.
- [x] `grep -rn "todo/" packages/app/src` returns nothing. **Still open after this batch:** the
      `Placeholder` copy itself is fixed (`SessionsPlaceholder` in `view-registry.tsx` names
      `.midnite/tasks/`), but eight unrelated `todo/` references survive in docblocks and one
      markdown-link test fixture — `checks-verdict.ts`, `branch-health.ts`, `repos-panel.tsx`,
      `use-browser-bounds.ts`, `markdown-links.test.ts`. A comment sweep, not this phase's bug.
      - **Refined 2026-11-17.** `SessionsPlaceholder` is gone entirely (sessions is a real view).
        `use-browser-bounds.ts` no longer matches. Three **comment-only** hits remain, all naming
        `todo/outstanding.md` → "Branch checks", which is now
        `.midnite/tasks/outstanding.md` (entry struck, landed in Phase 17 Theme F):
        [`features/repos/branch-health.ts:24`](../../../packages/app/src/features/repos/branch-health.ts),
        [`features/repos/checks-verdict.ts:10`](../../../packages/app/src/features/repos/checks-verdict.ts),
        [`features/repos/repos-panel.tsx:1167`](../../../packages/app/src/features/repos/repos-panel.tsx).
        Replace `todo/outstanding.md` with `.midnite/tasks/outstanding.md` in each; change no code.
      - **The test fixtures stay.** `build-change-tree.test.ts` and
        `features/files/preview/markdown-links.test.ts` use `todo/…` as an arbitrary repo-relative
        path, not as a pointer at this repo's tracker; renaming them changes nothing they assert.
      - **Acceptance (the grep this line now means):**
        `git grep -n "todo/" -- packages/app/src ':!*.test.ts' ':!*.test.tsx'` prints nothing.
- [ ] **Open, for a human (human):** a lazy chunk that 404s after an in-place reinstall shows the
      boundary card, not a blank window.
      1. On `main`, `moon run desktop:dist`; install `packages/desktop/release/midnite-studio-<version>-arm64.dmg` (drag to
         `/Applications`, replacing any copy) and launch it. Open a repo. Do **not** visit
         `History` or `Settings` yet (their lazy chunks must not be cached in the window).
      2. With that window still open, make any one-line renderer change in a throwaway
         `git worktree add --detach <scratchpad>/p60-dist main` (so chunk hashes differ; never in
         the primary checkout), `moon run desktop:dist` there, and install the new dmg over
         `/Applications/Midnite Studio.app` **without quitting** the running app.
      3. In the still-open window, click `History` in the rail.
      4. Pass: a card titled **History stopped rendering** with the import error as body, and
         **Try again** / **Copy details** buttons; the rail still navigates. Fail: a blank
         window, or a spinner that never resolves (that would mean the boundary moved inside the
         `Suspense`).
      5. `Mod+r` reloads onto the new build; confirm `History` renders. Remove the throwaway worktree (`git worktree remove --force`).

---

## Not in this phase

- **Building the `sessions` view.** It is named explicitly in the record and still renders
  `Placeholder`. Shipping a real sessions surface is its own phase with its own data question.
- **A renderer→main error report channel.** It is a `CHANNELS` addition, a schema, a handler and a
  sink — a contract change, and this phase deliberately adds none. See Decision 3.
- **Any redesign of `EmptyState` or `Skeleton`.** Twenty and eighteen consumers respectively; a
  widened API here is a diff across the whole renderer and would bury the actual work.
- **The Escape/dismissal stack.** 22 hand-rolled `key === 'Escape'` handlers with a real
  double-dismiss bug between `popover.tsx` (which calls `stopPropagation`) and `confirm-dialog.tsx`
  / `context-menu.tsx` (which do not) is a genuine and separate phase. It shares nothing with this
  one but the word "primitive".
- **A `Settings ▸ Diff` page** for `diffLayout`/`diffShowOldGutter`, the only persisted pref cluster
  with no settings home. Real, small, unrelated.

---

## Decisions / open questions

1. **Resolved — the record lives in `components/`, not `store/`.** `VIEW_ICON` and `VIEW_COMMAND`
   are already there and it imports React components; `ui-store.ts` stays free of JSX imports, which
   is what keeps it testable under plain vitest without jsdom.

2. **Resolved — the boundary wraps the slot, not each view.** One boundary keyed on `activeView`
   gives every view isolation for one mount point, where per-view boundaries inside the record would
   be sixteen identical wrappers and a maintenance obligation on every future view. The three modals
   and the detached root are separate because their fallback behaviour differs (silent `null`, not a
   card).

3. **Resolved — report to `console.error` only, for now.** There is no renderer→main log channel;
   `CHANNELS` carries none, and the main-side seam
   ([`main/log.ts`](../../../packages/desktop/src/main/log.ts)'s `defaultLogger`) takes a single
   string with no levels and no file sink. Building a real report path means a channel, a schema, a
   handler and a sink — worth doing, and worth doing as its own thing rather than as a rider on a
   26-item phase. *Recommendation for later:* fold it into whatever phase gives `main/log.ts`
   structured levels, so there is one sink rather than two.

   *Superseded (audit 2026-11-17):* the boundary reports through Phase 65's
   `reportError('boundary', …)` in `lib/report.ts` — see Theme B's landed note.

4. **Resolved — `sessions` stays `Placeholder`, explicitly.** Deleting the rail row was the
   alternative and is worse: the row, the `/sessions` path and the palette entry are three places
   that would all have to agree, and the view is wanted. Naming it in the record costs one line and
   makes the intent legible.

   *Superseded (audit 2026-11-17):* Phase 67 built the real sessions view (#209); it is
   `global: true` in `view-registry.tsx`.

5. **Resolved (audit 2026-11-17) — the hook ships, `import.meta.env.DEV`-gated, and the spec is
   built against the Vite dev server.** The hook landed in #170 exactly as recommended; what was
   missing was only the spec. Kept as e2e rather than vitest because the claim is about `App`'s
   real rail + view slot + lazy chunks together. Original question:
   **Does the `error-boundary.spec.ts` throw hook ship?** A Playwright test needs a way to
   make a real view throw, and the only clean way is a `window.__mstudioTestThrow` escape hatch in
   the product build. *Recommendation:* attempt it behind `import.meta.env.DEV` so it is absent from
   `desktop:dist`; if that proves awkward, drop the e2e item — the RTL spec already covers the
   boundary's behaviour, and the human dist-reinstall pass covers the case e2e cannot reach anyway.

6. **Resolved (landed in #170 as topped-up) — do `actions`/`reviews`/`projects` get audited, or just topped up?** Theme C says topped
   up. *Recommendation:* keep it at topped-up. Auditing 21 existing error sites for consistency is a
   different, larger job and would push this phase past the size it was chosen for.
