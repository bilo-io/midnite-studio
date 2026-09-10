import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fixtures } from '../../../test-support/fixtures';
import type { MockFixtures } from '../../../test-support/mock-bridge';
import { renderView } from '../../../test-support/render';
import { useDashboardStore } from '../../store/dashboard-store';
import { DashboardView } from './dashboard-view';

/**
 * Migrated from `e2e/dashboard.spec.ts` (Phase 82 Theme C, wave 5) — the
 * board's registry actually reaching the DOM: every widget as a named
 * landmark, real data (not just frames) in each tile, removing/restoring a
 * widget, Reset layout, the no-GitHub-remote widget cull, the author filter
 * scoping the whole board, the four-way empty state, issues-disabled copy,
 * layout surviving a leave-and-return, and the statistics-window control
 * refetching. All 10 of the original tests moved here; none stay in
 * Playwright.
 *
 * `GridLayout`/`useContainerWidth` (`react-grid-layout`) are mocked exactly
 * as `dashboard-view.test.tsx`'s own suite already does — the grid measures
 * its container with a `ResizeObserver` and (per that file's own comment)
 * paints nothing at width 0, which is what jsdom leaves an unmeasured
 * container at regardless of `vitest-setup.ts`'s `FiringResizeObserver`
 * default rect, since `measureBeforeMount` gates the very first paint on a
 * real layout pass this stand-in skips entirely. Reusing the proven mock
 * rather than re-deriving one keeps this file agreeing with the unit suite
 * about what does and doesn't need a real grid.
 *
 * `DashboardView` has no internal `React.lazy` boundary of its own, so no
 * chunk warm-up is needed.
 */

vi.mock('react-grid-layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="board-grid">{children}</div>
  ),
  useContainerWidth: () => ({ width: 800, containerRef: { current: null }, mounted: true }),
}));

const MAIN = '/tmp/midnite-studio';

const GITHUB_REMOTE = {
  name: 'origin',
  fetchUrl: 'git@github.com:bilo-io/midnite-studio.git',
  pushUrl: 'git@github.com:bilo-io/midnite-studio.git',
  forge: { host: 'github.com', owner: 'bilo-io', repo: 'midnite-studio', kind: 'github' },
};

/**
 * GitLab rather than "no remotes at all".
 *
 * The rule under test is about the FORGE — `gh` speaks GitHub only — and a
 * repo with no remotes would also satisfy a rule that merely checked whether
 * any remote existed.
 */
const GITLAB_REMOTE = {
  name: 'origin',
  fetchUrl: 'git@gitlab.com:bilo-io/midnite-studio.git',
  pushUrl: 'git@gitlab.com:bilo-io/midnite-studio.git',
  forge: { host: 'gitlab.com', owner: 'bilo-io', repo: 'midnite-studio', kind: 'gitlab' },
};

const localRef = (name: string, over: Record<string, unknown> = {}) => ({
  name,
  fullName: `refs/heads/${name}`,
  kind: 'localBranch',
  sha: 'a'.repeat(40),
  upstream: null,
  isHead: false,
  worktreePath: null,
  ...over,
});

/**
 * Two commit timestamps, and the calendar derived FROM them.
 *
 * Local noon, and the calendar bucketed with the same `en-CA` local-date rule
 * the renderer uses, so the fixture's two halves cannot disagree about what
 * day a commit lands on regardless of the host timezone.
 */
const BO_AT = Math.floor(new Date(2026, 2, 1, 12, 0, 0).getTime() / 1000);
const ADA_AT = Math.floor(new Date(2026, 2, 2, 12, 0, 0).getTime() / 1000);
const dayOf = (epochSeconds: number) => new Date(epochSeconds * 1000).toLocaleDateString('en-CA');

const CONTRIBUTORS = [
  {
    email: 'ada@example.com',
    name: 'Ada Lovelace',
    commits: 1,
    insertions: 120,
    deletions: 40,
    firstAt: ADA_AT,
    lastAt: ADA_AT,
  },
  {
    email: 'bo@example.com',
    name: 'Bo Diddley',
    commits: 1,
    insertions: 8,
    deletions: 2,
    firstAt: BO_AT,
    lastAt: BO_AT,
  },
];

const ACTIVITY = [
  {
    sha: 'c'.repeat(40),
    at: ADA_AT,
    authorName: 'Ada Lovelace',
    authorEmail: 'ada@example.com',
    subject: 'Teach the calendar about local midnight',
  },
  {
    sha: 'd'.repeat(40),
    at: BO_AT,
    authorName: 'Bo Diddley',
    authorEmail: 'bo@example.com',
    subject: 'Bo fixes the sparkline',
  },
];

