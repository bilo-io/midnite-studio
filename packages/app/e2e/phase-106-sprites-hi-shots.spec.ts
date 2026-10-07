import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { clickRailLink, fixtures, installMockBridge, type MockFixtures, setTheme, settle, SHOT_VIEWPORTS, shotPath } from './shots-helper';

/**
 * Phase 106 Themes H + I screenshots for the PR: the Environment form (terrains, transitions,
 * autotiling), a generated tileset, the parallax stage and the props. The pictures are the real kernel
 * output rendered by `environment-shots.test.ts` into `MSTUDIO_SHOTS_ASSETS` and swapped in for the
 * `mstudio-file://` URLs the mock bridge cannot serve. Run with `MSTUDIO_SHOTS=1`; skipped otherwise.
 * Behaviour is covered in vitest (`sprite-environment.bridge.test.tsx`).
 */
const OUT = '../../docs/screenshots/phase-106-sprites-hi';
const ASSETS = process.env['MSTUDIO_SHOTS_ASSETS'] ?? '';

test.skip(!process.env['MSTUDIO_SHOTS'] || !ASSETS, 'set MSTUDIO_SHOTS=1 and MSTUDIO_SHOTS_ASSETS to write screenshots');
test.describe.configure({ timeout: 90_000 });
test.use({ viewport: SHOT_VIEWPORTS.wide });

const uri = (file: string): string => `data:image/png;base64,${readFileSync(join(ASSETS, file)).toString('base64')}`;
const report = { frames: 4, failing: 0, at: '2026-10-07T10:00:00.000Z' };

const data: MockFixtures = {
  ...fixtures,
  media: {
    files: {
      'sprite:tilesets': {
        'meadow-20261007-120000/sprite.json': JSON.stringify({
          version: 1,
          kind: 'tileset',
          name: 'Meadow',
          prompt: 'A temperate meadow with a stream',
          style: 'pixel',
          tileSize: 32,
          scheme: 'blob47',
          terrains: [
            { id: 'grass', label: 'Grass', prompt: 'lush grass', collision: 'walkable' },
            { id: 'dirt', label: 'Dirt', prompt: 'packed dirt', collision: 'walkable' },
            { id: 'water', label: 'Water', prompt: 'shallow water', collision: 'water' },
            { id: 'stone', label: 'Stone', prompt: 'cobblestone', collision: 'solid' },
          ],
          transitions: [{ a: 'grass', b: 'dirt' }, { a: 'grass', b: 'water' }, { a: 'dirt', b: 'stone' }],
          lastReport: { ...report, frames: 145 },
        }),
        'isle-20261007-120000/sprite.json': JSON.stringify({
          version: 1,
          kind: 'tileset',
          name: 'Isle',
          style: 'pixel',
          tileSize: 16,
          fromTerrain: { project: 'terrains', terrain: 'isle-1', metresPerTile: 4 },
          lastReport: { ...report, frames: 12 },
        }),
      },
      'sprite:backgrounds': {
        'dusk-20261007-120000/sprite.json': JSON.stringify({
          version: 1,
          kind: 'background',
          name: 'Dusk',
          style: 'flat',
          size: [1280, 360],
          layers: [
            { name: 'sky', prompt: 'clear sky', scrollFactor: 0 },
            { name: 'far', prompt: 'distant mountains', scrollFactor: 0.2 },
            { name: 'mid', prompt: 'rolling hills', scrollFactor: 0.5 },
            { name: 'near', prompt: 'foreground grass', scrollFactor: 0.8 },
          ],
          lastReport: report,
        }),
      },
      'sprite:objects': {
        'camp-20261007-120000/sprite.json': JSON.stringify({
          version: 1,
          kind: 'prop-sheet',
          name: 'Camp',
          style: 'pixel',
          cell: [32, 32],
          props: [{ name: 'crate', prompt: 'wooden crate' }, { name: 'barrel', prompt: 'oak barrel' }, { name: 'sign', prompt: 'signpost' }],
          lastReport: { ...report, frames: 3 },
        }),
      },
      'terrain:terrains': { 'isle-1/terrain.json': JSON.stringify({ version: 1, name: 'Isle' }) },
    },
  },
};

async function openSprites(page: Page, theme: 'dark' | 'light'): Promise<void> {
  await installMockBridge(page, data);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible({ timeout: 90_000 });
  await expect(async () => {
    await clickRailLink(page, 'Media');
    await page.getByRole('tab', { name: 'Sprites' }).click();
    await expect(page.getByRole('tab', { name: 'Sprites', selected: true })).toBeVisible({ timeout: 2500 });
  }).toPass({ timeout: 45_000 });
  await setTheme(page, theme, { settleMs: 200 });
  await expect(page.getByTestId('sprite-create-panel')).toBeVisible();
}

