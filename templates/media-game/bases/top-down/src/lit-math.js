// @ts-check
/**
 * Pure geometry and shading for the generated 2D surfaces in `lit.js`: where a pixel of an isometric
 * tile or block lands in texture space, and which way each face points on screen. No engine, no imports,
 * so it can be unit-tested. Normals are screen-space and OpenGL-style (x right, y UP, z at the viewer),
 * which is what Phaser's Light2D reads.
 */

/** Screen-space normals of the three faces of a 2:1 isometric block (the camera looks down 30 degrees). */
export const FACE_NORMALS = {
  top: /** @type {const} */ ([0, 0.87, 0.5]),
  left: /** @type {const} */ ([-0.707, -0.35, 0.61]),
  right: /** @type {const} */ ([0.707, -0.35, 0.61]),
};

/** How bright each face is painted before Light2D acts on it: the top catches the sky, the right side is in shade. */
export const FACE_SHADE = { top: 1, left: 0.78, right: 0.58 };

/**
 * Texture coordinates (0..1 each) of pixel (x, y) on a 2:1 diamond `w` x `h`, or `null` outside it. `u`
 * runs along grid x (down and right on screen), `v` along grid y (down and left).
 * @param {number} x @param {number} y @param {number} w @param {number} h
 */
export function isoUV(x, y, w, h) {
  const nx = (x + 0.5 - w / 2) / (w / 2);
  const ny = (y + 0.5 - h / 2) / (h / 2);
  const u = (nx + ny + 1) / 2;
  const v = (ny + 1 - nx) / 2;
  return u < 0 || u > 1 || v < 0 || v > 1 ? null : { u, v };
}

/**
 * Which face of an isometric block pixel (x, y) is on, and its texture coordinates. The block is a `w` x `h`
 * diamond top with `depth` pixels of side below it, so its canvas is `w` x `h + depth`.
 * @param {number} x @param {number} y @param {number} w @param {number} h @param {number} depth
 * @returns {{ face: 'top' | 'left' | 'right', u: number, v: number } | null}
 */
export function classifyBlockPixel(x, y, w, h, depth) {
  const top = isoUV(x, y, w, h);
  if (top) return { face: 'top', u: top.u, v: top.v };
  const px = x + 0.5;
  const py = y + 0.5;
  if (px < w / 2) {
    const s = px / (w / 2);
    const edge = h / 2 + (s * h) / 2;
    const t = (py - edge) / depth;
    return t >= 0 && t <= 1 ? { face: 'left', u: s, v: t } : null;
  }
  const s = (px - w / 2) / (w / 2);
  const edge = h - (s * h) / 2;
  const t = (py - edge) / depth;
  return t >= 0 && t <= 1 ? { face: 'right', u: s, v: t } : null;
}

/**
 * A face's base normal tilted by a tangent-space texture normal (components -1..1), renormalised.
 * @param {readonly [number, number, number]} base @param {number} tx @param {number} ty @param {number} strength 0 leaves the base untouched
 * @returns {[number, number, number]}
 */
export function tiltNormal(base, tx, ty, strength) {
  const x = base[0] + tx * strength;
  const y = base[1] + ty * strength;
  const z = base[2];
  const len = Math.hypot(x, y, z) || 1;
  return [x / len, y / len, z / len];
}

/** A normal (-1..1 each) as the RGB bytes of a normal map. @param {readonly number[]} n @returns {[number, number, number]} */
export const encodeNormal = (n) => [Math.round(((n[0] ?? 0) * 0.5 + 0.5) * 255), Math.round(((n[1] ?? 0) * 0.5 + 0.5) * 255), Math.round(((n[2] ?? 1) * 0.5 + 0.5) * 255)];

/** The normal of a dome (a ball seen from the side) at (dx, dy) from its centre in -1..1, y down; `null` outside it. @param {number} dx @param {number} dy @returns {[number, number, number] | null} */
export function domeNormal(dx, dy) {
  const r2 = dx * dx + dy * dy;
  return r2 > 1 ? null : [dx, -dy, Math.sqrt(1 - r2)];
}

/**
 * How strongly a pixel `x` of a tile edge is shaded: +1 on the lit edge fading to -1 on the shadowed one, 0 inside.
 * Used to bevel top-down blocks so neighbours read as separate pieces.
 * @param {number} pos pixel index along the axis @param {number} size @param {number} [edge]
 */
export function bevel(pos, size, edge = 3) {
  if (pos < edge) return 1 - pos / edge;
  if (pos >= size - edge) return -(1 - (size - 1 - pos) / edge);
  return 0;
}
