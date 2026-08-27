import { expect, test, type Page } from '@playwright/test';

import { fixtures } from './fixtures';
import { installMockBridge, type MockFixtures } from './mock-bridge';

/**
 * The Reviews view (Phase 20 Themes A + B): the nav-rail shell and the
 * filterable pull-request list.
 *
 * Status-tab / author-filter / search logic is plain data filtering and
 * covered as such where it can be; what only the assembled app can show is
 * that the rail item, the sidebar's narrowing and the row's route into the
 * view actually compose — the same split `actions-view.spec.ts` draws.
 */

const MAIN = '/tmp/midnite-git';

const REMOTES = [
  {
    name: 'origin',
    fetchUrl: 'git@github.com:bilo-io/midnite-git.git',
    pushUrl: 'git@github.com:bilo-io/midnite-git.git',
    forge: { host: 'github.com', owner: 'bilo-io', repo: 'midnite-git', kind: 'github' },
  },
];

/**
 * A `ForgePull` — the shape main already parsed it into, not `gh`'s raw JSON.
 * The mock bridge stands in for the preload, which only ever hands the
 * renderer parsed domain objects (`gh-parse.ts`'s job), so a fixture written
 * in `gh`'s own field names (`headRefName`, `author: {login}`) is testing a
 * shape the real bridge never produces.
 */
const pull = (over: Record<string, unknown>) => ({
  title: 'Untitled',
  state: 'open',
  isDraft: false,
  reviewDecision: null,
  checks: null,
  headBranch: 'feature/x',
  author: 'bilo',
  mergedAt: null,
  closedAt: null,
  ...over,
  url: `https://github.com/bilo-io/midnite-git/pull/${String(over['number'])}`,
});

/**
 * One local branch, so "Show all sections" reveals something.
 *
 * `TreeSection` hides an empty section outright (`hideWhenEmpty`), which
 * without this would make Local indistinguishable from a Local section that
 * is simply empty — the same reason `nav-shell.spec.ts`'s own fixture seeds one.
 */
const LOCAL_REF = {
  name: 'main',
  fullName: 'refs/heads/main',
  kind: 'localBranch',
  sha: 'a'.repeat(40),
  upstream: null,
  isHead: true,
  worktreePath: MAIN,
};

/**
 * One PR of each status tab, from two different authors — the asymmetry a
 * fixture with four identical open PRs could not show.
 */
const base: MockFixtures = {
  ...fixtures,
  remotes: REMOTES,
  refs: [LOCAL_REF],
  statusEntries: [],
  statusByWorktree: { [MAIN]: [] },
  forge: {
    cli: { reason: 'ready' },
    pulls: [
      pull({
        number: 101,
        title: 'Add reviews list',
        headBranch: 'feature/reviews',
        author: 'bilo',
        reviewDecision: 'APPROVED',
        checks: 'passing',
      }),
      pull({
        number: 102,
        title: 'WIP: highlight diffs',
        isDraft: true,
        headBranch: 'wip/highlight',
        author: 'ana',
      }),
      pull({
        number: 103,
        title: 'Fix flaky test',
        state: 'merged',
        headBranch: 'fix/flaky',
        author: 'bilo',
        mergedAt: '2026-08-20T10:00:00Z',
        closedAt: '2026-08-20T10:00:00Z',
      }),
      pull({
        number: 104,
        title: 'Drop dead code',
        state: 'closed',
        headBranch: 'chore/cleanup',
        author: 'ana',
        closedAt: '2026-08-21T10:00:00Z',
      }),
    ],
  },
};

const pulls = (page: Page) => page.getByRole('list', { name: 'Pull requests' });

async function goToReviews(page: Page, data: MockFixtures = base): Promise<void> {
  await installMockBridge(page, data);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();
  await page.getByRole('link', { name: 'Reviews' }).click();
}

test('the Reviews nav item is hidden for a repository with no GitHub remote', async ({ page }) => {
  await installMockBridge(page, fixtures);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Reviews' })).toHaveCount(0);
});

