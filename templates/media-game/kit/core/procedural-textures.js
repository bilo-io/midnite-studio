// @ts-check
/**
 * Midnite game kit — procedural textures (engine-free).
 *
 * No image files: every surface is generated in code from a seed, so a game
 * stays licence-free and a seed replays. The pure half (`generateTextureData`)
 * works on plain typed arrays, so it runs under node and in the browser alike;
 * `generateCanvases` wraps the same data in canvases for three's `CanvasTexture`
 * or Phaser's `textures.addCanvas`.
 *
 * Every pattern builds ONE height field in [0, 1]. The albedo is coloured from
 * it, the normal map is its Sobel gradient (OpenGL convention: +Y up, which is
 * what both three's `normalMap` and Phaser's `Light2D` read), and the bump map
 * is the height field as grey. Textures tile seamlessly: all noise is periodic.
 */

/** Pattern names `generateTextureData` knows. */
export const TEXTURE_KINDS = /** @type {const} */ (['stone', 'brick', 'wood', 'metal', 'grass', 'dirt', 'tiles']);

/** @typedef {typeof TEXTURE_KINDS[number]} TextureKind */

/**
 * Default palettes, 0xRRGGBB. `base` is the body colour, `accent` the second tone.
 * @type {Record<TextureKind, { base: number, accent: number, roughness: number }>}
 */
export const TEXTURE_PALETTES = {
  stone: { base: 0x6b7280, accent: 0x9ca3af, roughness: 0.9 },
  brick: { base: 0x9a4a35, accent: 0xc9b8a0, roughness: 0.85 },
  wood: { base: 0x8a5a30, accent: 0x4e3015, roughness: 0.7 },
  metal: { base: 0x8d98a6, accent: 0x4b5563, roughness: 0.35 },
  grass: { base: 0x4c8a3a, accent: 0x2c5a24, roughness: 0.95 },
  dirt: { base: 0x6e5238, accent: 0x3e2d1e, roughness: 0.95 },
  tiles: { base: 0xc8ccd2, accent: 0x7d8590, roughness: 0.45 },
};

/** Integer hash of a lattice point and a seed, as a float in [0, 1). */
export function hash2(seed, x, y) {
  let h = (Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const smooth = (/** @type {number} */ t) => t * t * (3 - 2 * t);

/**
 * Smooth value noise in [0, 1) that repeats every `period` lattice cells on both axes.
 * @param {number} seed
 * @param {number} x
 * @param {number} y
 * @param {number} [period] lattice cells per repeat; 0 = no wrapping
 */
export function valueNoise(seed, x, y, period = 0) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = smooth(x - x0);
  const fy = smooth(y - y0);
  const wrap = (/** @type {number} */ v) => (period > 0 ? ((v % period) + period) % period : v);
  const a = hash2(seed, wrap(x0), wrap(y0));
  const b = hash2(seed, wrap(x0 + 1), wrap(y0));
  const c = hash2(seed, wrap(x0), wrap(y0 + 1));
  const d = hash2(seed, wrap(x0 + 1), wrap(y0 + 1));
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

/**
 * Fractal Brownian motion: summed octaves of `valueNoise`, normalised to [0, 1).
 * With `period` the result tiles (the period doubles with the frequency).
 * @param {number} seed
 * @param {number} x
 * @param {number} y
 * @param {{ octaves?: number, lacunarity?: number, gain?: number, period?: number }} [o]
 */
export function fbm(seed, x, y, o = {}) {
  const octaves = o.octaves ?? 4;
  const lacunarity = o.lacunarity ?? 2;
  const gain = o.gain ?? 0.5;
  let freq = 1;
  let amp = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i += 1) {
    const period = o.period ? Math.round(o.period * freq) : 0;
    sum += amp * valueNoise(seed + i * 101, x * freq, y * freq, period);
    norm += amp;
    freq *= lacunarity;
    amp *= gain;
  }
  return sum / norm;
}

/**
 * Normal map from a height field with a Sobel filter, wrapping at the edges so it tiles.
 * Output is RGBA bytes, OpenGL convention (green = +Y up). `strength` scales the slope.
 * @param {ArrayLike<number>} height width × height values in [0, 1]
 * @param {number} width
 * @param {number} h
 * @param {number} [strength]
 * @returns {Uint8ClampedArray}
 */
export function heightToNormal(height, width, h, strength = 2) {
  const out = new Uint8ClampedArray(width * h * 4);
  const at = (/** @type {number} */ x, /** @type {number} */ y) =>
    /** @type {number} */ (height[((y + h) % h) * width + ((x + width) % width)]);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
      // Image y grows downward; the normal's +Y is up, so the slope is negated.
      const dy = (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1)) - (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1));
      let nx = -dx * strength;
      let ny = -dy * strength;
      let nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len;
      ny /= len;
      nz /= len;
      const i = (y * width + x) * 4;
      out[i] = Math.round((nx * 0.5 + 0.5) * 255);
      out[i + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      out[i + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      out[i + 3] = 255;
    }
  }
  return out;
}

