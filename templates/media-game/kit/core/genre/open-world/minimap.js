// @ts-check
/**
 * Midnite game kit — a minimap from a terrain pack's land cover (engine-free).
 *
 * `maps/landcover.png` is 8-bit greyscale, one class index per pixel, and
 * `maps/landcover.json` (`landcoverLegend`) names the classes and their
 * colours. `minimapPixels` turns the two into RGBA at the minimap's size (a
 * nearest-neighbour downsample — classes must not blend); `worldToMinimap`
 * places a world point on it. North (−z) is up.
 */

/** `#rrggbb` → `[r, g, b]`. */
export function hexRgb(/** @type {string} */ hex) {
  const n = parseInt(hex.replace(/^#/, ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * @param {ArrayLike<number>} classes class index per pixel, row-major from the north edge
 * @param {number} size the land cover's width (and height)
 * @param {{ classes: string[], colours: Record<string, string> }} legend
 * @param {number} out the minimap's width (and height) in pixels
 * @returns {Uint8ClampedArray} `out × out × 4`
 */
export function minimapPixels(classes, size, legend, out) {
  const palette = legend.classes.map((name) => hexRgb(legend.colours[name] ?? '#808080'));
  const rgba = new Uint8ClampedArray(out * out * 4);
  for (let y = 0; y < out; y += 1) {
    const sy = Math.min(size - 1, Math.floor(((y + 0.5) / out) * size));
    for (let x = 0; x < out; x += 1) {
      const sx = Math.min(size - 1, Math.floor(((x + 0.5) / out) * size));
      const [r = 128, g = 128, b = 128] = palette[classes[sy * size + sx] ?? 0] ?? [];
      rgba.set([r, g, b, 255], (y * out + x) * 4);
    }
  }
  return rgba;
}

/**
 * A world point on the minimap: the pack's origin is its centre, so `x` and
 * `z` run from −worldSize/2 to +worldSize/2.
 * @param {number} x
 * @param {number} z
 * @param {number} worldSize
 * @param {number} size minimap pixels
 */
export function worldToMinimap(x, z, worldSize, size) {
  return [((x / worldSize) + 0.5) * size, ((z / worldSize) + 0.5) * size];
}
