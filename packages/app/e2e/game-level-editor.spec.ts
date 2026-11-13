// e2e-capability: real canvas pointer input and getBoundingClientRect hit-testing
import { expect, test } from '@playwright/test';

import { fixtures } from '../test-support/fixtures';
import { clickRailLink, installMockBridge, type MockFixtures } from '../test-support/mock-bridge';
import { settle } from './shots-helper';

/**
 * Media ▸ Games ▸ Level editor (Phase 132 Theme D). The editor paints on a `<canvas>` and turns a pointer
 * position into a cell with `getBoundingClientRect` and the fitted view, which jsdom cannot do (no layout, no
 * real pointer events). This spec drags the Paint tool over three cells, paints a fourth and undoes it (a
 * stroke is one undo step), saves, and asserts the `level-set` payload the
 * bridge received. Edit-model rules are vitest (`level-edit-model.test.ts`); no screenshot is taken.
 */
const W = 8, H = 6, TILE = 32;
const layer = (id: number, name: string) => ({ id, name, type: 'tilelayer', x: 0, y: 0, width: W, height: H, opacity: 1, visible: true, data: new Array<number>(W * H).fill(0) });
const level = {
  type: 'map', version: '1.10', tiledversion: '1.10.2', orientation: 'orthogonal', renderorder: 'right-down', infinite: false,
  width: W, height: H, tilewidth: TILE, tileheight: TILE, nextlayerid: 4, nextobjectid: 2,
  layers: [
    layer(1, 'ground'),
    layer(2, 'collision'),
    { id: 3, name: 'objects', type: 'objectgroup', x: 0, y: 0, opacity: 1, visible: true, draworder: 'topdown', objects: [{ id: 1, name: 'spawn', type: 'spawn', x: 112, y: 80, width: 0, height: 0, rotation: 0, visible: true, point: true }] },
  ],
  tilesets: [],
  properties: [],
};
const GAME = 'g000000000001';
const data: MockFixtures = {
  ...fixtures,
  games: { list: [{ gameId: GAME, name: 'Level Game', path: '/Users/test/Midnite Games/level-game' }], levels: { [GAME]: { level } } },
};

test('paint three cells by pointer drag, undo the next stroke, Save writes one level-set with exactly those', async ({ page }) => {
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
  const save = page.getByRole('button', { name: 'Save' });
  await expect(save).toBeDisabled();

  // The editor fits the map on first measure: zoom = min(2, boxW/mapW, boxH/mapH) * 0.95, centred in the canvas.
  const box = (await canvas.boundingBox())!;
  const zoom = Math.min(2, box.width / (W * TILE), box.height / (H * TILE)) * 0.95;
  const pitch = TILE * zoom;
  const x0 = box.x + (box.width - W * pitch) / 2;
  const y0 = box.y + (box.height - H * pitch) / 2;
  const at = (cellX: number, cellY: number) => ({ x: x0 + (cellX + 0.5) * pitch, y: y0 + (cellY + 0.5) * pitch });
  const drag = async (from: { x: number; y: number }, to: { x: number; y: number }) => {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 6 });
    await page.mouse.up();
  };

  await drag(at(1, 1), at(2, 1)); // one stroke, two cells
  await expect(save).toBeEnabled();
  await drag(at(3, 3), at(3, 3)); // a third cell
  await drag(at(5, 4), at(5, 4)); // a fourth, which the undo takes back
  await page.getByRole('button', { name: 'Undo' }).click();
  await save.click();

  await expect.poll(() => page.evaluate(() => (window as unknown as { __mstudioMockGames: { calls: Array<Record<string, unknown>> } }).__mstudioMockGames.calls.filter((c) => c.call === 'levelSet').length)).toBe(1);
  const call = await page.evaluate(() => (window as unknown as { __mstudioMockGames: { calls: Array<Record<string, unknown>> } }).__mstudioMockGames.calls.find((c) => c.call === 'levelSet'));
  const saved = call!.level as { layers: Array<{ name: string; data?: number[] }> };
  const ground = saved.layers.find((l) => l.name === 'ground')!.data!;
  const painted = ground.map((g, i) => (g === 1 ? i : -1)).filter((i) => i >= 0);
  expect(call).toMatchObject({ gameId: GAME, scene: 'level' });
  expect(painted).toEqual([1 * W + 1, 1 * W + 2, 3 * W + 3]);
});
