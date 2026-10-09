import type { ForgeComment, ForgeReviewThread } from '@midnite/studio-shared';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PrConversation } from './pr-conversation';

afterEach(cleanup);

vi.mock('../../services/bridge', () => ({ bridge: () => null, hasBridge: () => false }));
vi.mock('../../components/user-avatar', () => ({ UserAvatar: () => null }));
vi.mock('../slides/present-button', () => ({ PresentButton: () => null }));

const review: ForgeComment = {
  id: '77',
  kind: 'review',
  author: 'alice',
  body: '',
  createdAt: '2026-01-02T00:00:00Z',
  url: '',
  reviewState: 'CHANGES_REQUESTED',
};

function thread(id: string, resolved: boolean): ForgeReviewThread {
  return {
    id,
    path: 'src/greet.ts',
    line: 12,
    originalLine: 12,
    startLine: null,
    side: 'RIGHT',
    resolved,
    outdated: false,
    fileLevel: false,
    comments: [
      {
        id: `c-${id}`,
        databaseId: '501',
        author: 'alice',
        body: `Please rename ${id}`,
        createdAt: '2026-01-02T00:00:00Z',
        url: '',
        diffHunk: '@@ -10,3 +10,4 @@\n const a = 1;\n-const b = 2;\n+const b = 3;\n+const c = 4;',
        reviewId: '77',
      },
    ],
  };
}

const base = { comments: [review], isLoading: false, error: null, notReady: null };

describe('PrConversation threads', () => {
  it('nests a thread under its review with the hunk lines, and no "No message."', () => {
    render(<PrConversation {...base} threads={[thread('open', false)]} />);
    const card = screen.getByTestId('conversation-thread');
    expect(within(card).getByText('src/greet.ts')).toBeTruthy();
    expect(within(card).getByText('Please rename open')).toBeTruthy();
    const rows = within(card).getByTestId('hunk-excerpt').children;
    expect(rows).toHaveLength(4);
    expect(rows[3]!.getAttribute('data-commented')).toBe('true');
    expect(rows[1]!.getAttribute('data-kind')).toBe('del');
    expect(screen.queryByText('No message.')).toBeNull();
  });

  it('still says "No message." for a bare review without threads', () => {
    render(<PrConversation {...base} threads={[]} />);
    expect(screen.getByText('No message.')).toBeTruthy();
  });

  it('Resolve conversation calls onResolve with resolved:true', () => {
    const onResolve = vi.fn();
    render(<PrConversation {...base} threads={[thread('open', false)]} onResolve={onResolve} />);
    fireEvent.click(screen.getByRole('button', { name: /Resolve conversation/ }));
    expect(onResolve).toHaveBeenCalledWith({ threadId: 'open', resolved: true });
  });

  it('collapses resolved threads, offers Show resolved, and Unresolve', () => {
    const onResolve = vi.fn();
    render(<PrConversation {...base} threads={[thread('done', true)]} onResolve={onResolve} />);
    expect(screen.queryByText('Please rename done')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show resolved' }));
    expect(screen.getByText('Please rename done')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Unresolve conversation/ }));
    expect(onResolve).toHaveBeenCalledWith({ threadId: 'done', resolved: false });
  });

  it('shows an unmatched thread standalone', () => {
    const orphan = thread('lone', false);
    orphan.comments[0]!.reviewId = null;
    render(<PrConversation {...base} comments={[]} threads={[orphan]} />);
    expect(screen.getByTestId('conversation-thread')).toBeTruthy();
  });
});
