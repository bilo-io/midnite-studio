import type { ForgeCapability, ForgeIssueDetailResult, Remote } from '@midnite/studio-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DialogHost } from '../../components/dialog-host';
import { IssueDialog } from './issue-dialog';

const issueCreate = vi.fn();
const issueEdit = vi.fn();
const issueDelete = vi.fn();
const issueDetail = vi.fn<() => Promise<ForgeIssueDetailResult>>();
const capabilities = vi.fn<() => Promise<ForgeCapability>>();
const remotesList = vi.fn<() => Promise<Remote[]>>(async () => [
  {
    name: 'origin',
    fetchUrl: 'https://github.com/bilo-io/midnite-studio.git',
    pushUrl: 'https://github.com/bilo-io/midnite-studio.git',
    forge: { kind: 'github', host: 'github.com', owner: 'bilo-io', repo: 'midnite-studio' },
  },
]);

const FULL_OPS = {
  createIssue: true,
  editIssue: true,
  deleteIssue: true,
  createProject: true,
  editProject: true,
  deleteProject: true,
  addProjectItem: true,
  removeProjectItem: true,
  linkBlockedBy: true,
  linkSubIssue: true,
};

function capability(overrides: Partial<ForgeCapability['ops']> = {}): ForgeCapability {
  return {
    pulls: 'full',
    issues: 'full',
    checks: 'full',
    projects: 'full',
    threadResolution: 'full',
    requestChanges: 'full',
    repoListing: 'full',
    ops: { ...FULL_OPS, ...overrides },
  };
}

vi.mock('../../services/bridge', () => ({
  bridge: () => ({
    forge: { issueCreate, issueEdit, issueDelete, issueDetail },
    forgeAccounts: { capabilities },
    remotes: { list: remotesList },
    ai: { improveField: vi.fn() },
  }),
  hasBridge: () => true,
}));

afterEach(() => {
  cleanup();
  issueCreate.mockReset();
  issueEdit.mockReset();
  issueDelete.mockReset();
  issueDetail.mockReset();
  capabilities.mockReset();
});

function renderDialog(props: Partial<ComponentProps<typeof IssueDialog>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <DialogHost>
        <IssueDialog
          open
          onClose={vi.fn()}
          repoId="repo-1"
          worktreePath="/repo"
          mode={{ kind: 'create' }}
          {...props}
        />
      </DialogHost>
    </QueryClientProvider>,
  );
}

describe('IssueDialog', () => {
  it('creates an issue with the typed fields', async () => {
    capabilities.mockResolvedValue(capability());
    issueCreate.mockResolvedValue({ ok: true, cli: { reason: 'ready', binPath: '/gh', hint: '' }, issue: {} });
    const onClose = vi.fn();
    renderDialog({ onClose });

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'A new bug' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(issueCreate).toHaveBeenCalledWith(
      expect.objectContaining({ repoId: 'repo-1', title: 'A new bug' }),
    ));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('hides Delete when the capability says the provider cannot', async () => {
    capabilities.mockResolvedValue(capability({ deleteIssue: false }));
    issueDetail.mockResolvedValue({
      cli: { reason: 'ready', binPath: '/gh', hint: '' },
      issue: {
        issue: {
          id: 'I_1',
          number: 7,
          title: 'Existing',
          state: 'open',
          author: 'bilo',
          labels: [],
          assignees: [],
          updatedAt: '2026-01-01T00:00:00Z',
          createdAt: null,
          url: 'https://github.com/bilo-io/midnite-studio/issues/7',
          milestone: null,
        },
        body: 'The body',
      },
      error: null,
    });
    renderDialog({ mode: { kind: 'edit', number: 7 } });

    await waitFor(() => expect(screen.getByLabelText('Title')).toBeTruthy());
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Existing');
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
  });

  it('shows Delete when the capability allows it, and raises the blast-radius confirm', async () => {
    capabilities.mockResolvedValue(capability());
    issueDetail.mockResolvedValue({
      cli: { reason: 'ready', binPath: '/gh', hint: '' },
      issue: {
        issue: {
          id: 'I_1',
          number: 7,
          title: 'Existing',
          state: 'open',
          author: 'bilo',
          labels: [],
          assignees: [],
          updatedAt: '2026-01-01T00:00:00Z',
          createdAt: null,
          url: 'https://github.com/bilo-io/midnite-studio/issues/7',
          milestone: null,
        },
        body: '',
      },
      error: null,
    });
    renderDialog({ mode: { kind: 'edit', number: 7, linkedPrCount: 2 } });

    await waitFor(() => expect(screen.getByRole('button', { name: 'Delete' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(await screen.findByText('Delete issue #7?')).toBeTruthy();
    expect(screen.getByText(/2 linked pull requests/)).toBeTruthy();
  });
});
