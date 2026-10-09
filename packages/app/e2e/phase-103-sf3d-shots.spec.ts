import { resolve } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { clickRailLink, fixtures, installMockBridge, type MockFixtures, settle, SHOT_VIEWPORTS, shotPath } from './shots-helper';

/** Phase 103 Theme J — SF3D tier screenshots for the PR (consent, install progress, installed + generate). Run with `MSTUDIO_SHOTS=1`. */
const OUT = '../../docs/screenshots/phase-103-sf3d';
// Specs run from packages/app (ESM: no __dirname).
const PICTURE = resolve(process.cwd(), '../desktop/resources/icon.png');

const data = (sf3d: NonNullable<MockFixtures['media']>['sf3d']): MockFixtures => ({
  ...fixtures,
  media: { files: { 'model:props': {} }, sf3d },
});

async function openSf3d(page: Page, fixture: MockFixtures) {
  await installMockBridge(page, fixture);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible({ timeout: 120_000 });
  await expect(async () => {
    await clickRailLink(page, 'Media');
    await page.getByRole('tab', { name: 'Models' }).click();
    await expect(page.getByRole('tab', { name: 'Models', selected: true })).toBeVisible({ timeout: 500 });
  }).toPass({ timeout: 5000 });
  await page.getByTestId('model-tier-sf3d').click();
  await expect(page.getByTestId('sf3d-panel')).toBeVisible({ timeout: 10_000 });
}

async function acceptLicence(page: Page) {
  await page.getByTestId('sf3d-setup').click();
  const dialog = page.getByTestId('sf3d-consent');
  await expect(dialog).toBeVisible();
  await page.getByTestId('sf3d-consent-read').check();
  await page.getByTestId('sf3d-consent-revenue').check();
}

test.describe('phase 103 SF3D screenshots', () => {
  test.skip(!process.env.MSTUDIO_SHOTS, 'set MSTUDIO_SHOTS=1 to regenerate');
  test.use({ viewport: SHOT_VIEWPORTS.wide });

  test('consent dialog shows the licence and the US$1M line', async ({ page }) => {
    test.setTimeout(150_000);
    await openSf3d(page, data({ state: 'not-installed' }));
    await expect(page.getByTestId('sf3d-state')).toHaveText('Not installed');
    await settle(page, 400);
    await page.screenshot({ path: shotPath(OUT, 'not-installed.png') });
    await acceptLicence(page);
    await expect(page.getByTestId('sf3d-revenue-note')).toContainText('US$1,000,000');
    await settle(page, 400);
    await page.screenshot({ path: shotPath(OUT, 'consent.png') });
  });

  test('install progress with cancel', async ({ page }) => {
    test.setTimeout(150_000);
    await openSf3d(page, data({ state: 'not-installed', hold: true, holdFraction: 0.42 }));
    await acceptLicence(page);
    await page.getByTestId('sf3d-consent-accept').click();
    await expect(page.getByTestId('sf3d-install-progress')).toBeVisible();
    await expect(page.getByRole('progressbar', { name: 'SF3D download' })).toHaveAttribute('aria-valuenow', '42');
    await settle(page, 400);
    await page.screenshot({ path: shotPath(OUT, 'install-progress.png') });
  });

  test('installed, with a picture attached and Generate ready', async ({ page }) => {
    test.setTimeout(150_000);
    // Consent through the dialog (the mock records the licence hash the app sends), then an instant install.
    await openSf3d(page, data({ state: 'not-installed' }));
    await acceptLicence(page);
    await page.getByTestId('sf3d-consent-accept').click();
    await expect(page.getByTestId('sf3d-state')).toHaveText('Installed', { timeout: 10_000 });
    const chooser = page.waitForEvent('filechooser');
    await page.getByTestId('sf3d-attach').click();
    await (await chooser).setFiles(PICTURE);
    await expect(page.getByTestId('sf3d-image')).toBeVisible();
    await expect(page.getByTestId('sf3d-generate')).toBeEnabled();
    await settle(page, 400);
    await page.screenshot({ path: shotPath(OUT, 'installed-generate.png') });
  });
});
