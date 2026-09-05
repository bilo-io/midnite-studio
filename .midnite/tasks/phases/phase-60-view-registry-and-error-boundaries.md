# Phase 60 — A window that never goes blank

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

## Deliverables

### A — One record, not a seventeen-branch ternary (S) — ✅ DONE (PR #PENDING, 2026-09-05)

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

### B — A boundary per view (M) — ✅ DONE (PR #PENDING, 2026-09-05)

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
- [ ] Playwright: extend [`packages/app/e2e/`](../../../packages/app/e2e/) with `error-boundary.spec.ts`
      — navigate to a view, force a throw through a `window.__mstudioTestThrow` hook the boundary
      test-build honours, assert the rail is still interactive and a different view still renders.
      **If the throw hook cannot be added without shipping test code, drop this item** and say so in
      the PR rather than shipping a hook into the product.

### C — The three states, applied (M) — ✅ DONE (PR #PENDING, 2026-09-05)

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
| [`packages/app/e2e/`](../../../packages/app/e2e/) | `error-boundary.spec.ts`, if the throw hook is shippable |

---

## Verification

- [x] `moon run :typecheck :lint :test` green.
- [ ] Adding a member to `ViewId` without adding a `VIEW_COMPONENT` entry **fails typecheck** —
      check it by hand once, then delete the probe. This is the regression the phase exists to make
      impossible.
- [ ] A view component that throws on render leaves the nav rail, the terminal and the status bar
      interactive; navigating to another view and back renders the broken view again, freshly.
- [x] The three optional modals still render `null` — not an error card — when their chunk fails.
- [x] Each of the six previously-bare views shows exactly one of error / empty / skeleton for the
      matching query state, never two at once.
- [ ] Clicking **Copy details** puts `message` + `stack` on the clipboard.
- [ ] `grep -rn "todo/" packages/app/src` returns nothing. **Still open after this batch:** the
      `Placeholder` copy itself is fixed (`SessionsPlaceholder` in `view-registry.tsx` names
      `.midnite/tasks/`), but eight unrelated `todo/` references survive in docblocks and one
      markdown-link test fixture — `checks-verdict.ts`, `branch-health.ts`, `repos-panel.tsx`,
      `use-browser-bounds.ts`, `markdown-links.test.ts`. A comment sweep, not this phase's bug.
- [ ] **Open, for a human:** run `moon run desktop:dist`, install over a running copy, then navigate
      to a lazy view in the still-open window. The chunk 404s; confirm the boundary's card appears
      with a working **Try again** rather than a blank window.

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

4. **Resolved — `sessions` stays `Placeholder`, explicitly.** Deleting the rail row was the
   alternative and is worse: the row, the `/sessions` path and the palette entry are three places
   that would all have to agree, and the view is wanted. Naming it in the record costs one line and
   makes the intent legible.

5. **Open — does the `error-boundary.spec.ts` throw hook ship?** A Playwright test needs a way to
   make a real view throw, and the only clean way is a `window.__mstudioTestThrow` escape hatch in
   the product build. *Recommendation:* attempt it behind `import.meta.env.DEV` so it is absent from
   `desktop:dist`; if that proves awkward, drop the e2e item — the RTL spec already covers the
   boundary's behaviour, and the human dist-reinstall pass covers the case e2e cannot reach anyway.

6. **Open — do `actions`/`reviews`/`projects` get audited, or just topped up?** Theme C says topped
   up. *Recommendation:* keep it at topped-up. Auditing 21 existing error sites for consistency is a
   different, larger job and would push this phase past the size it was chosen for.
