import { expect, test } from '@playwright/test';

import {
  clickRailLink,
  fixtures,
  installMockBridge,
  type MockFixtures,
  settle,
  SHOT_VIEWPORTS,
  shotPath,
} from './shots-helper';

/**
 * Phase 99 Theme A — the Media shell's PR screenshots (not assertions:
 * `media-view.bridge.test.tsx` owns those). Run with `MSTUDIO_SHOTS=1`.
 */
const OUT = '../../docs/screenshots/p99-a';

async function openMedia(page: import('@playwright/test').Page, data: MockFixtures): Promise<void> {
  await installMockBridge(page, data);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();
  await expect(async () => {
    await clickRailLink(page, 'Media');
    await expect(page.getByRole('tablist', { name: 'Media' })).toBeVisible({ timeout: 500 });
  }).toPass({ timeout: 5000 });
}

test.describe('media shell screenshots', () => {
  test.skip(!process.env.MSTUDIO_SHOTS, 'set MSTUDIO_SHOTS=1 to regenerate');
  test.use({ viewport: SHOT_VIEWPORTS.board });

  test('docs tab with a project', async ({ page }) => {
    await openMedia(page, {
      ...fixtures,
      media: { files: { 'doc:launch': { 'brief.md': '# Brief', 'notes/outline.md': '- a' }, 'doc:roadmap': {} } },
    });
    await page.getByRole('tab', { name: 'Docs' }).click();
    await page.getByText('brief', { exact: true }).click();
    await settle(page, 300);
    await page.screenshot({ path: shotPath(OUT, 'docs-tab.png') });
  });

  test('video tab through MediaLayout', async ({ page }) => {
    await openMedia(page, {
      ...fixtures,
      video: { projects: [{ id: 'showreel', title: 'COP31 showreel', valid: true, composition: 'Main' }] },
    });
    await page.getByRole('tab', { name: 'Video' }).click();
    await page.getByRole('button', { name: 'COP31 showreel' }).click();
    await settle(page, 300);
    await page.screenshot({ path: shotPath(OUT, 'video-tab.png') });
  });
});
