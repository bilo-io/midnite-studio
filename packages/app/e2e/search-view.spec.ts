import { expect, test, type Page } from '@playwright/test';

import { fixtures } from './fixtures';
import { clickRailLink, installMockBridge, type MockFixtures } from './mock-bridge';

/**
 * The Search view (Phase 25 Theme C): commit pickaxe, `git grep` at any
 * revision, and a file-name filter, behind one query bar with mode tabs.
 */

const COMMIT_HIT = {
  sha: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
  parents: [],
  subject: 'fix(search): cancel the previous request',
  authorName: 'Alice',
  authorEmail: 'alice@example.com',
  authorDate: 1_700_000_000,
  committerDate: 1_700_000_000,
  refs: [],
};

const CONTENT_HIT = {
  path: 'src/index.ts',
  line: 10,
  kind: 'match',
  text: 'export const foo = 1;',
};

async function openSearch(
  page: Page,
  search: MockFixtures['search'],
  extra: Partial<MockFixtures> = {},
) {
  await installMockBridge(page, { ...fixtures, ...extra, search });
  await page.goto('/');
  await clickRailLink(page, 'Search');
  await expect(page.getByRole('button', { name: 'commits', exact: true })).toBeVisible();
}

test('each mode returns and renders its own results', async ({ page }) => {
  await openSearch(
    page,
    { commits: [COMMIT_HIT], contentHits: [CONTENT_HIT] },
    {
      fsListFilesResult: { ok: true, files: ['src/index.ts', 'README.md'], truncated: false },
      // The first content hit auto-selects into the preview pane, so it
      // needs a real fixture — without one the pane renders "no fixture for
      // …", which itself contains the path substring and makes every path
      // assertion below ambiguous.
      fsFiles: {
        'repo:src/index.ts': { kind: 'text', content: 'export const foo = 1;\n', size: 23 },
      },
    },
  );

  // Commits — the default tab.
  await page.getByRole('textbox', { name: 'Commit message grep' }).fill('cancel');
  await expect(page.getByText(COMMIT_HIT.subject)).toBeVisible();

  // Content. The first hit auto-selects into the preview pane too, so both
  // the path and its text render twice (list row + preview) — `.first()`
  // is enough here; this test only needs to know each mode renders at all.
  await page.getByRole('button', { name: 'content', exact: true }).click();
  await page.getByRole('textbox', { name: 'Pattern to grep' }).fill('foo');
  await expect(page.getByText(CONTENT_HIT.path).first()).toBeVisible();
  await expect(page.getByText(CONTENT_HIT.text).first()).toBeVisible();

  // Files — no bridge search call at all, just `fs.listFiles` filtered client-side.
  await page.getByRole('button', { name: 'files', exact: true }).click();
  await page.getByRole('textbox', { name: 'Filter files' }).fill('index');
  await expect(page.getByText('src/index.ts').first()).toBeVisible();
});

test('a truncated result set says so', async ({ page }) => {
  await openSearch(page, { contentHits: [CONTENT_HIT], truncated: true });

  await page.getByRole('button', { name: 'content', exact: true }).click();
  await page.getByRole('textbox', { name: 'Pattern to grep' }).fill('foo');
  await expect(page.getByText(/capped at 5,000/)).toBeVisible();
});

test('an invalid pattern surfaces the error state, not an empty list', async ({ page }) => {
  await openSearch(page, { contentHits: [], error: 'fatal: bad pattern' });

  await page.getByRole('button', { name: 'content', exact: true }).click();
  await page.getByRole('textbox', { name: 'Pattern to grep' }).fill('(unterminated');
  await expect(page.getByText('fatal: bad pattern')).toBeVisible();
});

test('a second query cancels the first rather than letting it run to completion', async ({
  page,
}) => {
  // Long enough that changing the query well inside the window still finds
  // the first request's mock timer pending — short enough the test does not
  // drag. 250ms is `DEBOUNCE_MS`; every margin below is at least that wide.
  await openSearch(page, { contentHits: [CONTENT_HIT], delayMs: 800 });

  await page.getByRole('button', { name: 'content', exact: true }).click();
  const pattern = page.getByRole('textbox', { name: 'Pattern to grep' });

  await pattern.fill('aaa');
  // Past the 250ms debounce: the first `search.start` has fired and is
  // sitting in its 800ms mock delay, not yet resolved.
  await page.waitForTimeout(400);
  await expect(page.getByTestId('status-segment-search-progress')).toBeVisible();

  await pattern.fill('bbb');
  // Past the second debounce: `use-search.ts` must cancel the first
  // request's id before starting the second.
  await page.waitForTimeout(400);

  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __mstudioSearchCancels: string[] }).__mstudioSearchCancels.length,
      ),
    )
    .toBe(1);

  // The cancelled request's mock timer was cleared, so only the second
  // request's batch ever lands — the count is not doubled.
  await expect(page.getByText(/^1 match$/)).toBeVisible({ timeout: 2000 });
});

test('the footer readout survives navigation, reopens Search on click, and its Stop button cancels in place', async ({
  page,
}) => {
  await openSearch(page, { contentHits: [CONTENT_HIT], delayMs: 600 });

  await page.getByRole('button', { name: 'content', exact: true }).click();
  await page.getByRole('textbox', { name: 'Pattern to grep' }).fill('foo');

  const readout = page.getByTestId('status-segment-search-progress');
  await expect(readout).toBeVisible();
  await expect(readout).toContainText('Searching content');

  // `inFlight` lives in the zustand store, not in the Search view's own
  // component tree, so the readout keeps tracking it after the view that
  // started the search unmounts.
  await clickRailLink(page, 'Graph');
  await expect(readout).toBeVisible();

  // Clicking the label half reopens the Search view without touching the
  // in-flight search.
  await readout.getByRole('button', { name: /go to Search/ }).click();
  await expect(page.getByRole('button', { name: 'content', exact: true })).toBeVisible();
  await expect(readout).toBeVisible();

  // The trailing Stop button cancels without navigating.
  await clickRailLink(page, 'Graph');
  await page.getByRole('button', { name: 'Stop search' }).click();
  await expect(readout).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __mstudioSearchCancels: string[] }).__mstudioSearchCancels.length,
      ),
    )
    .toBeGreaterThan(0);
});
