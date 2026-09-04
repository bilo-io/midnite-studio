import type { ForgeComment, ForgeIssue, ForgeIssueDetailResult } from '@midnite/studio-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DialogHost } from '../../components/dialog-host';
import { IssueDetail } from './issue-detail';

const issueDetailFn = vi.fn();
const issueCommentsFn = vi.fn();
const listProjectsFn = vi.fn();

vi.mock('../../services/bridge', () => ({
  bridge: () => ({
    forge: {
      issueDetail: issueDetailFn,
      issueComments: issueCommentsFn,
      issueComment: vi.fn(),
      issueSetState: vi.fn(),
    },
    // `IssueActionBar`'s "Add to project" fetches boards unconditionally
    // (see its own doc comment) — a bare `vi.fn()` with no resolved value
    // would leave that query pending forever, which is fine for these tests
    // since none of them opens the menu, but must still exist or the call
    // throws before render settles.
    forgeProject: { list: listProjectsFn, addItem: vi.fn() },
  }),
  hasBridge: () => true,
}));

const CLI_READY = { reason: 'ready' as const, binPath: '/usr/bin/gh', hint: '' };

function issue(overrides: Partial<ForgeIssue> = {}): ForgeIssue {
  return {
    id: '',
    number: 7,
    title: 'The button does nothing',
    state: 'open',
    author: 'bilo',
    labels: [{ name: 'bug', color: 'ee0000' }],
    assignees: ['bilo'],
    updatedAt: '2026-01-01T00:00:00Z',
    createdAt: null,
    url: 'https://github.com/bilo-io/midnite-studio/issues/7',
    milestone: null,
    ...overrides,
  };
}

function detailResult(body: string): ForgeIssueDetailResult {
  return { cli: CLI_READY, issue: { issue: issue(), body }, error: null };
}

function comment(overrides: Partial<ForgeComment> = {}): ForgeComment {
  return {
    id: 'c1',
    kind: 'comment',
    author: 'someone',
    body: 'Same here.',
    createdAt: '2026-01-02T00:00:00Z',
    url: '',
    reviewState: null,
    ...overrides,
  };
}

function renderDetail() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <DialogHost>
        <IssueDetail repoId="repo-1" issue={issue()} />
      </DialogHost>
    </QueryClientProvider>,
  );
}

// `IssueActionBar`'s boards fetch, resolved by default so react-query never
// complains about an undefined result — none of these tests reads it.
beforeEach(() => {
  listProjectsFn.mockResolvedValue({ cli: CLI_READY, projects: [], error: null, kind: 'ok' });
});

afterEach(() => {
  cleanup();
  issueDetailFn.mockReset();
  issueCommentsFn.mockReset();
  listProjectsFn.mockReset();
});

describe('IssueDetail', () => {
  it('renders the body as markdown', async () => {
    issueDetailFn.mockResolvedValue(detailResult('This **really** happened.'));
    issueCommentsFn.mockResolvedValue({ cli: CLI_READY, comments: [], error: null });
    renderDetail();

    expect(await screen.findByText('really')).not.toBeNull();
  });

  it('renders comments beneath the body', async () => {
    issueDetailFn.mockResolvedValue(detailResult('Description here.'));
    issueCommentsFn.mockResolvedValue({
      cli: CLI_READY,
      comments: [comment({ author: 'reviewer-1', body: 'Confirmed, reproduces for me too.' })],
      error: null,
    });
    renderDetail();

    expect(await screen.findByText('reviewer-1')).not.toBeNull();
    expect(screen.getByText('Confirmed, reproduces for me too.')).not.toBeNull();
  });

  it('says nobody has commented, with no comments', async () => {
    issueDetailFn.mockResolvedValue(detailResult('Description here.'));
    issueCommentsFn.mockResolvedValue({ cli: CLI_READY, comments: [], error: null });
    renderDetail();

    expect(await screen.findByText('Nobody has commented on this issue.')).not.toBeNull();
  });

  it('surfaces a failed fetch instead of rendering it as an empty description', async () => {
    issueDetailFn.mockResolvedValue({ cli: CLI_READY, issue: null, error: 'gh: command not found' });
    issueCommentsFn.mockResolvedValue({ cli: CLI_READY, comments: [], error: null });
    renderDetail();

    expect(await screen.findByText('gh: command not found')).not.toBeNull();
    expect(screen.queryByText('No description.')).toBeNull();
  });
});
