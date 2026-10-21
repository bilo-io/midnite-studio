// @ts-check
/**
 * Midnite game kit — a seeded random number generator (engine-free).
 *
 * mulberry32: tiny, fast and good enough for games. The same seed gives the
 * same sequence on every machine, which is what makes a play-test replayable
 * (`window.__midnite.setSeed(n)`).
 */

/**
 * @param {number} seed any number; only its low 32 bits matter
 */
export function createRng(seed = 1) {
  let state = seed >>> 0;
  const rng = {
    /** The seed this generator was last (re)seeded with. */
    get seed() {
      return seed;
    },
    /** Re-seed in place: every holder of this generator restarts the sequence. */
    reseed(/** @type {number} */ next) {
      seed = next;
      state = next >>> 0;
    },
    /** A float in [0, 1). */
    next() {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    /** An integer in [min, max], both inclusive. */
    int(/** @type {number} */ min, /** @type {number} */ max) {
      return min + Math.floor(rng.next() * (max - min + 1));
    },
    /** A float in [min, max). */
    range(/** @type {number} */ min, /** @type {number} */ max) {
      return min + rng.next() * (max - min);
    },
    /**
     * One element of a non-empty array.
     * @template T
     * @param {readonly T[]} items
     * @returns {T}
     */
    pick(items) {
      return /** @type {T} */ (items[Math.floor(rng.next() * items.length)]);
    },
  };
  return rng;
}

/** The kit's shared generator: presets and genre systems draw from it, and `setSeed` reseeds it. */
export const rng = createRng(1);