const STATS: MockFixtures['stats'] = {
  calendar: [
    { date: dayOf(BO_AT), count: 1 },
    { date: dayOf(ADA_AT), count: 1 },
  ],
  contributors: CONTRIBUTORS,
  activity: ACTIVITY,
  commitsScanned: 2,
  health: { localBranches: 4, remoteBranches: 2, tags: 1, staleByAge: 1, mergedBranches: 2 },
};

const base: MockFixtures = {
  ...fixtures,
  refs: [localRef('main', { isHead: true, worktreePath: MAIN })],
  remotes: [GITHUB_REMOTE],
  statusEntries: [],
  statusByWorktree: { [MAIN]: [] },
  forge: {
    cli: { reason: 'ready' },
    runs: [],
    pulls: [
      {
        number: 7,
        title: 'Dashboard widgets',
        state: 'open',
        isDraft: false,
        reviewDecision: 'APPROVED',
        checks: 'passing',
        headBranch: 'feature/dashboard',
        author: 'bilo',
        url: 'https://github.com/bilo-io/midnite-studio/pull/7',
      },
    ],
    issues: [
      {
        number: 12,
        title: 'Sparkline stops at the cadence change',
        state: 'open',
        author: 'bilo',
        labels: [{ name: 'bug', color: 'd73a4a' }],
        assignees: [],
        updatedAt: '2026-08-20T09:00:00Z',
        createdAt: '2026-08-14T11:30:00Z',
        comments: 2,
        url: 'https://github.com/bilo-io/midnite-studio/issues/12',
      },
    ],
  },
  stats: STATS,
};

/** A widget's tile — every one is a landmark named after its title. */
const tile = (name: string) => screen.getByRole('region', { name, exact: true });

const boardMenu = async (): Promise<void> => {
  fireEvent.click(screen.getByRole('button', { name: 'Widgets and layout' }));
  await screen.findByRole('menu');
};

const open = async (data: MockFixtures = base) => {
  renderView(<DashboardView />, { fixtures: data, uiState: { selectedRepoId: 'repo-1' } });
  await screen.findByRole('heading', { name: 'Dashboard', exact: true });
};

beforeEach(() => {
  // `useDashboardStore` is a module singleton — reset it between tests so a
  // widget removed or a layout reset in one test cannot leak into the next.
  useDashboardStore.setState({ boards: {} });
});

afterEach(cleanup);

