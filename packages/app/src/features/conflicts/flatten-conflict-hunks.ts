import type { ConflictedHunk, ConflictRegion } from '@midnite/studio-shared';

/**
 * One row the Studio renders — either a plain unchanged stretch, or a
 * conflict region carrying the global `regionIndex` `applyConflictHunk`
 * (Phase 47 Theme C) addresses it by.
 */
export type ConflictStudioItem =
  | { kind: 'context'; lines: string[] }
  | { kind: 'conflict'; regionIndex: number; region: ConflictRegion };

/**
 * Flattens a file's per-hunk segments into one ordered list, numbering
 * conflict regions globally across every hunk.
 *
 * The numbering has to match `locateConflictRegion`'s (git-engine): that
 * function counts conflict regions by scanning the WHOLE file's raw lines
 * top-to-bottom, with no notion of hunk boundaries at all. `readFileDiff`'s
 * hunks are already in file order and never overlap, so counting `'conflict'`
 * segments in hunk order, segment order within each hunk, lands on the exact
 * same number `locateConflictRegion` would — regardless of the diff's context
 * radius, since a context window only ever trims `'context'` segments, never
 * splits or reorders a `'conflict'` one.
 */
export function flattenConflictHunks(hunks: ConflictedHunk[]): ConflictStudioItem[] {
  const items: ConflictStudioItem[] = [];
  let regionIndex = 0;

  for (const hunk of hunks) {
    for (const segment of hunk.segments) {
      if (segment.kind === 'context') {
        items.push({ kind: 'context', lines: segment.lines });
      } else {
        items.push({ kind: 'conflict', regionIndex, region: segment.region });
        regionIndex++;
      }
    }
  }

  return items;
}
