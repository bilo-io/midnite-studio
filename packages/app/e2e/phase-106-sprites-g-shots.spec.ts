import { expect, test, type Page } from '@playwright/test';

import { clickRailLink, fixtures, installMockBridge, type MockFixtures, setTheme, settle, SHOT_VIEWPORTS, shotPath } from './shots-helper';

/**
 * Phase 106 Theme G screenshots for the PR: the animation previewer (compass, onion skin, anchor and
 * baseline overlay, checker background, pixel zoom) with the frame strip and its badges, plus the
 * pack export. Run with `MSTUDIO_SHOTS=1`; skipped otherwise. Behaviour is covered by vitest.
 *
 * The mock bridge cannot serve `mstudio-file://`, so an init script swaps each frame URL for a small
 * procedurally drawn pixel figure (its legs and arm swing with the frame number, and it faces the
 * direction in the URL). Everything else on screen is the real tab.
 */
const OUT = '../../docs/screenshots/phase-106-sprites-g';

test.skip(!process.env['MSTUDIO_SHOTS'], 'set MSTUDIO_SHOTS=1 to write screenshots');
test.describe.configure({ timeout: 120_000 });
test.use({ viewport: SHOT_VIEWPORTS.wide });

const meta = (badges: string[] = [], extra: Record<string, unknown> = {}) => ({ anchorNudge: [0, 0], flipped: false, source: 'generated', badges, ...extra });

function framesFor(clips: Array<[string, number]>, dirs: string[], badges: Record<string, string[]> = {}, mirrored = false) {
  const out: Record<string, unknown> = {};
  for (const [clip, n] of clips)
    for (const d of dirs)
      for (let i = 0; i < n; i += 1) {
        const key = `${clip}/${d}/${String(i).padStart(3, '0')}`;
        out[key] = mirrored && d === 'w' ? meta(badges[key], { flipped: true, source: 'mirrored' }) : meta(badges[key]);
      }
  return JSON.stringify({ frames: out });
}

const data: MockFixtures = {
  ...fixtures,
  media: {
    files: {
      'sprite:characters': {
        'knight-20261007-120000/sprite.json': JSON.stringify({
          version: 1,
          kind: 'sheet',
          name: 'Knight',
          style: 'pixel',
          targetPerspective: 'side',
          frameSize: [64, 64],
          directions: 1,
          method: 'hand-drawn',
          reference: { kind: 'image', file: 'reference/reference.png', approved: true },
          clips: [
            { name: 'idle', frames: 4, fps: 6, loop: 'loop' },
            { name: 'walk', frames: 8, fps: 10, loop: 'loop' },
            { name: 'attack', frames: 6, fps: 12, loop: 'once' },
          ],
          lastReport: { frames: 36, failing: 2, at: '2026-10-07T10:00:00.000Z' },
        }),
        'knight-20261007-120000/frames/frames.json': framesFor(
          [
            ['idle', 4],
            ['walk', 8],
            ['attack', 6],
          ],
          ['e', 'w'],
          { 'walk/e/003': ['drift'], 'walk/e/006': ['clipped', 'height'] },
          true,
        ),
        'scout-20261007-120000/sprite.json': JSON.stringify({
          version: 1,
          kind: 'sheet',
          name: 'Scout',
          style: 'pixel',
          targetPerspective: 'isometric',
          frameSize: [48, 48],
          directions: 8,
          method: 'rendered',
          clips: [
            { name: 'idle', frames: 4, fps: 6, loop: 'loop' },
            { name: 'walk', frames: 6, fps: 10, loop: 'ping-pong' },
          ],
        }),
        'scout-20261007-120000/frames/frames.json': framesFor(
          [
            ['idle', 4],
            ['walk', 6],
          ],
          ['s', 'sw', 'w', 'nw', 'n', 'ne', 'e', 'se'],
        ),
      },
    },
  },
};

