import { expect, test } from '@playwright/test';

import { fixtures } from '../test-support/fixtures';
import { installMockBridge, type MockFixtures } from '../test-support/mock-bridge';
import { setReducedMotion, settle, shotPath } from './shots-helper';

/**
 * Ad hoc: the nav rail (and other narrow sidebars/rails/lists) hide their
 * own scrollbar chrome — `scrollbar-width: none` + `::-webkit-scrollbar {
 * display: none }` — while staying scrollable by wheel, trackpad and
 * keyboard. A short viewport forces the rail past its own `scrollHeight`
 * (the same trick `nav-shell.spec.ts`'s overflow test uses) so the "before"
 * shot would otherwise show a visible track running the rail's full height.
 *
 * Run with `MSTUDIO_SHOTS=1`; skipped otherwise so the normal suite stays fast.
 */
const OUT = '../../docs/screenshots/adhoc-narrow-scrollbars';

test.skip(!process.env['MSTUDIO_SHOTS'], 'set MSTUDIO_SHOTS=1 to write screenshots');

test('the nav rail overflows with no visible scrollbar track', async ({ page }) => {
  await installMockBridge(page, fixtures satisfies MockFixtures);
  await page.setViewportSize({ width: 1280, height: 700 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();
  await setReducedMotion(page);

  const dashboard = page.getByRole('link', { name: 'Dashboard', exact: true });
  await dashboard.hover();
  const nav = page.getByRole('navigation', { name: 'Views' });
  await expect(nav).toBeVisible();

  const overflows = await dashboard.evaluate((link) => {
    const el = link.closest('nav');
    return el !== null && el.scrollHeight > el.clientHeight;
  });
  expect(overflows).toBe(true);

  await settle(page, 200);
  await page.screenshot({ path: shotPath(OUT, 'nav-rail-scrollbar-hidden') });
});
