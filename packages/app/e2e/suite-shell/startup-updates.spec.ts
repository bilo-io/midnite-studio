// e2e-capability: multi-view flow, clipboard
import { expect, test } from '@playwright/test';

import { installSuiteBridge, STARTUP_UPDATES_ANSWERS, STARTUP_UPDATES_DRAFT, SUITE_APP_URLS } from '../../test-support/suite-bridge';

/**
 * Startup's Updates view (Phase 153 Theme E). A multi-view flow over one live workspace: Overview -> Updates, a draft
 * accepted into the editor, the saved text read back after leaving and returning, and Copy markdown reaching the real
 * clipboard (jsdom has none). Everything else about the view (diff, Cancel, read-only, truncation) is vitest in
 * `packages/modules/startup/renderer/updates`.
 */
test('draft with AI, accept, leave and return, then copy markdown', async ({ page, context }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await installSuiteBridge(page, { frameless: true, answers: STARTUP_UPDATES_ANSWERS, statefulStartup: true });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(SUITE_APP_URLS.startup);
  const views = page.getByRole('complementary', { name: 'Views' });

  await views.locator('a[data-view="startup.updates"]').click();
  await expect(page.getByRole('main', { name: 'Updates' })).toBeVisible();
  await page.getByRole('button', { name: 'Draft with AI' }).click();
  await expect(page.getByRole('region', { name: 'Draft for review' })).toBeVisible();
  await page.getByRole('button', { name: 'Accept' }).click();
  await expect(page.getByLabel('Update markdown')).toHaveValue(STARTUP_UPDATES_DRAFT);

  await views.locator('a[data-view="startup.overview"]').click();
  await views.locator('a[data-view="startup.updates"]').click();
  await expect(page.getByLabel('Update markdown')).toHaveValue(STARTUP_UPDATES_DRAFT);

  await page.getByRole('button', { name: 'Copy markdown' }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(STARTUP_UPDATES_DRAFT);
  expect(pageErrors).toEqual([]);
});
