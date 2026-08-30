import { expect, test, type Page } from '@playwright/test';

import { fixtures } from './fixtures';
import { installMockBridge, type MockFixtures } from './mock-bridge';

/**
 * The dashboard as an assembled board.
 *
 * The unit tests own the parts that are functions — which widgets a repo can
 * offer, how a layout is edited, how the author filter rebuckets a calendar.
 * What only the running app can show is that the registry actually reaches the
 * DOM: that a tile can be removed and put back, that Reset layout undoes it,
 * that a repository with no GitHub remote is offered no forge widgets at all,
 * and that the board follows the sidebar's selection rather than a repo of its
 * own choosing.
 */

const MAIN = '/tmp/midnite-git';

const GITHUB_REMOTE = {
  name: 'origin',
  fetchUrl: 'git@github.com:bilo-io/midnite-git.git',
  pushUrl: 'git@github.com:bilo-io/midnite-git.git',
  forge: { host: 'github.com', owner: 'bilo-io', repo: 'midnite-git', kind: 'github' },
};

/**
 * GitLab rather than "no remotes at all".
 *
 * The rule under test is about the FORGE — `gh` speaks GitHub only — and a repo
 * with no remotes would also satisfy a rule that merely checked whether any
 * remote existed.
 */
const GITLAB_REMOTE = {
  name: 'origin',
  fetchUrl: 'git@gitlab.com:bilo-io/midnite-git.git',
  pushUrl: 'git@gitlab.com:bilo-io/midnite-git.git',
  forge: { host: 'gitlab.com', owner: 'bilo-io', repo: 'midnite-git', kind: 'gitlab' },
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
 * Built at local noon and bucketed with the same `en-CA` local-date rule the
 * renderer uses, rather than written out as literal dates: the board recounts
 * the calendar from the activity feed whenever the author filter is on, so a
 * fixture whose two halves disagree would make the filtered total a number
 * neither the widget nor the test could justify. Local noon is far enough from
 * either edge of a day that no host timezone moves it.
 */
const BO_AT = Math.floor(new Date(2026, 2, 1, 12, 0, 0).getTime() / 1000);
const ADA_AT = Math.floor(new Date(2026, 2, 2, 12, 0, 0).getTime() / 1000);
const dayOf = (epochSeconds: number) =>
  new Date(epochSeconds * 1000).toLocaleDateString('en-CA');

/** Two people, so the author filter has something to choose between. */
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
  /*
    The PARSED shapes main sends, not `gh --json` output.

    The mock bridge stands in for the preload, which is downstream of
    `gh-parse.ts` — so a fixture written in `gh`'s vocabulary (`headRefName`,
    `author: {login}`, an uppercase `state`) reaches the renderer unparsed and
    renders as `undefined` and `[object Object]`. The parsers have their own
    unit tests; this side asserts the renderer against what it is actually
    handed.
  */
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
        url: 'https://github.com/bilo-io/midnite-git/pull/7',
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
        url: 'https://github.com/bilo-io/midnite-git/issues/12',
      },
    ],
  },
  stats: STATS,
};

