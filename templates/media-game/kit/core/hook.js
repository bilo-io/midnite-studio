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
import { isSceneName, LEVEL_PARAM, SPAWN_PARAM } from './level.js';
import { virtualGamepad } from './input-map.js';
import { replayer } from './replay.js';

export const KIT_VERSION = '0.16.0';
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
 *   goto?: (name: string) => boolean,
 *   spawnAt?: (x: number, y: number, z?: number) => boolean,
 *   entities?: () => import('./level.js').EntitySnapshot[],
 *   debug?: (options: Partial<DebugOptions>) => DebugOptions,
 *   navMesh?: () => { polygons: [number, number][][] },
 * }} HookImpl
 */

/**
 * The in-game debug overlays (Phase 140 Theme G): `colliders` and `triggers` are drawn by the level builders,
 * `nav` by whatever built the navmesh.
 * @typedef {{ colliders: boolean, triggers: boolean, nav: boolean }} DebugOptions
 */

/**
 * The default `goto`: reload this page on level `name`, keeping every other query param (determinism included).
 * @param {string} name
 */
function gotoByReload(name) {
  if (!isSceneName(name) || typeof location === 'undefined') return false;
  const query = new URLSearchParams(location.search);
  query.set(LEVEL_PARAM, name);
  location.replace(`${location.pathname}?${query.toString()}${location.hash}`);
  return true;
}

/**
 * The default `spawnAt`: reload this page with `?midnite-spawn=x,y[,z]` (pixels for 2D, metres for 3D),
 * keeping every other query param. The scene's `spawn` is replaced for this run only; nothing is saved.
 * @param {number} x
 * @param {number} y
 * @param {number} [z]
 */
function spawnByReload(x, y, z) {
  const coords = z === undefined ? [x, y] : [x, y, z];
  if (!coords.every(Number.isFinite) || typeof location === 'undefined') return false;
  const query = new URLSearchParams(location.search);
  query.set(SPAWN_PARAM, coords.join(','));
  location.replace(`${location.pathname}?${query.toString()}${location.hash}`);
  return true;
}

/** @type {Map<string, () => import('./level.js').EntitySnapshot[]>} */
const entitySources = new Map();

/**
 * Register what `window.__midnite.entities()` reports for one source (a level builder, a game's own
 * spawner). A later registration under the same `key` replaces the earlier one (a scene rebuilt by `goto`).
 * @param {() => import('./level.js').EntitySnapshot[]} fn
 * @param {string} [key]
 */
export function registerEntities(fn, key = 'default') {
  entitySources.set(key, fn);
}

/** Every registered source's snapshots, in registration order; a source that throws contributes nothing. */
function collectEntities() {
  /** @type {import('./level.js').EntitySnapshot[]} */
  const all = [];
  for (const fn of entitySources.values()) {
    try {
      all.push(...fn());
    } catch {
      /* one broken source must not blind the editor to the rest */
    }
  }
  return all;
}

/** @type {DebugOptions} */
let debugOptions = { colliders: false, triggers: false, nav: false };
/** @type {Map<string, (options: DebugOptions) => void>} */
const debugSinks = new Map();

/**
 * Register a drawer for `window.__midnite.debug(...)`: `fn(options)` runs now with the current options (a scene
 * rebuilt by `goto` keeps its overlays) and on every change. A later registration under the same `key` replaces
 * the earlier one; the returned function removes it.
 * @param {(options: DebugOptions) => void} fn
 * @param {string} [key]
 * @returns {() => void}
 */
export function registerDebug(fn, key = 'default') {
  debugSinks.set(key, fn);
  try {
    fn({ ...debugOptions });
  } catch {
    /* a broken drawer must not break the level */
  }
  return () => {
    if (debugSinks.get(key) === fn) debugSinks.delete(key);
  };
}

/**
 * `window.__midnite.debug({ colliders?, triggers?, nav? })`: switch overlays; switches left out keep their setting.
 * Answers the options now in force.
 * @param {Partial<DebugOptions>} [patch]
 * @returns {DebugOptions}
 */
function applyDebug(patch) {
  const p = patch && typeof patch === 'object' ? patch : {};
  debugOptions = {
    colliders: typeof p.colliders === 'boolean' ? p.colliders : debugOptions.colliders,
    triggers: typeof p.triggers === 'boolean' ? p.triggers : debugOptions.triggers,
    nav: typeof p.nav === 'boolean' ? p.nav : debugOptions.nav,
  };
  for (const fn of debugSinks.values()) {
    try {
      fn({ ...debugOptions });
    } catch {
      /* one broken drawer must not stop the others */
    }
  }
  return { ...debugOptions };
}

/** Re-send the options now in force to every drawer (a navmesh that arrived after the overlay was switched on). */
export function refreshDebug() {
  applyDebug({});
}

/** @type {(() => { polygons: [number, number][][] }) | null} */
let navSource = null;

/**
 * Register what `window.__midnite.navMesh()` reports: the newest navmesh's polygons. The returned function
 * unregisters it, but only while it is still the current source.
 * @param {() => { polygons: [number, number][][] }} fn
 * @returns {() => void}
 */
export function registerNavMesh(fn) {
  navSource = fn;
  return () => {
    if (navSource === fn) navSource = null;
  };
}

/** The navmesh as `{ polygons }` (`[x, z]` metres), empty when the game has none. */
function readNavMesh() {
  try {
    return navSource ? navSource() : { polygons: [] };
  } catch {
    return { polygons: [] };
  }
}

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
    /** Jump to level `name` (`levels/<name>.tmj`): reloads on `?midnite-level=` unless the engine loop restarts in place. */
    goto: gotoByReload,
    /** Restart on the level's own scene with the player placed at `x, y[, z]` (`?midnite-spawn=`). */
    spawnAt: spawnByReload,
    /** The live objects as `{ id, type, x, y, z?, alive, state? }[]` (Phase 140 D); empty before any level loads. */
    entities: collectEntities,
    /** Switch the debug overlays (Phase 140 G): colliders, triggers, nav-mesh. */
    debug: applyDebug,
    /** The navmesh's polygons, `[x, z]` metres; empty without one. */
    navMesh: readNavMesh,
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
