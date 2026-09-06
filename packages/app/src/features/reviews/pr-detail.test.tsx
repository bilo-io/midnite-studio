import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ForgePull, ForgePullDetail } from '@midnite/studio-shared';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DialogHost } from '../../components/dialog-host';
import { useUiStore } from '../../store/ui-store';
import { PrDetail } from './pr-detail';

afterEach(() => {
  cleanup();
  useUiStore.setState({ forgeWritesEnabled: false });
});

function pull(overrides: Partial<ForgePull> = {}): ForgePull {
  return {
    id: 'PR_kwDOfake',
    number: 42,
    title: 'Add a widget',
    state: 'open',
    isDraft: false,
    reviewDecision: null,
    checks: null,
    headBranch: 'feature/widget',
    author: 'bilo',
    url: 'https://github.com/acme/my-app/pull/42',
    mergedAt: null,
    closedAt: null,
    ...overrides,
  };
}

function detailOf(body: string): ForgePullDetail {
  return {
    pull: pull(),
    body,
    headSha: 'a'.repeat(40),
    baseSha: 'b'.repeat(40),
    baseBranch: 'main',
    additions: 3,
    deletions: 1,
    changedFiles: 2,
    createdAt: '2026-08-01T00:00:00Z',
    updatedAt: '2026-08-01T00:00:00Z',
    mergeable: 'MERGEABLE',
    commitCount: 1,
    commits: [],
    reviewRequests: [],
  };
}

/**
 * `bridge()` stubbed once for the whole suite. `pullDetail` is the only call
 * whose payload varies by test — everything else here is a fixed minimal
 * shape the header and the action bar need to mount at all, on a tab
 * (Overview) that never fetches files, comments or threads.
 */
let pullDetailBody = '';

vi.mock('../../services/bridge', () => ({
  bridge: () => ({
    forge: {
      pulls: vi.fn().mockResolvedValue({
        cli: { reason: 'ready', hint: '' },
        pulls: [pull()],
        error: null,
      }),
      pullDetail: vi.fn(async () => ({
        cli: { reason: 'ready', hint: '' },
        detail: detailOf(pullDetailBody),
        error: null,
      })),
      pullFiles: vi.fn(),
      pullComments: vi.fn(),
      pullThreads: vi.fn(),
      pullReview: vi.fn(),
      pullComment: vi.fn(),
      pullRequestReview: vi.fn(),
      pullReady: vi.fn(),
      pullMerge: vi.fn(),
      reviewComment: vi.fn(),
      reviewReply: vi.fn(),
      resolveThread: vi.fn(),
    },
    forgeProject: { list: vi.fn().mockResolvedValue({ cli: { reason: 'ready', hint: '' }, projects: [], error: null }) },
  }),
  hasBridge: () => true,
}));

function renderPr() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <DialogHost>
        <PrDetail repoId="repo-1" number={42} />
      </DialogHost>
    </QueryClientProvider>,
  );
}

describe('PrDetail — the Open-preview affordance (Phase 71 Theme D)', () => {
  it('shows no button when the PR body names no preview deployment', async () => {
    pullDetailBody = 'Just a description, no links.';
    renderPr();

    await screen.findByRole('heading', { name: /Add a widget/ });
    expect(screen.queryByRole('button', { name: /Open preview/i })).toBeNull();
  });

  it('shows a single button — opening it directly — for exactly one candidate', async () => {
    pullDetailBody = 'Preview: https://my-app-git-feat.vercel.app';
    renderPr();

    expect(
      await screen.findByRole('button', { name: 'Open preview deployment for #42' }),
    ).toBeDefined();
  });

  it('shows a menu-opening button for several candidates', async () => {
    pullDetailBody = [
      'https://my-app-git-a.vercel.app',
      'https://my-app-git-b.netlify.app',
      'https://my-app-git-c.pages.dev',
    ].join(' ');
    renderPr();

    expect(
      await screen.findByRole('button', { name: 'Open a preview deployment for #42 (3)' }),
    ).toBeDefined();
  });
});
