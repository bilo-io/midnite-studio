import type { DiffHunk, DiffLine, FileDiff } from '@midnite/git-shared';

/**
 * Flattening the hunk tree into one row list, because the view is virtualised.
 *
 * A virtualizer measures and windows a flat, indexable sequence; nested
 * hunks-then-lines cannot be windowed without re-deriving the mapping on every
 * scroll frame. Doing it once here keeps `<DiffView>` a pure paint over
 * `rows[index]`.
 *
 * Kept out of the component file so it is testable without a DOM.
 */

export type DiffRow =
  | {
      kind: 'hunk';
      hunkIndex: number;
      heading: string;
      /** Lines of the file skipped since the previous hunk, or null before the first. */
      gap: number | null;
    }
  | { kind: 'line'; line: DiffLine };

export function toDiffRows(diff: FileDiff): DiffRow[] {
  const rows: DiffRow[] = [];
  let previousEnd: number | null = null;

  diff.hunks.forEach((hunk: DiffHunk, hunkIndex) => {
    rows.push({
      kind: 'hunk',
      hunkIndex,
      heading: hunk.heading,
      gap: previousEnd === null ? null : Math.max(0, hunk.newStart - previousEnd),
    });
    for (const line of hunk.lines) rows.push({ kind: 'line', line });
    previousEnd = hunk.newStart + hunk.newLines;
  });

  return rows;
}

/**
 * How much context an expander click asks for next.
 *
 * Multiplicative rather than a fixed `+10`: a 400-line gap would otherwise take
 * forty clicks to cross. The floor keeps the first step from being trivially
 * small when the current context is 0 or 1.
 *
 * Named and exported so the component and its tests agree on the step by
 * construction rather than by two copies of the same arithmetic.
 */
export const nextContext = (current: number): number => Math.max(current * 4, 10);

/**
 * Split a line's text into painted segments: the parts that changed within the
 * line, and the parts that didn't.
 *
 * Ranges arrive sorted and non-overlapping from the parser, but this does not
 * assume it — a malformed range would otherwise drop or duplicate characters,
 * and silently rendering the wrong source text is the worst failure this
 * component has available to it.
 */
export type DiffSegment = { text: string; changed: boolean };

export function toSegments(line: DiffLine): DiffSegment[] {
  if (line.ranges.length === 0) return [{ text: line.text, changed: false }];

  const ranges = [...line.ranges]
    .map((r) => ({
      start: Math.max(0, Math.min(r.start, line.text.length)),
      end: Math.max(0, Math.min(r.end, line.text.length)),
    }))
    .filter((r) => r.end > r.start)
    .sort((a, b) => a.start - b.start);

  const segments: DiffSegment[] = [];
  let cursor = 0;

  for (const range of ranges) {
    // Overlapping ranges: the cursor has already passed this one's start.
    const start = Math.max(range.start, cursor);
    if (start >= range.end) continue;
    if (start > cursor) segments.push({ text: line.text.slice(cursor, start), changed: false });
    segments.push({ text: line.text.slice(start, range.end), changed: true });
    cursor = range.end;
  }

  if (cursor < line.text.length) {
    segments.push({ text: line.text.slice(cursor), changed: false });
  }

  return segments;
}
