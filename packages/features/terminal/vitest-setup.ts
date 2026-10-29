/**
 * The jsdom gaps the terminal's tests run into — the same plain-assignment
 * defaults `packages/app/src/vitest-setup.ts` installs, which these tests
 * relied on before the feature moved out of the app (Phase 123 Theme E).
 * xterm reads `matchMedia` for the device pixel ratio and asks a canvas for a
 * context when it opens; the panel's lists read `ResizeObserver`.
 *
 * Plain assignments rather than spies, so a test's own `vi.stubGlobal` /
 * `vi.spyOn` falls back to these when undone, never to jsdom's broken ones.
 */
class StubResizeObserver implements ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = StubResizeObserver;
}

if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  window.matchMedia = (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}

if (typeof document !== 'undefined' && typeof document.queryCommandSupported !== 'function') {
  document.queryCommandSupported = () => false;
}

if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;
}
