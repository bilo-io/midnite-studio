// @ts-check
/**
 * Midnite game kit — the debug and play-test hook, `window.__midnite`.
 *
 * Midnite Studio's runner and its `game_*` MCP tools talk to a game only
 * through this object: `game_state` calls `getState()`, the toolbar calls
 * `pause()`/`resume()`/`setOverlay()`, `game_input` presses the virtual gamepad,
 * and the play-test tools drive `replay` (record, load, seek, play) on a
 * deterministic run (`deterministic` says whether this one is).
 * `getState()` must return plain JSON — at least `{ version: 1, scene, frame,
 * time }`, plus `player: { position, health? }` and `score` when the game has
 * them (`KitGameStateSchema` in the app holds the kit to this).
 */

import { determinism } from './determinism.js';
import { virtualGamepad } from './input-map.js';
import { replayer } from './replay.js';

export const KIT_VERSION = '0.10.0';
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

/** Extra properties other kit modules hang on the hook (`juice`, `fx`); they survive a re-install. @type {Record<string, unknown>} */
const extensions = {};

/**
 * Attach `value` as `window.__midnite[key]`, now and on every later `installHook`.
 * @param {string} key
 * @param {unknown} value
 */
export function extendHook(key, value) {
  extensions[key] = value;
  if (typeof window !== 'undefined' && /** @type {Record<string, unknown>} */ (window).__midnite) {
    /** @type {Record<string, any>} */ (/** @type {any} */ (window).__midnite)[key] = value;
  }
}

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
    setSeed: (/** @type {number} */ seed) => determinism.reseed(seed),
    setOverlay: (/** @type {boolean} */ _on) => {},
    input: {
      gamepad: (/** @type {number} */ button, /** @type {boolean} */ pressed) => virtualGamepad.set(button, pressed),
    },
    /** Whether `midnite-ready` has been printed. */
    get ready() {
      return readyLogged;
    },
    deterministic: { enabled: determinism.enabled, seed: determinism.seed },
    replay: {
      record: () => replayer.record(),
      stop: () => replayer.stop(),
      load: (/** @type {unknown} */ replay) => replayer.load(replay),
      seek: (/** @type {number} */ frame) => replayer.seek(frame),
      play: (/** @type {unknown} */ replay, /** @type {{ speed?: 1 | 'max' }} */ opts) => replayer.play(replay, opts),
      status: () => replayer.status(),
    },
    ...extensions,
    ...impl,
  };
  if (impl.setSeed) {
    const custom = impl.setSeed;
    hook.setSeed = (seed) => {
      determinism.reseed(seed);
      custom(seed);
    };
  }
  // The replayer drives whatever loop this hook fronts.
  replayer.attach({
    step: (n) => hook.step(n),
    pause: () => hook.pause(),
    resume: () => hook.resume(),
  });
  installed = hook;
  /** @type {Record<string, unknown>} */ (window).__midnite = hook;
  return hook;
}

/** @type {{ pause: () => void } | null} */
let installed = null;
let readyLogged = false;

/**
 * Print `midnite-ready` once — the line the runner's e2e and agents wait for.
 * On a play-test run (`midnite-paused=1`) the loop pauses here, after its first
 * step, so every run of a play-test starts from the same frame.
 */
export function markReady() {
  if (readyLogged) return;
  readyLogged = true;
  if (determinism.startPaused) installed?.pause();
  console.log('midnite-ready');
}

/** The seed a kit loop starts its random streams from: the run's in deterministic mode, else 1. */
export const startSeed = () => (determinism.enabled ? determinism.seed : 1);
