/**
 * The UV atlas and texture bake for an SF3D mesh (Phase 103 Theme J).
 *
 * SF3D's own unwrap is a box projection plus a CUDA/Metal rasteriser; here every triangle gets its
 * own spot in a square atlas instead — two triangles per cell, the lower-left and upper-right halves
 * of the cell, each inset so neither touches the other or the cell edge. No two triangles overlap,
 * so every texel belongs to exactly one triangle, and the bake can simply walk the cells: each texel
 * is mapped back to the closest point on its triangle and the colour function is evaluated there.
 * Texels outside any cell keep the background.
 *
 * Cells are as large as the texture allows (`size / ceil(sqrt(triangles / 2))`), so a texture size
 * trades bake time against texel density, nothing else.
 */

export type Atlas = {
  size: number;
  /** Cells per row (and column). */
  cols: number;
  /** Cell edge, in texels. */
  cell: number;
  /** Per triangle, its three corners' UVs in [0, 1] (u right, v down), two floats each. */
  uvs: Float32Array;
};

/** Texel inset of each triangle inside its half-cell. */
const INSET = 0.75;

/**
 * Corner positions, in texels, of triangle `t`'s slot: even triangles take a cell's lower-left
 * half, odd ones its upper-right half.
 */
function slotCorners(t: number, cols: number, cell: number): [number, number, number, number, number, number] {
  const pair = t >> 1;
  const x0 = (pair % cols) * cell;
  const y0 = Math.floor(pair / cols) * cell;
  const lo = INSET;
  const hi = cell - INSET;
  // The diagonal runs (x0+cell, y0) → (x0, y0+cell); each half is pulled one inset off it.
  const gap = INSET * 0.5;
  if ((t & 1) === 0) return [x0 + lo, y0 + lo, x0 + hi - gap * 2, y0 + lo, x0 + lo, y0 + hi - gap * 2];
  return [x0 + hi, y0 + hi, x0 + lo + gap * 2, y0 + hi, x0 + hi, y0 + lo + gap * 2];
}

export function atlasLayout(triangles: number, size: number): { cols: number; cell: number } {
  const pairs = Math.max(1, Math.ceil(triangles / 2));
  const cols = Math.ceil(Math.sqrt(pairs));
  const cell = Math.floor(size / cols);
  if (cell < 3) throw new Error(`A ${size}px atlas cannot hold ${triangles} triangles; pick a larger texture.`);
  return { cols, cell };
}

export function buildAtlas(triangles: number, size: number): Atlas {
  const { cols, cell } = atlasLayout(triangles, size);
  const uvs = new Float32Array(triangles * 6);
  for (let t = 0; t < triangles; t += 1) {
    const c = slotCorners(t, cols, cell);
    for (let k = 0; k < 6; k += 1) uvs[t * 6 + k] = c[k]! / size;
  }
  return { size, cols, cell, uvs };
}

/**
 * Barycentric coordinates of (px, py) in the 2D triangle, clamped onto the triangle — the closest
 * point when it lies outside, so dilated texels continue the edge's colour instead of extrapolating.
 */
export function clampedBarycentric(px: number, py: number, ax: number, ay: number, bx: number, by: number, cx: number, cy: number): [number, number, number] {
  const v0x = bx - ax, v0y = by - ay, v1x = cx - ax, v1y = cy - ay, v2x = px - ax, v2y = py - ay;
  const d00 = v0x * v0x + v0y * v0y;
  const d01 = v0x * v1x + v0y * v1y;
  const d11 = v1x * v1x + v1y * v1y;
  const d20 = v2x * v0x + v2y * v0y;
  const d21 = v2x * v1x + v2y * v1y;
  const denom = d00 * d11 - d01 * d01;
  if (denom === 0) return [1, 0, 0];
  let v = (d11 * d20 - d01 * d21) / denom;
  let w = (d00 * d21 - d01 * d20) / denom;
  let u = 1 - v - w;
  if (u >= 0 && v >= 0 && w >= 0) return [u, v, w];
  // Outside: clamp to the nearest edge (project, then clamp the edge parameter).
  const closestOnEdge = (sx: number, sy: number, ex: number, ey: number): [number, number] => {
    const dx = ex - sx, dy = ey - sy;
    const len = dx * dx + dy * dy;
    const t = len === 0 ? 0 : Math.min(1, Math.max(0, ((px - sx) * dx + (py - sy) * dy) / len));
    return [t, (sx + t * dx - px) ** 2 + (sy + t * dy - py) ** 2];
  };
  const [tab, dab] = closestOnEdge(ax, ay, bx, by);
  const [tbc, dbc] = closestOnEdge(bx, by, cx, cy);
  const [tca, dca] = closestOnEdge(cx, cy, ax, ay);
  if (dab <= dbc && dab <= dca) { u = 1 - tab; v = tab; w = 0; }
  else if (dbc <= dca) { u = 0; v = 1 - tbc; w = tbc; }
  else { u = tca; v = 0; w = 1 - tca; }
  return [u, v, w];
}

