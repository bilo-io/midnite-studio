import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test, type Page } from '@playwright/test';

import { fixtures } from '../test-support/fixtures';
import { clickRailLink, type MockFixtures } from '../test-support/mock-bridge';
import { installMockBridge, prepareForVisualCapture } from './shots-helper';

/**
 * Playwright: the Animations timeline player in Studio's real Media shell (Phase 125 Theme D).
 *
 * Needs a real browser for three things jsdom cannot give: a real WebGL context drawing the retargeted
 * preview, real layout (the ruler's pixel width is what a click or a drag converts to a time), and pointer
 * capture on the ruler and its in/out handles. The reducers, the bone-name table, the lanes and the keys are
 * vitest (`player-state`, `bone-names`, `clip-lanes`, `clip-player.test.tsx`); this spec scrubs, steps and drags,
 * and writes the review shots.
 */
const SHOTS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../docs/screenshots/p125-d');

type Joint = { name: string; offset: [number, number, number]; children?: Joint[] };
const BODY: Joint = {
  name: 'Hips',
  offset: [0, 100, 0],
  children: [
    { name: 'Spine', offset: [0, 10, 0], children: [{ name: 'Head', offset: [0, 40, 0] }, { name: 'LeftArm', offset: [18, 30, 0], children: [{ name: 'LeftForeArm', offset: [26, 0, 0] }] }, { name: 'RightArm', offset: [-18, 30, 0], children: [{ name: 'RightForeArm', offset: [-26, 0, 0] }] }] },
    { name: 'LeftUpLeg', offset: [9, -5, 0], children: [{ name: 'LeftLeg', offset: [0, -44, 0] }] },
    { name: 'RightUpLeg', offset: [-9, -5, 0], children: [{ name: 'RightLeg', offset: [0, -44, 0] }] },
  ],
};

/** A walk-ish 31-frame, 30 fps BVH on Mixamo bone names, so the mannequin matches every joint by name. */
function walkBvh(): string {
  const names: string[] = [];
  const lines: string[] = ['HIERARCHY'];
  const emit = (joint: Joint, depth: number) => {
    const pad = '  '.repeat(depth);
    const root = depth === 0;
    names.push(joint.name);
    lines.push(`${pad}${root ? 'ROOT' : 'JOINT'} ${joint.name}`, `${pad}{`, `${pad}  OFFSET ${joint.offset.join(' ')}`);
    lines.push(`${pad}  CHANNELS ${root ? '6 Xposition Yposition Zposition Zrotation Xrotation Yrotation' : '3 Zrotation Xrotation Yrotation'}`);
    if (joint.children) joint.children.forEach((c) => emit(c, depth + 1));
    else lines.push(`${pad}  End Site`, `${pad}  {`, `${pad}    OFFSET 0 8 0`, `${pad}  }`);
    lines.push(`${pad}}`);
  };
  emit(BODY, 0);
  const frames = 31;
  lines.push('MOTION', `Frames: ${frames}`, 'Frame Time: 0.033333');
  for (let f = 0; f < frames; f++) {
    const swing = Math.sin((f / (frames - 1)) * Math.PI * 2) * 35;
    const row: number[] = [];
    names.forEach((name, i) => {
      if (i === 0) row.push(0, 100 + Math.abs(swing) * 0.1, f * 2, 0, 0, 0);
      else row.push(0, name.startsWith('Left') ? swing : name.startsWith('Right') ? -swing : 0, 0);
    });
    lines.push(row.map((v) => v.toFixed(3)).join(' '));
  }
  return lines.join('\n');
}

const data: MockFixtures = {
  ...fixtures,
  media: {
    animations: [
      {
        id: 'aaaaaaaaaaaa',
        name: 'Walking',
        tags: ['locomotion'],
        durationSec: 1,
        frameCount: 31,
        fps: 30,
        boneCount: 11,
        hasSkin: false,
        format: 'bvh',
        source: 'local',
        licence: 'unknown',
        author: '',
        sha256: 'a'.repeat(64),
        file: 'clips/aaaaaaaaaaaa.bvh',
        sizeBytes: 4096,
        addedAt: 1_700_000_000_000,
      },
    ],
    animationFiles: { aaaaaaaaaaaa: { format: 'bvh', dataBase64: Buffer.from(walkBvh()).toString('base64') } },
  },
};

