// @ts-check
/**
 * Midnite game kit — juice settings (engine-free).
 *
 * Juice (shake, flashes, particles, post-processing, sound) is ON by default,
 * with a master `intensity` and a switch for each family. The prefers-reduced-
 * motion media query scales shake and flashes down (`REDUCED_MOTION_SCALE`),
 * and `off()` turns everything off for pristine, deterministic screenshots.
 *
 * Settings persist through the kit's save store (slot `juice-settings`) and are
 * exposed on `window.__midnite.juice` so a play-test can read or override them:
 * `juice.get()`, `juice.resolved()`, `juice.set(patch)`, `juice.off()`,
 * `juice.on()`, `juice.reset()`. A `?juice=off` URL parameter starts a run with juice off.
 */

import { extendHook } from './hook.js';
import { createSaveStore } from './save.js';

/**
 * @typedef {{
 *   enabled: boolean,
 *   intensity: number,
 *   shake: boolean,
 *   flash: boolean,
 *   particles: boolean,
 *   postfx: boolean,
 *   volume: number,
 *   reducedMotion: 'auto' | 'on' | 'off',
 * }} JuiceSettings
 */

/** @type {Readonly<JuiceSettings>} */
export const DEFAULT_JUICE_SETTINGS = Object.freeze({
  enabled: true,
  intensity: 1,
  shake: true,
  flash: true,
  particles: true,
  postfx: true,
  volume: 0.8,
  reducedMotion: 'auto',
});

/** Multipliers applied while reduced motion is on. */
export const REDUCED_MOTION_SCALE = Object.freeze({ shake: 0.25, flash: 0.3 });

/** Whether the user prefers reduced motion (false off the browser). */
export function detectReducedMotion() {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

const clamp = (/** @type {number} */ v, /** @type {number} */ lo, /** @type {number} */ hi) => Math.min(hi, Math.max(lo, v));

/**
 * Coerce anything (a saved blob, a patch) into valid settings, filling gaps from `base`.
 * @param {unknown} input
 * @param {JuiceSettings} [base]
 * @returns {JuiceSettings}
 */
export function normalizeSettings(input, base = { ...DEFAULT_JUICE_SETTINGS }) {
  const src = input && typeof input === 'object' ? /** @type {Record<string, unknown>} */ (input) : {};
  const bool = (/** @type {string} */ k, /** @type {boolean} */ d) => (typeof src[k] === 'boolean' ? /** @type {boolean} */ (src[k]) : d);
  const num = (/** @type {string} */ k, /** @type {number} */ d, /** @type {number} */ hi) =>
    typeof src[k] === 'number' && Number.isFinite(src[k]) ? clamp(/** @type {number} */ (src[k]), 0, hi) : d;
  const rm = src['reducedMotion'];
  return {
    enabled: bool('enabled', base.enabled),
    intensity: num('intensity', base.intensity, 2),
    shake: bool('shake', base.shake),
    flash: bool('flash', base.flash),
    particles: bool('particles', base.particles),
    postfx: bool('postfx', base.postfx),
    volume: num('volume', base.volume, 1),
    reducedMotion: rm === 'on' || rm === 'off' || rm === 'auto' ? rm : base.reducedMotion,
  };
}

/**
 * The settings reducer. Actions: `{ type: 'patch', patch }`, `{ type: 'off' }`, `{ type: 'on' }`, `{ type: 'reset' }`.
 * @param {JuiceSettings} state
 * @param {{ type: 'patch', patch: Partial<JuiceSettings> } | { type: 'off' } | { type: 'on' } | { type: 'reset' }} action
 * @returns {JuiceSettings}
 */
export function juiceReducer(state, action) {
  switch (action.type) {
    case 'patch':
      return normalizeSettings(action.patch, state);
    case 'off':
      return { ...state, enabled: false };
    case 'on':
      return { ...state, enabled: true };
    case 'reset':
      return { ...DEFAULT_JUICE_SETTINGS };
    default:
      return state;
  }
}

/**
 * What the engines actually apply: every family already multiplied by intensity and reduced motion.
 * `shake` and `flash` are scales (0 = none), `particles` a count scale, `postfx` a switch, `volume` 0..1.
 * @typedef {{ enabled: boolean, reducedMotion: boolean, intensity: number, shake: number, flash: number, particles: number, postfx: boolean, volume: number }} ResolvedJuice
 * @param {JuiceSettings} s
 * @param {{ reducedMotion?: boolean }} [env] pass `reducedMotion` to override the media query (tests)
 * @returns {ResolvedJuice}
 */
export function resolveJuice(s, env = {}) {
  const reduced = s.reducedMotion === 'on' || (s.reducedMotion === 'auto' && (env.reducedMotion ?? detectReducedMotion()));
  const on = s.enabled;
  const k = on ? s.intensity : 0;
  return {
    enabled: on,
    reducedMotion: reduced,
    intensity: k,
    shake: on && s.shake ? k * (reduced ? REDUCED_MOTION_SCALE.shake : 1) : 0,
    flash: on && s.flash ? k * (reduced ? REDUCED_MOTION_SCALE.flash : 1) : 0,
    particles: on && s.particles ? k * (reduced ? 0.5 : 1) : 0,
    postfx: on && s.postfx && !reduced,
    // Volume is independent of the visual master switch except that `off` mutes too: it is the pristine mode.
    volume: on ? s.volume : 0,
  };
}

/**
 * A settings store: `get`, `set(patch)`, `off()`, `on()`, `reset()`, `resolved()`, `subscribe(fn)`.
 * Loads from and saves to the kit's save store when `gameName` is given, honours `?juice=off`,
 * and publishes itself as `window.__midnite.juice`.
 * @param {{ gameName?: string, storage?: Parameters<typeof createSaveStore>[0]['storage'], initial?: Partial<JuiceSettings>, reducedMotion?: () => boolean, search?: string, expose?: boolean }} [options]
 */
export function createJuiceSettings(options = {}) {
  const save = options.gameName ? createSaveStore({ gameName: options.gameName, storage: options.storage }) : null;
  let state = normalizeSettings(options.initial ?? {});
  if (save) state = normalizeSettings(save.load('juice-settings'), state);
  const search = options.search ?? (typeof location === 'undefined' ? '' : location.search);
  if (/[?&]juice=off\b/.test(search)) state = juiceReducer(state, { type: 'off' });
  /** @type {Set<(s: JuiceSettings) => void>} */
  const listeners = new Set();
  const dispatch = (/** @type {Parameters<typeof juiceReducer>[1]} */ action, /** @type {boolean} */ persist = true) => {
    state = juiceReducer(state, action);
    if (persist) save?.save('juice-settings', state);
    for (const fn of listeners) fn(state);
    return state;
  };
  const store = {
    get: () => ({ ...state }),
    resolved: () => resolveJuice(state, { reducedMotion: options.reducedMotion?.() }),
    /** @param {Partial<JuiceSettings>} patch */
    set: (patch) => ({ ...dispatch({ type: 'patch', patch }) }),
    /** Turn all juice off for this run only (not saved): pristine screenshots. */
    off: () => ({ ...dispatch({ type: 'off' }, false) }),
    on: () => ({ ...dispatch({ type: 'on' }, false) }),
    reset: () => ({ ...dispatch({ type: 'reset' }) }),
    /** @param {(s: JuiceSettings) => void} fn @returns {() => void} unsubscribe */
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
  if (options.expose !== false) extendHook('juice', { get: store.get, resolved: store.resolved, set: store.set, off: store.off, on: store.on, reset: store.reset });
  return store;
}
