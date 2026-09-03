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

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.startsWith('<<<<<<<')) {
      context.push(line);
      i++;
      continue;
    }

    flushContext();
    i++; // past the `<<<<<<<` marker itself

    const ours: string[] = [];
    while (i < lines.length && !lines[i].startsWith('|||||||') && !lines[i].startsWith('=======')) {
      ours.push(lines[i]);
      i++;
    }

    let base: string[] | null = null;
    if (i < lines.length && lines[i].startsWith('|||||||')) {
      i++; // past the `|||||||` marker
      const baseLines: string[] = [];
      while (i < lines.length && !lines[i].startsWith('=======')) {
        baseLines.push(lines[i]);
        i++;
      }
      base = baseLines;
    }

    if (i < lines.length && lines[i].startsWith('=======')) i++; // past `=======`

    const theirs: string[] = [];
    while (i < lines.length && !lines[i].startsWith('>>>>>>>')) {
      theirs.push(lines[i]);
      i++;
    }
    if (i < lines.length && lines[i].startsWith('>>>>>>>')) i++; // past `>>>>>>>`

    segments.push({ kind: 'conflict', region: { ours, theirs, base } });
  }
  flushContext();

  return { segments };
}

/** Convenience over a whole file's already-parsed hunks — one call per hunk. */
export function parseConflictedFile(hunks: DiffHunk[]): ConflictedHunk[] {
  return hunks.map((hunk) => parseConflictMarkers(hunk.lines.map((line) => line.text)));
}
