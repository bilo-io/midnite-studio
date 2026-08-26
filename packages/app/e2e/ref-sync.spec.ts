import { expect, test, type Locator, type Page } from '@playwright/test';

import { installMockBridge, type MockFixtures } from './mock-bridge';

/**
 * Phase 12 Theme C + F: the ref chip as a control, and the row polish around it.
 *
 * The enablement rules themselves are unit-tested in `ref-sync.test.ts`; what
 * needs a browser is everything those rules are useless without — that the
 * hover strip actually appears, that clicking it reaches the right git op with
 * the right scope, that a disabled control still explains itself, and that
 * expanding it does not shove the row's other columns sideways.
 *
 * The reflow assertion is the one worth spelling out: an overlay that reflows
 * looks fine in a screenshot and is intolerable in use, because the subject you
 * were reading jumps as the pointer crosses a chip two columns away.
 */
const sha = (i: number) => `${i}`.padStart(40, 'b');

const commit = (i: number, parents: string[], subject: string) => ({
  sha: sha(i),
  parents,
  authorName: 'Ada Lovelace',
  authorEmail: 'ada@example.com',
  authorDate: 1_787_000_000 - i * 3600,
  committerDate: 1_787_000_000 - i * 3600,
  subject,
  refs: [],
});

const row = (i: number, parents: string[], subject: string) => ({
  row: i,
  commit: commit(i, parents, subject),
  lane: 0,
  laneCount: 1,
  colorIdx: 0,
  edges:
    parents.length > 0
      ? [{ type: 'straight' as const, fromLane: 0, toLane: 0, colorIdx: 0 }]
      : [],
});

/**
 * `main` diverged, `feature/ahead` ahead only, `feature/behind` behind only,
 * and `feature/solo` with no upstream at all — the four states the theme has to
 * tell apart, one per row so no two chips can be confused for each other.
 */
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
    name: 'feature/ahead',
    fullName: 'refs/heads/feature/ahead',
    kind: 'localBranch',
    sha: sha(2),
    isHead: false,
    worktreePath: null,
    upstream: { name: 'origin/feature/ahead', ahead: 3, behind: 0, gone: false },
  },
  {
    name: 'feature/behind',
    fullName: 'refs/heads/feature/behind',
    kind: 'localBranch',
    sha: sha(4),
    isHead: false,
    worktreePath: null,
    upstream: { name: 'origin/feature/behind', ahead: 0, behind: 4, gone: false },
  },
  {
    name: 'feature/solo',
    fullName: 'refs/heads/feature/solo',
    kind: 'localBranch',
    sha: sha(6),
    isHead: false,
    worktreePath: null,
    upstream: null,
  },
];

const FIXTURES: MockFixtures = {
  commitDetail: { sha: sha(0), body: '', stat: '', files: [] },
  diffs: {},
  graphRows: [
    row(0, [sha(1)], 'the tip'),
    row(1, [sha(2)], 'filler'),
    row(2, [sha(3)], 'ahead only'),
    row(3, [sha(4)], 'filler'),
    row(4, [sha(5)], 'behind only'),
    row(5, [sha(6)], 'filler'),
    row(6, [], 'no upstream'),
  ],
  refs: REFS,
  remotes: [
    {
      name: 'origin',
      fetchUrl: 'https://github.com/bilo-io/midnite-git.git',
      pushUrl: 'https://github.com/bilo-io/midnite-git.git',
      forge: {
        host: 'github.com',
        owner: 'bilo-io',
        repo: 'midnite-git',
        kind: 'github',
      },
    },
  ],
  statusEntries: [],
};

/** One modified file — enough to raise the pseudo-row, singular in its label. */
const DIRTY_ONE: MockFixtures['statusEntries'] = [
  {
    path: 'packages/app/src/features/graph/ref-badge.tsx',
    origPath: null,
    staged: 'modified',
    unstaged: 'unmodified',
    conflicted: false,
    similarity: null,
  },
];

const withStatus = (entries: MockFixtures['statusEntries']): MockFixtures => ({
  ...FIXTURES,
  statusEntries: entries,
});

/**
 * An element's x once the layout has stopped moving.
 *
 * Waiting for the chip to appear is not enough. The gutter's width is derived
 * from the widest `laneCount` in the streamed rows and then re-clamped against
 * the persisted column width, so the subject column keeps shifting for a beat
 * after the first paint — by ~13px in this fixture. A baseline taken during
 * that window makes the settling look like the hover's doing, which is exactly
 * the wrong conclusion for a test whose whole subject is reflow.
 */