/**
 * A grey RGBA image from a [0, 1] field (a bump map, or a roughness map).
 * @param {ArrayLike<number>} field
 * @returns {Uint8ClampedArray}
 */
export function fieldToGrey(field) {
  const out = new Uint8ClampedArray(field.length * 4);
  for (let i = 0; i < field.length; i += 1) {
    const v = Math.round(Math.min(1, Math.max(0, /** @type {number} */ (field[i]))) * 255);
    out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = v;
    out[i * 4 + 3] = 255;
  }
  return out;
}

/** @param {number} c 0xRRGGBB @returns {[number, number, number]} */
const rgb = (c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
const mix = (/** @type {[number, number, number]} */ a, /** @type {[number, number, number]} */ b, /** @type {number} */ t) =>
  /** @type {[number, number, number]} */ ([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
const clamp01 = (/** @type {number} */ v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Per-pixel surface sample: `height` and `tone` (0 = accent, 1 = base) in [0, 1],
 * `rough` an offset applied to the preset roughness, `tint` a per-cell brightness multiplier.
 * @typedef {{ height: number, tone: number, rough: number, tint?: number }} Sample
 */

/** @type {Record<TextureKind, (seed: number, u: number, v: number, size: number) => Sample>} */
const SAMPLERS = {
  stone(seed, u, v, size) {
    const p = 4;
    const n = fbm(seed, u * p, v * p, { octaves: 5, period: p });
    const crack = Math.abs(fbm(seed + 7, u * 6, v * 6, { octaves: 3, period: 6 }) - 0.5);
    const groove = crack < 0.014 ? 0.55 + (crack / 0.014) * 0.45 : 1;
    const speck = hash2(seed, Math.floor(u * size), Math.floor(v * size)) > 0.97 ? 0.15 : 0;
    return { height: clamp01(n * 0.75 * groove + 0.2 + speck * 0.3), tone: clamp01(n + speck), rough: (n - 0.5) * 0.2 };
  },
  brick(seed, u, v) {
    const rows = 8;
    const cols = 4;
    const row = Math.floor(v * rows);
    const x = u * cols + (row % 2) * 0.5;
    const col = Math.floor(x);
    const fx = x - col;
    const fy = v * rows - row;
    const edge = Math.min(fx, 1 - fx, fy * (cols / rows) * 2, (1 - fy) * (cols / rows) * 2);
    const mortar = edge < 0.05;
    const bevel = clamp01(edge / 0.09);
    const cell = hash2(seed, ((col % cols) + cols) % cols, row);
    const grain = fbm(seed + 3, u * 24, v * 24, { octaves: 3, period: 24 });
    return { height: mortar ? 0 : clamp01(0.5 + bevel * 0.35 + (grain - 0.5) * 0.15), tone: mortar ? 0.1 : clamp01(0.3 + cell * 0.7), rough: mortar ? 0.1 : (grain - 0.5) * 0.15, tint: mortar ? 1.05 : 0.8 + cell * 0.35 };
  },
  wood(seed, u, v) {
    const planks = 4;
    const plank = Math.floor(u * planks);
    const fx = u * planks - plank;
    const warp = fbm(seed + plank, u * 3, v * 2, { octaves: 3, period: 3 });
    const ring = Math.sin((fx * 0.6 + warp * 2.4 + hash2(seed, plank, 0) * 6) * 18) * 0.5 + 0.5;
    const fibre = fbm(seed + 9, u * 4, v * 64, { octaves: 2, period: 4 });
    const gap = fx < 0.03 || fx > 0.97;
    return { height: gap ? 0 : clamp01(0.45 + ring * 0.2 + fibre * 0.25), tone: clamp01(ring * 0.6 + fibre * 0.4), rough: (fibre - 0.5) * 0.2, tint: 0.88 + hash2(seed + 1, plank, 1) * 0.24 };
  },
  metal(seed, u, v, size) {
    // Brushed: noise stretched along u, plus panel seams and rivets.
    const brush = fbm(seed, u * 2, v * 96, { octaves: 3, period: 2 });
    const seam = Math.min(Math.abs(u - 0.5), Math.abs(v - 0.5), u, 1 - u, v, 1 - v) < 0.012 ? 1 : 0;
    const rx = (u * 4) % 1;
    const ry = (v * 4) % 1;
    const rivet = Math.hypot(rx - 0.5, ry - 0.5) < 0.05 ? 1 : 0;
    const scratch = hash2(seed, Math.floor(u * size * 0.25), Math.floor(v * size)) > 0.985 ? 0.2 : 0;
    return { height: clamp01(0.55 + (brush - 0.5) * 0.12 - seam * 0.4 + rivet * 0.3), tone: clamp01(0.5 + (brush - 0.5) * 0.8 + scratch), rough: (brush - 0.5) * 0.2 + seam * 0.3 };
  },
  grass(seed, u, v) {
    const blades = fbm(seed, u * 48, v * 20, { octaves: 2, period: 48 });
    const clump = fbm(seed + 5, u * 5, v * 5, { octaves: 3, period: 5 });
    return { height: clamp01(blades * 0.7 + clump * 0.3), tone: clamp01(clump * 0.6 + blades * 0.5 - 0.1), rough: 0.05 };
  },
  dirt(seed, u, v) {
    const n = fbm(seed, u * 6, v * 6, { octaves: 5, period: 6 });
    const pebble = Math.max(0, valueNoise(seed + 9, u * 20, v * 20, 20) - 0.68) * 3.2;
    return { height: clamp01(n * 0.7 + pebble * 0.4), tone: clamp01(n * 0.8 + pebble * 0.3), rough: (n - 0.5) * 0.1 };
  },
  tiles(seed, u, v) {
    const cells = 4;
    const cx = Math.floor(u * cells);
    const cy = Math.floor(v * cells);
    const fx = u * cells - cx;
    const fy = v * cells - cy;
    const edge = Math.min(fx, 1 - fx, fy, 1 - fy);
    const grout = edge < 0.04;
    const bevel = clamp01((edge - 0.04) / 0.08);
    const cell = hash2(seed, cx, cy);
    const wear = fbm(seed + 2, u * 16, v * 16, { octaves: 3, period: 16 });
    return { height: grout ? 0 : clamp01(0.6 + bevel * 0.3 - wear * 0.1), tone: grout ? 0 : clamp01(0.55 + cell * 0.25 + (wear - 0.5) * 0.2), rough: grout ? 0.3 : (wear - 0.5) * 0.2, tint: grout ? 0.55 : 1 };
  },
};

/**
 * Generate one surface: a height field plus the albedo, normal, roughness and bump images
 * (RGBA bytes). Pure and deterministic: the same arguments give identical bytes.
 * @param {TextureKind} kind
 * @param {{ seed?: number, size?: number, base?: number, accent?: number, normalStrength?: number, roughness?: number }} [options]
 * @returns {{ kind: TextureKind, size: number, height: Float32Array, albedo: Uint8ClampedArray, normal: Uint8ClampedArray, roughness: Uint8ClampedArray, bump: Uint8ClampedArray }}
 */
export function generateTextureData(kind, options = {}) {
  const sampler = SAMPLERS[kind];
  if (!sampler) throw new Error(`unknown texture kind: ${kind}`);
  const palette = TEXTURE_PALETTES[kind];
  const seed = options.seed ?? 1;
  const size = Math.max(8, Math.floor(options.size ?? 256));
  const base = rgb(options.base ?? palette.base);
  const accent = rgb(options.accent ?? palette.accent);
  const rough0 = options.roughness ?? palette.roughness;
  const height = new Float32Array(size * size);
  const albedo = new Uint8ClampedArray(size * size * 4);
  const rough = new Float32Array(size * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const s = sampler(seed, x / size, y / size, size);
      const i = y * size + x;
      height[i] = s.height;
      // Crevices (low height) are darker: cheap baked ambient occlusion.
      const shade = (0.6 + s.height * 0.5) * (s.tint ?? 1);
      const c = mix(accent, base, s.tone);
      albedo[i * 4] = c[0] * shade;
      albedo[i * 4 + 1] = c[1] * shade;
      albedo[i * 4 + 2] = c[2] * shade;
      albedo[i * 4 + 3] = 255;
      rough[i] = clamp01(rough0 + s.rough);
    }
  }
  return {
    kind,
    size,
    height,
    albedo,
    normal: heightToNormal(height, size, size, options.normalStrength ?? 2),
    roughness: fieldToGrey(rough),
    bump: fieldToGrey(height),
  };
}

/**
 * The same set as canvases (browser only), ready for `THREE.CanvasTexture` or Phaser `textures.addCanvas`.
 * @param {TextureKind} kind
 * @param {Parameters<typeof generateTextureData>[1]} [options]
 */
export function generateCanvases(kind, options = {}) {
  const data = generateTextureData(kind, options);
  const toCanvas = (/** @type {Uint8ClampedArray} */ pixels) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = data.size;
    const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
    ctx.putImageData(new ImageData(/** @type {any} */ (pixels), data.size, data.size), 0, 0);
    return canvas;
  };
  return {
    kind,
    size: data.size,
    albedo: toCanvas(data.albedo),
    normal: toCanvas(data.normal),
    roughness: toCanvas(data.roughness),
    bump: toCanvas(data.bump),
  };
}
