// vitest/jsdom: the Reviews list, PR detail, conversation and review submission over a fake data source (Phase 146 Theme I).
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { ForgePull, ForgePullDetail, ForgeReviewThread } from '@midnite/studio-shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { routerCalls } from '../../test/mocks/expo-router';
import { renderInShell, resetShellState } from '../../test/shell-harness';
import { fail, ok } from '../data/source';
import { buildConversation, threadLabel } from './conversation';
import { decisionBadge, isHttpsUrl, reviewBlockedReason, reviewBodyRequired } from './format';
import { PullDetailScreen } from './pull-detail-screen';
import { ReviewsScreen } from './reviews-screen';

const repo = { owner: 'bilo-io', name: 'midnite-studio', defaultBranch: 'main' };
const viewer = async () => ok({ login: 'octo', name: 'Octo', avatarUrl: null });
const SLOW = { timeout: 4000 };
const pull = (n: number, over: Partial<ForgePull> = {}): ForgePull => ({
  id: `P${n}`, number: n, title: `Pull ${n}`, state: 'open', isDraft: false, reviewDecision: null, checks: null,
  headBranch: 'feature/x', author: 'ada', url: '', mergedAt: null, closedAt: null, commentCount: 0, ...over,
});
const detail = (p: ForgePull): ForgePullDetail => ({
  pull: p, body: 'Body text', headSha: null, baseSha: null, baseBranch: 'main', additions: 1, deletions: 0, changedFiles: 1,
  createdAt: null, updatedAt: null, mergeable: null, commitCount: 1, commits: [], reviewRequests: [],
});
const thread = (id: string, over: Partial<ForgeReviewThread> = {}): ForgeReviewThread => ({
  id, path: 'a.ts', line: 3, originalLine: 3, startLine: null, side: 'RIGHT', resolved: false, outdated: false, fileLevel: false,
  comments: [{ id: `${id}c`, databaseId: '1', author: 'zed', body: `thread ${id}`, createdAt: '2026-01-02T00:00:00Z', url: '', diffHunk: '@@ -1,2 +1,3 @@\n a\n+b\n c', reviewId: null }],
  ...over,
});
const overview = { checks: [{ name: 'build', conclusion: 'success' as const, detailsUrl: 'https://x/1' }], reviewers: [{ login: 'zed', state: 'APPROVED' as const }], comments: [{ id: 'c1', author: 'ada', body: 'general comment', createdAt: '2026-01-01T00:00:00Z' }] };
const file = { path: 'a.ts', oldPath: null, change: 'modified' as const, binary: false, oldMode: null, newMode: null, hunks: [], insertions: 2, deletions: 1, contextLines: 3, combined: false, truncated: false, droppedLines: 0 };
const base = (p: ForgePull, extra: Record<string, unknown> = {}) => ({
  viewer, pull: async () => ok(detail(p)), pullOverview: async () => ok(overview), pullFiles: async () => ok([file]), pullThreads: async () => ok([thread('t1')]), ...extra,
});

beforeEach(() => {
  routerCalls.length = 0;
  resetShellState({ currentRepo: repo });
});
afterEach(cleanup);

describe('helpers', () => {
  it('maps decisions and blocks own, merged and closed PRs', () => {
    expect(decisionBadge('APPROVED')?.label).toBe('Approved');
    expect(decisionBadge(null)).toBeNull();
    expect(reviewBlockedReason({ state: 'open', author: 'Ada' }, 'ada')).toMatch(/own/);
    expect(reviewBlockedReason({ state: 'merged', author: 'x' }, 'ada')).toMatch(/merged/);
    expect(reviewBlockedReason({ state: 'open', author: 'x' }, 'ada')).toBeNull();
    expect(reviewBodyRequired('APPROVE')).toBe(false);
    expect(reviewBodyRequired('COMMENT')).toBe(true);
    expect(isHttpsUrl('https://x/1')).toBe(true);
    expect(isHttpsUrl('javascript:alert(1)')).toBe(false);
    expect(isHttpsUrl('http://x')).toBe(false);
    expect(isHttpsUrl(null)).toBe(false);
  });
  it('orders the conversation by time and splits resolved threads', () => {
    const { items, resolved } = buildConversation(overview.comments, [thread('t1'), thread('t2', { resolved: true })]);
    expect(items.map((i) => i.kind)).toEqual(['comment', 'thread']);
    expect(resolved).toHaveLength(1);
    expect(threadLabel(thread('t3', { outdated: true }))).toBe('a.ts:3 (outdated)');
  });
});

describe('ReviewsScreen', () => {
  it('lists requested pulls by default and opens one', async () => {
    const listPulls = vi.fn(async () => ok({ items: [pull(7, { reviewDecision: 'APPROVED', checks: 'passing', isDraft: true })], nextCursor: null }));
    await renderInShell(<ReviewsScreen />, { viewer, listPulls });
    expect(await screen.findByText('#7 Pull 7')).toBeTruthy();
    expect(screen.getByText('Approved')).toBeTruthy();
    expect(screen.getByText('Draft')).toBeTruthy();
    expect(screen.getByTestId('pull-checks-passing')).toBeTruthy();
    expect(listPulls).toHaveBeenCalledWith(expect.objectContaining({ name: 'midnite-studio' }), 'review-requested', null);
    fireEvent.click(screen.getByTestId('pull-row-7'));
    expect(routerCalls.at(-1)).toEqual({ method: 'push', href: '/reviews/7' });
  });

  it('switches scope to Mine', async () => {
    const listPulls = vi.fn(async () => ok({ items: [], nextCursor: null }));
    await renderInShell(<ReviewsScreen />, { viewer, listPulls });
    expect(await screen.findByText('No reviews requested from you')).toBeTruthy();
    fireEvent.click(screen.getByText('Mine'));
    await waitFor(() => expect(listPulls).toHaveBeenCalledWith(expect.anything(), 'mine', null), SLOW);
    expect(await screen.findByText('You have no pull requests')).toBeTruthy();
  });

  it('shows an error with Retry', async () => {
    await renderInShell(<ReviewsScreen />, { viewer, listPulls: async () => fail('error', 'boom') });
    expect(await screen.findByTestId('reviews-error', {}, SLOW)).toBeTruthy();
    expect(screen.getByText('Retry')).toBeTruthy();
  });

  it('asks for a repository when none is selected', async () => {
    resetShellState({ currentRepo: null });
    await renderInShell(<ReviewsScreen />, { viewer, listPulls: vi.fn() });
    expect(await screen.findByTestId('reviews-no-repo')).toBeTruthy();
  });
});

