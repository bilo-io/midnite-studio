// @ts-check
/**
 * Pure shading math for the software raycaster view (`render.js`). No engine, no imports, so the
 * lighting rules can be unit-tested and read without the renderer around them.
 *
 * The view lights every wall, floor and ceiling pixel from a torch carried at the player's position,
 * using the procedural normal maps from `kit/core/procedural-textures.js`. Normals are tangent space,
 * OpenGL convention: red right, green UP the texture, blue out of the surface.
 */

/** Light falloff with squared distance `d2` (cells squared): 1 at the lamp, a soft tail beyond. @param {number} d2 @param {number} [k] */
export const falloff = (d2, k = 0.16) => 1 / (1 + k * d2);

/**
 * Lambert term of a tangent-space normal against an unnormalised light vector, never negative.
 * @param {number} nx @param {number} ny @param {number} nz the normal, each in -1..1
 * @param {number} lx @param {number} ly @param {number} lz towards the light, in the same frame
 */
export function lambert(nx, ny, nz, lx, ly, lz) {
  const len = Math.hypot(lx, ly, lz) || 1;
  return Math.max(0, (nx * lx + ny * ly + nz * lz) / len);
}

/**
 * Distance, in cells, to the floor (or ceiling) seen on screen row `row`; `Infinity` on the horizon.
 * With a wall line height of `height / distance` this is the exact inverse of where a floor point lands.
 * @param {number} row @param {number} horizon @param {number} height
 */
export function floorRowDistance(row, horizon, height) {
  const p = Math.abs(row - horizon);
  return p < 0.5 ? Infinity : (height * 0.5) / p;
}

/**
 * The light vector in a wall's tangent frame, for the point a ray hit. `lu` runs along the wall (the
 * texture's u axis), `ln` out of it towards the player; the vertical part is added per pixel.
 * @param {0 | 1} side 0 for a face crossing an x grid line, 1 for a y one (as `kit/core/raycast.js`)
 * @param {number} rayX @param {number} rayY the (unnormalised) ray direction
 * @param {number} distance the perpendicular hit distance
 */
export function wallLight(side, rayX, rayY, distance) {
  return side === 0 ? { lu: -rayY * distance, ln: Math.abs(rayX) * distance } : { lu: -rayX * distance, ln: Math.abs(rayY) * distance };
}

/** One RGBA pixel as the little-endian Uint32 an `ImageData` buffer reads. @param {number} r @param {number} g @param {number} b */
export const packRgb = (r, g, b) => ((255 << 24) | ((b > 255 ? 255 : b < 0 ? 0 : b | 0) << 16) | ((g > 255 ? 255 : g < 0 ? 0 : g | 0) << 8) | (r > 255 ? 255 : r < 0 ? 0 : r | 0)) >>> 0;

/** Vertical camera bob for a walk phase (radians); `amount` is pixels at the screen's internal resolution. @param {number} phase @param {number} amount */
export const bobOffset = (phase, amount) => Math.sin(phase) * amount;
