import type { ForgeComment, ForgeReviewThread } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { buildConversationTimeline } from './conversation-timeline';

const comment = (id: string, kind: 'review' | 'comment', createdAt: string): ForgeComment => ({
  id,
  kind,
  author: 'a',
  body: '',
  createdAt,
  url: '',
  reviewState: kind === 'review' ? 'COMMENTED' : null,
});

const thread = (id: string, reviewId: string | null, createdAt: string): ForgeReviewThread => ({
  id,
  path: 'a.ts',
  line: 1,
  originalLine: 1,
  startLine: null,
  side: 'RIGHT',
  resolved: false,
  outdated: false,
  fileLevel: false,
  comments: [{ id: `c-${id}`, databaseId: '1', author: 'a', body: '', createdAt, url: '', diffHunk: '', reviewId }],
});

describe('buildConversationTimeline', () => {
  it('nests threads under the review whose id matches their first comment', () => {
    const entries = buildConversationTimeline(
      [comment('7', 'review', '2026-01-02'), comment('8', 'comment', '2026-01-03')],
      [thread('t1', '7', '2026-01-02'), thread('t2', '7', '2026-01-02T01')],
    );
    expect(entries).toHaveLength(2);
    const review = entries[0]!;
    expect(review.type === 'comment' && review.threads.map((t) => t.id)).toEqual(['t1', 't2']);
    expect(entries[1]!.type === 'comment' && entries[1]!.threads).toEqual([]);
  });

  it('does not nest under a discussion comment that shares the id', () => {
    const entries = buildConversationTimeline([comment('7', 'comment', '2026-01-01')], [thread('t', '7', '2026-01-02')]);
    expect(entries.map((e) => e.type)).toEqual(['comment', 'thread']);
  });

  it('interleaves threads with no review by their first comment time', () => {
    const entries = buildConversationTimeline(
      [comment('1', 'comment', '2026-01-01'), comment('2', 'comment', '2026-01-03')],
      [thread('late', null, '2026-01-05'), thread('mid', null, '2026-01-02'), thread('orphan', '99', '2026-01-02T05')],
    );
    expect(entries.map((e) => e.key)).toEqual([
      'comment-1',
      'thread-mid',
      'thread-orphan',
      'comment-2',
      'thread-late',
    ]);
  });

  it('is empty for nothing', () => {
    expect(buildConversationTimeline([], [])).toEqual([]);
  });
});
