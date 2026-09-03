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
