import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test, type Page } from '@playwright/test';

import { fixtures } from '../test-support/fixtures';
import { clickRailLink, type MockFixtures } from '../test-support/mock-bridge';
import { installMockBridge, prepareForVisualCapture } from './shots-helper';

/**
 * Playwright: Media ▸ Animations ▸ Sketchfab (Phase 125 Theme E) — review shots only, over a MOCKED bridge.
 *
 * Needs a real browser only to photograph the panel inside Studio's real Media shell; the behaviour (token
 * prompt, licence ticks, paging, download, cancel) is vitest (`sketchfab-panel.test.tsx`). Nothing here is a
 * real token or a real Sketchfab result — the models are made up. Named `-shots`, so the e2e budget skips it.
 */
const SHOTS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../docs/screenshots/p125-e');

const thumb = (hue: number) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="160" height="96"><rect width="160" height="96" fill="hsl(${hue} 35% 30%)"/><circle cx="80" cy="42" r="18" fill="hsl(${hue} 40% 60%)"/><rect x="58" y="62" width="44" height="26" rx="8" fill="hsl(${hue} 40% 60%)"/></svg>`)}`;

const model = (n: number, name: string, author: string, licence: 'cc0' | 'cc-by' | 'cc-by-sa', animationCount: number, faceCount: number) => ({
  uid: String(n).repeat(32),
  name,
  author,
  licence,
  viewUrl: `https://sketchfab.com/3d-models/mock-${String(n).repeat(32)}`,
  thumbnailUrl: thumb(n * 40),
  animationCount,
  faceCount,
});

const results = [
  model(1, 'Low-poly knight walk cycle', 'Example Author', 'cc-by', 3, 4200),
  model(2, 'Chicken walk', 'Another Author', 'cc-by', 1, 1556),
  model(3, 'Stylised runner', 'Third Author', 'cc-by-sa', 2, 9800),
  model(4, 'Zombie shamble', 'Fourth Author', 'cc0', 4, 12000),
];

const withSketchfab = (sketchfab: NonNullable<NonNullable<MockFixtures['media']>['sketchfab']>): MockFixtures => ({ ...fixtures, media: { animations: [], sketchfab } });

test.use({ viewport: { width: 1440, height: 900 }, contextOptions: { reducedMotion: 'reduce' } });

async function openSketchfab(page: Page, data: MockFixtures): Promise<void> {
  await installMockBridge(page, data);
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Media', exact: true })).toBeVisible({ timeout: 90_000 });
  await expect(async () => {
    await clickRailLink(page, 'Media');
    await page.getByRole('tab', { name: 'Animations' }).click();
    await expect(page.getByRole('group', { name: 'Clip source' })).toBeVisible({ timeout: 500 });
  }).toPass({ timeout: 15_000 });
  await page.getByRole('group', { name: 'Clip source' }).getByRole('button', { name: 'Sketchfab' }).click();
}

async function shoot(page: Page, name: string): Promise<void> {
  mkdirSync(SHOTS, { recursive: true });
  await prepareForVisualCapture(page);
  const shell = page.getByRole('tablist', { name: 'Media' }).locator('xpath=../../..');
  await shell.screenshot({ path: path.join(SHOTS, name) });
}

test('with no token the tab asks for one; with a token it searches and downloads into the library', async ({ page }) => {
  test.setTimeout(120_000);
  await openSketchfab(page, withSketchfab({ hasToken: false, results }));
  await expect(page.getByTestId('sketchfab-token-prompt')).toBeVisible();
  await expect(page.getByLabel('Sketchfab API token')).toHaveAttribute('type', 'password');
  await shoot(page, 'no-token.png');

  // Pasting a (made-up) value flips the tab into search; the value is not kept anywhere on the page.
  await page.getByLabel('Sketchfab API token').fill('not-a-real-token');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('searchbox', { name: 'Search Sketchfab' })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search Sketchfab' }).fill('walk');
  await page.getByRole('button', { name: /^Search$/ }).click();
  const list = page.getByRole('list', { name: 'Sketchfab results' });
  await expect(list.getByRole('listitem')).toHaveCount(4);
  await shoot(page, 'results.png');

  await list.getByRole('button', { name: 'Download Chicken walk' }).click();
  await expect(list.getByText('In library')).toBeVisible();
  await shoot(page, 'downloaded.png');
});
