// e2e-capability: getBoundingClientRect, pointer drag
import { expect, test, type Page } from '@playwright/test';

import { installSuiteBridge, STARTUP_FLEET_ANSWERS, SUITE_APP_URLS } from '../../test-support/suite-bridge';

/**
 * Startup's Projections view (Phase 150) and its bridge to Runway (Phase 152). Browser capability: the side panes' real widths under a pointer drag
 * (the clamps are `useResizable`'s, but only layout shows them applied) and the Recharts SVG's real paths.
 * jsdom reports every box as 0x0 and draws no chart. The send -> stale -> update test is a multi-view flow: it
 * crosses Projections and Runway through one live workspace, which the vitest suites only ever see one view of. Figures and copy are vitest in `packages/modules/startup`.
 */

const pageErrors: string[] = [];

test.beforeEach(() => {
  pageErrors.length = 0;
});
test.afterEach(() => {
  expect(pageErrors).toEqual([]);
});

async function open(page: Page, options: { statefulStartup?: boolean } = {}): Promise<void> {
  await installSuiteBridge(page, { frameless: true, answers: STARTUP_FLEET_ANSWERS, ...options });
  await page.setViewportSize({ width: 1440, height: 900 });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(SUITE_APP_URLS.startup);
  await expect(page.getByRole('main', { name: 'Projections' })).toBeVisible();
}

/** The pane a handle resizes: the list sits before its handle, the controls after theirs. */
const width = (page: Page, label: string) =>
  page.getByRole('separator', { name: label }).evaluate((h, before) => (before ? h.previousElementSibling! : h.nextElementSibling!).getBoundingClientRect().width, label === 'Resize projection list');

async function drag(page: Page, label: string, dx: number): Promise<void> {
  const box = (await page.getByRole('separator', { name: label }).boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + 100;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y, { steps: 6 });
  await page.mouse.up();
}

test.describe('Projections', () => {
  test('lands on Projections, not the company form, and draws a real chart', async ({ page }) => {
    await open(page);
    await expect(page.getByText('Set up your company')).toHaveCount(0);
    await expect(page.locator('[role="img"] svg path').first()).toBeVisible();
    expect(await page.locator('[role="img"] svg path').count()).toBeGreaterThan(0);
  });

  test('side panes clamp at their bounds and never collapse; Scale by keyboard moves Net margin', async ({ page }) => {
    await open(page);
    await drag(page, 'Resize projection list', -200);
    expect(await width(page, 'Resize projection list')).toBe(200);
    await drag(page, 'Resize projection list', 400);
    expect(await width(page, 'Resize projection list')).toBe(360);
    await drag(page, 'Resize controls', 300);
    expect(await width(page, 'Resize controls')).toBe(300);
    await drag(page, 'Resize controls', -300);
    expect(await width(page, 'Resize controls')).toBe(480);

    const tile = page.getByRole('group', { name: 'Net margin /mo' });
    const before = await tile.innerText();
    await page.locator('#g-scale').focus();
    for (let i = 0; i < 5; i += 1) await page.keyboard.press('ArrowRight');
    await expect(tile).not.toHaveText(before);
  });

  test('send to Runway, edit Scale, then update: Stale appears in both views and clears', async ({ page }) => {
    await open(page, { statefulStartup: true });
    const views = page.getByRole('complementary', { name: 'Views' });
    const stale = page.getByText('Stale', { exact: true });

    await page.getByRole('button', { name: 'Send to Runway' }).click();
    await page.getByRole('button', { name: 'Send lines' }).click();
    await expect(page.getByText(/Linked to Runway/)).toBeVisible();
    await views.locator('a[data-view="startup.runway"]').click();
    await expect(page.getByRole('button', { name: /From GPU cluster/ }).first()).toBeVisible();
    await expect(stale).toHaveCount(0);

    await views.locator('a[data-view="startup.projections"]').click();
    await page.locator('#g-scale').focus();
    for (let i = 0; i < 3; i += 1) await page.keyboard.press('ArrowRight');
    await expect(stale.first()).toBeVisible();
    await views.locator('a[data-view="startup.runway"]').click();
    await expect(stale.first()).toBeVisible();

    await views.locator('a[data-view="startup.projections"]').click();
    await page.getByRole('button', { name: 'Update Runway' }).click();
    await page.getByRole('button', { name: 'Update lines' }).click();
    await expect(page.getByText(/Linked to Runway/)).toBeVisible();
    await expect(stale).toHaveCount(0);
    await views.locator('a[data-view="startup.runway"]').click();
    await expect(stale).toHaveCount(0);
  });
});
