// @ts-check
/** Pure maths behind the open world's sound beds (`engine-audio.js`), kept apart so a vitest can pin it. */

/**
 * Engine pitch (Hz) and loudness for a car doing `speed` m/s with the throttle at `throttle` (−1..1).
 * A little idle at rest, a rising whine with speed, louder on the throttle.
 * @param {number} speed
 * @param {number} throttle
 */
export function engineParams(speed, throttle) {
  const v = Math.min(1, Math.abs(speed) / 32);
  return { frequency: 48 + v * 150 + Math.abs(throttle) * 18, gain: 0.05 + v * 0.07 + Math.abs(throttle) * 0.05, cutoff: 260 + v * 1500 + Math.abs(throttle) * 500 };
}

/**
 * How much ambient bed each kind of moment wants, from the hour (0-24) and rain (0..1).
 * @param {number} hour
 * @param {number} rain
 */
export function ambienceMix(hour, rain) {
  const night = hour < 6 || hour >= 19;
  return { wind: 0.5 + rain * 0.5, birds: night || rain > 0.3 ? 0 : 1, crickets: night ? 1 : 0, rain };
}
