/**
 * Midnite Studio Game Kit (Phase 107 Theme C)
 * Core runtime hook and state contract.
 */
export const KIT_VERSION = '0.1.0';

/**
 * Install the debug and play-test hook on `window.__midnite`.
 */
export function installHook(impl = {}) {
  if (typeof window === 'undefined') return;
  window.__midnite = {
    version: 1,
    getState: () => ({ version: 1, scene: 'main', frame: 0, time: 0 }),
    pause: () => {},
    resume: () => {},
    step: () => {},
    setSeed: () => {},
    setOverlay: () => {},
    input: {
      gamepad: () => {},
    },
    ...impl,
  };
}