describe('PullDetailScreen', () => {
  it('shows overview with reviewers and checks', async () => {
    await renderInShell(<PullDetailScreen n={7} />, base(pull(7)));
    expect(await screen.findByText('Pull 7', {}, SLOW)).toBeTruthy();
    expect(screen.getByText('Body text')).toBeTruthy();
    expect(await screen.findByTestId('reviewer-zed')).toBeTruthy();
    expect(screen.getByTestId('check-build')).toBeTruthy();
  });

  it('lists files and opens the diff viewer', async () => {
    await renderInShell(<PullDetailScreen n={7} />, base(pull(7)));
    fireEvent.click(await screen.findByText(/^Files/, {}, SLOW));
    fireEvent.click(await screen.findByTestId('file-a.ts'));
    expect(await screen.findByTestId('diff-empty')).toBeTruthy();
  });

  it('splits the file list beside the diff on an expanded window', async () => {
    // react-native-web reads the window size from documentElement.clientWidth/Height on a resize event.
    const el = document.documentElement;
    const setWindow = (w: number, h: number) => {
      Object.defineProperty(el, 'clientWidth', { configurable: true, value: w });
      Object.defineProperty(el, 'clientHeight', { configurable: true, value: h });
      window.dispatchEvent(new Event('resize'));
    };
    setWindow(1000, 800);
    try {
      await renderInShell(<PullDetailScreen n={7} />, base(pull(7)));
      fireEvent.click(await screen.findByText(/^Files/, {}, SLOW));
      expect(await screen.findByTestId('pull-files-list')).toBeTruthy();
      expect(screen.getByText('Select a file to see its diff.')).toBeTruthy();
      fireEvent.click(await screen.findByTestId('file-a.ts'));
      expect(await screen.findByTestId('diff-empty')).toBeTruthy();
      expect(screen.getByTestId('pull-files-list')).toBeTruthy();
    } finally {
      setWindow(0, 0);
    }
  });

  it('shows the conversation with a thread excerpt and replies', async () => {
    const replyToThread = vi.fn(async () => ok(null));
    await renderInShell(<PullDetailScreen n={7} />, base(pull(7), { replyToThread }));
    fireEvent.click(await screen.findByText(/^Conversation/, {}, SLOW));
    expect(await screen.findByText('general comment')).toBeTruthy();
    expect(screen.getByText('thread t1')).toBeTruthy();
    expect(screen.getByTestId('diff-compact')).toBeTruthy();
    fireEvent.change(screen.getByTestId('reply-t1-input'), { target: { value: 'ok' } });
    fireEvent.click(screen.getByTestId('reply-t1-send'));
    await waitFor(() => expect(replyToThread).toHaveBeenCalledWith('t1', 'ok'), SLOW);
  });

  it('submits an approval and shows a banner', async () => {
    const submitReview = vi.fn(async () => ok(null));
    await renderInShell(<PullDetailScreen n={7} />, base(pull(7), { submitReview }));
    fireEvent.click(await screen.findByTestId('review-approve', {}, SLOW));
    fireEvent.click(await screen.findByTestId('review-submit'));
    await waitFor(() => expect(submitReview).toHaveBeenCalledWith(expect.anything(), 7, 'APPROVE', ''), SLOW);
    expect(await screen.findByTestId('review-banner')).toBeTruthy();
  });

  it('requires a body for Request changes', async () => {
    const submitReview = vi.fn(async () => ok(null));
    await renderInShell(<PullDetailScreen n={7} />, base(pull(7), { submitReview }));
    fireEvent.click(await screen.findByTestId('review-request-changes', {}, SLOW));
    fireEvent.click(await screen.findByTestId('review-submit'));
    expect(submitReview).not.toHaveBeenCalled();
    fireEvent.change(screen.getByTestId('review-body'), { target: { value: 'please fix' } });
    fireEvent.click(screen.getByTestId('review-submit'));
    await waitFor(() => expect(submitReview).toHaveBeenCalledWith(expect.anything(), 7, 'REQUEST_CHANGES', 'please fix'), SLOW);
  });

  it('disables the bar on the viewer’s own PR and on merged PRs', async () => {
    await renderInShell(<PullDetailScreen n={7} />, base(pull(7, { author: 'octo' })));
    expect(await screen.findByText(/own pull request/, {}, SLOW)).toBeTruthy();
    cleanup();
    await renderInShell(<PullDetailScreen n={8} />, base(pull(8, { state: 'merged' })));
    expect(await screen.findByText(/is merged/, {}, SLOW)).toBeTruthy();
  });

  it('shows an error with Retry when the PR cannot load', async () => {
    await renderInShell(<PullDetailScreen n={7} />, { viewer, pull: async () => fail('network', 'offline') });
    expect(await screen.findByText('You appear to be offline', {}, SLOW)).toBeTruthy();
  });
});