test('the default Open tab excludes drafts, merged and closed PRs', async ({ page }) => {
  await goToReviews(page);
  await expect(pulls(page)).toBeVisible();

  await expect(pulls(page).getByText('Add reviews list')).toBeVisible();
  await expect(pulls(page).getByText('WIP: highlight diffs')).toHaveCount(0);
  await expect(pulls(page).getByText('Fix flaky test')).toHaveCount(0);
  await expect(pulls(page).getByText('Drop dead code')).toHaveCount(0);
});

test('status tabs narrow the list to each state', async ({ page }) => {
  await goToReviews(page);

  await page.getByRole('tab', { name: 'All' }).click();
  for (const title of ['Add reviews list', 'WIP: highlight diffs', 'Fix flaky test', 'Drop dead code']) {
    await expect(pulls(page).getByText(title)).toBeVisible();
  }

  await page.getByRole('tab', { name: 'Draft' }).click();
  await expect(pulls(page).getByText('WIP: highlight diffs')).toBeVisible();
  await expect(pulls(page).getByText('Add reviews list')).toHaveCount(0);

  await page.getByRole('tab', { name: 'Merged' }).click();
  await expect(pulls(page).getByText('Fix flaky test')).toBeVisible();
  await expect(pulls(page).getByText('WIP: highlight diffs')).toHaveCount(0);

  await page.getByRole('tab', { name: 'Closed' }).click();
  await expect(pulls(page).getByText('Drop dead code')).toBeVisible();
  await expect(pulls(page).getByText('Fix flaky test')).toHaveCount(0);
});

test('the author filter and the search box narrow the list together', async ({ page }) => {
  await goToReviews(page);
  await page.getByRole('tab', { name: 'All' }).click();

  await page.getByRole('button', { name: 'All authors' }).click();
  await page.getByRole('option', { name: 'ana' }).click();
  await page.keyboard.press('Escape');

  await expect(pulls(page).getByText('WIP: highlight diffs')).toBeVisible();
  await expect(pulls(page).getByText('Drop dead code')).toBeVisible();
  await expect(pulls(page).getByText('Add reviews list')).toHaveCount(0);
  await expect(pulls(page).getByText('Fix flaky test')).toHaveCount(0);

  // Search narrows further, on top of the author filter already applied.
  await page.getByRole('searchbox', { name: 'Search pull requests' }).fill('highlight');
  await expect(pulls(page).getByText('WIP: highlight diffs')).toBeVisible();
  await expect(pulls(page).getByText('Drop dead code')).toHaveCount(0);
});

test('a repository with gh signed out shows the hint, not an empty list', async ({ page }) => {
  await goToReviews(page, {
    ...base,
    forge: { ...base.forge, cli: { reason: 'not-authenticated', hint: 'Run `gh auth login`…' } },
  });
  // The sidebar's own (collapsed) Reviews section carries the identical hint,
  // so this is deliberately `.first()` rather than a stricter single-match.
  await expect(page.getByText('Run `gh auth login`…').first()).toBeVisible();
  await expect(pulls(page)).toHaveCount(0);
});

test('the sidebar Reviews row opens the Reviews view rather than a workbench tab', async ({
  page,
}) => {
  await installMockBridge(page, base);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();

  await page.getByRole('button', { name: 'Reviews', exact: true }).click();
  await page.getByText('Add reviews list').first().click();

  // Landed on the Reviews VIEW's own list — a workbench tab would render the
  // read-only `ReviewView` summary card instead, which has no such landmark.
  await expect(pulls(page)).toBeVisible();
});

test('the Reviews view narrows the sidebar to Reviews and Worktrees, with the escape hatch intact', async ({
  page,
}) => {
  await goToReviews(page);

  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Local' })).toHaveCount(0);

  await page.getByRole('button', { name: /show all sections/i }).click();
  await expect(page.getByRole('heading', { name: 'Local' })).toBeVisible();
});
