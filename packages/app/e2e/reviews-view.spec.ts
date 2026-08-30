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

const MAIN = '/tmp/midnite-studio';

const REMOTES = [
  {
    name: 'origin',
    fetchUrl: 'git@github.com:bilo-io/midnite-studio.git',
    pushUrl: 'git@github.com:bilo-io/midnite-studio.git',
    forge: { host: 'github.com', owner: 'bilo-io', repo: 'midnite-studio', kind: 'github' },
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
  url: `https://github.com/bilo-io/midnite-studio/pull/${String(over['number'])}`,
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

/**
 * The list pane, and only the list pane.
 *
 * The sidebar carries its own copy of the same three groups, with the same
 * headings, and a collapsed `TreeSection` is still in the DOM — so an unscoped
 * locator is ambiguous rather than wrong. `reviews-groups` is the view's own
 * container, which is why it has a test id at all.
 */
const groups = (page: Page) => page.getByTestId('reviews-groups');

/** The rows of one scope group, once it is open. */
const pulls = (page: Page, group = 'All Pull Requests') =>
  groups(page).getByRole('list', { name: group });

/** Open one scope group — which is also what makes it fetch. */
async function expandGroup(page: Page, title = 'All Pull Requests'): Promise<void> {
  await groups(page).getByRole('button', { name: title }).click();
}

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

test('every group starts collapsed, and expanding one is what loads it', async ({ page }) => {
  await goToReviews(page);

  // All three headings are there; none of them has a listing under it yet.
  for (const title of ['My Requests', 'Awaiting My Review', 'All Pull Requests']) {
    await expect(groups(page).getByRole('button', { name: title })).toBeVisible();
  }
  await expect(groups(page).getByRole('list')).toHaveCount(0);
  await expect(page.getByText('Open one of the groups on the left')).toBeVisible();

  await expandGroup(page);
  await expect(pulls(page)).toBeVisible();
});

test('each group is its own listing, and shows only its own scope', async ({ page }) => {
  await goToReviews(page, {
    ...base,
    forge: {
      ...base.forge,
      /*
        Deliberately disjoint from `pulls`: if the groups shared one query — or
        one cache key — whichever expanded first would serve its rows to the
        others, and only fixtures that disagree can show that they do not.
      */
      pullsByScope: {
        mine: [pull({ number: 201, title: 'Mine to land', author: 'bilo' })],
        'review-requested': [pull({ number: 202, title: 'Yours to read', author: 'ana' })],
      },
    },
  });

  await expandGroup(page, 'My Requests');
  await expect(pulls(page, 'My Requests').getByText('Mine to land')).toBeVisible();
  await expect(pulls(page, 'My Requests').getByText('Yours to read')).toHaveCount(0);

  await expandGroup(page, 'Awaiting My Review');
  await expect(pulls(page, 'Awaiting My Review').getByText('Yours to read')).toBeVisible();
  await expect(pulls(page, 'Awaiting My Review').getByText('Mine to land')).toHaveCount(0);

  // And the first group is still showing its own answer, not the second's.
  await expect(pulls(page, 'My Requests').getByText('Mine to land')).toBeVisible();
});

test('the default Open tab excludes drafts, merged and closed PRs', async ({ page }) => {
  await goToReviews(page);
  await expandGroup(page);
  await expect(pulls(page)).toBeVisible();

  await expect(pulls(page).getByText('Add reviews list')).toBeVisible();
  await expect(pulls(page).getByText('WIP: highlight diffs')).toHaveCount(0);
  await expect(pulls(page).getByText('Fix flaky test')).toHaveCount(0);
  await expect(pulls(page).getByText('Drop dead code')).toHaveCount(0);
});

test('status tabs narrow the list to each state', async ({ page }) => {
  await goToReviews(page);
  await expandGroup(page);

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
  await expandGroup(page);
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
  await expandGroup(page);
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
  await page.getByRole('button', { name: 'All Pull Requests', exact: true }).click();
  await page.getByText('Add reviews list').first().click();

  /*
    Landed on the Reviews VIEW — a workbench tab would render the read-only
    `ReviewView` summary card instead, which has neither of these landmarks.

    The view's own groups are all still collapsed, and deliberately so: the
    sidebar row carried a SELECTION, not a listing, and `PrDetail` fetches the
    pull request by number. Arriving with a PR open and no list loaded is the
    normal path, not a gap — so the assertion is the pane, not its rows.
  */
  await expect(groups(page)).toBeVisible();
  await expect(page.getByRole('region', { name: 'Pull request #101' })).toBeVisible();
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
