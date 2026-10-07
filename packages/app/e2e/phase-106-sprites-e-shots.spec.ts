import { expect, test, type Page } from '@playwright/test';

import { clickRailLink, fixtures, installMockBridge, type MockFixtures, setTheme, settle, SHOT_VIEWPORTS, shotPath } from './shots-helper';

/**
 * Phase 106 Theme E screenshots for the PR: the Rendered-from-3D options (rigged-model picker, clip
 * mapping, camera and shading), and a contact sheet of **real** renders — the `SpriteRenderHost`'s
 * three.js path run in this Chromium against an auto-rigged biped, laid out as the sheet's directions.
 * Run with `MSTUDIO_SHOTS=1`; skipped otherwise. Behaviour is covered by vitest and `sprite-render.spec.ts`.
 */
const OUT = '../../docs/screenshots/phase-106-sprites-e';

test.skip(!process.env['MSTUDIO_SHOTS'], 'set MSTUDIO_SHOTS=1 to write screenshots');
test.describe.configure({ timeout: 120_000 });
test.use({ viewport: SHOT_VIEWPORTS.wide });

const manifest = (name: string, extra: Record<string, unknown>) =>
  JSON.stringify({
    version: 1,
    name,
    agent: { provider: 'mcp' },
    author: { name: 'bilo' },
    prompt: '',
    details: { triangles: 1, vertices: 3, parts: 1, size: [1, 2, 1], materials: [] },
    files: { design: `${name.toLowerCase()}.json` },
    createdAt: '2026-10-07T10:00:00.000Z',
    ...extra,
  });

const data: MockFixtures = {
  ...fixtures,
  media: {
    files: {
      'model:characters': {
        'robot/model.json': manifest('Robot', {
          rig: { bones: 18, facing: '+z', bound: 16 },
          animations: [
            { name: 'idle', kind: 'idle', duration: 2.4, loop: true },
            { name: 'walk', kind: 'walk', duration: 1.1, loop: true },
            { name: 'Sprint', kind: 'run', duration: 0.7, loop: true },
            { name: 'die', kind: 'die', duration: 1.6, loop: false },
            { name: 'Dodge', kind: 'dodge', duration: 0.6, loop: false },
          ],
        }),
        'robot/robot.json': '{}',
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

test('rendered from 3D: model picker, clip mapping, camera (dark)', async ({ page }) => {
  await openSprites(page, 'dark');
  const panel = page.getByTestId('sprite-create-panel');
  await panel.getByLabel('Name', { exact: true }).fill('Robot');
  await panel.getByLabel('Perspective').selectOption('isometric');
  await panel.getByLabel('Directions').selectOption('8');
  await panel.getByRole('radio', { name: /Rendered from 3D/ }).click();
  await panel.getByTestId('sprite-rig-picker').selectOption('characters/robot/robot.json');
  await panel.getByLabel('Shading').selectOption('toon');
  await expect(panel.getByTestId('clip-mapping')).toBeVisible();
  await panel.getByTestId('rendered-options').scrollIntoViewIfNeeded();
  await settle(page, 400);
  await page.screenshot({ path: shotPath(OUT, 'sprites-rendered-options-dark.png') });
});

/** Renders the fixture in this page and lays the frames out as a contact sheet: one row per direction. */
async function contactSheet(page: Page, label: string, over: Record<string, unknown>): Promise<void> {
  await installMockBridge(page, fixtures);
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  const error = await page.evaluate(
    async ({ label, over }) => {
      const mod = (await import(/* @vite-ignore */ '/e2e/sprite-render-fixture.ts')) as typeof import('./sprite-render-fixture');
      const rendered = await mod.renderFixture(over);
      if (rendered.error) return rendered.error;
      const root = document.createElement('div');
      root.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#14161c;color:#cfd3dc;font:13px system-ui;padding:24px;overflow:auto';
      root.innerHTML = `<div style="margin-bottom:14px;font-weight:600">${label}</div>`;
      const dirs = [...new Set(rendered.frames.map((f) => f.dir))];
      for (const dir of dirs) {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:6px';
        row.innerHTML = `<span style="width:28px;font-family:monospace">${dir}</span>`;
        for (const f of rendered.frames.filter((x) => x.dir === dir)) {
          const img = document.createElement('img');
          img.src = URL.createObjectURL(new Blob([Uint8Array.from(atob(f.png), (c) => c.charCodeAt(0))], { type: 'image/png' }));
          img.style.cssText = 'width:96px;height:96px;image-rendering:pixelated;background:repeating-conic-gradient(#20232b 0 25%,#2a2e38 0 50%) 0 0/12px 12px;border-radius:4px';
          row.appendChild(img);
        }
        root.appendChild(row);
      }
      document.body.appendChild(root);
      await Promise.all([...root.querySelectorAll('img')].map((img) => img.decode()));
      return null;
    },
    { label, over },
  );
  expect(error).toBeNull();
}

test('real renders: isometric 8 directions, lit', async ({ page }) => {
  await contactSheet(page, 'Rendered from 3D — walk, isometric (26.565°), 8 directions, lit, 4× supersampled → 64×64', {
    directions: ['s', 'sw', 'w', 'nw', 'n', 'ne', 'e', 'se'],
    settings: { camera: 'isometric', elevationDeg: 26.565051177077994, azimuthDeg: 0, shading: 'lit', outline: false, supersample: 4 },
  });
  await settle(page, 300);
  await page.screenshot({ path: shotPath(OUT, 'sprites-rendered-isometric-lit.png') });
});

test('real renders: side, toon with outline', async ({ page }) => {
  await contactSheet(page, 'Rendered from 3D — walk, side camera, 4 directions, toon + outline', {
    settings: { camera: 'side', elevationDeg: 0, azimuthDeg: 0, shading: 'toon', outline: true, supersample: 4 },
  });
  await settle(page, 300);
  await page.screenshot({ path: shotPath(OUT, 'sprites-rendered-side-toon.png') });
});
