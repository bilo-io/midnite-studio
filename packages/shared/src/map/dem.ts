/** DEM tile decode and no-data handling. Heights are metres, row-major. */
export type DemEncoding = 'terrarium' | 'terrain-rgb';

/** `rgba` is 4 bytes per pixel. A fully transparent pixel (A = 0) is no-data → `NaN`. */
export function decodeDem(rgba: Uint8Array, encoding: DemEncoding): Float32Array {
  const count = Math.floor(rgba.length / 4);
  const out = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    const o = i * 4;
    if (rgba[o + 3] === 0) {
      out[i] = Number.NaN;
      continue;
    }
    const r = rgba[o]!;
    const g = rgba[o + 1]!;
    const b = rgba[o + 2]!;
    out[i] =
      encoding === 'terrarium'
        ? r * 256 + g + b / 256 - 32768
        : -10000 + (r * 65536 + g * 256 + b) * 0.1;
  }
  return out;
}

/** Encodes one height as a Terrarium RGB triple (the inverse of `decodeDem`; used by fixtures). */
export function encodeTerrarium(heightM: number): [number, number, number] {
  const v = Math.max(0, Math.min(65535.99609375, heightM + 32768));
  const r = Math.floor(v / 256);
  const g = Math.floor(v - r * 256);
  const b = Math.round((v - r * 256 - g) * 256);
  return b === 256 ? [r, g + 1, 0] : [r, g, b];
}

export function countNoData(grid: Float32Array): number {
  let n = 0;
  for (let i = 0; i < grid.length; i += 1) if (Number.isNaN(grid[i]!)) n += 1;
  return n;
}

/**
 * Fills `NaN` cells in place by iterated 4-neighbour mean (up to `maxPasses`). Returns how many
 * cells are still `NaN` (only possible when the whole grid is no-data).
 */
export function fillNoData(grid: Float32Array, w: number, h: number, maxPasses = 64): number {
  let remaining = countNoData(grid);
  for (let pass = 0; pass < maxPasses && remaining > 0; pass += 1) {
    const next = grid.slice();
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const i = y * w + x;
        if (!Number.isNaN(grid[i]!)) continue;
        let sum = 0;
        let n = 0;
        if (x > 0 && !Number.isNaN(grid[i - 1]!)) {
          sum += grid[i - 1]!;
          n += 1;
        }
        if (x < w - 1 && !Number.isNaN(grid[i + 1]!)) {
          sum += grid[i + 1]!;
          n += 1;
        }
        if (y > 0 && !Number.isNaN(grid[i - w]!)) {
          sum += grid[i - w]!;
          n += 1;
        }
        if (y < h - 1 && !Number.isNaN(grid[i + w]!)) {
          sum += grid[i + w]!;
          n += 1;
        }
        if (n > 0) next[i] = sum / n;
      }
    }
    grid.set(next);
    remaining = countNoData(grid);
  }
  return remaining;
}
