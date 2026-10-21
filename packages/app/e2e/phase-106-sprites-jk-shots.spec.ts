import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { clickRailLink, fixtures, installMockBridge, installShotsBridge, type MockFixtures, setTheme, settle, SHOT_VIEWPORTS, shotPath } from './shots-helper';

/**
 * Phase 106 Themes J + K screenshots for the PR: the Map form, a generated map in the previewer (layers,
 * collision overlay) and Settings ▸ MCP's new sprites switch. The map is the real kernel output
 * rendered by `map-shots.test.ts` into `MSTUDIO_SHOTS_ASSETS`; the mock bridge cannot serve
 * `mstudio-file://`, so `fetch` and image `src` are answered from those files. Run with
 * `MSTUDIO_SHOTS=1`; skipped otherwise. Behaviour is covered in vitest (`sprite-map.bridge.test.tsx`).
 */
const OUT = '../../docs/screenshots/phase-106-sprites-jk';
const ASSETS = process.env['MSTUDIO_SHOTS_ASSETS'] ?? '';

test.skip(!process.env['MSTUDIO_SHOTS'] || !ASSETS, 'set MSTUDIO_SHOTS=1 and MSTUDIO_SHOTS_ASSETS to write screenshots');
test.describe.configure({ timeout: 90_000 });

const report = { frames: 1040, failing: 0, at: '2026-10-07T10:00:00.000Z' };
const data: MockFixtures = {
  ...fixtures,
  media: {
    files: {
      'sprite:tilesets': {
        'meadow-20261007-120000/sprite.json': JSON.stringify({ version: 1, kind: 'tileset', name: 'Meadow', style: 'pixel', tileSize: 16, lastReport: { ...report, frames: 145 } }),
      },
      'sprite:objects': {
        'camp-20261007-120000/sprite.json': JSON.stringify({ version: 1, kind: 'prop-sheet', name: 'Camp', style: 'pixel', cell: [16, 16], props: [{ name: 'crate', prompt: '' }], lastReport: { ...report, frames: 3 } }),
      },
      'sprite:maps': {
        'island-20261007-120000/sprite.json': JSON.stringify({
          version: 1,
          kind: 'map',
          name: 'Island',
          prompt: 'A meadow island with a lake, a rocky outcrop, a camp clearing and a dirt trail from the spawn to the dock',
          style: 'pixel',
          tileset: { group: 'tilesets', asset: 'meadow-20261007-120000' },
          engine: { kind: 'ollama', model: 'qwen2.5:7b' },
          decorations: { props: { group: 'objects', asset: 'camp-20261007-120000' }, density: 0.25 },
          mapSpec: {
            width: 40,
            height: 26,
            orientation: 'orthogonal',
            base: 'grass',
            regions: [{}, {}, {}],
            rooms: [{}],
            corridors: [{}],
            paths: [{}],
            objects: [{ type: 'spawn', name: 'player', x: 3, y: 5 }, { type: 'exit', name: 'dock', x: 22, y: 8 }, { type: 'point', name: 'camp', x: 19, y: 18 }],
          },
          lastReport: report,
        }),
      },
    },
  },
};

/** Answers the map's `mstudio-file://` reads from the rendered assets. */
async function serveMapFiles(page: Page): Promise<void> {
  const tmj = readFileSync(join(ASSETS, 'map.tmj'), 'utf8');
  const files: Record<string, string> = {
    'tileset.png': `data:image/png;base64,${readFileSync(join(ASSETS, 'tileset.png')).toString('base64')}`,
    'collision.png': `data:image/png;base64,${readFileSync(join(ASSETS, 'collision.png')).toString('base64')}`,
    'props.png': `data:image/png;base64,${readFileSync(join(ASSETS, 'props.png')).toString('base64')}`,
  };
  await page.addInitScript(({ map, tmj }: { map: Record<string, string>; tmj: string }) => {
    const find = (url: string) => Object.entries(map).find(([name]) => url.includes(`/${name}`))?.[1];
    const original = window.fetch.bind(window);
    // The CSP refuses a fetch of a data: URL, so the map's JSON is answered directly.
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) =>
      String(input instanceof Request ? input.url : input).includes('/map.tmj') ? Promise.resolve(new Response(tmj, { status: 200 })) : original(input, init);
    const desc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src')!;
    Object.defineProperty(HTMLImageElement.prototype, 'src', {
      ...desc,
      set(value: string) {
        desc.set!.call(this, find(value) ?? value);
      },
    });
  }, { map: files, tmj });
}

async function openSprites(page: Page, theme: 'dark' | 'light'): Promise<void> {
  await serveMapFiles(page);
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

test.describe('maps', () => {
  test.use({ viewport: SHOT_VIEWPORTS.wide });

  test('the Map form: tileset, size, decorations and the layout engine (dark)', async ({ page }) => {
    await openSprites(page, 'dark');
    const panel = page.getByTestId('sprite-create-panel');
    await panel.getByRole('radio', { name: 'Environment' }).click();
    await panel.getByLabel('Kind', { exact: true }).selectOption('map');
    await panel.getByLabel('Name', { exact: true }).fill('Island');
    await panel.getByLabel('Tileset', { exact: true }).selectOption('meadow-20261007-120000');
    await panel.getByLabel('Decorations', { exact: true }).selectOption('camp-20261007-120000');
    await panel.locator('textarea').first().fill('A meadow island with a lake, a rocky outcrop and a trail to the dock');
    await settle(page, 400);
    await page.screenshot({ path: shotPath(OUT, 'map-form-dark.png') });
  });

  test('a generated map with the collision overlay (dark)', async ({ page }) => {
    await openSprites(page, 'dark');
    await page.locator('[data-media-pane="explorer"]').getByRole('button', { name: 'island', exact: true }).click();
    const preview = page.getByTestId('sprite-map-preview');
    await expect(preview).toBeVisible();
    await preview.getByRole('checkbox', { name: 'Collision overlay' }).check();
    await settle(page, 600);
    await page.screenshot({ path: shotPath(OUT, 'map-preview-collision-dark.png') });
  });

  test('a generated map zoomed in, decorations hidden (light)', async ({ page }) => {
    await openSprites(page, 'light');
    await page.locator('[data-media-pane="explorer"]').getByRole('button', { name: 'island', exact: true }).click();
    const preview = page.getByTestId('sprite-map-preview');
    await expect(preview).toBeVisible();
    await preview.getByRole('checkbox', { name: 'Layer decoration' }).uncheck();
    await preview.getByRole('img').focus();
    await page.keyboard.press('+');
    await settle(page, 600);
    await page.screenshot({ path: shotPath(OUT, 'map-preview-zoomed-light.png') });
  });
});

test.describe('settings', () => {
  test.use({ viewport: SHOT_VIEWPORTS.default });

  test('Settings ▸ MCP: Let agents edit sprites and maps (light)', async ({ page }) => {
    await installShotsBridge(page, { mcp: { enabled: true, allowSprites: true } });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('navigation', { name: 'Settings pages' }).getByRole('button', { name: 'MCP Server' }).click();
    const accordion = page.getByRole('button', { name: 'Let agents edit sprites and maps' });
    await accordion.click();
    await page.getByTestId('mcp-allow-sprites').scrollIntoViewIfNeeded();
    await settle(page, 400);
    await page.screenshot({ path: shotPath(OUT, 'settings-mcp-sprites-light.png') });
  });
});