async function stableX(locator: Locator): Promise<number> {
  let last = Number.NaN;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const box = await locator.boundingBox();
    const x = box?.x ?? Number.NaN;
    if (x === last) return x;
    last = x;
    await locator.page().waitForTimeout(50);
  }
  throw new Error('layout never settled');
}

async function openGraph(page: Page, fixtures: MockFixtures = FIXTURES) {
  await installMockBridge(page, fixtures);
  await page.goto('/');
  await expect(page.getByRole('row').first()).toBeVisible();
}

/**
 * The chip carrying a branch name, IN THE GRAPH.
 *
 * Scoped to the grid deliberately: the repositories sidebar lists the same four
 * branches, so an unscoped locator resolves to the sidebar's copy and every
 * hover in this file would act on the wrong element — while still finding
 * something, which is the failure mode that wastes the most time.
 */
const chip = (page: Page, name: string) =>
  page.getByRole('grid').getByRole('button', { name: new RegExp(`^${name}\\b`) }).first();

/**
 * The hover strip for one branch.
 *
 * Located by its group name rather than by position in the tree: the strip is
 * portalled to <body> to escape the BRANCH / TAG cell's `overflow-hidden`, so
 * it is not a descendant of the grid at all.
 *
 * Naming the group is also what makes the negative assertions meaningful. The
 * title bar and the repositories sidebar each carry their own Fetch/Pull/Push
 * cluster, so an unscoped `toHaveCount(0)` for /^Pull/ could never pass however
 * correct the badge was — and a grid-scoped one now passes however BROKEN it
 * is, since the strip lives outside the grid.
 */
const strip = (page: Page, branch: string) =>
  page.getByRole('group', { name: `Sync ${branch}` });

const syncButton = (page: Page, branch: string, name: string | RegExp) =>
  strip(page, branch).getByRole('button', { name });

test.describe('ref badge sync controls', () => {
  test('a diverged branch expands into both a pull and a push', async ({ page }) => {
    await openGraph(page);

    // Nothing before the hover — the strip is an affordance, not decoration.
    await expect(syncButton(page, 'main', /^Push 2 commits/)).toHaveCount(0);

    await chip(page, 'main').hover();

    await expect(syncButton(page, 'main', 'Pull 5 commits from origin/main')).toBeVisible();
    await expect(syncButton(page, 'main', 'Push 2 commits to origin/main')).toBeVisible();
  });

  test('an in-sync-in-one-direction branch offers only the verb it needs', async ({ page }) => {
    await openGraph(page);

    await chip(page, 'feature/ahead').hover();
    await expect(
      syncButton(page, 'feature/ahead', 'Push 3 commits to origin/feature/ahead'),
    ).toBeVisible();
    // Nothing to pull, so no pull button — an always-present pair would make
    // the counts on the chip pointless.
    await expect(syncButton(page, 'feature/ahead', /^Pull/)).toHaveCount(0);
  });

  test('a branch with no upstream never expands', async ({ page }) => {
    await openGraph(page);
    await chip(page, 'feature/solo').hover();
    // Publishing lives in the context menu: there is no count for the chip to
    // expand FROM, and a strip that appears on every branch is just clutter.
    await expect(strip(page, 'feature/solo')).toHaveCount(0);
  });

  test('pushing from the chip reaches git scoped to that branch', async ({ page }) => {
    await openGraph(page);

    await chip(page, 'feature/ahead').hover();
    await syncButton(page, 'feature/ahead', 'Push 3 commits to origin/feature/ahead').click();

    const ops = await page.evaluate(() => (window as never as { __mgitOps: unknown[] }).__mgitOps);
    expect(ops).toContainEqual(
      expect.objectContaining({
        op: 'push',
        // The scope is the whole point: pushing HEAD when the user clicked ↑ on
        // a branch three rows down is the failure this test exists to catch.
        args: expect.objectContaining({ branch: 'feature/ahead', remote: 'origin' }),
      }),
    );
  });

  test('a pull you cannot run stays visible and says why', async ({ page }) => {
    await openGraph(page);

    // `feature/behind` is behind but is not checked out, so the count on the
    // chip is real and the action is not available. Hiding the button would
    // leave the ↓4 unexplained.
    await chip(page, 'feature/behind').hover();
    const pull = syncButton(page, 'feature/behind', /^Pull 4 commits/);
    await expect(pull).toBeVisible();
    await expect(pull).toHaveAttribute('aria-disabled', 'true');

    // `force`, because an aria-disabled button is deliberately still hoverable
    // and focusable (that is how it carries its reason) and Playwright's
    // actionability check would otherwise refuse to click it. The point of the
    // click is that the HANDLER is inert, not that the element is unreachable.
    await pull.click({ force: true });
    const ops = await page.evaluate(() => (window as never as { __mgitOps: unknown[] }).__mgitOps);
    expect(ops.filter((op) => (op as { op: string }).op === 'pull')).toHaveLength(0);
  });

  test('expanding the strip does not move anything else in the row', async ({ page }) => {
    await openGraph(page);

    const subject = page.getByText('the tip', { exact: true });
    await expect(chip(page, 'main')).toBeVisible();
    const before = await stableX(subject);

    await chip(page, 'main').hover();
    await expect(syncButton(page, 'main', /^Push 2 commits/)).toBeVisible();

    /*
      Exactly equal, now that the baseline is a settled one. The bug this guards
      against moved the subject 4.4px: the strip was an in-flow sibling inside
      the BRANCH / TAG cell, which also meant `overflow-hidden` was clipping it
      out of sight while it still satisfied `toBeVisible()`.
    */
    expect(await stableX(subject)).toBe(before);
  });

  test('the context menu carries the same verbs, plus the ones with no count', async ({ page }) => {
    await openGraph(page);

    await chip(page, 'feature/solo').click({ button: 'right' });
    // The no-upstream case the chip cannot express.
    await expect(
      page.getByRole('menuitem', { name: 'Publish feature/solo to origin (sets upstream)' }),
    ).toBeVisible();
  });
});

