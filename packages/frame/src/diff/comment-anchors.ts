import type { FileDiff, ForgeReviewThread } from '@midnite/studio-shared';

/**
 * Where an inline thread belongs in a rendered diff, and how a new one names
 * the line it was written against.
 *
 * Pure data, kept out of the components for the usual reason and one extra: the
 * position mapping is the piece of Theme E most likely to be *subtly* wrong, and
 * "subtly wrong" here means somebody's review comment lands on the wrong line of
 * somebody else's pull request. It should be exercisable line by line under bare
 * vitest with no DOM and no bridge.
 */

/**
 * Threads keyed by the new-file line they hang off.
 *
 * A `Map<number, ForgeReviewThread[]>` rather than a lookup by index, because
 * the row list is a flattened hunk sequence and a line's *index* changes the
 * moment context is expanded, while its `newNo` does not.
 *
 * Only threads with a live right-side anchor are in here. Everything else —
 * outdated, file-level, or left-side — goes to `unanchoredThreads`, because a
 * thread whose anchor no longer exists must not be drawn against whichever row
 * happens to carry that number now. That is the failure mode this split exists
 * to make impossible.
 */
export type ThreadsByLine = Map<number, ForgeReviewThread[]>;

/** Is this thread still pinned to a line the current diff actually renders? */
export function isAnchored(thread: ForgeReviewThread): boolean {
  return !thread.outdated && !thread.fileLevel && thread.line !== null;
}

/**
 * Every new-file line the diff actually renders on its right side.
 */
export function rightSideLines(diff: FileDiff): Set<number> {
  const lines = new Set<number>();
  for (const hunk of diff.hunks) {
    for (const line of hunk.lines) {
      if (line.kind !== 'del' && line.newNo !== null) lines.add(line.newNo);
    }
  }
  return lines;
}

/**
 * Every old-file line the diff actually renders on its left side.
 */
export function leftSideLines(diff: FileDiff): Set<number> {
  const lines = new Set<number>();
  for (const hunk of diff.hunks) {
    for (const line of hunk.lines) {
      if (line.kind !== 'add' && line.oldNo !== null) lines.add(line.oldNo);
    }
  }
  return lines;
}

/**
 * The threads for one file, split by side into right and left thread maps.
 */
export function threadsForFile(
  threads: readonly ForgeReviewThread[],
  path: string,
  diff?: FileDiff,
): { byLine: ThreadsByLine; leftByLine: ThreadsByLine; unanchored: ForgeReviewThread[] } {
  const byLine: ThreadsByLine = new Map();
  const leftByLine: ThreadsByLine = new Map();
  const unanchored: ForgeReviewThread[] = [];
  const rightRendered = diff === undefined ? null : rightSideLines(diff);
  const leftRendered = diff === undefined ? null : leftSideLines(diff);

  for (const thread of threads) {
    if (thread.path !== path) continue;
    if (!isAnchored(thread)) {
      unanchored.push(thread);
      continue;
    }
    const line = thread.line;
    if (line === null) continue;

    const isLeft = thread.side === 'LEFT';
    const rendered = isLeft ? leftRendered : rightRendered;
    if (rendered !== null && !rendered.has(line)) {
      unanchored.push(thread);
      continue;
    }

    const targetMap = isLeft ? leftByLine : byLine;
    const existing = targetMap.get(line);
    if (existing) existing.push(thread);
    else targetMap.set(line, [thread]);
  }

  return { byLine, leftByLine, unanchored };
}

/**
 * GitHub's legacy `position` for a line — the fallback anchor.
 */
export function positionForLine(
  diff: FileDiff,
  lineNo: number,
  side: 'LEFT' | 'RIGHT' = 'RIGHT',
): number | null {
  let position = 0;

  for (const [hunkIndex, hunk] of diff.hunks.entries()) {
    if (hunkIndex > 0) position += 1;

    for (const line of hunk.lines) {
      position += 1;
      if (side === 'RIGHT' && line.kind !== 'del' && line.newNo === lineNo) return position;
      if (side === 'LEFT' && line.kind !== 'add' && line.oldNo === lineNo) return position;
    }
  }

  return null;
}

/**
 * Whether a line can be commented on at all.
 * Context lines resolve to RIGHT side per user decision.
 */
export const isCommentableLine = (
  line: { kind: string; oldNo: number | null; newNo: number | null },
  side: 'left' | 'right' = 'right',
): boolean => {
  if (side === 'left') {
    return line.kind === 'del' && line.oldNo !== null;
  }
  return line.kind !== 'del' && line.newNo !== null;
};

