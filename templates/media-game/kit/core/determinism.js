// @ts-check
/**
 * Midnite game kit — deterministic mode (engine-free).
 *
 * When the runner starts a game with `?midnite-deterministic=1` (the manifest's
 * `deterministic: true`, or any play-test run), this module — loaded by
 * `index.html` before any game module, and imported by the hook as a backstop —
 * replaces `Math.random` with a seeded mulberry32 and `performance.now` /
 * `Date.now` with a virtual clock. The kit loops advance that clock by exactly
 * one step per fixed step and ignore wall time, so the same seed plus the same
 * input gives the same `getState()` trace.
 *
 * Not covered: physics engines' own SIMD paths across machines (Rapier's
 * `-compat` build is deterministic on one machine), `new Date()` with no
 * arguments, and anything a game reads from the network or storage.
 */

import { createRng, rng } from './rng.js';

export const DETERMINISM_PARAMS = {
  deterministic: 'midnite-deterministic',
  seed: 'midnite-seed',
  paused: 'midnite-paused',
};

/** `Date.now()` in deterministic mode starts here (2026-01-01T00:00:00Z) and moves with the virtual clock. */
export const VIRTUAL_EPOCH_MS = 1_767_225_600_000;

/**
 * Read the runner's query. Never throws.
 * @param {string} [search]
 */
export function readDeterminismParams(search) {
  try {
    const query = new URLSearchParams(search ?? globalThis.location?.search ?? '');
    const seed = Number.parseInt(query.get(DETERMINISM_PARAMS.seed) ?? '', 10);
    return {
      enabled: query.get(DETERMINISM_PARAMS.deterministic) === '1',
      seed: Number.isFinite(seed) ? seed : 1,
      paused: query.get(DETERMINISM_PARAMS.paused) === '1',
    };
  } catch {
    return { enabled: false, seed: 1, paused: false };
  }
}

/**
 * @param {{ enabled: boolean, seed: number, paused: boolean }} options
 */
export function createDeterminism(options) {
  let virtualMs = 0;
  let seed = options.seed;
  let installed = false;
  // `Math.random`'s own stream, so game code calling it does not shift the kit's `rng` sequence.
  const mathRng = createRng(seed);

  const determinism = {
    enabled: options.enabled,
    /** Start the kit loop paused after its first step (a play-test run). */
    startPaused: options.paused,
    get seed() {
      return seed;
    },
    /** Virtual milliseconds since boot. */
    get now() {
      return virtualMs;
    },
    get installed() {
      return installed;
    },
    /**
     * Move the virtual clock by one step. A no-op outside deterministic mode.
     * @param {number} ms
     */
    advance(ms) {
      if (options.enabled && ms > 0) virtualMs += ms;
    },
    /**
     * Restart both random streams — the kit's `rng` and `Math.random` — from `next`.
     * @param {number} next
     */
    reseed(next) {
      seed = next;
      rng.reseed(next);
      mathRng.reseed(next ^ 0x5bd1e995);
    },
    /**
     * Patch the globals. Only in deterministic mode, and only once.
     * @param {{ Math: Math, performance?: { now: () => number }, Date: { now: () => number } }} [target]
     */
    install(target = /** @type {any} */ (globalThis)) {
      if (!options.enabled || installed) return false;
      installed = true;
      determinism.reseed(seed);
      target.Math.random = () => mathRng.next();
      const perf = target.performance;
      if (perf) {
        try {
          Object.defineProperty(perf, 'now', { value: () => virtualMs, configurable: true, writable: true });
        } catch {
          // A frozen `performance` keeps wall time; the loops still ignore it.
        }
      }
      target.Date.now = () => VIRTUAL_EPOCH_MS + virtualMs;
      return true;
    },
  };
  return determinism;
}

/** The page's one instance, installed as this module is evaluated. */
export const determinism = createDeterminism(readDeterminismParams());
determinism.install();
