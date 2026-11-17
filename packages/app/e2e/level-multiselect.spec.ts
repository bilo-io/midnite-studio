// e2e-capability: pointer drag on canvas (marquee and group drag through getBoundingClientRect and the fitted view)
import { expect, test } from '@playwright/test';

import { fixtures } from '../test-support/fixtures';
import { clickRailLink, installMockBridge, type MockFixtures } from '../test-support/mock-bridge';
import { settle } from './shots-helper';

/**
 * Media ▸ Games ▸ Level editor, multi-select (Phase 137 Theme C). A marquee from empty ground selects the two coins it
 * fully encloses (the spawn outside it stays out), and dragging one coin moves both. jsdom has no layout or real
 * pointer input to turn a screen position into a map point. Selection and move rules are vitest
 * (`level-edit-model.test.ts`, `level-editor.test.tsx`); the saved payload is what this asserts. No screenshot is taken.
 */
const W = 8, H = 6, TILE = 32;
const level = {
  type: 'map', version: '1.10', tiledversion: '1.10.2', orientation: 'orthogonal', renderorder: 'right-down', infinite: false,
  width: W, height: H, tilewidth: TILE, tileheight: TILE, nextlayerid: 3, nextobjectid: 4,
  layers: [
    { id: 1, name: 'ground', type: 'tilelayer', x: 0, y: 0, width: W, height: H, opacity: 1, visible: true, data: new Array<number>(W * H).fill(0) },
    {
      id: 2, name: 'objects', type: 'objectgroup', x: 0, y: 0, opacity: 1, visible: true, draworder: 'topdown',
      objects: [
        { id: 1, name: 'coin', type: 'pickup', x: 48, y: 48, width: 0, height: 0, rotation: 0, visible: true, point: true },
        { id: 2, name: 'coin', type: 'pickup', x: 112, y: 48, width: 0, height: 0, rotation: 0, visible: true, point: true },
        { id: 3, name: 'spawn', type: 'spawn', x: 208, y: 144, width: 0, height: 0, rotation: 0, visible: true, point: true },
      ],
    },
  ],
  tilesets: [],
  properties: [],
};
const GAME = 'g000000000001';
const data: MockFixtures = {
  ...fixtures,
  games: { list: [{ gameId: GAME, name: 'Level Game', path: '/Users/test/Midnite Games/level-game' }], levels: { [GAME]: { level } } },
};

test('marquee-select two coins, drag one, and Save writes both moved', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await installMockBridge(page, data);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible({ timeout: 30_000 });
  await expect(async () => {
    await clickRailLink(page, 'Media');
    await page.getByRole('tab', { name: 'Games' }).click();
    await expect(page.getByText('Level Game').first()).toBeVisible({ timeout: 500 });
  }).toPass({ timeout: 10_000 });
  await page.getByText('Level Game').first().click();
  await page.getByRole('tab', { name: 'Level editor' }).click();

  const canvas = page.getByTestId('level-canvas');
  await expect(page.getByTestId('level-editor')).toBeVisible();
  await settle(page);
  await page.getByRole('radio', { name: 'Select' }).click();

  // The editor fits the map on first measure: zoom = min(2, boxW/mapW, boxH/mapH) * 0.95, centred in the canvas.
  const box = (await canvas.boundingBox())!;
  const zoom = Math.min(2, box.width / (W * TILE), box.height / (H * TILE)) * 0.95;
  const x0 = box.x + (box.width - W * TILE * zoom) / 2;
  const y0 = box.y + (box.height - H * TILE * zoom) / 2;
  const at = (mx: number, my: number) => ({ x: x0 + mx * zoom, y: y0 + my * zoom });
  const drag = async (from: { x: number; y: number }, to: { x: number; y: number }) => {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 6 });
    await page.mouse.up();
  };

  await drag(at(8, 8), at(150, 90)); // encloses both coins, not the spawn
  await drag(at(48, 48), at(176, 48)); // a Select-tool drag on a selected coin moves the group
  const save = page.getByRole('button', { name: 'Save' });
  await expect(save).toBeEnabled();
  await save.click();

  const levelSets = () => page.evaluate(() => (window as unknown as { __mstudioMockGames: { calls: Array<Record<string, unknown>> } }).__mstudioMockGames.calls.filter((c) => c.call === 'levelSet'));
  await expect.poll(async () => (await levelSets()).length).toBe(1);
  const [call] = await levelSets();
  const saved = call!.level as { layers: Array<{ name: string; objects?: Array<{ id: number; x: number; y: number }> }> };
  const objects = saved.layers.find((l) => l.name === 'objects')!.objects!;
  // Both coins moved by the same 128 px along X; the unselected spawn did not move. Y is compared between the coins, not
  // to a number: the editor fits its view before the "does not read levels" banner shrinks the canvas, which
  // shifts rows by a fraction of a tile in this mock.
  const [a, b, spawn] = objects;
  expect([a!.x, b!.x]).toEqual([176, 240]);
  expect(a!.y).toBe(b!.y);
  expect([spawn!.x, spawn!.y]).toEqual([208, 144]);
});
