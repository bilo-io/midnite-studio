import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { MockFixtures } from '../../../test-support/mock-bridge';
import { renderView } from '../../../test-support/render';
import { useIssuesStore } from '../../store/issues-store';
import { IssuesView } from './issues-view';

/**
 * Migrated from `e2e/issues-view.spec.ts` (Phase 82 Theme C wave 5) — the
 * initial-selection default (most recently updated, not fixture order), a
 * row's own body/conversation fetch, the list's labels/state, and the
 * disabled-tracker sentence. 4 of the original 5 tests moved here; 1 stays
 * in Playwright, below.
 *
 * `IssuesView` has no internal `React.lazy` boundary of its own (only the
 * outer `view-registry.tsx` lazy-loads the *view*, which mounting the
 * component directly bypasses entirely) — the same non-issue prior waves
 * found for `ActionsView`/`search-view` — so no warm-up `beforeAll` is
 * needed here.
 *
 * **1 of the original 5 stays in Playwright**: "reaches the view with
 * Mod+Shift+i from anywhere" is not about anything inside `IssuesView` — it
 * is the global command dispatcher and the rail's view routing, neither of
 * which mounting this one component reaches.
 */

const MAIN = '/tmp/midnite-studio';

const REMOTES = [
  {
    name: 'origin',
    fetchUrl: 'git@github.com:bilo-io/midnite-studio.git',
    pushUrl: 'git@github.com:bilo-io/midnite-studio.git',
    forge: { host: 'github.com', owner: 'bilo-io', repo: 'midnite-studio', kind: 'github' },
  },
];

const issue = (over: Record<string, unknown> = {}) => ({
  id: '',
  number: 1,
  title: 'Untitled',
  state: 'open',
  author: 'bilo',
  labels: [],
  assignees: [],
  createdAt: '2026-08-01T09:00:00Z',
  updatedAt: '2026-08-01T09:00:00Z',
  url: 'https://github.com/bilo-io/midnite-studio/issues/1',
  milestone: null,
  ...over,
});

const base: MockFixtures = {
  commitDetails: {},
  revisions: {},
  diffs: {},
  graphRows: [],
  remotes: REMOTES,
  statusEntries: [],
  statusByWorktree: { [MAIN]: [] },
  forge: {
    cli: { reason: 'ready' },
    issues: [
      issue({
        number: 42,
        title: 'Graph rows jump on resize',
        updatedAt: '2026-08-20T09:00:00Z',
        labels: [{ name: 'bug', color: 'd73a4a' }],
      }),
      issue({
        number: 7,
        title: 'Dark mode contrast',
        updatedAt: '2026-08-25T09:00:00Z',
        state: 'closed',
      }),
    ],
    issueDetail: {
      '42': { body: 'The rows **jump** when the window resizes.' },
      '7': { body: '' },
    },
    issueComments: {
      '42': [
        {
          id: 'c1',
          kind: 'comment',
          author: 'reviewer-1',
          body: 'Confirmed, reproduces for me too.',
          createdAt: '2026-08-21T09:00:00Z',
          url: '',
          reviewState: null,
        },
      ],
      '7': [],
    },
  },
};

const list = () => screen.getByRole('list', { name: 'Issues' });
const detail = () => screen.getByRole('region', { name: 'Issue detail' });

/** Land on the Issues view. Only for fixtures where it has issues to show. */
async function open(data: MockFixtures = base): Promise<void> {
  renderView(<IssuesView />, { fixtures: data, uiState: { selectedRepoId: 'repo-1' } });
  await screen.findByRole('list', { name: 'Issues' });
}

beforeEach(() => {
  useIssuesStore.setState({ selectedIssue: {} });
});

afterEach(cleanup);

describe('IssuesView, assembled through the real bridge', () => {
  it('opens on the most recently updated issue, not the first in the fixture', async () => {
    await open();

    // #7 was updated after #42, even though #42 is listed first in the fixture.
    expect(within(detail()).getByRole('heading', { level: 2 }).textContent).toContain(
      'Dark mode contrast',
    );
    // The conversation is its own (separately-fetched) query, behind the
    // detail heading's own — a real second fetch, not a synchronous prop.
    expect(await within(detail()).findByText('Nobody has commented on this issue.')).toBeTruthy();
  });

  it('selecting a row loads that issue’s body and conversation', async () => {
    await open();

    fireEvent.click(within(list()).getByText('Graph rows jump on resize'));

    const heading = await within(detail()).findByRole('heading', { level: 2 });
    expect(heading.textContent).toContain('Graph rows jump on resize');
    // The markdown body's own bold — `**jump**` — proves this isn't the title reused.
    expect(within(detail()).getByText('jump', { exact: true })).toBeTruthy();
    expect(within(detail()).getByText('reviewer-1')).toBeTruthy();
    expect(within(detail()).getByText('Confirmed, reproduces for me too.')).toBeTruthy();
  });

  it('the list shows both issues, labelled and stateful', async () => {
    await open();

    expect(within(list()).getByText('Graph rows jump on resize')).toBeTruthy();
    expect(within(list()).getByText('Dark mode contrast')).toBeTruthy();
    expect(within(list()).getByText('bug')).toBeTruthy();
  });

  it('a repo with issues turned off says so, not an error', async () => {
    renderView(
      <IssuesView />,
      {
        fixtures: { ...base, forge: { cli: { reason: 'ready' }, issues: [], issuesDisabled: true } },
        uiState: { selectedRepoId: 'repo-1' },
      },
    );

    expect(await screen.findByText('Issues are turned off for this repository.')).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'Issues' })).toBeNull();
  });
});
