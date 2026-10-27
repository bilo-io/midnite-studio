/**
 * forge-light — Coder ▸ Git Forge (Studio's Reviews view): the pull-request
 * list, then #950 with its CI still running (seven jobs green, e2e shard 4/4
 * running), the review conversation, and the files diff with inline threads.
 */
import { expect, test, type Page } from '@playwright/test';

import { installMockBridge } from '../../../../../../../packages/app/test-support/mock-bridge';
import { click, glide, glideTo, gotoView, placeCursor, preparePage, Recorder, settlePage, smoothScrollEl } from '../lib';
import { forgeFixture } from '../fixtures/forge';
import { roadmapFixtures } from '../fixtures/roadmap';

const PROBE = process.env['CAP_PROBE'];
const shot = async (page: Page, n: string) => {
  if (PROBE) await page.screenshot({ path: `${PROBE}/forge-${n}.png` });
};

async function open(page: Page): Promise<void> {
  await installMockBridge(page, roadmapFixtures({ forge: forgeFixture } as never), { cspGuard: false });
  await preparePage(page, { theme: 'light', ui: { forgeWritesEnabled: true } });
  await page.goto('/');
  await expect(page.getByRole('navigation', { name: 'Views' })).toBeVisible({ timeout: 30_000 });
  await expect(async () => {
    await gotoView(page, 'Reviews');
    await expect(page.getByTestId('reviews-groups')).toBeVisible({ timeout: 800 });
  }).toPass({ timeout: 8000 });
  const groups = page.getByTestId('reviews-groups');
  const all = groups.getByRole('button', { name: /All Pull Requests/ }).first();
  if ((await all.getAttribute('aria-expanded')) !== 'true') await all.click();
  await expect(groups.getByText(/fold gate-locale into gate-native/).first()).toBeVisible({ timeout: 10_000 });
  // Start on #952, so opening #950 on camera is a visible change.
  await groups.getByText(/consolidate gate-node/).first().click();
  await expect(page.getByRole('region', { name: 'Pull request #952' })).toBeVisible();
  await placeCursor(page, 820, 470);
  await settlePage(page, 900);
}

test('forge-light', async ({ page }) => {
  await open(page);
  await shot(page, '0');
  const rec = PROBE ? null : new Recorder(page, 'forge-light');
  await rec?.start();
  await page.waitForTimeout(650);

  const groups = page.getByTestId('reviews-groups');
  // List: Open ▸ All (merged ones fill in), then open #950.
  await glideTo(page, page.getByLabel('Pull request status').getByText('All', { exact: true }), 650);
  await click(page);
  await page.waitForTimeout(550);
  await glideTo(page, groups.getByText(/fold gate-locale into gate-native/).first(), 450, { x: 0.3, y: 0.5 });
  await click(page);
  const pr = page.getByRole('region', { name: 'Pull request #950' });
  await expect(pr).toBeVisible();
  await page.waitForTimeout(1300);
  await shot(page, '1');

  // Checks: the running run, then the running job.
  await glideTo(page, pr.getByRole('tab', { name: 'Checks' }), 550);
  await click(page);
  await expect(pr.getByRole('list', { name: 'Jobs' })).toBeVisible();
  await page.waitForTimeout(600);
  await smoothScrollEl(page, '[data-testid="actions-jobs-pane"]', 160, 450);
  await glideTo(page, pr.getByRole('list', { name: 'Jobs' }).getByText('e2e (4)').first(), 550, { x: 0.3, y: 0.5 });
  await click(page);
  await page.waitForTimeout(1200);
  await shot(page, '2');

  // Conversation.
  await glideTo(page, pr.getByRole('tab', { name: 'Conversation' }), 550);
  await click(page);
  await page.waitForTimeout(1500);
  await shot(page, '3');

  // Files, with the inline threads.
  await glideTo(page, pr.getByRole('tab', { name: 'Files' }), 500);
  await click(page);
  await expect(pr.getByText('shard: [1, 2]').first()).toBeVisible();
  await page.waitForTimeout(500);
  await shot(page, '4');
  await smoothScrollEl(page, '#pr-panel-files', 420, 900);
  await glide(page, 980, 560, 700);
  await page.waitForTimeout(900);
  await shot(page, '5');
  await rec?.stop();
});
