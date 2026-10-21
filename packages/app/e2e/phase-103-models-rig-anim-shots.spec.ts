import * as sharedModule from '@midnite/studio-shared';
import { expect, type Page, test } from '@playwright/test';

import { clickRailLink, fixtures, installMockBridge, type MockFixtures, settle, shotPath } from './shots-helper';

/** Phase 103 — Media ▸ Models rigging and animation screenshots for the PR. Run with `MSTUDIO_SHOTS=1`. */
const OUT = '../../docs/screenshots/phase-103-models-rig-anim';
// Under Playwright the shared package loads as CommonJS, whose `export *` re-exports are invisible to
// named ESM imports; they are all on its default export. Typecheck reads the source, which has none.
const shared = (sharedModule as unknown as { default?: typeof sharedModule }).default ?? sharedModule;
const { autoRig, RIG_EXAMPLE_BIPED } = shared;
const spec = {
  ...RIG_EXAMPLE_BIPED,
  name: 'Robot',
  anatomy: 'biped' as const,
  rig: autoRig(RIG_EXAMPLE_BIPED, 'biped')!,
  animations: [
    { name: 'walk', kind: 'walk' as const },
    { name: 'jump', kind: 'jump' as const },
    { name: 'idle', kind: 'idle' as const },
  ],
};
const sidecar = JSON.stringify({ version: 1, name: 'robot', prompt: 'A small robot', engine: 'mcp', spec, createdAt: '2026-10-04T00:00:00.000Z' });
const DATA: MockFixtures = {
  ...fixtures,
  media: { files: { 'model:robots': { 'robot.obj': 'o x', 'robot.mtl': 'x', 'robot.fbx': 'x', 'robot.json': sidecar } } },
};

async function openModels(page: Page): Promise<void> {
  await installMockBridge(page, DATA);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible({ timeout: 120_000 });
  await expect(async () => {
    await clickRailLink(page, 'Media');
    await page.getByRole('tab', { name: 'Models' }).click();
    await expect(page.getByRole('tab', { name: 'Models', selected: true })).toBeVisible({ timeout: 500 });
  }).toPass({ timeout: 5000 });
  await expect(page.getByTestId('model-canvas')).toBeVisible({ timeout: 30_000 });
  await settle(page, 800);
  await page.getByRole('button', { name: 'Reset camera' }).click();
  // Pull back a little so a jump stays in frame under the floating widgets.
  const box = (await page.getByTestId('model-canvas').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 260);
  await settle(page, 300);
}

const panelTab = (page: Page, name: string) => page.getByRole('tablist', { name: 'Part panels' }).getByRole('tab', { name });

test.describe('phase 103 models rig and animation screenshots', () => {
  test.skip(!process.env.MSTUDIO_SHOTS, 'set MSTUDIO_SHOTS=1 to regenerate');
  // Wider and taller than the shared presets: the editor sits between the explorer and the prompt panel.
  test.use({ viewport: { width: 1920, height: 1120 } });

  test('anatomy picker, bone outliner, weights, pose mode and the timeline', async ({ page }) => {
    test.setTimeout(180_000);
    await openModels(page);

    // Rig tab: anatomy picker, Auto-rig and the bone outliner with a bone picked.
    await panelTab(page, 'Rig').click();
    await expect(page.getByTestId('bone-outliner')).toBeVisible();
    await page.getByTestId('bone-outliner').getByRole('button', { name: 'leftUpperArm' }).click();
    await expect(page.getByRole('group', { name: 'Bone leftUpperArm' })).toBeVisible();
    await settle(page, 500);
    await page.screenshot({ path: shotPath(OUT, 'rig-outliner.png') });

    // Weight view for the picked bone.
    await page.getByRole('button', { name: 'Weights' }).click();
    await settle(page, 500);
    await page.screenshot({ path: shotPath(OUT, 'weights.png') });
    await page.getByRole('button', { name: 'Weights' }).click();

    // Pose mode: the walk on the timeline, and the picked arm keyed up at the playhead.
    await page.getByRole('button', { name: 'Pose mode' }).click();
    await page.getByLabel('Timeline clip').selectOption('walk');
    await page.getByLabel('Scrub').fill('0.3');
    await expect(page.getByTestId('pose-key')).toBeVisible();
    const z = page.getByLabel('Rotate ° Z');
    await z.fill('70');
    await z.press('Enter');
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await settle(page, 500);
    await page.screenshot({ path: shotPath(OUT, 'pose-mode.png') });

    // Animation tab: the clip list and the timeline playing the walk.
    await page.getByRole('button', { name: 'Pose mode' }).click();
    await panelTab(page, 'Animation').click();
    await page.getByTestId('clip-list').getByRole('button', { name: /walk/ }).click();
    await page.getByRole('toolbar', { name: 'Timeline' }).getByRole('button', { name: 'Play', exact: true }).click();
    await expect(page.getByRole('toolbar', { name: 'Timeline' }).getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
    await page.waitForTimeout(450);
    await page.screenshot({ path: shotPath(OUT, 'timeline-playing.png') });
  });
});
