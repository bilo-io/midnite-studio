import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

/**
 * Unmount between tests.
 *
 * `@testing-library/react` registers this itself — but only when a global
 * `afterEach` exists, and this suite runs with vitest's `globals` off. Without
 * it every `render` accumulates in the same document and the second test in a
 * file fails with "found multiple elements", which reads like a component bug
 * and is not one.
 */
afterEach(cleanup);

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

/**
 * jsdom has no media pipeline: `HTMLMediaElement.prototype.play`/`pause` are
 * present but call jsdom's `notImplemented`, which throws synchronously *and*
 * logs to the virtual console regardless of whether the caller catches it
 * (`HeroVideo`'s explicit `.play()` on mount does, but the log still fires).
 * Stubbed the same way `matchMedia` is above — components that autoplay a
 * `<video>` are exercised under jsdom for everything except actual decoding.
 */
if (typeof HTMLMediaElement !== 'undefined') {
  HTMLMediaElement.prototype.play = () => Promise.resolve();
  HTMLMediaElement.prototype.pause = () => {};
}