async function openDashboard(page: Page, data: MockFixtures = base): Promise<void> {
  await installMockBridge(page, data);
  await page.goto('/');
  await page.getByRole('link', { name: 'Dashboard', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
}

/** A widget's tile — every one is a landmark named after its title. */
const tile = (page: Page, name: string) => page.getByRole('region', { name, exact: true });

const boardMenu = async (page: Page): Promise<void> => {
  await page.getByRole('button', { name: 'Widgets and layout' }).click();
  await expect(page.getByRole('menu')).toBeVisible();
};

test('the board renders every widget as a named landmark', async ({ page }) => {
  await openDashboard(page);

  for (const name of [
    'Commit calendar',
    'Contributors',
    'Recent activity',
    'Open pull requests',
    'Open issues',
    'Latest workflow runs',
    'Repo health',
  ]) {
    await expect(tile(page, name)).toBeVisible();
  }

  // Each tile carries a real heading, so the board is navigable by heading
  // rather than being one undifferentiated region of numbers.
  await expect(tile(page, 'Contributors').getByRole('heading', { level: 3 })).toHaveText(
    'Contributors',
  );
});

test('the widgets render their data, not just their frames', async ({ page }) => {
  await openDashboard(page);

  await expect(tile(page, 'Contributors').getByText('Ada Lovelace')).toBeVisible();
  await expect(
    tile(page, 'Recent activity').getByText('Teach the calendar about local midnight'),
  ).toBeVisible();
  await expect(tile(page, 'Open pull requests').getByText('Dashboard widgets')).toBeVisible();
  await expect(
    tile(page, 'Open issues').getByText('Sparkline stops at the cadence change'),
  ).toBeVisible();
  await expect(tile(page, 'Commit calendar').getByText('2 commits')).toBeVisible();
});

test('a widget can be removed and restored', async ({ page }) => {
  await openDashboard(page);
  await expect(tile(page, 'Repo health')).toBeVisible();

  await tile(page, 'Repo health').getByRole('button', { name: 'Repo health options' }).click();
  await page.getByRole('menuitem', { name: 'Remove widget' }).click();
  await expect(tile(page, 'Repo health')).toHaveCount(0);

  await boardMenu(page);
  await page.getByRole('menuitem', { name: 'Repo health' }).click();
  await expect(tile(page, 'Repo health')).toBeVisible();
});

test('Reset layout puts back a widget that was removed', async ({ page }) => {
  await openDashboard(page);

  await tile(page, 'Open issues').getByRole('button', { name: 'Open issues options' }).click();
  await page.getByRole('menuitem', { name: 'Remove widget' }).click();
  await expect(tile(page, 'Open issues')).toHaveCount(0);

  await boardMenu(page);
  await page.getByRole('menuitem', { name: 'Reset layout' }).click();
  await expect(tile(page, 'Open issues')).toBeVisible();
});

test('a repo with no GitHub remote offers no forge widgets at all', async ({ page }) => {
  await openDashboard(page, { ...base, remotes: [GITLAB_REMOTE] });

  // Not "renders an error tile" — a widget that could only ever be empty is
  // removed from the board AND from the picker.
  await expect(tile(page, 'Open pull requests')).toHaveCount(0);
  await expect(tile(page, 'Open issues')).toHaveCount(0);
  await expect(tile(page, 'Latest workflow runs')).toHaveCount(0);
  await expect(tile(page, 'Commit calendar')).toBeVisible();

  await boardMenu(page);
  const menu = page.getByRole('menu');
  await expect(menu.getByRole('menuitem', { name: /Open pull requests/ })).toHaveCount(0);
  await expect(menu.getByRole('menuitem', { name: /Open issues/ })).toHaveCount(0);
  await expect(menu.getByRole('menuitem', { name: /Latest workflow runs/ })).toHaveCount(0);
  await expect(menu.getByRole('menuitem', { name: /Commit calendar/ })).toBeVisible();
});

test('the author filter scopes the whole board at once', async ({ page }) => {
  await openDashboard(page);

  await expect(tile(page, 'Recent activity').getByText('Bo fixes the sparkline')).toBeVisible();

  // Clicking a name in the contributor table IS the filter — the gesture you
  // reach for while reading the table, not a separate menu.
  await tile(page, 'Contributors').getByRole('button', { name: /Ada Lovelace/ }).click();

  // The feed loses Bo's commit, and the calendar's total falls with it: one
  // scoping, applied once, read by every widget.
  await expect(tile(page, 'Recent activity').getByText('Bo fixes the sparkline')).toHaveCount(0);
  await expect(
    tile(page, 'Recent activity').getByText('Teach the calendar about local midnight'),
  ).toBeVisible();
  await expect(tile(page, 'Contributors').getByText('Bo Diddley')).toHaveCount(0);
  await expect(tile(page, 'Commit calendar').getByText('1 commit', { exact: true })).toBeVisible();
});

test('a repository with no history renders empty states, not broken tiles', async ({ page }) => {
  // A repo cloned five minutes ago. Every widget has to say so rather than
  // spinning forever or showing an error.
  const empty: MockFixtures = { ...base, stats: undefined, forge: { cli: { reason: 'ready' } } };
  await openDashboard(page, empty);

  await expect(tile(page, 'Commit calendar').getByText('No commits in this window yet.')).toBeVisible();
  await expect(
    tile(page, 'Contributors').getByText('No commits by anyone in this window.'),
  ).toBeVisible();
  await expect(tile(page, 'Open pull requests').getByText('No open pull requests.')).toBeVisible();
  await expect(tile(page, 'Open issues').getByText('No open issues.')).toBeVisible();
});

test('a repository with issues disabled says so instead of showing an error', async ({ page }) => {
  await openDashboard(page, {
    ...base,
    forge: { cli: { reason: 'ready' }, runs: [], pulls: [], issues: [], issuesDisabled: true },
  });

  await expect(
    tile(page, 'Open issues').getByText('Issues are disabled for this repository.'),
  ).toBeVisible();
  // And it is a note, not the destructive card the four-way empty reserves for
  // a call that genuinely failed.
  await expect(tile(page, 'Open issues').getByText(/could not complete/i)).toHaveCount(0);
});

test('the board layout survives leaving the view and coming back', async ({ page }) => {
  await openDashboard(page);

  await tile(page, 'Repo health').getByRole('button', { name: 'Repo health options' }).click();
  await page.getByRole('menuitem', { name: 'Remove widget' }).click();
  await expect(tile(page, 'Repo health')).toHaveCount(0);

  await page.getByRole('link', { name: 'Graph', exact: true }).click();
  await page.getByRole('link', { name: 'Dashboard', exact: true }).click();

  // Persisted per repository in its own store — the same edit has to still be
  // there, and the rest of the board with it.
  await expect(tile(page, 'Repo health')).toHaveCount(0);
  await expect(tile(page, 'Commit calendar')).toBeVisible();
});

test('the statistics window is a control, and changing it refetches', async ({ page }) => {
  await openDashboard(page);

  const picker = page.getByLabel('Statistics window');
  await expect(picker).toHaveValue('90d');
  await picker.selectOption('1y');
  await expect(picker).toHaveValue('1y');

  // The window is part of the query key, so the board is still populated after
  // the refetch rather than falling back to a skeleton it never leaves.
  await expect(tile(page, 'Contributors').getByText('Ada Lovelace')).toBeVisible();
});