test.use({ viewport: { width: 1440, height: 900 }, contextOptions: { reducedMotion: 'reduce' } });

async function openPlayer(page: Page): Promise<void> {
  await installMockBridge(page, data);
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Media', exact: true })).toBeVisible({ timeout: 90_000 });
  await expect(async () => {
    await clickRailLink(page, 'Media');
    await page.getByRole('tab', { name: 'Animations' }).click();
    await expect(page.getByRole('list', { name: 'Animation clips' })).toBeVisible({ timeout: 500 });
  }).toPass({ timeout: 15_000 });
  await page.getByRole('button', { name: /Walking/ }).click();
  await expect(page.getByTestId('clip-canvas')).toBeVisible({ timeout: 30_000 });
}

const readout = (page: Page) => page.getByLabel('Playhead');

test('scrubs, steps and drags the range on the real ruler, with a WebGL preview retargeted by bone name', async ({ page }) => {
  test.setTimeout(150_000);
  await openPlayer(page);

  await expect(page.getByRole('status').filter({ hasText: 'bones matched' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Bone lanes' }).getByRole('listitem')).toHaveCount(11);
  await expect(readout(page)).toHaveText('0.00s · frame 0 / 30');

  // The WebGL pane redraws with the playhead: the stage looks different after a scrub (a blank or frozen canvas would not).
  const stage = page.getByTestId('clip-canvas');
  await page.waitForTimeout(300);
  const before = await stage.screenshot();

  // A click half way along the ruler lands on half the clip (real layout width -> time).
  const ruler = (await page.getByRole('slider', { name: 'Timeline' }).boundingBox())!;
  await page.mouse.click(ruler.x + ruler.width / 2, ruler.y + ruler.height / 2);
  const mid = (await readout(page).textContent())!;
  expect(Number(/^([\d.]+)s/.exec(mid)![1])).toBeGreaterThan(0.4);
  expect(Number(/^([\d.]+)s/.exec(mid)![1])).toBeLessThan(0.6);
  await page.waitForTimeout(300);
  expect((await stage.screenshot()).equals(before)).toBe(false);

  // Keys act on the focused player: step, then set the range from the playhead.
  await page.getByRole('region', { name: 'Timeline player' }).focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('[');
  await expect(page.getByRole('slider', { name: 'In point' })).not.toHaveAttribute('aria-valuenow', '0');
  await page.getByRole('button', { name: 'Clear range' }).click();

  // Dragging the out handle moves the end of the range.
  const out = (await page.getByRole('slider', { name: 'Out point' }).boundingBox())!;
  await page.mouse.move(out.x + out.width / 2, out.y + out.height / 2);
  await page.mouse.down();
  await page.mouse.move(ruler.x + ruler.width * 0.7, out.y + out.height / 2, { steps: 5 });
  await page.mouse.up();
  const outNow = Number(await page.getByRole('slider', { name: 'Out point' }).getAttribute('aria-valuenow'));
  expect(outNow).toBeGreaterThan(55);
  expect(outNow).toBeLessThan(85);

  // Play advances the playhead on its own, then pause holds it.
  await page.getByRole('button', { name: 'Back to start' }).click();
  await page.getByRole('button', { name: 'Play' }).click();
  await expect(readout(page)).not.toHaveText('0.00s · frame 0 / 30');
  await page.getByRole('button', { name: 'Pause' }).click();

  mkdirSync(SHOTS, { recursive: true });
  await prepareForVisualCapture(page);
  await page.mouse.click(ruler.x + ruler.width * 0.3, ruler.y + ruler.height / 2);
  await page.getByTestId('clip-player').screenshot({ path: path.join(SHOTS, 'player.png') });
});
