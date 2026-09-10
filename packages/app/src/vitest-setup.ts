import { afterEach } from 'vitest';

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
 * Phase 82 Theme C's harness prerequisite (b): the original version of this
 * stub, quoted below, never invoked its callback at all:
 *
 * ```ts
 * class StubResizeObserver implements ResizeObserver {
 *   observe(): void {}
 *   unobserve(): void {}
 *   disconnect(): void {}
 * }
 * ```
 *
 * That was fine for every test that merely *mounts* something touching
 * `ResizeObserver` — which is all 15 local stubs it replaced ever needed —
 * but it is fatal to `@tanstack/react-virtual`: `virtual-core`'s
 * `observeElementRect` reads the *first* size synchronously off
 * `element.offsetWidth`/`offsetHeight` (permanently `0` under jsdom, which
 * does no layout at all), then relies on the `ResizeObserver` callback's
 * `entry.borderBoxSize` to ever learn a real size after that. A callback
 * that never fires means `scrollRect` never leaves `{width: 0, height: 0}`,
 * so `getVirtualItems()` computes an empty visible range forever — not a
 * crash, just silently zero rows. That is exactly what kept
 * `search-view.spec.ts`'s "each mode returns and renders its own results" in
 * Playwright (confirmed empirically there before this fix: with
 * `clientWidth`/`clientHeight` stubbed the same way `projects-view.test.tsx`
 * does, the store still received results, but `getVirtualItems()` stayed
 * empty), and it is documented as the same open finding in
 * `projects-view.test.tsx`.
 *
 * The fix needed nothing beyond a firing callback — no separate
 * `offsetWidth`/`getBoundingClientRect` shim. `virtual-core`'s callback
 * handler prefers `entry.borderBoxSize[0]` over re-reading `offsetWidth`/
 * `offsetHeight` (see its own `observeElementRect`), so a synthetic entry
 * carrying a real `borderBoxSize` is sufficient on its own to hand the
 * virtualizer a non-zero container size, regardless of what `offsetWidth`/
 * `offsetHeight` (or `getBoundingClientRect`) still report.
 *
 * Fires **once per `observe()` call, asynchronously** — via `queueMicrotask`,
 * never synchronously inside `observe()` itself. Two reasons: a real
 * `ResizeObserver` never notifies synchronously either (the spec batches
 * notifications into a microtask after layout), and firing synchronously
 * here would run a React state update outside of any `act()` boundary at the
 * exact moment `useEffect`/`useLayoutEffect` calls `observe()`. Deferred to a
 * microtask, the update lands where `@testing-library/react`'s async
 * queries (`findBy*`, `waitFor`) already expect asynchronous work to
 * resolve, with no extra plumbing needed at the call site.
 *
 * The content rect is **settable**, module-level state rather than a
 * per-instance option, because nothing about `ResizeObserver`'s constructor
 * signature gives a caller anywhere to pass one in — every observed element
 * reports the same rect until a test calls `setResizeObserverContentRect`,
 * and that override is reset after every test (see the `afterEach` below) so
 * one test's override can never leak into the next test in the same file.
 * The default (`1024×800`) is deliberately generous against every row height
 * this suite's virtualized surfaces use (32–56px) — comfortably more rows
 * than any single test asserts against, so a test does not need to reason
 * about the exact viewport size to get the row it wants rendered.
 *
 * Still overridable exactly like the other three defaults in this file: the
 * `typeof globalThis.ResizeObserver === 'undefined'` guard only decides
 * whether this file installs the default, never whether a later local
 * `vi.stubGlobal('ResizeObserver', …)` (or a test's own class, assigned
 * directly) can replace it — none of the ~15 existing local stubs needed to
 * change for this.
 */
type ResizeObserverContentRect = { width: number; height: number };

const DEFAULT_RESIZE_OBSERVER_RECT: ResizeObserverContentRect = { width: 1024, height: 800 };

let resizeObserverRect: ResizeObserverContentRect = DEFAULT_RESIZE_OBSERVER_RECT;

/**
 * Overrides the content rect every element the global `ResizeObserver` stub
 * observes reports from its *next* `observe()` call onward — a test
 * asserting a genuinely empty/zero-size viewport, or an exact overscan
 * boundary, needs a size it controls rather than the generous default.
 * Automatically reset after the test that calls it (see the `afterEach`
 * below), so it never needs an explicit `afterEach` of its own.
 */
export function setResizeObserverContentRect(rect: ResizeObserverContentRect): void {
  resizeObserverRect = rect;
}

class FiringResizeObserver implements ResizeObserver {
  private readonly callback: ResizeObserverCallback;
  private readonly targets = new Set<Element>();

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }

  observe(target: Element): void {
    this.targets.add(target);
    queueMicrotask(() => {
      // The target may have been unobserved (or the whole observer
      // disconnected) between `observe()` being called and this microtask
      // running — most commonly because the component that called
      // `observe()` already unmounted (React 18 Strict Mode double-invokes
      // effects, mounting/unmounting a throwaway instance first).
      if (!this.targets.has(target)) return;

      const { width, height } = resizeObserverRect;
      const size: ResizeObserverSize = { inlineSize: width, blockSize: height };
      const rect: DOMRectReadOnly = {
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: width,
        bottom: height,
        width,
        height,
        toJSON() {
          return { x: 0, y: 0, top: 0, left: 0, right: width, bottom: height, width, height };
        },
      };
      const entry: ResizeObserverEntry = {
        target,
        contentRect: rect,
        borderBoxSize: [size],
        contentBoxSize: [size],
        devicePixelContentBoxSize: [size],
      };
      this.callback([entry], this);
    });
  }

  unobserve(target: Element): void {
    this.targets.delete(target);
  }

  disconnect(): void {
    this.targets.clear();
  }
}

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = FiringResizeObserver;
}

afterEach(() => {
  resizeObserverRect = DEFAULT_RESIZE_OBSERVER_RECT;
});

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
