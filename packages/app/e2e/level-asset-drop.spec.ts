// e2e-capability: pointer drag across two elements with real DataTransfer (an HTML5 drag from a tile onto the canvas)
import { expect, test } from '@playwright/test';

import { fixtures } from '../test-support/fixtures';
import { clickRailLink, installMockBridge, type MockFixtures } from '../test-support/mock-bridge';
import { settle } from './shots-helper';

/**
 * Media ▸ Games ▸ Level editor, asset browser (Phase 139 Themes C and D). A model tile dragged from the Assets panel onto
 * the plan of a 3D level adds one `prop` carrying `model`. jsdom has no DragEvent coordinates or layout, so the tile-to-
 * canvas drag is only provable in a real browser; the drop maths and undo step are vitest (`level-editor.test.tsx`).
 * The saved payload is what this asserts. No screenshot is taken.
 */
const GAME = 'g000000000001';
const level = {
  type: 'map', version: '1.10', tiledversion: '1.10.2', orientation: 'orthogonal', renderorder: 'right-down', infinite: false,
  width: 20, height: 20, tilewidth: 32, tileheight: 32, nextlayerid: 2, nextobjectid: 2,
  layers: [
    {
      id: 1, name: 'objects', type: 'objectgroup', x: 0, y: 0, opacity: 1, visible: true, draworder: 'topdown',
      objects: [{ id: 1, name: 'spawn', type: 'spawn', x: 320, y: 320, width: 0, height: 0, rotation: 0, visible: true, point: true }],
    },
  ],
  tilesets: [],
  properties: [{ name: 'midnite.dimension', type: 'string', value: '3d' }],
};
const data: MockFixtures = {
  ...fixtures,
  games: {
    list: [{ gameId: GAME, name: 'Level Game', path: '/Users/test/Midnite Games/level-game' }],
    levels: { [GAME]: { level } },
    assets: { [GAME]: [{ name: 'tree.glb', kind: 'model', path: 'assets/tree.glb' }] },
  },
};

test('dragging a model tile onto the plan adds one prop with its model', async ({ page }) => {
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
  await expect(page.getByTestId('level-editor')).toBeVisible();
  await settle(page);

  await page.getByRole('button', { name: /^Assets/ }).click();
  const tile = page.getByTestId('level-asset-tile').first();
  await expect(tile).toBeVisible();
  const canvas = page.getByTestId('level-canvas');
  await tile.dragTo(canvas, { targetPosition: { x: 80, y: 150 } });

  const save = page.getByRole('button', { name: 'Save' });
  await expect(save).toBeEnabled();
  await save.click();
  const levelSets = () => page.evaluate(() => (window as unknown as { __mstudioMockGames: { calls: Array<Record<string, unknown>> } }).__mstudioMockGames.calls.filter((c) => c.call === 'levelSet'));
  await expect.poll(async () => (await levelSets()).length).toBe(1);
  const [call] = await levelSets();
  const saved = call!.level as { layers: Array<{ objects?: Array<{ type: string; properties?: Array<{ name: string; value: unknown }> }> }> };
  const objects = saved.layers[0]!.objects!;
  expect(objects).toHaveLength(2);
  expect(objects[1]).toMatchObject({ type: 'prop', properties: [{ name: 'model', value: 'tree.glb' }] });
});
