/**
 * jsdom has no `matchMedia`, and `useReducedMotion` asks for it on first
 * render. Stub it as "no preference expressed", which is the branch every
 * component's default behaviour lives in — a test that wants the reduced-motion
 * branch overrides this per test rather than flipping it globally.
 */
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}
