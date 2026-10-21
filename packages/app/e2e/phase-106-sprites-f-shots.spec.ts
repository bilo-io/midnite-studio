import { expect, test, type Page } from '@playwright/test';

import { clickRailLink, fixtures, installMockBridge, type MockFixtures, setTheme, settle, SHOT_VIEWPORTS, shotPath } from './shots-helper';

/**
 * Phase 106 Theme F screenshots for the PR: the one-shot toggle's grid summary (and its refusal past
 * 8 × 8), a sheet's grid-detection preview with the per-row verdict and the Hand-drawn hand-off, and a
 * mismatched grid reported rather than sliced. Run with `MSTUDIO_SHOTS=1`; skipped otherwise. Behaviour
 * is covered in vitest (`grid-detect.test.ts`, `one-shot.test.ts`, `sprite-one-shot.bridge.test.tsx`).
 *
 * The mock bridge cannot serve `mstudio-file://` URLs, so the sheet `<img>` is pointed at one the spec
 * draws on a canvas — a stand-in for what a provider returns, laid out to match the detected spans.
 */
const OUT = '../../docs/screenshots/phase-106-sprites-f';

test.skip(!process.env['MSTUDIO_SHOTS'], 'set MSTUDIO_SHOTS=1 to write screenshots');
test.describe.configure({ timeout: 90_000 });
test.use({ viewport: SHOT_VIEWPORTS.wide });

// A 4 × 3 sheet at 3:2 (840 × 560): cells 180 wide with 30 px gutters; rows 150 tall with 35 px gutters.
const COLS: Array<[number, number]> = [[45, 165], [255, 375], [465, 585], [675, 795]];
const ROWS: Array<[number, number]> = [[40, 165], [215, 340], [390, 515]];
const shot = (extra: Record<string, unknown> = {}) => ({
  promptVersion: 1,
  grid: { columns: 4, rows: 3, cell: [64, 64], gutter: 8 },
  aspect: '3:2',
  rows: [
    { clip: 'idle', dir: 'e' },
    { clip: 'walk', dir: 'e' },
    { clip: 'attack', dir: 'e' },
  ],
  image: { width: 840, height: 560 },
  detected: { columns: COLS, rows: ROWS },
  ...extra,
});
const sheet = (name: string, extra: Record<string, unknown>) =>
  JSON.stringify({
    version: 1,
    kind: 'sheet',
    name,
    prompt: 'A knight in plate armour with a red plume',
    method: 'one-shot',
    provider: 'gemini',
    model: 'gemini-2.5-flash-image',
    clips: [
      { name: 'idle', frames: 4, fps: 6, loop: 'loop' },
      { name: 'walk', frames: 4, fps: 10, loop: 'loop' },
      { name: 'attack', frames: 4, fps: 12, loop: 'once' },
    ],
    ...extra,
  });
const meta = (badges: string[]) => ({ anchorNudge: [0, 0], flipped: false, source: 'sliced', badges });
const frames: Record<string, unknown> = {};
for (const clip of ['idle', 'walk', 'attack']) for (let n = 0; n < 4; n += 1) frames[`${clip}/e/00${n}`] = meta(clip === 'attack' && n >= 2 ? ['clipped'] : clip === 'walk' && n === 3 ? ['grid'] : []);