describe('DashboardView, assembled through the real bridge', () => {
  it('renders every widget as a named landmark', async () => {
    await open();

    for (const name of [
      'Commit calendar',
      'Contributors',
      'Recent activity',
      'Open pull requests',
      'Open issues',
      'Latest workflow runs',
      'Repo health',
    ]) {
      expect(await screen.findByRole('region', { name, exact: true })).toBeTruthy();
    }

    // Each tile carries a real heading, so the board is navigable by heading
    // rather than being one undifferentiated region of numbers.
    expect(
      within(tile('Contributors')).getByRole('heading', { level: 3 }).textContent,
    ).toBe('Contributors');
  });

  it('renders their data, not just their frames', async () => {
    await open();

    expect(await within(tile('Contributors')).findByText('Ada Lovelace')).toBeTruthy();
    expect(
      await within(tile('Recent activity')).findByText('Teach the calendar about local midnight'),
    ).toBeTruthy();
    expect(await within(tile('Open pull requests')).findByText('Dashboard widgets')).toBeTruthy();
    expect(
      await within(tile('Open issues')).findByText('Sparkline stops at the cadence change'),
    ).toBeTruthy();
    // The count and the word are two separate text nodes (`{total}` and
    // `{total === 1 ? 'commit' : 'commits'}`), so a whole-string match
    // against the paragraph's combined text is needed rather than a
    // single-node match.
    expect(
      await within(tile('Commit calendar')).findByText(
        (_, element) => element?.textContent?.replace(/\s+/g, ' ').trim() === '2 commits',
      ),
    ).toBeTruthy();
  });

  it('a widget can be removed and restored', async () => {
    await open();
    await screen.findByRole('region', { name: 'Repo health' });

    fireEvent.click(
      within(tile('Repo health')).getByRole('button', { name: 'Repo health options' }),
    );
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Remove widget' }));
    expect(screen.queryByRole('region', { name: 'Repo health' })).toBeNull();

    await boardMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Repo health' }));
    expect(await screen.findByRole('region', { name: 'Repo health' })).toBeTruthy();
  });

  it('Reset layout puts back a widget that was removed', async () => {
    await open();
    await screen.findByRole('region', { name: 'Open issues' });

    fireEvent.click(
      within(tile('Open issues')).getByRole('button', { name: 'Open issues options' }),
    );
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Remove widget' }));
    expect(screen.queryByRole('region', { name: 'Open issues' })).toBeNull();

    await boardMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Reset layout' }));
    expect(await screen.findByRole('region', { name: 'Open issues' })).toBeTruthy();
  });

  it('a repo with no GitHub remote offers no forge widgets at all', async () => {
    await open({ ...base, remotes: [GITLAB_REMOTE] });

    // Not "renders an error tile" — a widget that could only ever be empty is
    // removed from the board AND from the picker.
    expect(screen.queryByRole('region', { name: 'Open pull requests' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Open issues' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Latest workflow runs' })).toBeNull();
    expect(await screen.findByRole('region', { name: 'Commit calendar' })).toBeTruthy();

    await boardMenu();
    const menu = screen.getByRole('menu');
    expect(within(menu).queryByRole('menuitem', { name: /Open pull requests/ })).toBeNull();
    expect(within(menu).queryByRole('menuitem', { name: /Open issues/ })).toBeNull();
    expect(within(menu).queryByRole('menuitem', { name: /Latest workflow runs/ })).toBeNull();
    expect(within(menu).getByRole('menuitem', { name: /Commit calendar/ })).toBeTruthy();
  });

  it('the author filter scopes the whole board at once', async () => {
    await open();
    expect(await within(tile('Recent activity')).findByText('Bo fixes the sparkline')).toBeTruthy();

    // Clicking a name in the contributor table IS the filter — the gesture
    // you reach for while reading the table, not a separate menu.
    await within(tile('Contributors')).findByText('Ada Lovelace');
    fireEvent.click(within(tile('Contributors')).getByRole('button', { name: /Ada Lovelace/ }));

    // The feed loses Bo's commit, and the calendar's total falls with it: one
    // scoping, applied once, read by every widget.
    await waitFor(() =>
      expect(within(tile('Recent activity')).queryByText('Bo fixes the sparkline')).toBeNull(),
    );
    expect(
      within(tile('Recent activity')).getByText('Teach the calendar about local midnight'),
    ).toBeTruthy();
    expect(within(tile('Contributors')).queryByText('Bo Diddley')).toBeNull();
    expect(
      within(tile('Commit calendar')).getByText(
        (_, element) => element?.textContent?.replace(/\s+/g, ' ').trim() === '1 commit',
      ),
    ).toBeTruthy();
  });

  it('a repository with no history renders empty states, not broken tiles', async () => {
    // A repo cloned five minutes ago. Every widget has to say so rather than
    // spinning forever or showing an error.
    await open({ ...base, stats: undefined, forge: { cli: { reason: 'ready' } } });

    expect(
      await within(tile('Commit calendar')).findByText('No commits in this window yet.'),
    ).toBeTruthy();
    expect(
      within(tile('Contributors')).getByText('No commits by anyone in this window.'),
    ).toBeTruthy();
    expect(
      await within(tile('Open pull requests')).findByText('No open pull requests.'),
    ).toBeTruthy();
    expect(await within(tile('Open issues')).findByText('No open issues.')).toBeTruthy();
  });

  it('a repository with issues disabled says so instead of showing an error', async () => {
    await open({
      ...base,
      forge: { cli: { reason: 'ready' }, runs: [], pulls: [], issues: [], issuesDisabled: true },
    });
    await screen.findByRole('region', { name: 'Open issues' });

    expect(
      await within(tile('Open issues')).findByText('Issues are disabled for this repository.'),
    ).toBeTruthy();
    // And it is a note, not the destructive card the four-way empty reserves
    // for a call that genuinely failed.
    expect(within(tile('Open issues')).queryByText(/could not complete/i)).toBeNull();
  });

  it('the board layout survives leaving the view and coming back', async () => {
    await open();

    fireEvent.click(
      within(tile('Repo health')).getByRole('button', { name: 'Repo health options' }),
    );
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Remove widget' }));
    expect(screen.queryByRole('region', { name: 'Repo health' })).toBeNull();

    // Persisted per repository in its own store, independent of this
    // component's own mount — unmounting and remounting `DashboardView`
    // (standing in for navigating away and back) has to still show the same
    // edit, the same way the store survives it for every other caller.
    cleanup();
    await open();

    expect(screen.queryByRole('region', { name: 'Repo health' })).toBeNull();
    expect(await screen.findByRole('region', { name: 'Commit calendar' })).toBeTruthy();
  });

  it('the statistics window is a control, and changing it refetches', async () => {
    await open();

    const picker = await screen.findByLabelText('Statistics window');
    expect((picker as HTMLSelectElement).value).toBe('90d');
    fireEvent.change(picker, { target: { value: '1y' } });
    expect((picker as HTMLSelectElement).value).toBe('1y');

    // The window is part of the query key, so the board is still populated
    // after the refetch rather than falling back to a skeleton it never
    // leaves.
    expect(await within(tile('Contributors')).findByText('Ada Lovelace')).toBeTruthy();
  });
});
