import { expect, test, type Page } from '@playwright/test';

import { fixtures } from '../test-support/fixtures';
import { clickRailLink, installMockBridge, type MockFixtures } from '../test-support/mock-bridge';

/**
 * The Search view (Phase 25 Theme C): commit pickaxe, `git grep` at any
 * revision, and a file-name filter, behind one query bar with mode tabs.
 *
 * **Four of this spec's original five tests moved to
 * `search-view.bridge.test.tsx` under jsdom** (Phase 82 Theme C, wave 1): the
 * truncated-results notice, the error state, the debounce/cancel race
 * (rewritten onto vitest fake timers), and the footer readout's
 * survive-navigation behaviour. This one test stays — its assertions are
 * entirely virtualized-row content (a commit subject, a grep hit's own path
 * and text, a filtered file name), and this codebase already has a
 * documented, verified finding that `@tanstack/react-virtual` rows do not
 * reliably render under jsdom: `projects-view.test.tsx`'s own comment says
 * so, and `search-view.bridge.test.tsx`'s header comment confirms it
 * empirically for this view too.
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

