// @ts-check
/**
 * Midnite game kit — the debug and play-test hook, `window.__midnite`.
 *
 * Midnite Studio's runner and its `game_*` MCP tools talk to a game only
 * through this object: `game_state` calls `getState()`, the toolbar calls
 * `pause()`/`resume()`/`setOverlay()`, `game_input` presses the virtual gamepad.
 * `getState()` must return plain JSON — at least `{ version: 1, scene, frame,
 * time }`, plus `player: { position, health? }` and `score` when the game has
 * them (`KitGameStateSchema` in the app holds the kit to this).
 */

import { virtualGamepad } from './input-map.js';
import { rng } from './rng.js';

export const KIT_VERSION = '0.3.0';
/** `window.__midnite.version`; bumped when the hook's shape changes. */
export const HOOK_VERSION = 1;

/**
 * @typedef {{
 *   getState?: () => Record<string, unknown>,
 *   pause?: () => void,
 *   resume?: () => void,
 *   step?: (n: number) => void,
 *   setSeed?: (seed: number) => void,
 *   setOverlay?: (on: boolean) => void,
 * }} HookImpl
 */

/**
 * Install (or replace) `window.__midnite`. Anything not provided gets a safe
 * default: `setSeed` reseeds the kit's shared RNG, `input.gamepad` presses the
 * virtual pad, and `getState` reports an idle `main` scene.
 * @param {HookImpl} [impl]
 */
export function installHook(impl = {}) {
  if (typeof window === 'undefined') return null;
  const hook = {
    version: HOOK_VERSION,
    kitVersion: KIT_VERSION,
    getState: () => ({ version: HOOK_VERSION, scene: 'main', frame: 0, time: 0 }),
    pause: () => {},
    resume: () => {},
    step: (/** @type {number} */ _n) => {},
    setSeed: (/** @type {number} */ seed) => rng.reseed(seed),
    setOverlay: (/** @type {boolean} */ _on) => {},
    input: {
      gamepad: (/** @type {number} */ button, /** @type {boolean} */ pressed) => virtualGamepad.set(button, pressed),
    },
    // Filled by the play-test theme (input replays).
    replay: { load: () => false, play: () => false, stop: () => false },
    ...impl,
  };
  if (impl.setSeed) {
    const custom = impl.setSeed;
    hook.setSeed = (seed) => {
      rng.reseed(seed);
      custom(seed);
    };
  }
  /** @type {Record<string, unknown>} */ (window).__midnite = hook;
  return hook;
}

let readyLogged = false;

/** Print `midnite-ready` once — the line the runner's e2e and agents wait for. */
export function markReady() {
  if (readyLogged) return;
  readyLogged = true;
  console.log('midnite-ready');
}
