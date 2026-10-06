/**
 * Binary morphology and distance transform helpers (Phase 105 Themes G & H).
 *
 * Used for:
 * - Land-cover building footprint clean-up (3×3 open then close)
 * - Road mask gap bridging and speck removal (3×3 close then open)
 * - Minimum connected-component filtering
 * - Exact Euclidean distance transform for road width estimation and foliage exclusion margins
 */

/** Binary 3×3 dilation (radius 1). Foreground is any non-zero value, output is 1 / 0. */
export function dilateMask(mask: Uint8Array, w: number, h: number, radius = 1): Uint8Array {
  if (radius <= 0) return new Uint8Array(mask);
  let current = mask;
  for (let r = 0; r < radius; r += 1) {
    const out = new Uint8Array(w * h);
    for (let y = 0; y < h; y += 1) {
      const yMin = Math.max(0, y - 1);
      const yMax = Math.min(h - 1, y + 1);
      for (let x = 0; x < w; x += 1) {
        const xMin = Math.max(0, x - 1);
        const xMax = Math.min(w - 1, x + 1);
        let hit = 0;
        outer: for (let ny = yMin; ny <= yMax; ny += 1) {
          const row = ny * w;
          for (let nx = xMin; nx <= xMax; nx += 1) {
            if (current[row + nx]! > 0) {
              hit = 1;
              break outer;
            }
          }
        }
        out[y * w + x] = hit;
      }
    }
    current = out;
  }
  return current;
}

/** Binary 3×3 erosion (radius 1). Foreground is any non-zero value, output is 1 / 0. */
export function erodeMask(mask: Uint8Array, w: number, h: number, radius = 1): Uint8Array {
  if (radius <= 0) return new Uint8Array(mask);
  let current = mask;
  for (let r = 0; r < radius; r += 1) {
    const out = new Uint8Array(w * h);
    for (let y = 0; y < h; y += 1) {
      const yMin = Math.max(0, y - 1);
      const yMax = Math.min(h - 1, y + 1);
      for (let x = 0; x < w; x += 1) {
        if (current[y * w + x] === 0) continue;
        const xMin = Math.max(0, x - 1);
        const xMax = Math.min(w - 1, x + 1);
        // Border pixels have fewer neighbors; if any neighbor is 0, erode
        let allOn = 1;
        outer: for (let ny = yMin; ny <= yMax; ny += 1) {
          const row = ny * w;
          for (let nx = xMin; nx <= xMax; nx += 1) {
            if (current[row + nx] === 0) {
              allOn = 0;
              break outer;
            }
          }
        }
        out[y * w + x] = allOn;
      }
    }
    current = out;
  }
  return current;
}

/** Morphological close: dilate then erode (bridges gaps). */
export function morphClose(mask: Uint8Array, w: number, h: number, radius = 1): Uint8Array {
  return erodeMask(dilateMask(mask, w, h, radius), w, h, radius);
}

/** Morphological open: erode then dilate (removes specks/noise). */
export function morphOpen(mask: Uint8Array, w: number, h: number, radius = 1): Uint8Array {
  return dilateMask(erodeMask(mask, w, h, radius), w, h, radius);
}

/**
 * Exact Euclidean Distance Transform using Felzenszwalb & Huttenlocher's linear-time 1D parabolic
 * lower-envelope algorithm.
 *
 * For each foreground pixel (> 0), computes the Euclidean distance (in pixels) to the nearest
 * background pixel (=== 0). Background pixels have distance 0.
 */
