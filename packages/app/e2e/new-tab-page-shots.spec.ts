import { expect, test, type Page } from '@playwright/test';

import { installShotsBridge, settle, setTheme } from './shots-helper';

/**
 * The committed screenshots Phase 32 Theme F's own Verification checklist
 * asks for: the new-tab page in both themes, and at the browser pane's
 * narrowest usable side-by-side width (320px — `ui-store`'s `browserWidth`
 * min) rather than a guess at where the tile grid's `flex-wrap` reflow
 * actually kicks in.
 *
 * `layout.browserWidth` is seeded directly into `midnite-studio.ui`'s
 * persisted blob rather than dragged into place through the real splitter:
 * a real drag needs the exact handle geometry and is one more flaky
 * pointer-move sequence for a screenshot spec that only cares about the
 * RESULT of being narrow, not the gesture that got there. Every other
 * `LayoutSizes` field is carried at its real default so nothing else on the
 * page renders at a bogus size.
 *
 * Density (comfortable/compact) is deliberately not a second axis here:
 * `appearance-store.ts` persists through `sharedSettingsStorage`, a
 * shell-owned serialisation this suite has no committed helper for yet, and
 * guessing its shape risks a spec that silently seeds nothing rather than
 * one that fails loudly. Toggling it through Settings ▸ Appearance instead
 * is the honest way to add that axis later.
 *
 * Run with `MSTUDIO_SHOTS=1`; skipped otherwise, matching every other
 * `*-shots.spec.ts` in this suite.
 */
const OUT = '../../docs/screenshots/p32-ef-new-tab-page';

const DEFAULT_LAYOUT_JSON = {
  reposWidth: 312,
  terminalHeight: 288,
  terminalListWidth: 176,
  detailWidth: 384,
  changesListWidth: 384,
  filesTreeWidth: 320,
  commitFilesHeight: 200,
  actionsJobsHeight: 200,
  actionsListWidth: 360,
  testsListWidth: 320,
  reviewsListWidth: 380,
  issuesListWidth: 360,
  sessionsListWidth: 360,
  searchResultsWidth: 420,
  fabPanelWidth: 320,
  browserWidth: 320,
  councilNavWidth: 260,
  councilConfigWidth: 320,
  apiTreeWidth: 320,
  apiBuilderHeight: 260,
};

/** Seeds the pane open, side-by-side, at the 320px minimum width — before `goto`, so it hydrates on first paint. */
async function seedNarrowSideBySide(page: Page): Promise<void> {
  await page.addInitScript(
    (layout) => {
      window.localStorage.setItem(
        'midnite-studio.ui',
        JSON.stringify({
          state: { browserOpen: true, browserLayout: 'left', reposOpen: false, layout },
          version: 11,
        }),
      );
    },
    DEFAULT_LAYOUT_JSON,
  );
}

async function openFullScreenNewTab(page: Page): Promise<void> {
  await installShotsBridge(page);
  await page.goto('/');
  await expect(page.getByRole('columnheader', { name: 'Commit message' })).toBeVisible();
  await page.locator('[data-testid="browser-toggle"]').click();
  await expect(page.getByTestId('browser-launcher')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('browser-newtab')).toBeVisible();
}

test.describe('new-tab page screenshots (Phase 32 Theme F)', () => {
  test.skip(!process.env.MSTUDIO_SHOTS, 'set MSTUDIO_SHOTS=1 to regenerate');

  test('full screen, light', async ({ page }) => {
    await openFullScreenNewTab(page);
    await settle(page);
    await page.getByTestId('browser-newtab').screenshot({ path: `${OUT}/full-light.png` });
  });

  test('full screen, dark', async ({ page }) => {
    await setTheme(page, 'dark');
    await openFullScreenNewTab(page);
    await page.evaluate(() => document.documentElement.classList.add('dark'));
    await settle(page, 400);
    await page.getByTestId('browser-newtab').screenshot({ path: `${OUT}/full-dark.png` });
  });

  test('320px side-by-side — the tile grid reflows, no horizontal scrollbar', async ({ page }) => {
    await seedNarrowSideBySide(page);
    await installShotsBridge(page);
    await page.goto('/');
    const newtab = page.getByTestId('browser-newtab');
    await expect(newtab).toBeVisible();
    await settle(page);

    // The actual failure mode this width guards against: a horizontal
    // scrollbar on the page itself would mean the grid overflowed rather
    // than wrapped.
    const overflowsX = await newtab.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
    expect(overflowsX).toBe(false);

    await newtab.screenshot({ path: `${OUT}/side-by-side-320.png` });
  });
});
