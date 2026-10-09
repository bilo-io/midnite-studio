// @ts-check
/**
 * Open world ground: which detail texture each patch of land wears, and what it sounds like underfoot.
 * Engine-free and pure, so a vitest can pin it. `level.js` turns the weights into a texture that the
 * terrain's drape material blends three procedural normal maps by.
 */

/**
 * How much of each detail layer (grass, dirt, rock) a land-cover class wears. Rows sum to 1.
 * @type {Record<string, [number, number, number]>}
 */
export const SPLAT_WEIGHTS = {
  grass: [1, 0, 0],
  tree: [0.55, 0.45, 0],
  bare: [0.1, 0.9, 0],
  rock: [0, 0.1, 0.9],
  water: [0, 1, 0],
  road: [0, 0.7, 0.3],
  building: [0, 0.6, 0.4],
  other: [0.4, 0.4, 0.2],
};

/** What a footstep sounds like on each class, with the pitch that suits it. */
export const SURFACES = /** @type {const} */ ({
  grass: { sound: 'footstep', pitch: 0.9, dust: 0 },
  tree: { sound: 'footstep', pitch: 0.8, dust: 0 },
  bare: { sound: 'footstep', pitch: 1.0, dust: 1 },
  rock: { sound: 'footstep', pitch: 1.35, dust: 0 },
  water: { sound: 'land', pitch: 1.2, dust: 0 },
  road: { sound: 'footstep', pitch: 1.2, dust: 0.4 },
  building: { sound: 'footstep', pitch: 1.3, dust: 0 },
  other: { sound: 'footstep', pitch: 1, dust: 0.3 },
});

/**
 * RGBA bytes (R grass, G dirt, B rock) at `out` × `out`, ready for a linearly filtered texture. Rows are
 * written bottom-up because three's `v` runs south to north while the land cover's rows run north to south.
 * @param {ArrayLike<number>} classes class index per pixel, row-major from the north edge
 * @param {number} size the land cover's width (and height)
 * @param {{ classes: string[] }} legend
 * @param {number} out
 */
export function splatTexture(classes, size, legend, out) {
  const rgba = new Uint8Array(out * out * 4);
  for (let y = 0; y < out; y += 1) {
    const sy = Math.min(size - 1, Math.floor(((y + 0.5) / out) * size));
    const row = out - 1 - y;
    for (let x = 0; x < out; x += 1) {
      const sx = Math.min(size - 1, Math.floor(((x + 0.5) / out) * size));
      const name = legend.classes[classes[sy * size + sx] ?? 0] ?? 'other';
      const [g = 0, d = 0, r = 0] = SPLAT_WEIGHTS[name] ?? SPLAT_WEIGHTS['other'] ?? [];
      rgba.set([Math.round(g * 255), Math.round(d * 255), Math.round(r * 255), 255], (row * out + x) * 4);
    }
  }
  return rgba;
}

/**
 * The land-cover class name under world `(x, z)` (north is −z; the pack's origin is its centre).
 * @param {ArrayLike<number>} classes
 * @param {number} size
 * @param {{ classes: string[] }} legend
 * @param {number} worldSize
 * @param {number} x
 * @param {number} z
 */
export function classAt(classes, size, legend, worldSize, x, z) {
  const col = Math.min(size - 1, Math.max(0, Math.floor((x / worldSize + 0.5) * size)));
  const row = Math.min(size - 1, Math.max(0, Math.floor((z / worldSize + 0.5) * size)));
  return legend.classes[classes[row * size + col] ?? 0] ?? 'other';
}
