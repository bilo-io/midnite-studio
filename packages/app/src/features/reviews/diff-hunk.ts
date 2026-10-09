import type { FileDiff, ForgeReviewThread } from '@midnite/studio-shared';

/**
 * Cutting a thread's code excerpt out of a unified-diff hunk.
 *
 * GitHub's `diffHunk` is an `@@ -a,b +c,d @@` header followed by hunk lines, and
 * it ends AT the commented line — so "the code this thread is about" is simply
 * the tail of it. Pure and string-in, lines-out, so the Conversation tab can
 * show the context without fetching the patch.
 */

export type HunkLineKind = 'add' | 'del' | 'ctx';

export interface HunkLine {
  kind: HunkLineKind;
  /** Pre-image line number; null on an addition. */
  oldNo: number | null;
  /** Post-image line number; null on a deletion. */
  newNo: number | null;
  /** Content with the leading +/-/space marker stripped. */
  text: string;
  /** True for the line(s) the thread is attached to. */
  commented: boolean;
}

export interface HunkExcerpt {
  /** The `@@ … @@` header, verbatim — empty when the excerpt came from a FileDiff. */
  header: string;
  lines: HunkLine[];
}

/** How many lines GitHub shows above (and including) the commented one. */
export const EXCERPT_LINES = 4;

const HEADER = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/** Parses a whole `diffHunk`; `null` when it has no recognisable header. */
export function parseDiffHunk(diffHunk: string): HunkExcerpt | null {
  if (diffHunk.trim() === '') return null;
  const rows = diffHunk.replace(/\r\n/g, '\n').split('\n');
  const headerIndex = rows.findIndex((row) => HEADER.test(row));
  if (headerIndex === -1) return null;
  const header = rows[headerIndex]!;
  const match = HEADER.exec(header)!;
  let oldNo = Number(match[1]);
  let newNo = Number(match[2]);

  const lines: HunkLine[] = [];
  for (const row of rows.slice(headerIndex + 1)) {
    // "\ No newline at end of file" annotates the previous line; it has no number.
    if (row.startsWith('\\')) continue;
    const marker = row[0];
    const text = row.slice(1);
    if (marker === '+') {
      lines.push({ kind: 'add', oldNo: null, newNo: newNo++, text, commented: false });
    } else if (marker === '-') {
      lines.push({ kind: 'del', oldNo: oldNo++, newNo: null, text, commented: false });
    } else if (marker === ' ' || row === '') {
      // A bare empty row is a context line whose single space was trimmed.
      lines.push({ kind: 'ctx', oldNo: oldNo++, newNo: newNo++, text, commented: false });
    }
  }
  // A trailing newline in the payload reads as one more blank context line.
  if (diffHunk.endsWith('\n') && lines.at(-1)?.kind === 'ctx' && lines.at(-1)?.text === '') lines.pop();
  return { header, lines };
}

type Anchor = Pick<ForgeReviewThread, 'line' | 'originalLine' | 'startLine' | 'side'>;

function numberOn(line: Pick<HunkLine, 'oldNo' | 'newNo'>, side: ForgeReviewThread['side']): number | null {
  return side === 'LEFT' ? line.oldNo : line.newNo;
}

/**
 * The last `count` lines of a hunk; for a multi-line thread, everything from
 * `startLine` to the end (the hunk already stops at the thread's last line).
 */
export function excerptFromHunk(
  diffHunk: string,
  anchor: Anchor,
  count: number = EXCERPT_LINES,
): HunkExcerpt | null {
  const parsed = parseDiffHunk(diffHunk);
  if (parsed === null || parsed.lines.length === 0) return null;
  const { header, lines } = parsed;

  let from = Math.max(0, lines.length - count);
  let commentedFrom = lines.length - 1;
  if (anchor.startLine !== null) {
    const at = lines.findIndex((line) => numberOn(line, anchor.side) === anchor.startLine);
    if (at !== -1) {
      from = at;
      commentedFrom = at;
    }
  }
  return {
    header,
    lines: lines.slice(from).map((line, i) => ({ ...line, commented: from + i >= commentedFrom })),
  };
}

/**
 * Fallback for an empty `diffHunk`: cut the same excerpt out of the Files
 * patch around the thread's current line. `null` when the line is not in it.
 */
export function excerptFromFile(
  file: FileDiff,
  anchor: Anchor,
  count: number = EXCERPT_LINES,
): HunkExcerpt | null {
  const target = anchor.line ?? anchor.originalLine;
  if (target === null) return null;
  for (const hunk of file.hunks) {
    const end = hunk.lines.findIndex((line) => numberOn(line, anchor.side) === target);
    if (end === -1) continue;
    let from = Math.max(0, end - count + 1);
    let commentedFrom = end;
    if (anchor.startLine !== null) {
      const at = hunk.lines.findIndex(
        (line) => numberOn(line, anchor.side) === anchor.startLine,
      );
      if (at !== -1 && at <= end) {
        from = at;
        commentedFrom = at;
      }
    }
    return {
      header: '',
      lines: hunk.lines.slice(from, end + 1).map((line, i) => ({
        kind: line.kind,
        oldNo: line.oldNo,
        newNo: line.newNo,
        text: line.text,
        commented: from + i >= commentedFrom,
      })),
    };
  }
  return null;
}

/** The excerpt for a thread: its first comment's `diffHunk`, else the cached patch. */
export function threadExcerpt(thread: ForgeReviewThread, file?: FileDiff): HunkExcerpt | null {
  const hunk = thread.comments[0]?.diffHunk ?? '';
  if (hunk !== '') {
    const fromHunk = excerptFromHunk(hunk, thread);
    if (fromHunk !== null) return fromHunk;
  }
  return file !== undefined ? excerptFromFile(file, thread) : null;
}
