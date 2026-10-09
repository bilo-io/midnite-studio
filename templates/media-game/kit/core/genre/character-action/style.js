// @ts-check
/**
 * Midnite game kit — the style meter (engine-free).
 *
 * Hits add style points; repeating the same move earns less each time
 * (variety is rewarded), long chains and air hits earn more, taking damage
 * knocks the meter down a rank, and points drain over time — faster the
 * higher the rank — so a rank has to be kept, not just reached.
 */

export const STYLE_RANKS = /** @type {const} */ (['D', 'C', 'B', 'A', 'S', 'SS', 'SSS']);
/** Points at which each rank starts. */
export const STYLE_THRESHOLDS = [0, 100, 220, 360, 520, 700, 900];
export const STYLE_MAX = 1000;
/** Points drained per second at each rank. */
export const STYLE_DECAY = [10, 18, 26, 34, 44, 56, 70];

export function createStyle() {
  return { score: 0, recent: /** @type {string[]} */ ([]), peak: 0 };
}

/** @typedef {ReturnType<typeof createStyle>} Style */

/** Rank index for a score. */
export function rankIndex(/** @type {number} */ score) {
  let i = 0;
  while (i + 1 < STYLE_THRESHOLDS.length && score >= /** @type {number} */ (STYLE_THRESHOLDS[i + 1])) i += 1;
  return i;
}

/** The rank letter for a score. */
export const styleRank = (/** @type {number} */ score) => /** @type {typeof STYLE_RANKS[number]} */ (STYLE_RANKS[rankIndex(score)]);

/**
 * Score a hit. The same move inside the last four costs a third of its value
 * per repeat; chains and air hits multiply.
 * @param {Style} style
 * @param {{ move: string, damage: number, chain?: number, air?: boolean }} hit
 * @returns {number} points awarded
 */
export function styleHit(style, hit) {
  const repeats = style.recent.filter((m) => m === hit.move).length;
  const variety = Math.max(0.1, 1 - repeats / 3);
  const chain = 1 + Math.min(4, (hit.chain ?? 1) - 1) * 0.15;
  const air = hit.air ? 1.3 : 1;
  const points = Math.round(hit.damage * 2 * variety * chain * air);
  style.score = Math.min(STYLE_MAX, style.score + points);
  style.peak = Math.max(style.peak, style.score);
  style.recent = [...style.recent, hit.move].slice(-4);
  return points;
}

/** Taking damage drops the meter to the start of the rank below. */
export function styleDamaged(/** @type {Style} */ style) {
  const i = rankIndex(style.score);
  style.score = i === 0 ? 0 : /** @type {number} */ (STYLE_THRESHOLDS[i - 1]);
  style.recent = [];
}

/** Drain over `dt` seconds. */
export function styleTick(/** @type {Style} */ style, /** @type {number} */ dt) {
  style.score = Math.max(0, style.score - (STYLE_DECAY[rankIndex(style.score)] ?? 10) * dt);
}

/** A 0..1 fill of the current rank (for the HUD bar). */
export function rankFill(/** @type {number} */ score) {
  const i = rankIndex(score);
  const from = /** @type {number} */ (STYLE_THRESHOLDS[i]);
  const to = STYLE_THRESHOLDS[i + 1] ?? STYLE_MAX;
  return Math.min(1, (score - from) / (to - from));
}
