// @ts-check
/**
 * Midnite game kit — animation key naming (engine-free).
 *
 * Phase 106 sprite exports name every animation `<asset>/<clip>/<dir>`, with
 * `dir` one of eight compass directions (screen-down is south). A sprite drawn
 * in fewer directions simply has fewer keys, and a facing vector falls back to
 * the nearest one it has: 8 → 4 → 1.
 */

/** In angle order from east, clockwise on screen (y grows downwards). */
export const DIRECTIONS_8 = /** @type {const} */ (['e', 'se', 's', 'sw', 'w', 'nw', 'n', 'ne']);
export const DIRECTIONS_4 = /** @type {const} */ (['e', 's', 'w', 'n']);

const ANGLE = /** @type {Record<string, number>} */ (
  Object.fromEntries(DIRECTIONS_8.map((dir, index) => [dir, (index * Math.PI) / 4]))
);

/**
 * The nearest direction to a facing vector, among `available` (default: all 8).
 * A tie (exactly between two) prefers the one listed first in `DIRECTIONS_8`,
 * so a diagonal on a 4-direction sprite reads as its horizontal neighbour.
 * @param {readonly number[]} facing `[dx, dy]`, screen space
 * @param {readonly string[]} [available]
 */
export function nearestDirection(facing, available = DIRECTIONS_8) {
  const [dx = 0, dy = 0] = facing;
  if (dx === 0 && dy === 0) return available[0] ?? 'e';
  let angle = Math.atan2(dy, dx);
  if (angle < 0) angle += Math.PI * 2;
  let best = available[0] ?? 'e';
  let bestDistance = Infinity;
  for (const dir of DIRECTIONS_8) {
    if (!available.includes(dir)) continue;
    const raw = Math.abs(angle - (ANGLE[dir] ?? 0));
    const distance = Math.min(raw, Math.PI * 2 - raw);
    if (distance < bestDistance - 1e-9) {
      best = dir;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * The directions a clip was drawn in, read off the animation keys that exist.
 * @param {string} asset
 * @param {string} clip
 * @param {Iterable<string>} keys every animation key the game has loaded
 */
export function directionsFor(asset, clip, keys) {
  const prefix = `${asset}/${clip}/`;
  /** @type {string[]} */
  const found = [];
  for (const key of keys) {
    if (!key.startsWith(prefix)) continue;
    const dir = key.slice(prefix.length);
    if (/** @type {readonly string[]} */ (DIRECTIONS_8).includes(dir)) found.push(dir);
  }
  return DIRECTIONS_8.filter((dir) => found.includes(dir));
}

/**
 * The animation key to play for `clip` facing `facing`: `<asset>/<clip>/<dir>`
 * with the nearest drawn direction, or `<asset>/<clip>` for a clip drawn in one
 * direction only. `null` when the clip does not exist at all.
 * @param {string} asset
 * @param {string} clip
 * @param {readonly number[]} facing
 * @param {Iterable<string>} keys
 */
export function animName(asset, clip, facing, keys) {
  const all = [...keys];
  const dirs = directionsFor(asset, clip, all);
  if (dirs.length > 0) return `${asset}/${clip}/${nearestDirection(facing, dirs)}`;
  const plain = `${asset}/${clip}`;
  return all.includes(plain) ? plain : null;
}

/** Every key in a Phase 106 `anims.json` (`AnimationManager.fromJSON` shape). */
export function animKeysFromJSON(/** @type {unknown} */ json) {
  const anims = /** @type {{ anims?: unknown }} */ (json ?? {}).anims;
  if (!Array.isArray(anims)) return [];
  return anims.flatMap((anim) => (anim && typeof anim.key === 'string' ? [anim.key] : []));
}

/**
 * Animation definitions from an Aseprite-style atlas's `meta.frameTags` — the
 * fallback when a sprite has `atlas.json` but no `anims.json`. Tag names are
 * `<clip>/<dir>` (or `<clip>`); frames are the atlas's frame names in order.
 * @param {string} asset
 * @param {unknown} atlas
 * @returns {{ key: string, frames: string[], frameRate: number, repeat: number }[]}
 */
export function asepriteAnimDefs(asset, atlas) {
  const data = /** @type {{ frames?: unknown, meta?: { frameTags?: unknown } }} */ (atlas ?? {});
  const frames = data.frames;
  const names = Array.isArray(frames)
    ? frames.map((frame) => String(frame?.filename ?? ''))
    : frames && typeof frames === 'object'
      ? Object.keys(frames)
      : [];
  const durations = Array.isArray(frames)
    ? frames.map((frame) => Number(frame?.duration) || 100)
    : names.map((name) => Number(/** @type {Record<string, { duration?: number }>} */ (frames)[name]?.duration) || 100);
  const tags = Array.isArray(data.meta?.frameTags) ? data.meta.frameTags : [];
  return tags.flatMap((tag) => {
    if (!tag || typeof tag.name !== 'string') return [];
    const from = Math.max(0, Number(tag.from) || 0);
    const to = Math.min(names.length - 1, Number(tag.to) || 0);
    if (to < from) return [];
    const slice = names.slice(from, to + 1);
    const ms = durations.slice(from, to + 1).reduce((sum, d) => sum + d, 0) / slice.length;
    return [{ key: `${asset}/${tag.name}`, frames: slice, frameRate: Math.round(1000 / ms), repeat: -1 }];
  });
}
