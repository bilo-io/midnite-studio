import type { RgbaImage } from './prepare-image';

/**
 * Cuts the background out of an opaque picture so SF3D sees one object on its grey, not the object
 * plus a white card: a flood fill from the border over every pixel within `tolerance` (per channel,
 * 0–255) of the background colour, which becomes transparent, then a one-pixel soft edge. The
 * background colour is the corner that agrees best with the other three, so a subject touching one
 * corner does not decide it. A picture that already has transparency comes back untouched, and so does
 * one the fill would clear entirely (a flat colour with nothing on it).
 *
 * It only clears background *connected to the border*: a white shirt inside an outline survives, and a
 * gap between an arm and the body stays filled unless it opens onto the edge.
 */
export function removeBackground(image: RgbaImage, tolerance: number): RgbaImage {
  const { width: w, height: h } = image;
  const src = image.data;
  for (let i = 3; i < src.length; i += 4) if (src[i]! < 250) return image;

  const corners = [0, w - 1, (h - 1) * w, h * w - 1].map((p) => [src[p * 4]!, src[p * 4 + 1]!, src[p * 4 + 2]!] as const);
  const spread = (c: readonly number[]) => corners.reduce((sum, o) => sum + Math.max(Math.abs(o[0] - c[0]!), Math.abs(o[1] - c[1]!), Math.abs(o[2] - c[2]!)), 0);
  const bg = corners.reduce((best, c) => (spread(c) < spread(best) ? c : best));
  const dist = (p: number) => Math.max(Math.abs(src[p * 4]! - bg[0]), Math.abs(src[p * 4 + 1]! - bg[1]), Math.abs(src[p * 4 + 2]! - bg[2]));

  const cleared = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  let top = 0;
  const push = (p: number) => {
    if (cleared[p] || dist(p) > tolerance) return;
    cleared[p] = 1;
    stack[top++] = p;
  };
  for (let x = 0; x < w; x += 1) {
    push(x);
    push((h - 1) * w + x);
  }
  for (let y = 0; y < h; y += 1) {
    push(y * w);
    push(y * w + w - 1);
  }
  let count = top;
  while (top > 0) {
    const p = stack[--top]!;
    const x = p % w;
    const before = top;
    if (x > 0) push(p - 1);
    if (x < w - 1) push(p + 1);
    if (p >= w) push(p - w);
    if (p < (h - 1) * w) push(p + w);
    count += top - before;
  }
  if (count === w * h) return image;

  const data = Uint8Array.from(src);
  // An outline pixel beside the cleared area keeps alpha by how far it is from the background, so the edge is not a hard stair.
  const fringe = Math.max(1, tolerance * 3);
  for (let p = 0; p < w * h; p += 1) {
    if (cleared[p]) {
      data[p * 4 + 3] = 0;
      continue;
    }
    const x = p % w;
    const edge = (x > 0 && cleared[p - 1]) || (x < w - 1 && cleared[p + 1]) || (p >= w && cleared[p - w]) || (p < (h - 1) * w && cleared[p + w]);
    if (edge) data[p * 4 + 3] = Math.min(255, Math.round((dist(p) / fringe) * 255));
  }
  return { data, width: w, height: h };
}
