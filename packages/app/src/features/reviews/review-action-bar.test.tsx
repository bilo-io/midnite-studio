import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ForgePull, ForgePullDetail } from '@midnite/studio-shared';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DialogHost } from '../../components/dialog-host';
import { useUiStore } from '../../store/ui-store';
import { ReviewActionBar } from './review-action-bar';

const handoff = vi.fn();
vi.mock('../agent/use-skill-handoff', () => ({ useSkillHandoff: () => handoff }));

const listProjects = vi.fn();
const addItem = vi.fn();
const pullRequestReview = vi.fn();
const pullComments = vi.fn();

beforeEach(() => {
  pullComments.mockResolvedValue({
    cli: { reason: 'ready', hint: '' },
    comments: [],
    error: null,
  });
});

afterEach(() => {
  cleanup();
  useUiStore.setState({ projectBoardByRepo: {} });
  listProjects.mockReset();
  addItem.mockReset();
  pullRequestReview.mockReset();
  pullComments.mockReset();
});

vi.mock('../../services/bridge', () => ({
  bridge: () => ({
    forge: {
      pullReview: vi.fn(),
      pullComment: vi.fn(),
      pullRequestReview,
      pullReady: vi.fn(),
      pullMerge: vi.fn(),
      pullComments,
    },
    forgeProject: { list: listProjects, addItem },
  }),
  hasBridge: () => true,
}));

function pull(overrides: Partial<ForgePull> = {}): ForgePull {
  return {
    id: 'PR_kwDOfake',
    number: 12,
    title: 'Add a widget',
    state: 'open',
    isDraft: false,
    reviewDecision: null,
    checks: null,
    headBranch: 'feature/widget',
    author: 'bilo',
    url: 'https://github.com/bilo-io/midnite-studio/pull/12',
    mergedAt: null,
    closedAt: null,
    commentCount: 0,
    ...overrides,
  };
}

function makeDetail(overrides: Partial<ForgePullDetail> = {}): ForgePullDetail {
  return {
    pull: pull(),
    body: 'PR description',
    headSha: 'head1234567890',
    baseSha: 'base1234567890',
    baseBranch: 'main',
    additions: 10,
    deletions: 2,
    changedFiles: 3,
    createdAt: '2026-08-20T10:00:00Z',
    updatedAt: '2026-08-20T11:00:00Z',
    mergeable: 'MERGEABLE',
    commitCount: 2,
    commits: [],
    reviewRequests: [],
    ...overrides,
  };
}

function renderBar(overrides: Partial<ForgePull> = {}, detail: ForgePullDetail | null = null) {
  useUiStore.setState({ forgeWritesEnabled: true });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <DialogHost>
        <ReviewActionBar repoId="repo-1" pull={pull(overrides)} detail={detail} />
      </DialogHost>
    </QueryClientProvider>,
  );
}

/**
 * `boards.isLoading` gates the button itself (see the JSX's own comment), so
 * every case here waits for it to enable before clicking rather than racing
 * the initial `forgeProject.list` fetch — the menu's items are a plain array
 * fixed at open time, and a click that beat the fetch would freeze on
 * whatever "still loading" said at that instant.
 */
