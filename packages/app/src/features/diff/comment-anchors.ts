import type { FileDiff, ForgeReviewThread } from '@midnite/git-shared';

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
  return !thread.outdated && !thread.fileLevel && thread.side === 'RIGHT' && thread.line !== null;
}

/**
 * Every new-file line the diff actually renders on its right side.
 *
 * The set `threadsForFile` checks a thread's anchor against. A `Set` rather than
 * a range test because a diff is hunks with gaps between them: line 200 being
 * below the highest rendered line does not mean it is rendered.
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
 * The threads for one file, split into the two groups that render differently.
 *
 * `path` matching is exact against `ForgeReviewThread.path`, which GitHub
 * reports as the *new* path — the same one `FileDiff.path` carries, so a
 * renamed file's threads follow the rename without a second lookup.
 *
 * **Pass `diff` wherever the diff is in hand**, which is every rendering caller.
 * A thread can be live, right-side and unresolved and still name a line this
 * diff does not contain: a reviewer who expands context on github.com can
 * comment well outside any hunk, and `gh pr diff` fetches three lines of
 * context. `line` alone cannot tell those apart, so without the set the thread
 * is keyed into `byLine`, no row ever matches it, and it renders **nowhere** —
 * a real review comment silently missing, which is the same harm as pinning one
 * to the wrong line. With the set it joins `unanchored` and states its line as
 * prose, like an outdated thread. Omitting `diff` skips the check, for callers
 * grouping threads before a diff has arrived.
 */
export function threadsForFile(
  threads: readonly ForgeReviewThread[],
  path: string,
  diff?: FileDiff,
): { byLine: ThreadsByLine; unanchored: ForgeReviewThread[] } {
  const byLine: ThreadsByLine = new Map();
  const unanchored: ForgeReviewThread[] = [];
  const rendered = diff === undefined ? null : rightSideLines(diff);

  for (const thread of threads) {
    if (thread.path !== path) continue;
    if (!isAnchored(thread)) {
      unanchored.push(thread);
      continue;
    }
    // `isAnchored` has already established this is non-null; the local keeps
    // that fact visible to the type checker without a non-null assertion.
    const line = thread.line;
    if (line === null) continue;
    if (rendered !== null && !rendered.has(line)) {
      unanchored.push(thread);
      continue;
    }
    const existing = byLine.get(line);
    if (existing) existing.push(thread);
    else byLine.set(line, [thread]);
  }

  return { byLine, unanchored };
}

/**
 * GitHub's legacy `position` for a new-file line — the fallback anchor.
 *
 * Defined by the API as "the number of lines down from the first `@@` hunk
 * header in the file", where the line immediately below that header is 1. Three
 * details that are easy to get wrong and are all deliberate here:
 *
 * - **Later `@@` headers count.** The position keeps increasing through
 *   subsequent hunks, and each header consumes one. Only the *first* header is
 *   the origin rather than a counted line.
 * - **Deleted lines count too.** Position is an offset into the patch text, not
 *   into the new file, so a `-` line advances it even though it has no `newNo`.
 * - **Blank and context lines count.** Everything in the patch body does.
 *
 * Returns null when the line is not in the diff at all — a line outside every
 * hunk has no position, and inventing one would anchor a comment to whatever
 * text happens to sit at that offset.
 *
 * This is only ever sent if the modern `line` + `side` form is refused; see
 * `addReviewComment`. It is computed here rather than in main because the parsed
 * hunks live here, and re-deriving them in main would mean re-fetching the patch.
 */
export function positionForLine(diff: FileDiff, newNo: number): number | null {
  let position = 0;

  for (const [hunkIndex, hunk] of diff.hunks.entries()) {
    // Every hunk header but the first is itself a counted line.
    if (hunkIndex > 0) position += 1;

    for (const line of hunk.lines) {
      position += 1;
      if (line.kind !== 'del' && line.newNo === newNo) return position;
    }
  }

  return null;
}

/**
 * Whether a line can be commented on at all.
 *
 * Right-side only for v1: an added or context line, which is exactly the set
 * that has a `newNo`. A deleted line needs `side: LEFT` and the left-side
 * position mapping this version does not build, so it gets no gutter affordance
 * rather than one that would post to the wrong place.
 */
export const isCommentableLine = (line: { kind: string; newNo: number | null }): boolean =>
  line.kind !== 'del' && line.newNo !== null;
