import type { DiffHunk, DiffLine, FileDiff, ForgeReviewThread } from '@midnite/git-shared';

import type { ThreadsByLine } from './comment-anchors';
import type { HighlightToken } from './line-highlight';

export { canSplit, toSplitRows } from './split-diff-rows';




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
  | { kind: 'line'; line: DiffLine }
  /*
    The two review rows (Phase 20 Theme E).

    They are rows rather than absolutely-positioned overlays because the diff is
    a *list*, and a thread has to push the code below it down — anchoring a
    variable-height panel over a fixed row grid would either cover the next
    lines or need a second layout pass to avoid them. Being rows also means the
    virtualizer windows them like anything else; what it costs is dynamic
    measurement, which is why `<DiffView>`'s virtualizer measures instead of
    assuming `ROW_HEIGHT`.
  */
  | { kind: 'thread'; line: number; threads: readonly ForgeReviewThread[] }
  | { kind: 'composer'; line: number };

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

/** A diff segment with syntax colour composed in — the outer tint, the inner colour. */
export type HighlightedSegment = { text: string; changed: boolean; color: string | null };

/** Cumulative character offsets over a run of texts, for intersecting two partitions. */
function withOffsets<T extends { text: string }>(
  items: readonly T[],
): (T & { start: number; end: number })[] {
  let at = 0;
  return items.map((item) => {
    const start = at;
    at += item.text.length;
    return { ...item, start, end: at };
  });
}

/**
 * Intersect the intraline diff segments with syntax-highlight tokens.
 *
 * The two are independent partitions of the same line text — one cut at
 * what changed, the other cut at what grammar rule matched — so the merged
 * result is cut at every boundary either one draws, carrying `changed` from
 * the segment side and `color` from the token side.
 *
 * `tokens === null` means "not highlighted yet, or this file has no
 * grammar", and every piece keeps its segment's `changed` flag with no
 * colour — exactly today's plain rendering, so a diff never looks wrong
 * while its highlight is still loading in the background.
 */
export function mergeSegmentsWithTokens(
  segments: readonly DiffSegment[],
  tokens: readonly HighlightToken[] | null,
): HighlightedSegment[] {
  if (tokens === null) return segments.map((segment) => ({ ...segment, color: null }));

  const segs = withOffsets(segments);
  const toks = withOffsets(tokens);
  const cuts = new Set<number>([0]);
  for (const seg of segs) cuts.add(seg.end);
  for (const tok of toks) cuts.add(tok.end);
  const points = [...cuts].sort((a, b) => a - b);
  const fullText = segments.map((segment) => segment.text).join('');

  let si = 0;
  let ti = 0;
  const result: HighlightedSegment[] = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const start = points[i]!;
    const end = points[i + 1]!;
    if (start === end) continue;
    while (segs[si] && segs[si]!.end <= start) si += 1;
    while (toks[ti] && toks[ti]!.end <= start) ti += 1;
    result.push({
      text: fullText.slice(start, end),
      changed: segs[si]?.changed ?? false,
      color: toks[ti]?.color ?? null,
    });
  }
  return result;
}

/**
 * Splice the review rows into a diff's row list.
 *
 * A thread row goes directly *after* the line it hangs off, and the composer
 * after any thread already there — the reading order GitHub uses, and the one
 * that keeps "reply to this" adjacent to what is being replied to.
 *
 * Pure, and separate from `toDiffRows`, for two reasons. Composer state changes
 * on a click and threads arrive on their own fetch, so folding either into
 * `toDiffRows` would make the whole row list rebuild on both; and the splice is
 * exactly the kind of off-by-one that deserves a test with no DOM in it.
 *
 * With no threads and no open composer this returns `rows` itself, not a copy —
 * so the Changes page and the commit inspector, which pass neither, pay nothing
 * for this function existing.
 */
export function withCommentRows(
  rows: readonly DiffRow[],
  threads: ThreadsByLine | undefined,
  composerLine: number | null,
): readonly DiffRow[] {
  if ((threads === undefined || threads.size === 0) && composerLine === null) return rows;

  const out: DiffRow[] = [];
  for (const row of rows) {
    out.push(row);
    if (row.kind !== 'line') continue;

    const newNo = row.line.newNo;
    // A deleted line has no new-file number, and v1 anchors only to the right
    // side — so it can carry neither a thread nor a composer.
    if (newNo === null) continue;

    const atLine = threads?.get(newNo);
    if (atLine !== undefined && atLine.length > 0) {
      out.push({ kind: 'thread', line: newNo, threads: atLine });
    }
    if (composerLine === newNo) out.push({ kind: 'composer', line: newNo });
  }
  return out;
}
