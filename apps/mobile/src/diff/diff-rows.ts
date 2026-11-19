// Pure helpers behind the shared diff viewer (Phase 146 Theme I4): flatten a `FileDiff` into list rows, split a line into
// plain and changed segments for the intraline tint, and parse a review comment's `diffHunk` for the compact excerpt.
import { parseUnifiedDiff } from '@midnite/studio-git-engine/diff';
import { DIFF_DEFAULT_CONTEXT, type DiffHunk, type DiffLine, type FileDiff, type IntralineRange } from '@midnite/studio-shared';

/** Above this many lines a diff sits behind a "Load full diff" gate. */
export const LARGE_DIFF_LINES = 2000;

export type DiffRow =
  | { kind: 'hunk'; key: string; text: string }
  | { kind: 'line'; key: string; line: DiffLine; old: string; new: string };

/** The old and new gutter cells of a line: blank where the line does not exist on that side. */
export function gutterNumbers(line: DiffLine): { old: string; new: string } {
  return { old: line.oldNo === null ? '' : String(line.oldNo), new: line.newNo === null ? '' : String(line.newNo) };
}

export const hunkHeader = (h: DiffHunk): string =>
  `@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@${h.heading ? ` ${h.heading}` : ''}`;

/** One hunk as its header row followed by its line rows. */
export function rowsForHunk(hunk: DiffHunk, index: number): DiffRow[] {
  return [
    { kind: 'hunk', key: `h${index}`, text: hunkHeader(hunk) },
    ...hunk.lines.map((line, i): DiffRow => ({ kind: 'line', key: `h${index}l${i}`, line, ...rename(gutterNumbers(line)) })),
  ];
}
const rename = (g: { old: string; new: string }) => ({ old: g.old, new: g.new });

export const rowsForFile = (file: FileDiff): DiffRow[] => file.hunks.flatMap((h, i) => rowsForHunk(h, i));

export const lineCount = (file: FileDiff): number => file.hunks.reduce((n, h) => n + h.lines.length, 0);
export const isLargeDiff = (file: FileDiff): boolean => lineCount(file) > LARGE_DIFF_LINES;

/** Indices of the hunk header rows, for a list's sticky headers. */
export const hunkIndices = (rows: DiffRow[]): number[] => rows.flatMap((r, i) => (r.kind === 'hunk' ? [i] : []));

export interface Segment {
  text: string;
  changed: boolean;
}

/** Split a line's text on its intraline ranges (clamped, sorted, merged) so the changed spans can carry a stronger tint. */
export function segmentsOf(text: string, ranges: IntralineRange[]): Segment[] {
  const spans = ranges
    .map((r) => ({ start: Math.max(0, Math.min(r.start, text.length)), end: Math.max(0, Math.min(r.end, text.length)) }))
    .filter((r) => r.end > r.start)
    .sort((a, b) => a.start - b.start);
  const out: Segment[] = [];
  let at = 0;
  for (const span of spans) {
    const start = Math.max(span.start, at);
    if (span.end <= start) continue;
    if (start > at) out.push({ text: text.slice(at, start), changed: false });
    out.push({ text: text.slice(start, span.end), changed: true });
    at = span.end;
  }
  if (at < text.length || out.length === 0) out.push({ text: text.slice(at), changed: false });
  return out;
}

/** A review comment's `diffHunk` (header plus lines, ending at the commented line) as a one-hunk `FileDiff`. */
export function fileFromHunkText(path: string, diffHunk: string): FileDiff | null {
  if (!diffHunk.trim()) return null;
  try {
    const file = parseUnifiedDiff(diffHunk, { contextLines: DIFF_DEFAULT_CONTEXT, fallbackPath: path });
    return file.hunks.length > 0 ? { ...file, path } : null;
  } catch {
    return null;
  }
}

/** The last `max` lines of a file's first hunk: the excerpt a thread shows above its comments. */
export function excerptOf(file: FileDiff, max = 6): FileDiff {
  const hunk = file.hunks[0];
  if (!hunk || hunk.lines.length <= max) return file;
  return { ...file, hunks: [{ ...hunk, lines: hunk.lines.slice(-max) }] };
}