export function distanceTransform(mask: Uint8Array, w: number, h: number): Float32Array {
  const INF = 1e9;
  const distSq = new Float32Array(w * h);

  // Initialize: 0 for background, INF for foreground
  for (let i = 0; i < mask.length; i += 1) {
    distSq[i] = mask[i]! > 0 ? INF : 0;
  }

  // 1D pass along columns
  const colF = new Float32Array(h);
  const colD = new Float32Array(h);
  const vCol = new Int32Array(h);
  const zCol = new Float32Array(h + 1);

  for (let x = 0; x < w; x += 1) {
    for (let y = 0; y < h; y += 1) {
      colF[y] = distSq[y * w + x]!;
    }
    distanceTransform1D(colF, colD, vCol, zCol, h);
    for (let y = 0; y < h; y += 1) {
      distSq[y * w + x] = colD[y]!;
    }
  }

  // 1D pass along rows
  const rowF = new Float32Array(w);
  const rowD = new Float32Array(w);
  const vRow = new Int32Array(w);
  const zRow = new Float32Array(w + 1);

  for (let y = 0; y < h; y += 1) {
    const rowOffset = y * w;
    for (let x = 0; x < w; x += 1) {
      rowF[x] = distSq[rowOffset + x]!;
    }
    distanceTransform1D(rowF, rowD, vRow, zRow, w);
    for (let x = 0; x < w; x += 1) {
      distSq[rowOffset + x] = rowD[x]!;
    }
  }

  // Compute square roots to get Euclidean distances
  const out = new Float32Array(w * h);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Math.sqrt(distSq[i]!);
  }
  return out;
}

/** 1D parabolic envelope distance transform (Felzenszwalb & Huttenlocher). */
function distanceTransform1D(
  f: Float32Array,
  d: Float32Array,
  v: Int32Array,
  z: Float32Array,
  n: number,
): void {
  let k = 0;
  v[0] = 0;
  z[0] = -1e9;
  z[1] = 1e9;

  for (let q = 1; q < n; q += 1) {
    let s = (f[q]! + q * q - (f[v[k]!]! + v[k]! * v[k]!)) / (2 * q - 2 * v[k]!);
    while (s <= z[k]!) {
      k -= 1;
      s = (f[q]! + q * q - (f[v[k]!]! + v[k]! * v[k]!)) / (2 * q - 2 * v[k]!);
    }
    k += 1;
    v[k] = q;
    z[k] = s;
    z[k + 1] = 1e9;
  }

  k = 0;
  for (let q = 0; q < n; q += 1) {
    while (z[k + 1]! < q) k += 1;
    const dx = q - v[k]!;
    d[q] = dx * dx + f[v[k]!]!;
  }
}

/**
 * Connected-component filtering: drops any 8-connected component with fewer than `minPixelCount` pixels.
 */
export function filterComponents(
  mask: Uint8Array,
  w: number,
  h: number,
  minPixelCount: number,
): Uint8Array {
  const out = new Uint8Array(mask.length);
  const visited = new Uint8Array(mask.length);
  const queueX = new Int32Array(mask.length);
  const queueY = new Int32Array(mask.length);

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const idx = y * w + x;
      if (mask[idx] === 0 || visited[idx] !== 0) continue;

      // Breadth-first search for this component
      let head = 0;
      let tail = 0;
      queueX[tail] = x;
      queueY[tail] = y;
      tail += 1;
      visited[idx] = 1;

      while (head < tail) {
        const cx = queueX[head]!;
        const cy = queueY[head]!;
        head += 1;

        const xMin = Math.max(0, cx - 1);
        const xMax = Math.min(w - 1, cx + 1);
        const yMin = Math.max(0, cy - 1);
        const yMax = Math.min(h - 1, cy + 1);

        for (let ny = yMin; ny <= yMax; ny += 1) {
          const row = ny * w;
          for (let nx = xMin; nx <= xMax; nx += 1) {
            const nIdx = row + nx;
            if (mask[nIdx]! > 0 && visited[nIdx] === 0) {
              visited[nIdx] = 1;
              queueX[tail] = nx;
              queueY[tail] = ny;
              tail += 1;
            }
          }
        }
      }

      // If component meets the size threshold, copy it to output
      if (tail >= minPixelCount) {
        for (let i = 0; i < tail; i += 1) {
          const px = queueX[i]!;
          const py = queueY[i]!;
          out[py * w + px] = mask[py * w + px]!;
        }
      }
    }
  }

  return out;
}
