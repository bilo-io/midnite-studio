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

/** A 0xRRGGBB colour as `[r, g, b]` bytes. @param {number} c @returns {[number, number, number]} */
export const rgbOf = (c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];

/**
 * The sky colour on a ceiling row: `t` 0 at the top of the screen (zenith) to 1 on the horizon, eased so the haze
 * gathers low and the blue stays deep overhead. Writes into `out` and returns it, so a frame allocates nothing.
 * @param {number} t @param {readonly number[]} zenith @param {readonly number[]} horizon @param {number[]} [out]
 */
export function skyGradient(t, zenith, horizon, out = [0, 0, 0]) {
  const k = Math.min(1, Math.max(0, t)) ** 1.8;
  for (let i = 0; i < 3; i += 1) out[i] = /** @type {number} */ (zenith[i]) + (/** @type {number} */ (horizon[i]) - /** @type {number} */ (zenith[i])) * k;
  return out;
}

/**
 * A star at a world-fixed bearing bin and screen row: a pure hash, so the same night sky replays and turning the camera
 * slides the stars across it. Returns brightness 0..1 (0 for most cells). @param {number} bin @param {number} row @param {number} density 0..1
 */
export function starAt(bin, row, density) {
  if (density <= 0) return 0;
  let h = (Math.imul(bin | 0, 374761393) + Math.imul(row | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  const r = ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  return r < 0.012 * density ? 0.45 + (r / (0.012 * density)) * 0.55 : 0;
}

/**
 * The light a sky pours into the room, as the `[r, g, b]` floats the view adds to its torch term: the preset's sky and
 * ground bounce light blended, scaled by the hemisphere intensity, so a bright day lifts the walls and a night leaves the torch alone.
 * @param {{ hemiSky: number, hemiGround: number, hemiIntensity: number }} preset
 * @returns {[number, number, number]}
 */
export function skyAmbient(preset) {
  const mix = (/** @type {number} */ a, /** @type {number} */ b) => a + (b - a) * 0.35;
  const sky = rgbOf(preset.hemiSky);
  const ground = rgbOf(preset.hemiGround);
  const k = 0.1 + 0.26 * Math.min(1, Math.max(0, (preset.hemiIntensity - 0.55) / 0.75));
  return [mix(sky[0], ground[0]) / 255 * k, mix(sky[1], ground[1]) / 255 * k, mix(sky[2], ground[2]) / 255 * k];
}
