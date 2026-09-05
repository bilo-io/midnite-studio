import { test, type Page } from '@playwright/test';

import {
  buildReproducibleHistory,
  DAY_S,
  fixtures,
  installMockBridge,
  type MockFixtures,
  REPRODUCIBLE_NOW_S,
  REPRODUCIBLE_REMOTE,
  setTheme,
  shotPath,
  stubGravatars,
} from './shots-helper';

/**
 * The Phase 19 Theme D screenshots.
 *
 * Not assertions — `dashboard.spec.ts` owns those. These exist to produce the
 * PNGs the PR embeds, from the same mocked bridge the rest of the suite uses so
 * the picture is reproducible rather than whatever happened to be in someone's
 * repo that day.
 *
 * Run with `MSTUDIO_SHOTS=1`; skipped otherwise, so the normal suite stays fast
 * and does not rewrite committed images on every run.
 */
const OUT = '../../docs/screenshots/phase-19-dashboard';

const MAIN = '/tmp/midnite-studio';

const GITHUB_REMOTE = REPRODUCIBLE_REMOTE;

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

const DAY = DAY_S;
const TODAY = REPRODUCIBLE_NOW_S;

const { calendar, activity } = buildReproducibleHistory();

const shots: MockFixtures = {
  ...fixtures,
  refs: [localRef('main', { isHead: true, worktreePath: MAIN })],
  remotes: [GITHUB_REMOTE],
  statusEntries: [],
  statusByWorktree: { [MAIN]: [] },
  stats: {
    calendar,
    activity,
    commitsScanned: calendar.reduce((sum, day) => sum + day.count, 0),
    contributors: [
      {
        email: 'ada@example.com',
        name: 'Ada Lovelace',
        commits: 412,
        insertions: 28_940,
        deletions: 11_204,
        firstAt: TODAY - 360 * DAY,
        lastAt: TODAY - DAY,
      },
      {
        email: 'grace@example.com',
        name: 'Grace Hopper',
        commits: 187,
        insertions: 9_311,
        deletions: 4_002,
        firstAt: TODAY - 300 * DAY,
        lastAt: TODAY - 9 * DAY,
      },
      {
        email: 'bo@example.com',
        name: 'Bo Diddley',
        commits: 46,
        insertions: 1_204,
        deletions: 388,
        firstAt: TODAY - 120 * DAY,
        lastAt: TODAY - 44 * DAY,
      },
    ],
    health: {
      localBranches: 14,
      remoteBranches: 22,
      tags: 6,
      staleByAge: 5,
      mergedBranches: 8,
      oldestUnmergedAt: TODAY - 210 * DAY,
      sizeBytes: 184_549_376,
      looseObjects: 341,
    },
  },
  /* The PARSED shapes main sends — see the note in `dashboard.spec.ts`. */
  forge: {
    cli: { reason: 'ready' },
    pulls: [
      {
        number: 41,
        title: 'feat(phase-19): the dashboard becomes a board',
        state: 'open',
        isDraft: false,
        reviewDecision: 'REVIEW_REQUIRED',
        checks: 'passing',
        headBranch: 'feature/phase-19-dashboard',
        author: 'bilo',
        url: 'https://github.com/bilo-io/midnite-studio/pull/41',
      },
      {
        number: 40,
        title: 'feat(phase-18): repo diagnostics behind a consent gate',
        state: 'open',
        isDraft: true,
        reviewDecision: null,
        checks: 'pending',
        headBranch: 'feature/phase-18-diagnostics',
        author: 'bilo',
        url: 'https://github.com/bilo-io/midnite-studio/pull/40',
      },
    ],
    issues: [
      {
        number: 37,
        title: 'Sparkline stops drawing at a cadence change',
        state: 'open',
        author: 'bilo',
        labels: [
          { name: 'bug', color: 'd73a4a' },
          { name: 'phase-18', color: '0e8a16' },
        ],
        assignees: ['bilo'],
        updatedAt: '2026-08-20T09:00:00Z',
        createdAt: '2026-08-14T11:30:00Z',
        comments: 4,
        url: 'https://github.com/bilo-io/midnite-studio/issues/37',
      },
      {
        number: 33,
        title: 'Sidebar filter toggle has no visible pressed state',
        state: 'open',
        author: 'bilo',
        labels: [{ name: 'ui', color: '5319e7' }],
        assignees: [],
        updatedAt: '2026-08-18T16:20:00Z',
        createdAt: '2026-08-18T16:20:00Z',
        comments: 0,
        url: 'https://github.com/bilo-io/midnite-studio/issues/33',
      },
    ],
    runs: [
      {
        id: '9901',
        name: 'CI',
        status: 'completed',
        conclusion: 'success',
        headBranch: 'main',
        headSha: 'a'.repeat(40),
        createdAt: '2026-08-26T07:40:00Z',
        url: 'https://github.com/bilo-io/midnite-studio/actions/runs/9901',
      },
      {
        id: '9900',
        name: 'CI',
        status: 'in_progress',
        // Null, not '' — an unfinished run has no verdict, and the domain type
        // is what the renderer is handed.
        conclusion: null,
        headBranch: 'feature/phase-19-dashboard',
        headSha: 'b'.repeat(40),
        createdAt: '2026-08-26T07:10:00Z',
        url: 'https://github.com/bilo-io/midnite-studio/actions/runs/9900',
      },
      {
        id: '9899',
        name: 'Release',
        status: 'completed',
        conclusion: 'failure',
        headBranch: 'main',
        headSha: 'c'.repeat(40),
        createdAt: '2026-08-25T18:02:00Z',
        url: 'https://github.com/bilo-io/midnite-studio/actions/runs/9899',
      },
    ],
  },
};

