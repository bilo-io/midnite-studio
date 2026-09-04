import type { ForgeIssue } from '@midnite/studio-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DialogHost } from '../../components/dialog-host';
import { useUiStore } from '../../store/ui-store';
import { IssueActionBar } from './issue-action-bar';

const issueCommentFn = vi.fn();
const issueSetStateFn = vi.fn();
const listProjects = vi.fn();
const addItem = vi.fn();

vi.mock('../../services/bridge', () => ({
  bridge: () => ({
    forge: {
      issueComment: issueCommentFn,
      issueSetState: issueSetStateFn,
    },
    forgeProject: { list: listProjects, addItem },
  }),
  hasBridge: () => true,
}));

afterEach(() => {
  cleanup();
  useUiStore.setState({ forgeWritesEnabled: false, projectBoardByRepo: {} });
  issueCommentFn.mockReset();
  issueSetStateFn.mockReset();
  listProjects.mockReset();
  addItem.mockReset();
});

function issue(overrides: Partial<ForgeIssue> = {}): ForgeIssue {
  return {
    id: 'I_kwDOfake',
    number: 7,
    title: 'The button does nothing',
    state: 'open',
    author: 'bilo',
    labels: [],
    assignees: [],
    updatedAt: '2026-01-01T00:00:00Z',
    createdAt: null,
    url: 'https://github.com/bilo-io/midnite-studio/issues/7',
    milestone: null,
    ...overrides,
  };
}

function renderBar(overrides: Partial<ForgeIssue> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <DialogHost>
        <IssueActionBar repoId="repo-1" issue={issue(overrides)} />
      </DialogHost>
    </QueryClientProvider>,
  );
}

describe('IssueActionBar — the gate', () => {
  it('disables every control until Settings turns issue actions on', async () => {
    useUiStore.setState({ forgeWritesEnabled: false });
    listProjects.mockResolvedValue({ cli: { reason: 'ready', hint: '' }, projects: [], error: null, kind: 'ok' });
    renderBar();

    for (const label of ['Comment', 'Close', 'Add to project']) {
      const button = (await screen.findByRole('button', { name: label })) as HTMLButtonElement;
      expect(button.disabled).toBe(true);
    }
    expect(screen.getByText(/Issue actions are off/)).not.toBeNull();
  });
});

describe('IssueActionBar — comment', () => {
  it('posts the typed body and refetches the conversation on success', async () => {
    useUiStore.setState({ forgeWritesEnabled: true });
    listProjects.mockResolvedValue({ cli: { reason: 'ready', hint: '' }, projects: [], error: null, kind: 'ok' });
    issueCommentFn.mockResolvedValue({ ok: true, cli: { reason: 'ready', hint: '' }, error: null });
    renderBar();

    fireEvent.click(await screen.findByRole('button', { name: 'Comment' }));
    fireEvent.change(screen.getByLabelText('Comment on the conversation (required)'), {
      target: { value: 'Same problem here.' },
    });
    fireEvent.click(screen.getAllByRole('button', { name: 'Comment' })[1]!);

    await waitFor(() =>
      expect(issueCommentFn).toHaveBeenCalledWith({
        repoId: 'repo-1',
        number: 7,
        body: 'Same problem here.',
      }),
    );
    // The composer closes only on success — see the doc comment on `submit`.
    await waitFor(() => expect(screen.queryByLabelText('Comment on the conversation (required)')).toBeNull());
  });

  it('cannot be submitted empty', async () => {
    useUiStore.setState({ forgeWritesEnabled: true });
    listProjects.mockResolvedValue({ cli: { reason: 'ready', hint: '' }, projects: [], error: null, kind: 'ok' });
    renderBar();

    fireEvent.click(await screen.findByRole('button', { name: 'Comment' }));
    const submit = screen.getAllByRole('button', { name: 'Comment' })[1]! as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    expect(issueCommentFn).not.toHaveBeenCalled();
  });

  it('shows gh’s own refusal beside the composer', async () => {
    useUiStore.setState({ forgeWritesEnabled: true });
    listProjects.mockResolvedValue({ cli: { reason: 'ready', hint: '' }, projects: [], error: null, kind: 'ok' });
    issueCommentFn.mockResolvedValue({
      ok: false,
      cli: { reason: 'ready', hint: '' },
      error: 'HTTP 403: Resource not accessible',
    });
    renderBar();

    fireEvent.click(await screen.findByRole('button', { name: 'Comment' }));
    fireEvent.change(screen.getByLabelText('Comment on the conversation (required)'), {
      target: { value: 'ping' },
    });
    fireEvent.click(screen.getAllByRole('button', { name: 'Comment' })[1]!);

    expect(await screen.findByText('HTTP 403: Resource not accessible')).not.toBeNull();
  });
});

describe('IssueActionBar — close/reopen', () => {
  it('closes an open issue with a target state, not a second channel', async () => {
    useUiStore.setState({ forgeWritesEnabled: true });
    listProjects.mockResolvedValue({ cli: { reason: 'ready', hint: '' }, projects: [], error: null, kind: 'ok' });
    issueSetStateFn.mockResolvedValue({ ok: true, cli: { reason: 'ready', hint: '' }, error: null });
    renderBar({ state: 'open' });

    fireEvent.click(await screen.findByRole('button', { name: 'Close' }));

    await waitFor(() =>
      expect(issueSetStateFn).toHaveBeenCalledWith({ repoId: 'repo-1', number: 7, state: 'closed' }),
    );
  });

  it('reopens a closed issue', async () => {
    useUiStore.setState({ forgeWritesEnabled: true });
    listProjects.mockResolvedValue({ cli: { reason: 'ready', hint: '' }, projects: [], error: null, kind: 'ok' });
    issueSetStateFn.mockResolvedValue({ ok: true, cli: { reason: 'ready', hint: '' }, error: null });
    renderBar({ state: 'closed' });

    fireEvent.click(await screen.findByRole('button', { name: 'Reopen' }));

    await waitFor(() =>
      expect(issueSetStateFn).toHaveBeenCalledWith({ repoId: 'repo-1', number: 7, state: 'open' }),
    );
  });
});

/** Reuses the exact pattern `ReviewActionBar`'s own test suite covers (Phase 50 Theme E). */
describe('IssueActionBar — Add to project (Phase 54 Theme F)', () => {
  async function openAddToProjectMenu() {
    await screen.findByRole('button', { name: 'Add to project' });
    await waitFor(() => {
      const button = screen.getByRole('button', { name: 'Add to project' }) as HTMLButtonElement;
      expect(button.disabled).toBe(false);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add to project' }));
  }

  it('lists the repo boards and adds the issue to the one picked', async () => {
    useUiStore.setState({ forgeWritesEnabled: true });
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
      expect(addItem).toHaveBeenCalledWith({ projectId: 'PVT_2', contentId: 'I_kwDOfake' }),
    );
  });

  it('shows an empty-state row rather than a dead menu when the owner has no boards', async () => {
    useUiStore.setState({ forgeWritesEnabled: true });
    listProjects.mockResolvedValue({ cli: { reason: 'ready', hint: '' }, projects: [], error: null, kind: 'ok' });

    renderBar();
    await openAddToProjectMenu();

    expect(await screen.findByText('No projects for this repo')).not.toBeNull();
    expect(addItem).not.toHaveBeenCalled();
  });
});
