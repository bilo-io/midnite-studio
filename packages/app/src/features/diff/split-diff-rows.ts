import type { DiffHunk, DiffLine, FileDiff, SplitCell, SplitDiffRow } from '@midnite/studio-shared';

export type { SplitCell, SplitDiffRow };


/**
 * Checks if a diff can be presented in split layout.
 * Binary and combined diffs revert to unified.
 */
export function canSplit(diff: FileDiff): boolean {
  return !diff.binary && !diff.combined;
}

/**
 * Convert a FileDiff into split diff rows.
 */
export function toSplitRows(diff: FileDiff): SplitDiffRow[] {
  const rows: SplitDiffRow[] = [];
  let previousEnd: number | null = null;

  diff.hunks.forEach((hunk: DiffHunk, hunkIndex) => {
    rows.push({
      kind: 'hunk',
      hunkIndex,
      heading: hunk.heading,
      gap: previousEnd === null ? null : Math.max(0, hunk.newStart - previousEnd),
    });

    const splitHunkRows = pairHunkLines(hunk.lines);
    rows.push(...splitHunkRows);

    previousEnd = hunk.newStart + hunk.newLines;
  });

  return rows;
}

/**
 * Group lines within a hunk into left/right split rows.
 * Implements Levenshtein-based sequence alignment per user decision.
 */
function pairHunkLines(lines: readonly DiffLine[]): SplitDiffRow[] {
  const result: SplitDiffRow[] = [];
  let i = 0;

  while (i < lines.length) {
    const current = lines[i];
    if (!current) break;

    if (current.kind === 'ctx') {
      result.push({
        kind: 'split-line',
        left: { line: current, type: 'ctx' },
        right: { line: current, type: 'ctx' },
      });
      i += 1;
      continue;
    }

    // Collect contiguous run of deletions and additions
    const delRun: DiffLine[] = [];
    const addRun: DiffLine[] = [];

    while (i < lines.length && lines[i]?.kind === 'del') {
      delRun.push(lines[i]!);
      i += 1;
    }
    while (i < lines.length && lines[i]?.kind === 'add') {
      addRun.push(lines[i]!);
      i += 1;
    }

    const paired = alignRuns(delRun, addRun);
    result.push(...paired);
  }

  return result;
}

/**
 * Align runs of deletions and additions using Levenshtein distance matching.
 */
function alignRuns(dels: readonly DiffLine[], adds: readonly DiffLine[]): SplitDiffRow[] {
  const rows: SplitDiffRow[] = [];

  if (dels.length === 0) {
    for (const add of adds) {
      rows.push({
        kind: 'split-line',
        left: { line: null, type: 'empty' },
        right: { line: add, type: 'add' },
      });
    }
    return rows;
  }

  if (adds.length === 0) {
    for (const del of dels) {
      rows.push({
        kind: 'split-line',
        left: { line: del, type: 'del' },
        right: { line: null, type: 'empty' },
      });
    }
    return rows;
  }

  // Levenshtein alignment matrix
  const m = dels.length;
  const n = adds.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i]![0] = i;
  for (let j = 0; j <= n; j++) dp[0]![j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const delLine = dels[i - 1]!;
      const addLine = adds[j - 1]!;
      const cost = levenshteinDistance(delLine.text, addLine.text);

      dp[i]![j] = Math.min(
        dp[i - 1]![j]! + 1, // deletion (del unmatched)
        dp[i]![j - 1]! + 1, // insertion (add unmatched)
        dp[i - 1]![j - 1]! + cost, // match/substitute
      );
    }
  }

  // Backtrack to find alignment path
  let i = m;
  let j = n;
  const alignment: Array<{ left: DiffLine | null; right: DiffLine | null }> = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0) {
      const delLine = dels[i - 1]!;
      const addLine = adds[j - 1]!;
      const cost = levenshteinDistance(delLine.text, addLine.text);
      if (dp[i]![j] === dp[i - 1]![j - 1]! + cost) {
        alignment.unshift({ left: delLine, right: addLine });
        i -= 1;
        j -= 1;
        continue;
      }
    }

    if (i > 0 && dp[i]![j] === dp[i - 1]![j]! + 1) {
      alignment.unshift({ left: dels[i - 1]!, right: null });
      i -= 1;
    } else {
      alignment.unshift({ left: null, right: adds[j - 1]! });
      j -= 1;
    }
  }

  for (const pair of alignment) {
    rows.push({
      kind: 'split-line',
      left: pair.left ? { line: pair.left, type: 'del' } : { line: null, type: 'empty' },
      right: pair.right ? { line: pair.right, type: 'add' } : { line: null, type: 'empty' },
    });
  }

  return rows;
}

/**
 * Normalized Levenshtein distance between 0.0 (identical) and 1.0 (completely different).
 */
function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return 1;
  if (b.length === 0) return 1;

  const matrix: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array(b.length + 1).fill(0),
  );

  for (let i = 0; i <= a.length; i++) matrix[i]![0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0]![j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i]![j] = Math.min(
        matrix[i - 1]![j]! + 1,
        matrix[i]![j - 1]! + 1,
        matrix[i - 1]![j - 1]! + cost,
      );
    }
  }

  const maxLen = Math.max(a.length, b.length);
  return matrix[a.length]![b.length]! / maxLen;
}
