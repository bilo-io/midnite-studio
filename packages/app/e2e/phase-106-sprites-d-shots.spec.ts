import { expect, test, type Page } from '@playwright/test';

import { clickRailLink, fixtures, installMockBridge, type MockFixtures, setTheme, settle, SHOT_VIEWPORTS, shotPath } from './shots-helper';

/**
 * Phase 106 Theme D screenshots for the PR: the hand-drawn create options with reference-blind
 * providers disabled, the reference card awaiting approval, and a new reference over existing frames
 * (Keep / Mark all for re-roll) with the flagged-frames list. Run with `MSTUDIO_SHOTS=1`; skipped
 * otherwise. Behaviour is covered in vitest (`sprite-reference.bridge.test.tsx`, `hand-drawn.test.ts`).
 *
 * The mock bridge cannot serve `mstudio-file://` URLs, so the reference `<img>` is pointed at a
 * turnaround the spec draws on a canvas — a stand-in for what a provider returns.
 */
const OUT = '../../docs/screenshots/phase-106-sprites-d';

test.skip(!process.env['MSTUDIO_SHOTS'], 'set MSTUDIO_SHOTS=1 to write screenshots');
test.describe.configure({ timeout: 90_000 });
test.use({ viewport: SHOT_VIEWPORTS.wide });

const REF = { kind: 'image', file: 'reference/reference.png', approved: false };
const sheet = (name: string, extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    version: 1,
    kind: 'sheet',
    name,
    prompt: 'A knight in plate armour with a red plume',
    style: 'pixel',
    method: 'hand-drawn',
    provider: 'gemini',
    model: 'gemini-2.5-flash-image',
    clips: [
      { name: 'idle', frames: 4, fps: 6, loop: 'loop' },
      { name: 'walk', frames: 8, fps: 10, loop: 'loop' },
    ],
    ...extra,
  });

const meta = (badges: string[], extra: Record<string, unknown> = {}) => ({ anchorNudge: [0, 0], flipped: false, source: 'generated', badges, ...extra });

const data: MockFixtures = {
  ...fixtures,
  media: {
    files: {
      'sprite:characters': {
        'knight-20261006-120000/sprite.json': sheet('Knight', { reference: REF }),
        'rogue-20261005-090000/sprite.json': sheet('Rogue', { prompt: 'A hooded rogue with twin daggers', reference: REF }),
        'rogue-20261005-090000/frames/frames.json': JSON.stringify({
          frames: {
            'idle/e/000': meta([], { score: 0.91 }),
            'idle/e/001': meta(['inconsistent'], { score: 0.42, issues: ['cloak is green, not grey', 'daggers missing'] }),
            'idle/e/002': meta([], { score: 0.88 }),
            'walk/e/003': meta(['unchecked']),
            'walk/e/004': meta(['inconsistent'], { score: 0.55, issues: ['hood is down'] }),
          },
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

/** Draws a three-view pixel turnaround (front, side, back) on magenta and swaps it into the reference card. */
async function paintReference(page: Page): Promise<void> {
  await page.getByTestId('sprite-reference').locator('img').waitFor();
  await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 288;
    canvas.height = 192;
    const g = canvas.getContext('2d')!;
    g.fillStyle = '#ff00ff';
    g.fillRect(0, 0, 288, 192);
    const px = (x: number, y: number, w: number, h: number, c: string) => {
      g.fillStyle = c;
      g.fillRect(x * 4, y * 4, w * 4, h * 4);
    };
    for (const [i, view] of (['front', 'side', 'back'] as const).entries()) {
      const ox = 6 + i * 24;
      px(ox + 4, 6, 6, 6, '#9aa4b1'); // helmet
      if (view !== 'back') px(ox + (view === 'side' ? 7 : 5), 8, view === 'side' ? 3 : 4, 2, '#1c2230'); // visor
      px(ox + 6, 3, 2, 4, '#d0302a'); // plume
      px(ox + 3, 12, 8, 10, '#7d8794'); // body
      px(ox + 5, 14, 4, 6, '#d0302a'); // tabard
      px(ox + 1, 13, 2, 8, '#6a7380'); // arm
      px(ox + 11, 13, 2, 8, '#6a7380'); // arm
      px(ox + 4, 22, 2, 10, '#59606b'); // leg
      px(ox + 8, 22, 2, 10, '#59606b'); // leg
      px(ox + 3, 32, 3, 2, '#2c2f36'); // boot
      px(ox + 8, 32, 3, 2, '#2c2f36'); // boot
    }
    const img = document.querySelector<HTMLImageElement>('[data-testid="sprite-reference"] img')!;
    img.src = canvas.toDataURL('image/png');
    img.style.imageRendering = 'pixelated';
  });
}

test('hand-drawn create options, reference-blind providers disabled (dark)', async ({ page }) => {
  await openSprites(page, 'dark');
  const panel = page.getByTestId('sprite-create-panel');
  await panel.getByLabel('Name').fill('Knight');
  await expect(panel.getByTestId('hand-drawn-options')).toBeVisible();
  await panel.getByTestId('sprite-picker').getByRole('button').first().click();
  await settle(page, 400);
  await page.screenshot({ path: shotPath(OUT, 'sprites-hand-drawn-create-dark.png') });
});

test('reference awaiting approval (light)', async ({ page }) => {
  await openSprites(page, 'light');
  await page.locator('[data-media-pane="explorer"]').getByRole('button', { name: 'knight' }).click();
  await expect(page.getByTestId('sprite-reference')).toBeVisible();
  await paintReference(page);
  await settle(page, 400);
  await page.screenshot({ path: shotPath(OUT, 'sprites-reference-approve-light.png') });
});

test('new reference over existing frames, and flagged frames (dark)', async ({ page }) => {
  await openSprites(page, 'dark');
  await page.locator('[data-media-pane="explorer"]').getByRole('button', { name: 'rogue' }).click();
  await expect(page.getByRole('button', { name: 'Mark all for re-roll' })).toBeVisible();
  await paintReference(page);
  await settle(page, 400);
  await page.screenshot({ path: shotPath(OUT, 'sprites-reference-changed-dark.png') });
});
