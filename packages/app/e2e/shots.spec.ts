import { expect, test, type Page } from '@playwright/test';

import { installMockBridge, type MockFixtures } from './mock-bridge';

/**
 * The Phase 12 Theme C + F screenshots.
 *
 * Not assertions — these exist to produce the PNGs the phase doc asks for, from
 * the same mocked bridge the rest of the suite uses so the picture is
 * reproducible rather than whatever happened to be in someone's repo that day.
 *
 * Run with `MGIT_SHOTS=1`; skipped otherwise, so the normal suite stays fast
 * and does not rewrite committed images on every run.
 */
/**
 * Relative to `packages/app`, which is Playwright's cwd — hence the `../../`.
 * Every other spec that writes a shot does the same; dropping it silently
 * creates a second `packages/app/docs/` tree instead of failing.
 */
const OUT = '../../docs/screenshots/phase-12-badges-rows';

const sha = (i: number) => `${i}`.padStart(40, 'c');

const commit = (i: number, parents: string[], subject: string, author: string, email: string) => ({
  sha: sha(i),
  parents,
  authorName: author,
  authorEmail: email,
  authorDate: 1_787_000_000 - i * 7200,
  committerDate: 1_787_000_000 - i * 7200,
  subject,
  refs: [],
});

type Edge = { type: 'straight' | 'branch' | 'merge'; fromLane: number; toLane: number; colorIdx: number };

const row = (
  i: number,
  parents: string[],
  subject: string,
  lane: number,
  colorIdx: number,
  laneCount: number,
  edges: Edge[],
  author = 'Ada Lovelace',
  email = 'ada@example.com',
) => ({
  row: i,
  commit: commit(i, parents, subject, author, email),
  lane,
  laneCount,
  colorIdx,
  edges,
});

const straight = (lane: number, colorIdx: number): Edge => ({
  type: 'straight',
  fromLane: lane,
  toLane: lane,
  colorIdx,
});

/** A history with a real branch and merge, so the lanes have something to show. */
const ROWS = [
  row(0, [sha(1), sha(3)], 'Merge branch feature/graph-polish', 0, 0, 3, [
    straight(0, 0),
    { type: 'merge', fromLane: 0, toLane: 1, colorIdx: 1 },
  ]),
  row(1, [sha(2)], 'fix(graph): line the table up, make the gutter resizable', 0, 0, 3, [
    straight(0, 0),
    straight(1, 1),
  ]),
  row(2, [sha(4)], 'feat(phase-12): model git remotes and open forge links safely', 0, 0, 3, [
    straight(0, 0),
    straight(1, 1),
  ]),
  row(3, [sha(4)], 'feat(graph): ref badges expand into sync controls', 1, 1, 3, [
    straight(0, 0),
    { type: 'branch', fromLane: 1, toLane: 0, colorIdx: 1 },
    straight(2, 2),
  ]),
  row(4, [sha(5)], 'test(app): cover the lane palette under simulated CVD', 0, 0, 3, [
    straight(0, 0),
    straight(2, 2),
  ], 'Grace Hopper', 'grace@example.com'),
  row(5, [sha(6)], 'chore(todo): claim Phase 12 Themes C+F', 0, 0, 3, [
    straight(0, 0),
    straight(2, 2),
  ], 'Grace Hopper', 'grace@example.com'),
  row(6, [sha(7)], 'docs: add the phase-12 verification list', 0, 0, 2, [straight(0, 0)]),
  row(7, [sha(8)], 'feat(settings): split settings into pages', 0, 0, 1, [straight(0, 0)]),
  row(8, [], 'feat(explorer): read-only folder tree behind a path jail', 0, 0, 1, []),
];

const REFS = [
  {
    name: 'main',
    fullName: 'refs/heads/main',
    kind: 'localBranch',
    sha: sha(0),
    isHead: true,
    worktreePath: '/tmp/repo',
    upstream: { name: 'origin/main', ahead: 2, behind: 5, gone: false },
  },
  {
    name: 'origin/main',
    fullName: 'refs/remotes/origin/main',
    kind: 'remoteBranch',
    sha: sha(2),
    isHead: false,
    worktreePath: null,
    upstream: null,
  },
  {
    name: 'feature/graph-polish',
    fullName: 'refs/heads/feature/graph-polish',
    kind: 'localBranch',
    sha: sha(3),
    isHead: false,
    worktreePath: null,
    upstream: { name: 'origin/feature/graph-polish', ahead: 4, behind: 0, gone: false },
  },
  {
    name: 'v0.4.0',
    fullName: 'refs/tags/v0.4.0',
    kind: 'tag',
    sha: sha(6),
    isHead: false,
    worktreePath: null,
    upstream: null,
  },
];

