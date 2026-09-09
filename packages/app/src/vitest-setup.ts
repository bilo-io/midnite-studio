/**
 * jsdom environment gap-filling for every component test in this package.
 *
 * `document.queryCommandSupported` — a real Chromium renderer (what this app
 * actually ships on) has it; jsdom does not. Monaco's clipboard contribution
 * reads it at its own module-evaluation time the moment anything touches
 * `monaco.typescript` (Phase 70 Theme B's ambient `pm.d.ts` registration,
 * `test-editor.tsx`, is the first thing in this codebase that does), which
 * would otherwise throw during test *collection* — before a single test in
 * the file gets to run — rather than inside the one test that happens to
 * open the Scripts tab. `false` is also the practically correct answer: this
 * environment has no queryCommandSupported-backed clipboard at all.
 */
if (typeof document !== 'undefined' && typeof document.queryCommandSupported !== 'function') {
  document.queryCommandSupported = () => false;
}

/**
 * Phase 82 Theme B — the four jsdom gaps that were, before this file, each
 * re-declared by hand in a growing pile of test files: 15 local
 * `ResizeObserver` stubs, 11 `matchMedia` stubs, 2 `IntersectionObserver`
 * stubs and 4 re-spies of `HTMLCanvasElement.prototype.getContext`. Writing
 * a unit test in this repo was measurably more work than writing an e2e one
 * partly *because* of this — every new test that merely mounted a component
 * touching one of these had to remember which polyfill it needed and paste
 * the same ten lines to supply it.
 *
 * Every one of these is a **plain global assignment**, not a `vi.spyOn` or
 * `vi.stubGlobal` — the same style `queryCommandSupported` above already
 * uses. That matters for overridability: a test file that wants its own
 * answer can still reach for `vi.spyOn(HTMLCanvasElement.prototype,
 * 'getContext').mockReturnValue(fakeContext)` or
 * `vi.stubGlobal('matchMedia', …)`, and when that spy is later undone with
 * `vi.restoreAllMocks()` / `vi.unstubAllGlobals()` (several existing files'
 * own `afterEach` already does this), execution falls back to the plain
 * default declared here — never to jsdom's real, broken implementation
 * (`getContext` throwing "Not implemented", `ResizeObserver`/
 * `IntersectionObserver` being `undefined` altogether). A `vi.spyOn`-based
 * *global* default would not have that property: restoring a spy restores
 * to whatever was there when the spy was FIRST created, so a later local
 * spy on top of an earlier global spy would, once undone, fall back to
 * jsdom's own broken behaviour rather than to this file's default.
 *
 * Deliberately NOT removing the ~30 existing local stubs in this same
 * change (see the phase doc) — a global default alongside a local
 * definition is harmless (the local one simply wins, being installed
 * later), and deleting them now would be pure churn bundled into a PR whose
 * entire point is to add ergonomics, not to touch passing tests. Later
 * migration waves delete them as they touch each file anyway.
 */

// --- ResizeObserver ----------------------------------------------------------

/**
 * Every local stub across the 15 files above does the same three no-ops —
 * `observe`/`unobserve`/`disconnect`, none of them ever needing to actually
 * fire a callback (nothing under test asserts on a resize *happening*, only
 * on the component not crashing for want of the API existing at all).
 */
class StubResizeObserver implements ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = StubResizeObserver;
}

// --- matchMedia ----------------------------------------------------------

/**
 * `false` for every query — the same default every local stub already
 * chose, because it is the *safe* default: it means "no reduced motion, no
 * dark-mode-by-OS, nothing special", which is what a test gets if it never
 * touches `useAppearanceStore`/theme state at all. A test that specifically
 * exercises the media-query-driven branch (dark mode, `prefers-reduced-
 * motion`) still needs its own `vi.stubGlobal('matchMedia', …)` returning
 * `matches: true` — this default only exists so that merely *mounting* a
 * component which calls `matchMedia` once, incidentally, does not throw.
 */
function stubMatchMedia(query: string): MediaQueryList {
  return {
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  };
}

if (typeof window !== 'undefined' && typeof window.matchMedia === 'undefined') {
  window.matchMedia = stubMatchMedia;
}

// --- IntersectionObserver ----------------------------------------------------

/**
 * Never actually fires — `use-card-visible.test.ts`'s own stub (one of the
 * two existing ones) goes further and lets a test call `.fire(isIntersecting)`
 * by hand, because that test's whole subject is what happens when
 * visibility changes. This default is only for a component that merely
 * *constructs* one (typically to decide whether to render a placeholder)
 * without a test caring about the intersection state itself.
 */
class StubIntersectionObserver implements IntersectionObserver {
  root: Element | Document | null = null;
  rootMargin = '';
  thresholds: ReadonlyArray<number> = [];
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

if (typeof globalThis.IntersectionObserver === 'undefined') {
  globalThis.IntersectionObserver = StubIntersectionObserver;
}

// --- HTMLCanvasElement.prototype.getContext ----------------------------------

/**
 * jsdom's own `getContext` is a function, not an absence — it throws "Not
 * implemented" the moment anything calls it, since jsdom does not implement
 * canvas at all. That is worse than returning `null`: every canvas-drawing
 * component in this codebase already null-guards its context (the same
 * defensive check a real browser's "canvas unsupported" case needs), so
 * `null` exercises that real, intentional fallback path, while a throw is
 * an unhandled exception the component was never written to expect. No
 * "already defined" guard here, unlike the three defaults above — jsdom's
 * throwing implementation IS already defined, so the guard would never
 * fire and this override would silently do nothing.
 */
if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = (() =>
    null) as typeof HTMLCanvasElement.prototype.getContext;
}