export type BakeOptions = {
  /** RGB 0..255 for texels no triangle covers. */
  background?: [number, number, number];
  isCancelled?: () => boolean;
  onProgress?: (fraction: number) => void;
};

/**
 * Bakes `colorAt` (a 3D point → linear 0..1 RGB) into an RGBA8 texture laid out by `atlas`.
 * `positions`/`indices` are the mesh in the space `colorAt` expects (SF3D's, for the real bake).
 */
export function bakeTexture(
  atlas: Atlas,
  positions: Float32Array,
  indices: Uint32Array,
  colorAt: (x: number, y: number, z: number, out: Float32Array) => void,
  options: BakeOptions = {},
): Uint8Array {
  const { size, cols, cell } = atlas;
  const [br, bg, bb] = options.background ?? [128, 128, 128];
  const rgba = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i += 1) {
    rgba[i * 4] = br;
    rgba[i * 4 + 1] = bg;
    rgba[i * 4 + 2] = bb;
    rgba[i * 4 + 3] = 255;
  }
  const triangles = indices.length / 3;
  const pairs = Math.ceil(triangles / 2);
  const rgb = new Float32Array(3);
  const to8 = (x: number) => Math.max(0, Math.min(255, Math.round(x * 255)));

  for (let pair = 0; pair < pairs; pair += 1) {
    if ((pair & 1023) === 0) {
      if (options.isCancelled?.()) throw new Error('cancelled');
      options.onProgress?.(pair / pairs);
    }
    const x0 = (pair % cols) * cell;
    const y0 = Math.floor(pair / cols) * cell;
    const lower = pair * 2;
    const upper = lower + 1 < triangles ? lower + 1 : -1;
    for (let ty = 0; ty < cell; ty += 1) {
      for (let tx = 0; tx < cell; tx += 1) {
        // Texel centre, in cell-local texels; the diagonal tx + ty = cell splits the two halves.
        const lx = tx + 0.5;
        const ly = ty + 0.5;
        const t = upper >= 0 && lx + ly > cell ? upper : lower;
        const c = slotCorners(t, cols, cell);
        const [u, v, w] = clampedBarycentric(x0 + lx, y0 + ly, c[0], c[1], c[2], c[3], c[4], c[5]);
        const ia = indices[t * 3]! * 3;
        const ib = indices[t * 3 + 1]! * 3;
        const ic = indices[t * 3 + 2]! * 3;
        colorAt(
          u * positions[ia]! + v * positions[ib]! + w * positions[ic]!,
          u * positions[ia + 1]! + v * positions[ib + 1]! + w * positions[ic + 1]!,
          u * positions[ia + 2]! + v * positions[ib + 2]! + w * positions[ic + 2]!,
          rgb,
        );
        const o = ((y0 + ty) * size + (x0 + tx)) * 4;
        rgba[o] = to8(linearToSrgb(rgb[0]!));
        rgba[o + 1] = to8(linearToSrgb(rgb[1]!));
        rgba[o + 2] = to8(linearToSrgb(rgb[2]!));
      }
    }
  }
  options.onProgress?.(1);
  return rgba;
}

/**
 * SF3D's colour head predicts sRGB-encoded values directly (its training targets are image pixels),
 * so this is the identity; kept as a named seam so the conversion question has one place to change.
 */
export function linearToSrgb(x: number): number {
  return x;
}