test.describe('graph row polish', () => {
  test('the selected row is marked by more than a tint', async ({ page }) => {
    await openGraph(page);

    const first = page.getByRole('row').filter({ hasText: 'the tip' }).first();
    await first.click();
    await expect(first).toHaveAttribute('aria-selected', 'true');

    // The accent bar: a 3px full-height child at the row's left edge. Asserted
    // structurally rather than by colour, because the colour is the row's lane
    // hue and changes with the palette.
    const bar = first.locator('span[aria-hidden].absolute.inset-y-0.left-0');
    await expect(bar).toHaveCount(1);
  });

  test('uncommitted work appears as a row above the first commit', async ({ page }) => {
    await openGraph(
      page,
      withStatus([
        {
          path: 'packages/app/src/features/graph/ref-badge.tsx',
          origPath: null,
          staged: 'modified',
          unstaged: 'unmodified',
          conflicted: false,
          similarity: null,
        },
        {
          path: 'packages/app/src/features/graph/graph-row.tsx',
          origPath: null,
          staged: 'unmodified',
          unstaged: 'modified',
          conflicted: false,
          similarity: null,
        },
      ]),
    );

    // A button, not a row: it sits above the grid and there is nothing on it to
    // select, only somewhere to go.
    const working = page.getByRole('button', { name: /^2 uncommitted changes/ });
    await expect(working).toBeVisible();

    // Above the tip, not merely present somewhere in the list.
    const workingBox = await working.boundingBox();
    const tipBox = await page.getByText('the tip', { exact: true }).boundingBox();
    expect(workingBox!.y).toBeLessThan(tipBox!.y);
  });

  test('a clean worktree gets no pseudo-row at all', async ({ page }) => {
    await openGraph(page);
    await expect(page.getByRole('button', { name: /uncommitted change/ })).toHaveCount(0);
  });

  test('the working-copy row opens the Changes view and selects nothing', async ({ page }) => {
    await openGraph(page, withStatus(DIRTY_ONE));
    // It must not announce a selection it does not have — which it did while
    // "selected" was tied to `selectedCommitSha === null`, i.e. to the state
    // every repo switch starts in.
    const working = page.getByRole('button', { name: /^1 uncommitted change\b/ });
    await expect(working).not.toHaveAttribute('aria-selected', /.*/);

    await working.click();
    await expect(page.getByRole('grid')).toHaveCount(0);
  });
});
