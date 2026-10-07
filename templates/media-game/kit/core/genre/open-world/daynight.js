// @ts-check
/**
 * Midnite game kit — the day/night cycle (engine-free).
 *
 * One game day lasts `dayLength` seconds. `skyAt(hour)` answers the sun's
 * direction and strength, the ambient level and the sky colour, so the
 * three.js glue only copies numbers onto lights.
 */

/** Game hour (0 ≤ h < 24) after `seconds`. */
export const hourAt = (/** @type {number} */ seconds, /** @type {number} */ dayLength = 240, /** @type {number} */ startHour = 9) =>
  (((startHour + (seconds / dayLength) * 24) % 24) + 24) % 24;

export const SUNRISE = 6;
export const SUNSET = 19;

/** Whether it is night (the street lights are on). */
export const isNight = (/** @type {number} */ hour) => hour < SUNRISE || hour >= SUNSET;

const mix = (/** @type {number} */ a, /** @type {number} */ b, /** @type {number} */ t) => a + (b - a) * t;
/** @param {readonly number[]} a @param {readonly number[]} b @param {number} t */
const mixRgb = (a, b, t) => a.map((v, i) => Math.round(mix(v, b[i] ?? 0, t)));

const NIGHT_SKY = [10, 14, 30];
const DAY_SKY = [120, 170, 225];
const DUSK_SKY = [230, 130, 80];

/**
 * @param {number} hour
 * @returns {{ elevation: number, azimuth: number, sun: number, ambient: number, sky: number[], night: boolean }}
 *   elevation/azimuth in radians; `sun` and `ambient` are light intensities
 */
export function skyAt(hour) {
  const dayLength = SUNSET - SUNRISE;
  const t = (hour - SUNRISE) / dayLength; // 0 at sunrise, 1 at sunset
  const day = t >= 0 && t <= 1;
  const elevation = day ? Math.sin(t * Math.PI) * 1.2 : -0.3;
  const azimuth = mix(-Math.PI / 2, Math.PI / 2, Math.min(1, Math.max(0, t)));
  const height = Math.max(0, Math.sin(Math.max(0, Math.min(1, t)) * Math.PI));
  // Dusk tint near either end of the day.
  const edge = day ? Math.max(0, 1 - Math.min(t, 1 - t) / 0.12) : 0;
  const sky = day ? mixRgb(mixRgb(NIGHT_SKY, DAY_SKY, Math.min(1, height * 2)), DUSK_SKY, edge * 0.7) : NIGHT_SKY;
  return {
    elevation,
    azimuth,
    sun: day ? 0.2 + 1.6 * height : 0,
    ambient: day ? 0.35 + 0.75 * height : 0.18,
    sky,
    night: isNight(hour),
  };
}

/** `HH:MM` for the HUD. */
export function clockText(/** @type {number} */ hour) {
  const h = Math.floor(hour);
  const m = Math.floor((hour - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
