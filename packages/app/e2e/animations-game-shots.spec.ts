import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test, type Page } from '@playwright/test';

import { fixtures } from '../test-support/fixtures';
import { clickRailLink, type MockFixtures } from '../test-support/mock-bridge';
import { installMockBridge, prepareForVisualCapture } from './shots-helper';

/**
 * Playwright: "Use in a game" on the Animations detail pane (Phase 125 Theme G) — review shots only.
 *
 * Needs a real browser only to photograph the detail column in Studio's real Media shell; the section's
 * behaviour (import by library id, the attribution confirm, idempotence, no games) is vitest
 * (`use-in-game.test.tsx`, `asset-bridge.test.ts`). Named `-shots`, so it is not counted by the e2e budget.
 */
const SHOTS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../docs/screenshots/p125-g');

const data: MockFixtures = {
  ...fixtures,
  games: { list: [{ gameId: 'g1', name: 'Dungeon Crawl', path: '/Users/test/Midnite Games/dungeon-crawl', engine: 'three', dimension: '3d', starter: 'blank', dirty: false, valid: true, issue: null }] },
  media: {
    animations: [
      {
        id: 'cccccccccccc',
        name: 'Idle Breathing',
        tags: ['idle'],
        durationSec: 3.2,
        frameCount: 96,
        fps: 30,
        boneCount: 65,
        hasSkin: false,
        format: 'glb',
        source: 'sketchfab',
        licence: 'cc-by',
        author: 'Ana',
        site: 'sketchfab.com',
        originalUrl: 'https://sketchfab.com/3d-models/idle',
        sha256: 'c'.repeat(64),
        file: 'clips/cccccccccccc.glb',
        sizeBytes: 4096,
        addedAt: 1,
      },
    ],
  },
};

test.use({ viewport: { width: 1440, height: 900 }, contextOptions: { reducedMotion: 'reduce' } });

async function shoot(page: Page, name: string): Promise<void> {
  mkdirSync(SHOTS, { recursive: true });
  await prepareForVisualCapture(page);
  const shell = page.getByRole('tablist', { name: 'Media' }).locator('xpath=../../..');
  await shell.screenshot({ path: path.join(SHOTS, name) });
}

test('a clip is used in a game from the detail pane, its licence named in the confirm', async ({ page }) => {
  test.setTimeout(120_000);
  await installMockBridge(page, data);
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Media', exact: true })).toBeVisible({ timeout: 90_000 });
  await expect(async () => {
    await clickRailLink(page, 'Media');
    await page.getByRole('tab', { name: 'Animations' }).click();
    await expect(page.getByRole('list', { name: 'Animation clips' })).toBeVisible({ timeout: 500 });
  }).toPass({ timeout: 15_000 });

  await page.getByRole('button', { name: /Idle Breathing/ }).click();
  const section = page.getByRole('region', { name: 'Use in a game' });
  await expect(section.getByRole('button', { name: 'Use in this game' })).toBeVisible();
  await shoot(page, 'use-in-game.png');

  await section.getByRole('button', { name: 'Use in this game' }).click();
  const confirm = page.getByRole('dialog');
  await expect(confirm).toContainText('crediting Ana');
  await confirm.getByRole('button', { name: 'Import' }).click();
  await expect(section.getByRole('status')).toContainText('assets/animations/Idle-Breathing.glb');
  await shoot(page, 'imported.png');
});