/** The mock bridge cannot serve `mstudio-file://`: swap each picture for the rendered one. */
async function paint(page: Page, files: Record<string, string>): Promise<void> {
  const map = Object.fromEntries(Object.entries(files).map(([needle, file]) => [needle, uri(file)]));
  await page.evaluate((m) => {
    const find = (url: string) => Object.entries(m).find(([needle]) => url.includes(needle))?.[1];
    for (const img of Array.from(document.querySelectorAll('img'))) {
      const to = find(img.getAttribute('src') ?? '');
      if (to) img.setAttribute('src', to);
    }
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('[data-testid^="parallax-layer-"]'))) {
      const name = el.dataset['testid']!.replace('parallax-layer-', '');
      const to = find(`layers/${name}.png`);
      if (to) el.style.backgroundImage = `url("${to}")`;
    }
  }, map);
}

const select = async (page: Page, name: string) => {
  await page.locator('[data-media-pane="explorer"]').getByRole('button', { name, exact: true }).click();
  await expect(page.getByTestId('sprite-environment-preview')).toBeVisible();
};

test('environment form: tileset terrains and transitions (dark)', async ({ page }) => {
  await openSprites(page, 'dark');
  const panel = page.getByTestId('sprite-create-panel');
  await panel.getByRole('radio', { name: 'Environment' }).click();
  await panel.getByLabel('Name', { exact: true }).fill('Meadow');
  await panel.getByRole('button', { name: 'Add terrain' }).click();
  await panel.getByRole('button', { name: 'Add transition' }).click();
  await panel.getByLabel('Transition 2 over').selectOption('sand');
  await settle(page, 400);
  await page.screenshot({ path: shotPath(OUT, 'environment-tileset-form-dark.png') });
});

test('a generated tileset with its base tiles (dark)', async ({ page }) => {
  await openSprites(page, 'dark');
  await select(page, 'meadow');
  await paint(page, { 'tileset.png': 'tileset.png', 'terrains/grass.png': 'base-grass.png', 'terrains/dirt.png': 'base-dirt.png', 'terrains/water.png': 'base-water.png', 'terrains/stone.png': 'base-stone.png' });
  await settle(page, 400);
  await page.screenshot({ path: shotPath(OUT, 'tileset-dark.png') });
});

test('an isometric tileset form (light)', async ({ page }) => {
  await openSprites(page, 'light');
  const panel = page.getByTestId('sprite-create-panel');
  await panel.getByRole('radio', { name: 'Environment' }).click();
  await panel.getByLabel('Kind', { exact: true }).selectOption('isometric');
  await panel.getByLabel('Name', { exact: true }).fill('Meadow iso');
  await settle(page, 400);
  await page.screenshot({ path: shotPath(OUT, 'environment-isometric-form-light.png') });
});

test('a terrain rendered into tiles (dark)', async ({ page }) => {
  await openSprites(page, 'dark');
  const panel = page.getByTestId('sprite-create-panel');
  await panel.getByRole('radio', { name: 'Environment' }).click();
  await panel.getByLabel('Name', { exact: true }).fill('Isle');
  await panel.getByRole('checkbox', { name: 'Render a terrain' }).check();
  await panel.getByLabel('Terrain group').selectOption('terrains');
  await panel.getByRole('combobox', { name: 'Terrain', exact: true }).selectOption('isle-1');
  await settle(page, 400);
  await page.screenshot({ path: shotPath(OUT, 'environment-terrain-source-dark.png') });
});

test('parallax stage with the camera moved (dark)', async ({ page }) => {
  await openSprites(page, 'dark');
  await select(page, 'dusk');
  await paint(page, { 'layers/sky.png': 'layer-sky.png', 'layers/far.png': 'layer-far.png', 'layers/mid.png': 'layer-mid.png', 'layers/near.png': 'layer-near.png' });
  await page.getByLabel('Camera').fill('420');
  await paint(page, { 'layers/sky.png': 'layer-sky.png', 'layers/far.png': 'layer-far.png', 'layers/mid.png': 'layer-mid.png', 'layers/near.png': 'layer-near.png' });
  await settle(page, 400);
  await page.screenshot({ path: shotPath(OUT, 'parallax-dark.png') });
});

test('prop sheet (light)', async ({ page }) => {
  await openSprites(page, 'light');
  await select(page, 'camp');
  await paint(page, { 'props/crate/000.png': 'prop-crate.png', 'props/barrel/000.png': 'prop-barrel.png', 'props/sign/000.png': 'prop-sign.png' });
  await settle(page, 400);
  await page.screenshot({ path: shotPath(OUT, 'props-light.png') });
});
