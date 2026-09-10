import { expect, test, type Page } from '@playwright/test';

import { installShotsBridge, prepareForVisualCapture, setTheme } from './shots-helper';

/**
 * The breadcrumb repo switcher's new opt-in filter box (ad hoc task, not a
 * `.midnite/tasks/` phase — see docs/screenshots/adhoc-repo-crumb-search/).
 *
 * `ContextMenu`'s `filterThreshold` defaults to 6 selectable rows, and the
 * switcher's own list is `others` — every open repo *except* the current one
 * (see `title-bar-nav.tsx`) — so seven extra repos is exactly one past the
 * point the search box starts rendering at all. Fewer than that and this
 * screenshot would show the plain, unfiltered menu every other `openMenu`
 * call site still gets.
 *
 * Run with `MSTUDIO_SHOTS=1`; skipped otherwise, matching every other
 * `*-shots.spec.ts` in this suite.
 */
const OUT = '../../docs/screenshots/adhoc-repo-crumb-search';

const EXTRA_REPOS = Array.from({ length: 7 }, (_, i) => ({
  id: `repo-${i + 2}`,
  name: `sibling-project-${i + 1}`,
  path: `/tmp/sibling-project-${i + 1}`,
}));

async function openSwitcherFiltered(page: Page): Promise<void> {
  await installShotsBridge(page, { extraRepos: EXTRA_REPOS });
  await page.goto('/');
  // Scoped to the breadcrumb nav — plenty of other controls in the sidebar
  // and title bar share the repo name as part of their own accessible name.
  const crumb = page.getByLabel('Location').getByRole('button', { name: 'midnite-studio' });
  await expect(crumb).toBeVisible();

  await crumb.click();
  const box = page.getByPlaceholder('Find a repo…');
  await expect(box).toBeVisible();
  // Narrows an 8-repo menu down to two matches, so the shot shows the box
  // actually doing its job rather than a static, unfiltered list.
  await box.fill('sibling-project-3');
}

test.describe('Breadcrumb repo switcher — filter box', () => {
  test.skip(!process.env['MSTUDIO_SHOTS'], 'set MSTUDIO_SHOTS=1 to write screenshots');

  test('filtering an 8-repo switcher, light', async ({ page }) => {
    await openSwitcherFiltered(page);
    await setTheme(page, 'light', { settleMs: 200 });
    await prepareForVisualCapture(page);
    await page.getByRole('menu').screenshot({ path: `${OUT}/repo-switcher-filter-light.png` });
  });

  test('filtering an 8-repo switcher, dark', async ({ page }) => {
    await openSwitcherFiltered(page);
    await setTheme(page, 'dark', { settleMs: 200 });
    await prepareForVisualCapture(page);
    await page.getByRole('menu').screenshot({ path: `${OUT}/repo-switcher-filter-dark.png` });
  });
});