async function openAddToProjectMenu() {
  await screen.findByRole('button', { name: 'Add to tasks' });
  await waitFor(() => {
    const button = screen.getByRole('button', { name: 'Add to tasks' }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
  });
  fireEvent.click(screen.getByRole('button', { name: 'Add to tasks' }));
}

describe('ReviewActionBar — Add to project (Phase 50 Theme E)', () => {
  it('lists the repo boards and adds the PR to the one picked', async () => {
    listProjects.mockResolvedValue({
      cli: { reason: 'ready', hint: '' },
      projects: [
        { id: 'PVT_1', title: 'Roadmap', closed: false },
        { id: 'PVT_2', title: 'Bugs', closed: false },
      ],
      error: null,
      kind: 'ok',
    });
    addItem.mockResolvedValue({ ok: true, kind: 'ok' });

    renderBar();
    await openAddToProjectMenu();
    await screen.findByText('Roadmap');

    fireEvent.click(screen.getByText('Bugs'));

    await waitFor(() =>
      expect(addItem).toHaveBeenCalledWith({ projectId: 'PVT_2', contentId: 'PR_kwDOfake' }),
    );
  });

  it('marks the last-picked board so a repeat visit reads which one', async () => {
    useUiStore.setState({ projectBoardByRepo: { 'repo-1': 'PVT_2' } });
    listProjects.mockResolvedValue({
      cli: { reason: 'ready', hint: '' },
      projects: [
        { id: 'PVT_1', title: 'Roadmap', closed: false },
        { id: 'PVT_2', title: 'Bugs', closed: false },
      ],
      error: null,
      kind: 'ok',
    });

    renderBar();
    await openAddToProjectMenu();

    expect(await screen.findByText('Bugs (last used)')).toBeDefined();
  });

  it('shows an empty-state row rather than a dead menu when the owner has no boards', async () => {
    listProjects.mockResolvedValue({
      cli: { reason: 'ready', hint: '' },
      projects: [],
      error: null,
      kind: 'ok',
    });

    renderBar();
    await openAddToProjectMenu();

    expect(await screen.findByText('No task boards for this repo')).toBeDefined();
    expect(addItem).not.toHaveBeenCalled();
  });
});

describe('ReviewActionBar — AI actions', () => {
  it.each([
    ['Review', 'prReview'],
    ['Audit', 'prAudit'],
    ['Address Feedback', 'prFeedback'],
  ])('%s hands off %s with the PR url', (name, skillId) => {
    handoff.mockClear();
    renderBar();
    fireEvent.click(screen.getByRole('button', { name }));
    expect(handoff).toHaveBeenCalledTimes(1);
    expect(handoff.mock.calls[0]?.[0]).toMatchObject({
      skillId,
      repoId: 'repo-1',
      body: 'https://github.com/bilo-io/midnite-studio/pull/12',
    });
  });

  it('groups the three AI buttons apart from the review actions', () => {
    renderBar();
    const group = screen.getByRole('group', { name: 'AI actions' });
    expect(within(group).getAllByRole('button')).toHaveLength(3);
    expect(group.className).toContain('ml-auto');
    expect(within(group).queryByRole('button', { name: 'Approve' })).toBeNull();
  });

  it('stays usable when review writes are off', () => {
    renderBar();
    useUiStore.setState({ forgeWritesEnabled: false });
    expect(
      (screen.getByRole('button', { name: 'Review' }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });
});

describe('ReviewActionBar — Assigned Reviewer Avatars & Re-request', () => {
  it('renders avatars for awaiting reviewers with amber border and clock status', async () => {
    const detail = makeDetail({ reviewRequests: ['octocat'] });
    renderBar({}, detail);

    const reviewerEl = await screen.findByTestId('reviewer-octocat');
    expect(reviewerEl).toBeDefined();

    const avatarContainer = within(reviewerEl).getByTestId('reviewer-avatar-octocat');
    expect(avatarContainer.getAttribute('aria-label')).toBe('octocat — Awaiting review');
    expect(within(avatarContainer).getByRole('img').className).toContain('border-amber-500');

    const rerequestBtn = within(reviewerEl).getByRole('button', {
      name: 'Re-request a review from octocat',
    });
    expect(rerequestBtn).toBeDefined();
  });

  it('renders avatars for reviewers who approved, requested changes, or commented', async () => {
    pullComments.mockResolvedValue({
      cli: { reason: 'ready', hint: '' },
      comments: [
        {
          id: 'c1',
          kind: 'review',
          author: 'alice',
          body: 'LGTM',
          createdAt: '2026-08-20T10:00:00Z',
          url: '',
          reviewState: 'APPROVED',
        },
        {
          id: 'c2',
          kind: 'review',
          author: 'bob',
          body: 'Needs fixes',
          createdAt: '2026-08-20T11:00:00Z',
          url: '',
          reviewState: 'CHANGES_REQUESTED',
        },
        {
          id: 'c3',
          kind: 'review',
          author: 'charlie',
          body: 'Some notes',
          createdAt: '2026-08-20T12:00:00Z',
          url: '',
          reviewState: 'COMMENTED',
        },
      ],
      error: null,
    });

    const detail = makeDetail({ reviewRequests: [] });
    renderBar({}, detail);

    const aliceEl = await screen.findByTestId('reviewer-alice');
    const bobEl = await screen.findByTestId('reviewer-bob');
    const charlieEl = await screen.findByTestId('reviewer-charlie');

    expect(within(aliceEl).getByTestId('reviewer-avatar-alice').getAttribute('aria-label')).toBe(
      'alice — Approved',
    );
    expect(within(bobEl).getByTestId('reviewer-avatar-bob').getAttribute('aria-label')).toBe(
      'bob — Changes requested',
    );
    expect(within(charlieEl).getByTestId('reviewer-avatar-charlie').getAttribute('aria-label')).toBe(
      'charlie — Commented',
    );

    expect(within(aliceEl).getByRole('img').className).toContain('border-emerald-500');
    expect(within(bobEl).getByRole('img').className).toContain('border-red-500');
    expect(within(charlieEl).getByRole('img').className).toContain('border-sky-500');
  });

  it('prioritizes awaiting review when a reviewer is re-requested after prior review', async () => {
    pullComments.mockResolvedValue({
      cli: { reason: 'ready', hint: '' },
      comments: [
        {
          id: 'c1',
          kind: 'review',
          author: 'alice',
          body: 'LGTM',
          createdAt: '2026-08-20T10:00:00Z',
          url: '',
          reviewState: 'APPROVED',
        },
      ],
      error: null,
    });

    // Alice previously approved, but is now back in reviewRequests!
    const detail = makeDetail({ reviewRequests: ['alice'] });
    renderBar({}, detail);

    const aliceEl = await screen.findByTestId('reviewer-alice');
    expect(within(aliceEl).getByTestId('reviewer-avatar-alice').getAttribute('aria-label')).toBe(
      'alice — Awaiting review',
    );
    expect(within(aliceEl).getByRole('img').className).toContain('border-amber-500');
  });

  it('clicking the re-request button triggers pullRequestReview', async () => {
    pullRequestReview.mockResolvedValue({ ok: true, cli: { reason: 'ready', hint: '' }, error: null });
    const detail = makeDetail({ reviewRequests: ['octocat'] });
    renderBar({}, detail);

    const reviewerEl = await screen.findByTestId('reviewer-octocat');
    const rerequestBtn = within(reviewerEl).getByRole('button', {
      name: 'Re-request a review from octocat',
    });

    fireEvent.click(rerequestBtn);

    await waitFor(() => {
      expect(pullRequestReview).toHaveBeenCalledWith({
        repoId: 'repo-1',
        number: 12,
        reviewers: ['octocat'],
      });
    });
  });
});

describe('ReviewActionBar — Searchable / Multi-select Dropdown Popover', () => {
  it('opens the popover on clicking Request review and lists candidate reviewers', async () => {
    pullComments.mockResolvedValue({
      cli: { reason: 'ready', hint: '' },
      comments: [
        {
          id: 'c1',
          kind: 'review',
          author: 'alice',
          body: 'LGTM',
          createdAt: '2026-08-20T10:00:00Z',
          url: '',
          reviewState: 'APPROVED',
        },
        {
          id: 'c2',
          kind: 'comment',
          author: 'bob',
          body: 'Nice PR',
          createdAt: '2026-08-20T11:00:00Z',
          url: '',
          reviewState: null,
        },
      ],
      error: null,
    });

    const detail = makeDetail({ reviewRequests: ['octocat'] });
    renderBar({}, detail);

    const requestReviewBtn = screen.getByRole('button', { name: 'Request review' });
    fireEvent.click(requestReviewBtn);

    const filterInput = await screen.findByPlaceholderText('Filter reviewers...');
    expect(filterInput).toBeDefined();

    const dropdown = await screen.findByTestId('reviewer-picker-dropdown');
    // Candidate rows inside the dropdown
    expect(await within(dropdown).findByText('octocat')).toBeDefined();
    expect(await within(dropdown).findByText('alice')).toBeDefined();
    expect(await within(dropdown).findByText('bob')).toBeDefined();
  });

  it('filters candidate reviewers based on search query', async () => {
    pullComments.mockResolvedValue({
      cli: { reason: 'ready', hint: '' },
      comments: [
        {
          id: 'c1',
          kind: 'review',
          author: 'alice',
          body: 'LGTM',
          createdAt: '2026-08-20T10:00:00Z',
          url: '',
          reviewState: 'APPROVED',
        },
      ],
      error: null,
    });

    const detail = makeDetail({ reviewRequests: ['octocat'] });
    renderBar({}, detail);

    fireEvent.click(screen.getByRole('button', { name: 'Request review' }));
    const filterInput = await screen.findByPlaceholderText('Filter reviewers...');
    const dropdown = await screen.findByTestId('reviewer-picker-dropdown');

    // Wait for alice to be loaded in the dropdown first
    await within(dropdown).findByText('alice');

    fireEvent.change(filterInput, { target: { value: 'ali' } });

    expect(within(dropdown).getByText('alice')).toBeDefined();
    expect(within(dropdown).queryByText('octocat')).toBeNull();
  });

  it('supports typing a new GitHub username directly to add them', async () => {
    pullRequestReview.mockResolvedValue({ ok: true, cli: { reason: 'ready', hint: '' }, error: null });
    const detail = makeDetail({ reviewRequests: [] });
    renderBar({}, detail);

    fireEvent.click(screen.getByRole('button', { name: 'Request review' }));
    const filterInput = await screen.findByPlaceholderText('Filter reviewers...');
    const dropdown = await screen.findByTestId('reviewer-picker-dropdown');

    fireEvent.change(filterInput, { target: { value: 'newcontributor' } });

    const addReviewerBtn = await within(dropdown).findByRole('button', { name: /newcontributor/i });
    expect(addReviewerBtn).toBeDefined();

    fireEvent.click(addReviewerBtn);

    await waitFor(() => {
      expect(pullRequestReview).toHaveBeenCalledWith({
        repoId: 'repo-1',
        number: 12,
        reviewers: ['newcontributor'],
      });
    });
  });

  it('clicking a candidate reviewer row triggers pullRequestReview', async () => {
    pullRequestReview.mockResolvedValue({ ok: true, cli: { reason: 'ready', hint: '' }, error: null });
    const detail = makeDetail({ reviewRequests: ['octocat'] });
    renderBar({}, detail);

    fireEvent.click(screen.getByRole('button', { name: 'Request review' }));
    const dropdown = await screen.findByTestId('reviewer-picker-dropdown');
    const candidateRow = await within(dropdown).findByTestId('candidate-octocat');

    fireEvent.click(candidateRow);

    await waitFor(() => {
      expect(pullRequestReview).toHaveBeenCalledWith({
        repoId: 'repo-1',
        number: 12,
        reviewers: ['octocat'],
      });
    });
  });
});

