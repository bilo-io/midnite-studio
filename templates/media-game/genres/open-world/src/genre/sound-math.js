// @ts-check
/** Pure maths behind the open world's sound beds (`engine-audio.js`), kept apart so a vitest can pin it. */

/**
 * Pitch and loudness for the kit's `engine-loop` preset while a car does `speed` m/s with the throttle at `throttle` (-1..1):
 * an idle at rest, a rising whine with speed, louder on the throttle. Feed it to `sfx.loop(...).set({ pitch, volume })`.
 * @param {number} speed
 * @param {number} throttle
 */
export function engineLoopParams(speed, throttle) {
  const v = Math.min(1, Math.abs(speed) / 32);
  const t = Math.min(1, Math.abs(throttle));
  return { pitch: 0.7 + v * 1.1 + t * 0.15, volume: 0.45 + v * 0.3 + t * 0.25 };
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
