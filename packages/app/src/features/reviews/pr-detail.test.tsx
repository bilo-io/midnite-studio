import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ForgePull, ForgePullDetail } from '@midnite/studio-shared';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DialogHost } from '../../components/dialog-host';
import { useUiStore } from '../../store/ui-store';
import { PrDetail } from './pr-detail';

afterEach(() => {
  cleanup();
  useUiStore.setState({ forgeWritesEnabled: false });
  remotesFixture = [];
  capabilityFixture = {
    pulls: 'full',
    issues: 'full',
    checks: 'full',
    projects: 'full',
    threadResolution: 'full',
    requestChanges: 'full',
    repoListing: 'full',
  };
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

/*
  Both read by `useActiveForgeCapability` (`services/queries.ts`), which
  `PrDetail` now calls for Phase 90 Theme H's "here's the limit" sentence.
  Defaulted to no remote / a full capability, so every test above this line
  that never touches the Files tab keeps seeing exactly what it did before
  this hook existed.
*/
let remotesFixture: Array<{ name: string; forge: { host: string; owner: string; repo: string; kind: string } | null }> = [];
let capabilityFixture = {
  pulls: 'full',
  issues: 'full',
  checks: 'full',
  projects: 'full',
  threadResolution: 'full',
  requestChanges: 'full',
  repoListing: 'full',
};

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
      pullFiles: vi.fn(async () => ({ cli: { reason: 'ready', hint: '' }, files: null, error: null })),
      pullComments: vi.fn(),
      pullThreads: vi.fn(async () => ({ cli: { reason: 'ready', hint: '' }, threads: [], error: null })),
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
    remotes: { list: vi.fn(async () => remotesFixture) },
    forgeAccounts: { capabilities: vi.fn(async () => capabilityFixture) },
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

describe('PrDetail — Overview image src resolution', () => {
  it('rewrites a repo-relative image path to an absolute raw.githubusercontent.com URL', async () => {
    pullDetailBody = '![before](docs/screenshots/agent-icon-fit/before.png)';
    renderPr();

    const img = await screen.findByRole('img', { name: 'before' });
    expect(img.getAttribute('src')).toBe(
      `https://raw.githubusercontent.com/acme/my-app/${'a'.repeat(40)}/docs/screenshots/agent-icon-fit/before.png`,
    );
  });

  it('leaves an already-absolute image src untouched', async () => {
    pullDetailBody = '![before](https://user-images.githubusercontent.com/1/abc.png)';
    renderPr();

    const img = await screen.findByRole('img', { name: 'before' });
    expect(img.getAttribute('src')).toBe('https://user-images.githubusercontent.com/1/abc.png');
  });
});

/**
 * Phase 90 Theme H's own deferred item — "a `'partial'` capability shows its
 * limits in place, once, where the limit bites" — unblocked now that
 * Bitbucket (Theme F) can report `threadResolution: 'partial'`.
 */
describe('PrDetail — the partial-capability thread note (Phase 90 Theme H)', () => {
  it('shows the Bitbucket flat-chain note once the Files tab is open', async () => {
    pullDetailBody = 'No links here.';
    remotesFixture = [
      { name: 'origin', forge: { host: 'bitbucket.org', owner: 'acme', repo: 'widgets', kind: 'bitbucket' } },
    ];
    capabilityFixture = { ...capabilityFixture, threadResolution: 'partial' };
    renderPr();

    await screen.findByRole('heading', { name: /Add a widget/ });
    fireEvent.click(screen.getByRole('tab', { name: 'Files' }));

    expect(await screen.findByTestId('thread-partial-capability-note')).toBeTruthy();
  });

  it('says nothing when the forge is github (full thread resolution)', async () => {
    pullDetailBody = 'No links here.';
    remotesFixture = [
      { name: 'origin', forge: { host: 'github.com', owner: 'acme', repo: 'widgets', kind: 'github' } },
    ];
    renderPr();

    await screen.findByRole('heading', { name: /Add a widget/ });
    fireEvent.click(screen.getByRole('tab', { name: 'Files' }));

    await screen.findByText('No diff to show for this pull request.');
    expect(screen.queryByTestId('thread-partial-capability-note')).toBeNull();
  });
});