/** Swaps frame URLs for a drawn figure: the PNG the real app would load from `frames/`. */
async function fakeFrames(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const cache = new Map<string, string>();
    const draw = (url: string): string => {
      const hit = cache.get(url);
      if (hit) return hit;
      const m = /frames\/([a-z-]+)\/([a-z]{1,2})\/(\d{3})\.png/.exec(decodeURIComponent(url));
      const clip = m?.[1] ?? 'idle';
      const dir = m?.[2] ?? 'e';
      const n = Number(m?.[3] ?? 0);
      const size = /scout/.test(url) ? 48 : 64;
      const px = size / 16;
      const c = document.createElement('canvas');
      c.width = size;
      c.height = size;
      const g = c.getContext('2d')!;
      const box = (x: number, y: number, w: number, h: number, colour: string) => {
        g.fillStyle = colour;
        g.fillRect(Math.round(x * px), Math.round(y * px), Math.round(w * px), Math.round(h * px));
      };
      const phase = Math.sin((n / (clip === 'walk' ? 8 : clip === 'attack' ? 6 : 4)) * Math.PI * 2);
      const bob = clip === 'idle' ? (n % 2) * 0.5 : Math.abs(phase) * 0.5;
      const back = dir === 'n' || dir === 'nw' || dir === 'ne';
      // Mirrored west frames are stored facing east, as Theme D writes them; the previewer flips them.
      const facing = dir === 'w' && !/knight/.test(url) ? -1 : 1;
      const cx = 8;
      box(cx - 2 + phase * 1.5, 12 - bob, 1.5, 3 + bob, '#3b3b58');
      box(cx + 0.5 - phase * 1.5, 12 - bob, 1.5, 3 + bob, '#2c2c44');
      box(cx - 3, 6 - bob, 6, 6.5, back ? '#5a6b8c' : '#7d8fb3');
      box(cx - 2.5, 2 - bob, 5, 4.5, '#e8c39e');
      box(cx - 2.5, 1.5 - bob, 5, 1.5, '#8b5a2b');
      if (!back) box(cx + facing * 1 - 0.5, 3.5 - bob, 1, 1, '#1d1d2b');
      const swing = clip === 'attack' ? (n / 5) * 5 : phase * 1.2;
      box(cx + facing * 3, 7 - bob + (clip === 'attack' ? -swing * 0.4 : 0), 1.5, 4, '#7d8fb3');
      if (clip === 'attack') box(cx + facing * (4 + swing * 0.3), 3 - swing * 0.2, 1, 6, '#c9d1d9');
      box(cx - 4, 15, 8, 0.5, 'rgba(0,0,0,0.25)');
      const out = c.toDataURL('image/png');
      cache.set(url, out);
      return out;
    };
    const desc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src')!;
    Object.defineProperty(HTMLImageElement.prototype, 'src', {
      configurable: true,
      get() {
        return desc.get!.call(this);
      },
      set(value: string) {
        desc.set!.call(this, typeof value === 'string' && value.startsWith('mstudio-file://') && value.includes('/frames/') ? draw(value) : value);
      },
    });
  });
}

async function openAsset(page: Page, theme: 'dark' | 'light', asset: string): Promise<void> {
  await fakeFrames(page);
  await installMockBridge(page, data);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible({ timeout: 90_000 });
  await expect(async () => {
    await clickRailLink(page, 'Media');
    await page.getByRole('tab', { name: 'Sprites' }).click();
    await expect(page.getByRole('tab', { name: 'Sprites', selected: true })).toBeVisible({ timeout: 2500 });
  }).toPass({ timeout: 45_000 });
  await setTheme(page, theme, { settleMs: 200 });
  await page.locator('[data-media-pane="explorer"]').getByRole('button', { name: asset }).click();
  await expect(page.getByTestId('sprite-previewer')).toBeVisible();
}

test('previewer: side sheet, walk, onion skin and overlay, frame strip with badges (dark)', async ({ page }) => {
  await openAsset(page, 'dark', 'knight');
  const previewer = page.getByTestId('sprite-previewer');
  await previewer.getByLabel('Clip').selectOption('walk');
  await previewer.getByRole('button', { name: 'Pause' }).click();
  await previewer.getByRole('button', { name: 'Onion skin' }).click();
  await page.getByRole('option', { name: /^Frame 4/ }).click();
  await settle(page, 400);
  await page.screenshot({ path: shotPath(OUT, 'sprites-previewer-walk-dark.png') });
});

test('previewer: mirrored west facing (light)', async ({ page }) => {
  await openAsset(page, 'light', 'knight');
  const previewer = page.getByTestId('sprite-previewer');
  await previewer.getByLabel('Clip').selectOption('attack');
  await previewer.getByRole('radio', { name: 'W', exact: true }).click();
  // `attack` plays once and stops on its own.
  await expect(previewer.getByRole('button', { name: 'Play' })).toBeVisible({ timeout: 5000 });
  await page.getByRole('option', { name: /^Frame 4/ }).click();
  await settle(page, 400);
  await page.screenshot({ path: shotPath(OUT, 'sprites-previewer-mirrored-light.png') });
});

test('previewer: 8-direction compass on an isometric sheet (dark)', async ({ page }) => {
  await openAsset(page, 'dark', 'scout');
  const previewer = page.getByTestId('sprite-previewer');
  await previewer.getByRole('radio', { name: 'NE', exact: true }).click();
  await previewer.getByRole('button', { name: 'Pause' }).click();
  await previewer.getByRole('button', { name: 'Solid background' }).click();
  await settle(page, 400);
  await previewer.screenshot({ path: shotPath(OUT, 'sprites-previewer-compass-dark.png') });
});