const DIRTY = [
  {
    path: 'packages/app/src/features/graph/ref-badge.tsx',
    origPath: null,
    staged: 'modified',
    unstaged: 'unmodified',
    conflicted: false,
    similarity: null,
  },
  {
    path: 'packages/app/src/features/graph/lane-colors.ts',
    origPath: null,
    staged: 'unmodified',
    unstaged: 'modified',
    conflicted: false,
    similarity: null,
  },
  {
    path: 'packages/app/src/features/graph/uncommitted-row.tsx',
    origPath: null,
    staged: 'unmodified',
    unstaged: 'untracked',
    conflicted: false,
    similarity: null,
  },
];

const FIXTURES: MockFixtures = {
  commitDetail: { sha: sha(0), body: '', stat: '', files: [] },
  diffs: {},
  graphRows: ROWS,
  refs: REFS,
  remotes: [
    {
      name: 'origin',
      fetchUrl: 'https://github.com/bilo-io/midnite-git.git',
      pushUrl: 'https://github.com/bilo-io/midnite-git.git',
      forge: { host: 'github.com', owner: 'bilo-io', repo: 'midnite-git', kind: 'github' },
    },
  ],
  statusEntries: DIRTY,
};

test.describe('screenshots', () => {
  test.skip(!process.env.MGIT_SHOTS, 'set MGIT_SHOTS=1 to regenerate');

  test.use({ viewport: { width: 1440, height: 820 } });

  /**
   * Let entrance animations finish before capturing.
   *
   * `toBeVisible()` does not consider opacity, so an element mid-`fade-in` is
   * already "visible" to the assertion and absent from the picture — which is
   * how the first pass at these produced a screenshot of the sync strip with no
   * sync strip in it.
   */
  const settle = (page: Page) => page.waitForTimeout(400);

  async function open(page: Page) {
    await installMockBridge(page, FIXTURES);
    await page.goto('/');
    await expect(page.getByRole('grid')).toBeVisible();
    await expect(page.getByRole('button', { name: /^3 uncommitted changes/ })).toBeVisible();
  }

  /** Settings is paged since Phase 16; the density picker lives on the Graph page. */
  async function openGraphSettings(page: Page) {
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('navigation', { name: 'Settings pages' })
      .getByRole('button', { name: 'Graph' })
      .click();
    await expect(page.getByText('Row density')).toBeVisible();
  }

  test('graph with the sync strip expanded', async ({ page }) => {
    await open(page);
    await page
      .getByRole('grid')
      .getByRole('button', { name: /^main\b/ })
      .first()
      .hover();
    await expect(page.getByRole('group', { name: 'Sync main' })).toBeVisible();
    await settle(page);
    await page.screenshot({ path: `${OUT}/badge-sync-expanded.png` });
  });

  test('selected row and the working-copy row', async ({ page }) => {
    await open(page);
    await page.getByText('test(app): cover the lane palette under simulated CVD').click();
    await settle(page);
    await page.screenshot({ path: `${OUT}/selection-and-working-copy.png` });
  });

  test('row density in settings', async ({ page }) => {
    await open(page);
    await openGraphSettings(page);
    await page.getByRole('button', { name: /^Compact/ }).click();
    await settle(page);
    await page.screenshot({ path: `${OUT}/density-picker.png` });
  });

  test('the graph at compact density', async ({ page }) => {
    await open(page);
    await openGraphSettings(page);
    await page.getByRole('button', { name: /^Compact/ }).click();
    await page.getByRole('link', { name: 'Graph' }).click();
    await expect(page.getByRole('grid')).toBeVisible();
    // Off the nav rail: it expands on hover, and the pointer is left sitting on
    // it by the click above — which puts a half-open rail over the sidebar in
    // a picture that is meant to be about row height.
    await page.mouse.move(900, 600);
    await settle(page);
    await page.screenshot({ path: `${OUT}/graph-compact.png` });
  });
});
