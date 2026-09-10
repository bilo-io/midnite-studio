import { expect, test, type Page } from '@playwright/test';

import { fixtures } from '../test-support/fixtures';
import { clickRailLink, installMockBridge, type MockFixtures } from '../test-support/mock-bridge';

/**
 * The Reviews view (Phase 20 Themes A + B): the nav-rail shell and the
 * filterable pull-request list.
 *
 * Migrated to `src/features/reviews/reviews-view.bridge.test.tsx` (Phase 82
 * Theme C, wave 5) — the group/tab/author/search filtering behaviour, 6 of
 * the original 9 tests. **The 3 tests left here are not about `ReviewsList`
 * itself** — each needs the app's outer rail/routing/sidebar shell, which
 * mounting `ReviewsList` alone bypasses entirely, the same reasoning
 * `optimizer.spec.ts`'s own feature-gate tests stayed for: "the Reviews nav
 * item is hidden…" tests the rail, "the sidebar Reviews row opens the
 * Reviews view…" tests cross-view routing from the sidebar, and "the Reviews
 * view narrows the sidebar…" tests the sidebar's own narrowing, not
 * `ReviewsList`.
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

async function goToReviews(page: Page, data: MockFixtures = base): Promise<void> {
  await installMockBridge(page, data);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();
  await clickRailLink(page, 'Reviews');
}

test('the Reviews nav item is hidden for a repository with no GitHub remote', async ({ page }) => {
  await installMockBridge(page, fixtures);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Reviews' })).toHaveCount(0);
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
