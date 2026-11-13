/**
 * mulberry32: a tiny seeded PRNG returning floats in [0, 1). Every random draw in every engine goes through it
 * (`Math.random` is banned under `renderer/engine` and `renderer/sims` by eslint), which is what makes a
 * scenario replay identically from its seed.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
