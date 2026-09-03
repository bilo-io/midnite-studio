import type { ConflictedHunk, ConflictSegment, DiffHunk } from '@midnite/studio-shared';

/**
 * Splits a combined diff's raw marker text into structured regions.
 *
 * Takes line *text* only — the caller already has `DiffHunk.lines[].text`
 * from `readFileDiff`, which for an unmerged path is the literal marker text
 * git prints (`<<<<<<< HEAD`, `=======`, `>>>>>>> feature`, and under
 * `merge.conflictStyle = diff3` an additional `||||||| <ancestor>`). Detecting
 * `|||||||` rather than assuming one style matters because the conflict style
 * is the user's global git config, not something this app controls.
 */
export function parseConflictMarkers(lines: string[]): ConflictedHunk {
  const segments: ConflictSegment[] = [];
  let context: string[] = [];
  const flushContext = () => {
    if (context.length > 0) {
      segments.push({ kind: 'context', lines: context });
      context = [];
    }
  };

  // An index cursor rather than a for-of: each marker branch below consumes
  // a variable number of lines, which a single increment-per-iteration loop
  // can't express.
  let i = 0;
  const at = (idx: number): string => lines[idx] ?? '';

  while (i < lines.length) {
    if (!at(i).startsWith('<<<<<<<')) {
      context.push(at(i));
      i++;
      continue;
    }

    flushContext();
    i++; // past the `<<<<<<<` marker itself

    const ours: string[] = [];
    while (i < lines.length && !at(i).startsWith('|||||||') && !at(i).startsWith('=======')) {
      ours.push(at(i));
      i++;
    }

    let base: string[] | null = null;
    if (i < lines.length && at(i).startsWith('|||||||')) {
      i++; // past the `|||||||` marker
      const baseLines: string[] = [];
      while (i < lines.length && !at(i).startsWith('=======')) {
        baseLines.push(at(i));
        i++;
      }
      base = baseLines;
    }

    if (i < lines.length && at(i).startsWith('=======')) i++; // past `=======`

    const theirs: string[] = [];
    while (i < lines.length && !at(i).startsWith('>>>>>>>')) {
      theirs.push(at(i));
      i++;
    }
    if (i < lines.length && at(i).startsWith('>>>>>>>')) i++; // past `>>>>>>>`

    segments.push({ kind: 'conflict', region: { ours, theirs, base } });
  }
  flushContext();

  return { segments };
}

/** Convenience over a whole file's already-parsed hunks — one call per hunk. */
export function parseConflictedFile(hunks: DiffHunk[]): ConflictedHunk[] {
  return hunks.map((hunk) => parseConflictMarkers(hunk.lines.map((line) => line.text)));
}

/**
 * One conflict region located within a whole file's lines, marker text and
 * all — what `applyConflictHunk` (Theme C) needs to synthesize a patch that
 * `git apply` will match byte-for-byte.
 *
 * Deliberately separate from `parseConflictMarkers` rather than built on top
 * of it: that function throws the marker lines themselves away (Theme A never
 * renders `<<<<<<< HEAD` text, only the content either side of it), and it
 * works hunk-by-hunk off already-diffed `DiffLine.text`. A patch has to
 * reproduce the marker lines verbatim and needs the region's exact position
 * in the file's own lines, not a diff hunk's — so this walks the file fresh.
 */
export type LocatedConflictRegion = {
  /** 0-based index of the opening `<<<<<<<` line. */
  startLine: number;
  /** 0-based index one past the closing `>>>>>>>` line. */
  endLine: number;
  oursMarker: string;
  ours: string[];
  baseMarker: string | null;
  base: string[] | null;
  sepMarker: string;
  theirs: string[];
  endMarker: string;
};

/**
 * Finds the `regionIndex`-th (0-based) conflict region in `lines`, in
 * document order — the same order a top-to-bottom parse of the file's
 * conflict segments already walks them in. Returns `null` for an index past
 * the last region, or for a marker run left unclosed at end-of-file (the
 * loops below simply run out of lines rather than hang, so this is the only
 * way that case surfaces).
 */
export function locateConflictRegion(
  lines: string[],
  regionIndex: number,
): LocatedConflictRegion | null {
  const at = (idx: number): string => lines[idx] ?? '';
  let index = -1;
  let i = 0;

  while (i < lines.length) {
    if (!at(i).startsWith('<<<<<<<')) {
      i++;
      continue;
    }

    const startLine = i;
    const oursMarker = at(i);
    i++;

    const ours: string[] = [];
    while (i < lines.length && !at(i).startsWith('|||||||') && !at(i).startsWith('=======')) {
      ours.push(at(i));
      i++;
    }

    let baseMarker: string | null = null;
    let base: string[] | null = null;
    if (at(i).startsWith('|||||||')) {
      baseMarker = at(i);
      i++;
      base = [];
      while (i < lines.length && !at(i).startsWith('=======')) {
        base.push(at(i));
        i++;
      }
    }

    if (!at(i).startsWith('=======')) return null; // unclosed marker run — malformed
    const sepMarker = at(i);
    i++;

    const theirs: string[] = [];
    while (i < lines.length && !at(i).startsWith('>>>>>>>')) {
      theirs.push(at(i));
      i++;
    }

    if (!at(i).startsWith('>>>>>>>')) return null; // unclosed marker run — malformed
    const endMarker = at(i);
    i++;

    index++;
    if (index === regionIndex) {
      return { startLine, endLine: i, oursMarker, ours, baseMarker, base, sepMarker, theirs, endMarker };
    }
  }

  return null;
}
