/**
 * Seeded procedural noise for terrains with no heightmap (Phase 105 Theme C). Pure typed arrays, no
 * `Math.random`: every stage of the terrain pipeline draws from {@link createRng}, so a terrain is
 * reproducible from its seed.
 */
export type NoiseParams = {
  seed: number;
  octaves: number;
  frequency: number;
  persistence: number;
  lacunarity: number;
  /** Multiplies the field by `1 − smoothstep(0.6, 1.0, r)`, `r` the normalised distance to the centre. */
  island?: boolean;
};

/** mulberry32: a 32-bit PRNG returning floats in `[0, 1)`. */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;
const GRADS: ReadonlyArray<readonly [number, number]> = [
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** 2-D simplex noise over a permutation table shuffled from `rng`; returns values in about `[-1, 1]`. */
export function simplex2(rng: () => number): (x: number, y: number) => number {
  const base = new Uint8Array(256);
  for (let i = 0; i < 256; i += 1) base[i] = i;
  for (let i = 255; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = base[i]!;
    base[i] = base[j]!;
    base[j] = tmp;
  }
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i += 1) perm[i] = base[i & 255]!;

  return (xin, yin) => {
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const x0 = xin - (i - t);
    const y0 = yin - (j - t);
    const i1 = x0 > y0 ? 1 : 0;
    const j1 = x0 > y0 ? 0 : 1;
    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2;
    const y2 = y0 - 1 + 2 * G2;
    const ii = i & 255;
    const jj = j & 255;
    const corner = (x: number, y: number, gi: number): number => {
      const falloff = 0.5 - x * x - y * y;
      if (falloff < 0) return 0;
      const g = GRADS[gi % 8]!;
      const f2 = falloff * falloff;
      return f2 * f2 * (g[0] * x + g[1] * y);
    };
    const n0 = corner(x0, y0, perm[ii + perm[jj]!]!);
    const n1 = corner(x1, y1, perm[ii + i1 + perm[jj + j1]!]!);
    const n2 = corner(x2, y2, perm[ii + 1 + perm[jj + 1]!]!);
    return 70 * (n0 + n1 + n2);
  };
}

const smoothstep = (a: number, b: number, v: number): number => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function normalise(field: Float32Array): void {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < field.length; i += 1) {
    const v = field[i]!;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const span = max - min;
  for (let i = 0; i < field.length; i += 1) field[i] = span > 0 ? (field[i]! - min) / span : 0;
}

function applyIsland(field: Float32Array, res: number): void {
  const half = (res - 1) / 2;
  for (let z = 0; z < res; z += 1) {
    for (let x = 0; x < res; x += 1) {
      const r = Math.min(1.4142, Math.hypot(x - half, z - half) / half);
      field[z * res + x] = field[z * res + x]! * (1 - smoothstep(0.6, 1, r));
    }
  }
}

/** Fractional Brownian motion on a `res × res` grid, normalised to `[0, 1]`. */
export function fbmField(res: number, params: NoiseParams): Float32Array {
  const noise = simplex2(createRng(params.seed));
  const out = new Float32Array(res * res);
  const scale = params.frequency / Math.max(1, res - 1);
  for (let z = 0; z < res; z += 1) {
    for (let x = 0; x < res; x += 1) {
      let amp = 1;
      let freq = 1;
      let sum = 0;
      for (let o = 0; o < params.octaves; o += 1) {
        sum += amp * noise(x * scale * freq + o * 17.3, z * scale * freq - o * 9.1);
        amp *= params.persistence;
        freq *= params.lacunarity;
      }
      out[z * res + x] = sum;
    }
  }
  normalise(out);
  if (params.island) applyIsland(out, res);
  return out;
}

/** Ridged multifractal (sharp crests, broad valleys) on a `res × res` grid, normalised to `[0, 1]`. */
export function ridgedField(res: number, params: NoiseParams): Float32Array {
  const noise = simplex2(createRng(params.seed));
  const out = new Float32Array(res * res);
  const scale = params.frequency / Math.max(1, res - 1);
  for (let z = 0; z < res; z += 1) {
    for (let x = 0; x < res; x += 1) {
      let amp = 1;
      let freq = 1;
      let weight = 1;
      let sum = 0;
      for (let o = 0; o < params.octaves; o += 1) {
        let signal = 1 - Math.abs(noise(x * scale * freq + o * 17.3, z * scale * freq - o * 9.1));
        signal *= signal * weight;
        weight = Math.min(1, Math.max(0, signal * 2));
        sum += signal * amp;
        amp *= params.persistence;
        freq *= params.lacunarity;
      }
      out[z * res + x] = sum;
    }
  }
  normalise(out);
  if (params.island) applyIsland(out, res);
  return out;
}