const data: MockFixtures = {
  ...fixtures,
  media: {
    files: {
      'sprite:characters': {
        'knight-20261007-120000/sprite.json': sheet('Knight', { oneShot: shot(), updatedAt: '2026-10-07T12:00:00.000Z' }),
        'knight-20261007-120000/frames/frames.json': JSON.stringify({ frames }),
        'rogue-20261007-110000/sprite.json': sheet('Rogue', {
          prompt: 'A hooded rogue with twin daggers',
          oneShot: shot({ detected: { columns: COLS.slice(0, 3), rows: ROWS }, mismatch: 'Expected 4 × 3 cells, found 3 × 3. Nothing was sliced.' }),
        }),
      },
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

/** Paints a magenta pixel-knight sheet whose figures sit inside `COLS × ROWS`, and swaps it in. */
async function paintSheet(page: Page, merged: boolean): Promise<void> {
  await page.getByTestId('one-shot-grid').locator('img').waitFor();
  await page.evaluate(
    ({ cols, rows, merged }) => {
      const canvas = document.createElement('canvas');
      canvas.width = 840;
      canvas.height = 560;
      const g = canvas.getContext('2d')!;
      g.fillStyle = '#ff00ff';
      g.fillRect(0, 0, 840, 560);
      rows.forEach(([y0], r) =>
        cols.forEach(([x0], c) => {
          const px = (x: number, y: number, w: number, h: number, colour: string) => {
            g.fillStyle = colour;
            g.fillRect(x0 + 20 + x * 4, y0 + y * 4, w * 4, h * 4);
          };
          const swing = (c % 2 === 0 ? 1 : -1) * (r === 0 ? 0 : 1);
          const lean = r === 2 ? c : 0;
          px(8 + lean, 0, 6, 6, '#9aa4b1');
          px(10 + lean, -1 + 1, 2, 3, '#d0302a');
          px(10 + lean, 2, 4, 2, '#1c2230');
          px(7 + lean, 6, 8, 10, '#7d8794');
          px(9 + lean, 8, 4, 6, '#d0302a');
          px(5 + lean, 7 + swing, 2, 8, '#6a7380');
          px(15 + lean, 7 - swing, 2, 8, '#6a7380');
          if (r === 2) px(17 + lean, 4, 2 + c * 2, 2, '#e5e7eb');
          px(8, 16, 2, 10 + swing, '#59606b');
          px(12, 16, 2, 10 - swing, '#59606b');
          px(7, 26, 3, 2, '#2c2f36');
          px(12, 26, 3, 2, '#2c2f36');
          if (merged && r < 3 && c === 2) px(18, 8, 20, 3, '#e5e7eb');
        }),
      );
      const img = document.querySelector<HTMLImageElement>('[data-testid="one-shot-grid"] img')!;
      img.src = canvas.toDataURL('image/png');
    },
    { cols: COLS, rows: ROWS, merged },
  );
}

test('one-shot toggle: the grid it asks for (light)', async ({ page }) => {
  await openSprites(page, 'light');
  const panel = page.getByTestId('sprite-create-panel');
  await panel.getByLabel('Name', { exact: true }).fill('Knight');
  await panel.getByLabel('Prompt').fill('A knight in plate armour with a red plume');
  await panel.getByRole('checkbox', { name: 'Try generating the whole sheet in one image' }).check();
  await expect(panel.getByTestId('one-shot-options')).toBeVisible();
  await settle(page, 400);
  await page.screenshot({ path: shotPath(OUT, 'sprites-one-shot-toggle-light.png') });
  await panel.getByLabel('walk frames').fill('9');
  await expect(panel.getByTestId('one-shot-options').getByRole('alert')).toBeVisible();
  await settle(page, 200);
  await page.screenshot({ path: shotPath(OUT, 'sprites-one-shot-too-many-light.png') });
});

test('grid detection preview and per-row verdict (dark)', async ({ page }) => {
  await openSprites(page, 'dark');
  await page.locator('[data-media-pane="explorer"]').getByRole('button', { name: 'knight' }).click();
  await expect(page.getByTestId('sprite-one-shot')).toBeVisible();
  await paintSheet(page, false);
  await settle(page, 400);
  await page.screenshot({ path: shotPath(OUT, 'sprites-one-shot-verdict-dark.png') });
});

test('a mismatched grid is reported, not sliced (dark)', async ({ page }) => {
  await openSprites(page, 'dark');
  await page.locator('[data-media-pane="explorer"]').getByRole('button', { name: 'rogue' }).click();
  await expect(page.getByTestId('sprite-one-shot')).toBeVisible();
  await paintSheet(page, true);
  await settle(page, 400);
  await page.screenshot({ path: shotPath(OUT, 'sprites-one-shot-mismatch-dark.png') });
});
