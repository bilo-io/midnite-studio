/**
 * Zhang–Suen thinning (Phase 105 Theme H): reduces the road mask to a one-pixel-wide, 8-connected
 * centreline that `road-graph.ts` walks into nodes and edges.
 */

/**
 * Thins a binary mask (non-zero = foreground) to its skeleton, returned as 1 / 0. Border pixels are
 * treated as having background outside the image. Iterates the two Zhang–Suen sub-passes until a
 * full pass removes nothing.
 */
export function zhangSuen(mask: Uint8Array, w: number, h: number): Uint8Array {
  const img = new Uint8Array(w * h);
  for (let i = 0; i < img.length; i += 1) img[i] = mask[i]! > 0 ? 1 : 0;
  const at = (x: number, y: number): number => (x < 0 || y < 0 || x >= w || y >= h ? 0 : img[y * w + x]!);
  const remove: number[] = [];

  // Only pixels still on the boundary can change, so each pass scans the live foreground list.
  let live: number[] = [];
  for (let i = 0; i < img.length; i += 1) if (img[i]) live.push(i);

  let changed = true;
  while (changed) {
    changed = false;
    for (let step = 0; step < 2; step += 1) {
      remove.length = 0;
      for (const i of live) {
        if (!img[i]) continue;
        const x = i % w;
        const y = (i - x) / w;
        // P2..P9 clockwise from north.
        const p2 = at(x, y - 1);
        const p3 = at(x + 1, y - 1);
        const p4 = at(x + 1, y);
        const p5 = at(x + 1, y + 1);
        const p6 = at(x, y + 1);
        const p7 = at(x - 1, y + 1);
        const p8 = at(x - 1, y);
        const p9 = at(x - 1, y - 1);
        const b = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
        if (b < 2 || b > 6) continue;
        const a =
          Number(!p2 && p3) + Number(!p3 && p4) + Number(!p4 && p5) + Number(!p5 && p6) +
          Number(!p6 && p7) + Number(!p7 && p8) + Number(!p8 && p9) + Number(!p9 && p2);
        if (a !== 1) continue;
        if (step === 0 ? p2 * p4 * p6 !== 0 || p4 * p6 * p8 !== 0 : p2 * p4 * p8 !== 0 || p2 * p6 * p8 !== 0) continue;
        remove.push(i);
      }
      for (const i of remove) img[i] = 0;
      if (remove.length > 0) changed = true;
    }
    if (changed) live = live.filter((i) => img[i] === 1);
  }
  return img;
}

/** 8-neighbour offsets, clockwise from north. */
export const NEIGHBOURS_8: readonly (readonly [number, number])[] = [
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
];

/** How many 0→1 transitions the clockwise ring of 8 neighbours makes — ≥ 3 is a junction. */
export function crossingNumber(skel: Uint8Array, w: number, h: number, x: number, y: number): number {
  let transitions = 0;
  for (let k = 0; k < 8; k += 1) {
    const [ax, ay] = NEIGHBOURS_8[k]!;
    const [bx, by] = NEIGHBOURS_8[(k + 1) % 8]!;
    const a = sample(skel, w, h, x + ax, y + ay);
    const b = sample(skel, w, h, x + bx, y + by);
    if (!a && b) transitions += 1;
  }
  return transitions;
}

/** Foreground 8-neighbours of a pixel. */
export function neighbourCount(skel: Uint8Array, w: number, h: number, x: number, y: number): number {
  let n = 0;
  for (const [dx, dy] of NEIGHBOURS_8) n += sample(skel, w, h, x + dx, y + dy);
  return n;
}

const sample = (img: Uint8Array, w: number, h: number, x: number, y: number): number =>
  x < 0 || y < 0 || x >= w || y >= h ? 0 : img[y * w + x]! > 0 ? 1 : 0;

/**
 * Yokoi's 8-connectivity number: how many separate 8-connected neighbour groups removing the pixel
 * would leave. 1 means the pixel is *simple* — deleting it changes no connectivity.
 */
export function connectivity8(img: Uint8Array, w: number, h: number, x: number, y: number): number {
  // E, NE, N, NW, W, SW, S, SE — complemented.
  const ring = [
    [1, 0],
    [1, -1],
    [0, -1],
    [-1, -1],
    [-1, 0],
    [-1, 1],
    [0, 1],
    [1, 1],
  ].map(([dx, dy]) => 1 - sample(img, w, h, x + dx!, y + dy!));
  let c = 0;
  for (let k = 0; k < 8; k += 2) c += ring[k]! - ring[k]! * ring[k + 1]! * ring[(k + 2) % 8]!;
  return c;
}

/**
 * Deletes the corner pixel of every staircase step Zhang–Suen leaves (a simple point that is not an
 * endpoint), in place and in raster order, so each deletion sees the ones before it and connectivity
 * is never broken. Afterwards a centreline pixel has exactly two neighbours and a junction three or more.
 */
export function removeStaircases(skel: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(skel);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x;
      if (!out[i]) continue;
      if (neighbourCount(out, w, h, x, y) >= 2 && connectivity8(out, w, h, x, y) === 1) out[i] = 0;
    }
  }
  return out;
}
