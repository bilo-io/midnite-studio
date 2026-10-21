import type { ForgeComment, ForgeReviewThread } from '@midnite/studio-shared';

/**
 * The Conversation tab's timeline, the way github.com lays it out: top-level
 * comments and review verdicts in order, each review carrying the inline
 * threads it opened beneath it. A thread whose review is not in the list
 * (another forge, or a null `reviewId`) stands on its own, placed by its first
 * comment's date.
 *
 * Pure so the grouping is tested without a DOM. `comments` arrives already
 * interleaved by time from main, so it is never re-sorted — threads are
 * merged into that order, not the other way round.
 */
export type TimelineEntry =
  | { type: 'comment'; key: string; comment: ForgeComment; threads: ForgeReviewThread[] }
  | { type: 'thread'; key: string; thread: ForgeReviewThread };

function firstCommentTime(thread: ForgeReviewThread): string {
  return thread.comments[0]?.createdAt ?? '';
}

export function buildConversationTimeline(
  comments: readonly ForgeComment[],
  threads: readonly ForgeReviewThread[],
): TimelineEntry[] {
  const reviewIds = new Set(comments.filter((c) => c.kind === 'review').map((c) => c.id));
  const nested = new Map<string, ForgeReviewThread[]>();
  const standalone: ForgeReviewThread[] = [];

  for (const thread of threads) {
    const reviewId = thread.comments[0]?.reviewId ?? null;
    if (reviewId !== null && reviewIds.has(reviewId)) {
      const list = nested.get(reviewId) ?? [];
      list.push(thread);
      nested.set(reviewId, list);
    } else {
      standalone.push(thread);
    }
  }
  standalone.sort((a, b) => firstCommentTime(a).localeCompare(firstCommentTime(b)));

  const entries: TimelineEntry[] = [];
  let next = 0;
  const flushBefore = (time: string | null) => {
    while (
      next < standalone.length &&
      (time === null || firstCommentTime(standalone[next]!) < time)
    ) {
      const thread = standalone[next++]!;
      entries.push({ type: 'thread', key: `thread-${thread.id}`, thread });
    }
  };

  for (const comment of comments) {
    flushBefore(comment.createdAt);
    entries.push({
      type: 'comment',
      key: `${comment.kind}-${comment.id}`,
      comment,
      threads:
        comment.kind === 'review'
          ? (nested.get(comment.id) ?? []).sort((a, b) =>
              firstCommentTime(a).localeCompare(firstCommentTime(b)),
            )
          : [],
    });
  }
  flushBefore(null);
  return entries;
}
