/**
 * Lane colours.
 *
 * A lane's colour is derived from the sha that OPENED it — a branch tip, or the
 * parent a merge edge reaches for. That makes the colour a pure function of
 * history: the same branch is the same colour across refreshes, across repo
 * reopens, and between two people looking at the same repo. Assigning colours by
 * lane index instead (the obvious shortcut) makes every branch change colour the
 * moment a lane to its left closes.
 *
 * The palette is indices, not CSS: the renderer maps them onto design-system
 * tokens so lane colours follow the theme.
 */
export const LANE_PALETTE_SIZE = 10;

/**
 * FNV-1a over the sha's hex characters.
 *
 * Chosen for being tiny, dependency-free and well-distributed over short hex
 * strings — taking the first byte of the sha instead clusters badly, because
 * commits authored in the same session share leading bits far more often than
 * chance would suggest.
 */
export function hashSha(sha: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < sha.length; i += 1) {
    hash ^= sha.charCodeAt(i);
    // hash * 16777619, kept in 32-bit range without overflowing to a double.
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export const colorForSha = (sha: string): number => hashSha(sha) % LANE_PALETTE_SIZE;
