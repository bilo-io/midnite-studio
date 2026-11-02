import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test, type Page } from '@playwright/test';

import { fixtures } from '../test-support/fixtures';
import { clickRailLink, type MockFixtures } from '../test-support/mock-bridge';
import { installMockBridge, prepareForVisualCapture } from './shots-helper';

/**
 * Playwright: Media ▸ Animations inside Studio's real Media shell (Phase 125 Themes A–C).
 *
 * Needs a real browser because the filters / list / detail columns are a flex layout: jsdom reports
 * every pane as 0×0, and the RTL suite (`animation-tab.test.tsx`) stubs `MediaLayout` into stacked
 * divs, so it cannot prove the three panes sit side by side or photograph the page. Search, tag
 * maths, rename and import are vitest. This spec proves the tab is wired into the shell, a tag
 * filter changes the rows, and a click fills the detail pane — and writes the three review shots.
 */
const SHOTS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../docs/screenshots/p125-abc');

const clip = (over: Record<string, unknown> & { id: string; name: string; tags: string[] }) => ({
  durationSec: 1,
  frameCount: 30,
  fps: 30,
  boneCount: 65,
  hasSkin: false,
  format: 'fbx',
  source: 'mixamo',
  licence: 'mixamo-eula',
  author: 'Adobe Mixamo',
  sha256: over.id.padEnd(64, 'a'),
  file: `clips/${over.id}.fbx`,
  sizeBytes: 4096,
  addedAt: 1_700_000_000_000,
  ...over,
});

const data: MockFixtures = {
  ...fixtures,
  media: {
    animations: [
      clip({ id: 'aaaaaaaaaaaa', name: 'Walking', tags: ['locomotion'], durationSec: 1.07, sizeBytes: 5000, addedAt: 3 }),
      clip({ id: 'bbbbbbbbbbbb', name: 'Sword Slash', tags: ['combat'], durationSec: 2.4, sizeBytes: 9000, addedAt: 1, hasSkin: true }),
      clip({
        id: 'cccccccccccc',
        name: 'Idle Breathing',
        tags: ['idle'],
        durationSec: null,
        source: 'sketchfab',
        licence: 'cc-by',
        author: 'Ana',
        site: 'sketchfab.com',
        originalUrl: 'https://sketchfab.com/3d-models/idle',
        format: 'glb',
        file: 'clips/cccccccccccc.glb',
        sizeBytes: 100,
        addedAt: 2,
      }),
      clip({ id: 'dddddddddddd', name: 'Run Forward', tags: ['locomotion', 'in-place'], durationSec: 0.8, sizeBytes: 3000, addedAt: 4 }),
    ],
  },
};

test.use({ viewport: { width: 1440, height: 900 }, contextOptions: { reducedMotion: 'reduce' } });

async function openAnimations(page: Page): Promise<void> {
  await installMockBridge(page, data);
  await page.goto('/');
  // `*-shots` closes the repos panel, so the Worktrees heading other specs wait on is not mounted.
  await expect(page.getByRole('link', { name: 'Media', exact: true })).toBeVisible({ timeout: 90_000 });
  await expect(async () => {
    await clickRailLink(page, 'Media');
    await page.getByRole('tab', { name: 'Animations' }).click();
    await expect(page.getByRole('list', { name: 'Animation clips' })).toBeVisible({ timeout: 500 });
  }).toPass({ timeout: 15_000 });
}

async function shoot(page: Page, name: string): Promise<void> {
  mkdirSync(SHOTS, { recursive: true });
  await prepareForVisualCapture(page);
  // tablist → strip wrapper → header row → the Media shell (header + the three panes).
  const shell = page.getByRole('tablist', { name: 'Media' }).locator('xpath=../../..');
  await shell.screenshot({ path: path.join(SHOTS, name) });
}

test('the library lists in the real three-pane shell, a tag filter narrows it, and a row opens its detail', async ({ page }) => {
  test.setTimeout(120_000);
  await openAnimations(page);

  await expect(page.getByText('4 of 4 clips')).toBeVisible();
  await expect(page.getByRole('button', { name: /Walking/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Sword Slash/ })).toBeVisible();
  const explorer = (await page.locator('[data-media-pane="explorer"]').boundingBox())!;
  const content = (await page.locator('[data-media-pane="content"]').boundingBox())!;
  const detail = (await page.locator('[data-media-pane="detail"]').boundingBox())!;
  expect(explorer.width).toBeGreaterThan(100);
  expect(content.width).toBeGreaterThan(200);
  expect(detail.width).toBeGreaterThan(100);
  expect(explorer.x).toBeLessThan(content.x);
  expect(content.x).toBeLessThan(detail.x);
  await shoot(page, 'list.png');

  await page.getByRole('list', { name: 'Filter by tag' }).getByRole('button', { name: /^combat/ }).click();
  await expect(page.getByText('1 of 4 clips')).toBeVisible();
  await expect(page.getByRole('button', { name: /Sword Slash/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Walking/ })).toHaveCount(0);
  await shoot(page, 'filter.png');

  await page.getByRole('button', { name: /Sword Slash/ }).click();
  await expect(page.getByLabel('Clip name')).toHaveValue('Sword Slash');
  await expect(page.getByLabel('Author')).toHaveValue('Adobe Mixamo');
  await expect(page.getByText('With mesh and skin')).toBeVisible();
  await shoot(page, 'detail.png');
});
