// @ts-check
/**
 * Midnite game kit — sky and lighting presets (engine-free numbers).
 *
 * `kit/three/environment.js` turns one of these into a gradient sky dome, hemisphere and sun lights,
 * fog and an optional reflection map. Colours are 0xRRGGBB. Everything is derived from the preset and
 * an optional `timeOfDay` (0..24 hours), so a game can sweep dawn to dusk by changing one number.
 */

/**
 * @typedef {{
 *   zenith: number, horizon: number, ground: number, sun: number, fog: number,
 *   hemiSky: number, hemiGround: number, hemiIntensity: number, sunIntensity: number,
 *   exposure: number, stars: number,
 * }} SkyPreset
 */

/** @type {Record<string, SkyPreset>} */
export const SKY_PRESETS = {
  day: { zenith: 0x2f6fc9, horizon: 0xbfd9f2, ground: 0x6b6458, sun: 0xfff1d6, fog: 0xbfd9f2, hemiSky: 0xcfe3ff, hemiGround: 0x4a4a42, hemiIntensity: 1.2, sunIntensity: 2.6, exposure: 1, stars: 0 },
  dawn: { zenith: 0x3a4f8f, horizon: 0xf3a77b, ground: 0x4a3f3f, sun: 0xffc08a, fog: 0xe8b496, hemiSky: 0xffd5b8, hemiGround: 0x3b3340, hemiIntensity: 0.9, sunIntensity: 1.9, exposure: 1, stars: 0.15 },
  dusk: { zenith: 0x1f2a5c, horizon: 0xe0764f, ground: 0x30283a, sun: 0xff9a5c, fog: 0xa8607a, hemiSky: 0xd9a0a0, hemiGround: 0x2a2535, hemiIntensity: 0.8, sunIntensity: 1.6, exposure: 1, stars: 0.35 },
  night: { zenith: 0x05081a, horizon: 0x18233f, ground: 0x0b0e18, sun: 0x9db4ff, fog: 0x0f1626, hemiSky: 0x4a5a8a, hemiGround: 0x10131c, hemiIntensity: 0.55, sunIntensity: 0.6, exposure: 1, stars: 1 },
  overcast: { zenith: 0x8d97a3, horizon: 0xc9ced4, ground: 0x59595a, sun: 0xe9edf2, fog: 0xc0c5cb, hemiSky: 0xd8dde3, hemiGround: 0x555555, hemiIntensity: 1.3, sunIntensity: 1.0, exposure: 1, stars: 0 },
};

/** @param {number} a @param {number} b @param {number} t */
const lerp = (a, b, t) => a + (b - a) * t;

/** Blend two 0xRRGGBB colours. @param {number} a @param {number} b @param {number} t */
export function mixColor(a, b, t) {
  const r = Math.round(lerp((a >> 16) & 255, (b >> 16) & 255, t));
  const g = Math.round(lerp((a >> 8) & 255, (b >> 8) & 255, t));
  const bl = Math.round(lerp(a & 255, b & 255, t));
  return (r << 16) | (g << 8) | bl;
}

/** @param {SkyPreset} a @param {SkyPreset} b @param {number} t @returns {SkyPreset} */
export function mixPresets(a, b, t) {
  const out = /** @type {Record<string, number>} */ ({});
  for (const k of Object.keys(a)) {
    const key = /** @type {keyof SkyPreset} */ (k);
    const isColor = ['zenith', 'horizon', 'ground', 'sun', 'fog', 'hemiSky', 'hemiGround'].includes(k);
    out[k] = isColor ? mixColor(a[key], b[key], t) : lerp(a[key], b[key], t);
  }
  return /** @type {SkyPreset} */ (out);
}

/**
 * Sun direction (unit vector pointing from the world toward the sun) for an azimuth and elevation in radians.
 * Azimuth 0 is -Z, increasing clockwise seen from above; elevation 0 is the horizon.
 * @param {number} azimuth @param {number} elevation @returns {[number, number, number]}
 */
export function sunDirection(azimuth, elevation) {
  const c = Math.cos(elevation);
  return [Math.sin(azimuth) * c, Math.sin(elevation), -Math.cos(azimuth) * c];
}

/**
 * The look at an hour of the day: a smooth walk night -> dawn -> day -> dusk -> night, with the sun
 * rising at 6 and setting at 18. Returns the blended preset and the sun elevation (radians, negative below the horizon).
 * @param {number} hours 0..24
 * @returns {{ preset: SkyPreset, elevation: number, azimuth: number }}
 */
export function skyAtTime(hours) {
  const h = ((hours % 24) + 24) % 24;
  const keys = /** @type {[number, string][]} */ ([[0, 'night'], [5, 'night'], [6.5, 'dawn'], [9, 'day'], [15, 'day'], [17.5, 'dusk'], [19.5, 'night'], [24, 'night']]);
  let i = 0;
  while (i < keys.length - 2 && h >= /** @type {[number, string]} */ (keys[i + 1])[0]) i += 1;
  const [h0, n0] = /** @type {[number, string]} */ (keys[i]);
  const [h1, n1] = /** @type {[number, string]} */ (keys[i + 1]);
  const t = h1 === h0 ? 0 : (h - h0) / (h1 - h0);
  const smooth = t * t * (3 - 2 * t);
  const preset = mixPresets(/** @type {SkyPreset} */ (SKY_PRESETS[n0]), /** @type {SkyPreset} */ (SKY_PRESETS[n1]), smooth);
  const day = (h - 6) / 12; // 0 at sunrise, 1 at sunset
  const elevation = Math.sin(day * Math.PI) * 1.15 - 0.05;
  return { preset, elevation, azimuth: Math.PI * (0.6 + day * 0.9) };
}