/**
 * Keep Gravatar out of it.
 *
 * `avatarFor` requests `?d=404`, so "this person has no picture" only ever
 * arrives as the image's own load error — which means whether a shot shows a
 * face or the generated initials depends on how fast gravatar.com answers. Two
 * runs then produce two different pictures, and a screenshot nobody can
 * reproduce is one nobody can review a change to. Aborting the request takes
 * the same path a real 404 does, deterministically and without the network.
 */
/** The grid positions from a measured width and the tiles animate in. */
const SETTLE_MS = 600;

async function openDashboard(page: Page): Promise<void> {
  await stubGravatars(page);
  await installMockBridge(page, shots);
  await page.goto('/');
  await page.getByRole('link', { name: 'Dashboard', exact: true }).click();
  await page.getByRole('region', { name: 'Repo health' }).waitFor();
  await page.waitForTimeout(SETTLE_MS);
}

test.describe('dashboard screenshots', () => {
  test.skip(!process.env.MSTUDIO_SHOTS, 'set MSTUDIO_SHOTS=1 to regenerate');
  test.use({ viewport: { width: 1600, height: 1100 } });

  test('the board, light', async ({ page }) => {
    await openDashboard(page);
    await page.screenshot({ path: shotPath(OUT, 'dashboard-light.png') });
  });

  test('the board, dark', async ({ page }) => {
    await stubGravatars(page);
    await installMockBridge(page, shots);
    await page.goto('/');
    // Set before the board is opened so the grid's own stylesheet overrides are
    // in force for the first paint of every tile.
    await setTheme(page, 'dark');
    await page.getByRole('link', { name: 'Dashboard', exact: true }).click();
    await page.getByRole('region', { name: 'Repo health' }).waitFor();
    await page.waitForTimeout(SETTLE_MS);
    await page.screenshot({ path: shotPath(OUT, 'dashboard-dark.png') });
  });

  test('the board scoped to one author', async ({ page }) => {
    await openDashboard(page);
    await page
      .getByRole('region', { name: 'Contributors' })
      .getByRole('button', { name: /Grace Hopper/ })
      .click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: shotPath(OUT, 'dashboard-author-filter.png') });
  });

  test('the widget picker', async ({ page }) => {
    await openDashboard(page);
    await page.getByRole('button', { name: 'Widgets and layout' }).click();
    await page.getByRole('menu').waitFor();
    await page.screenshot({ path: shotPath(OUT, 'dashboard-widget-menu.png') });
  });
});
