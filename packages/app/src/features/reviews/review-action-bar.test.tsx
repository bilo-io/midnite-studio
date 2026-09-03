import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ForgePull } from '@midnite/studio-shared';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DialogHost } from '../../components/dialog-host';
import { useUiStore } from '../../store/ui-store';
import { ReviewActionBar } from './review-action-bar';

afterEach(() => {
  cleanup();
  useUiStore.setState({ projectBoardByRepo: {} });
  listProjects.mockReset();
  addItem.mockReset();
});

const listProjects = vi.fn();
const addItem = vi.fn();

vi.mock('../../services/bridge', () => ({
  bridge: () => ({
    forge: {
      pullReview: vi.fn(),
      pullComment: vi.fn(),
      pullRequestReview: vi.fn(),
      pullReady: vi.fn(),
      pullMerge: vi.fn(),
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
    ...overrides,
  };
}

function renderBar(overrides: Partial<ForgePull> = {}) {
  useUiStore.setState({ forgeWritesEnabled: true });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <DialogHost>
        <ReviewActionBar repoId="repo-1" pull={pull(overrides)} detail={null} />
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
  await screen.findByRole('button', { name: 'Add to project' });
  await waitFor(() => {
    const button = screen.getByRole('button', { name: 'Add to project' }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
  });
  fireEvent.click(screen.getByRole('button', { name: 'Add to project' }));
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
    listProjects.mockResolvedValue({ cli: { reason: 'ready', hint: '' }, projects: [], error: null, kind: 'ok' });

    renderBar();
    await openAddToProjectMenu();

    expect(await screen.findByText('No projects for this repo')).toBeDefined();
    expect(addItem).not.toHaveBeenCalled();
  });
});
