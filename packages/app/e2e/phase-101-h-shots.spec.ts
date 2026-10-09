import { expect, test } from '@playwright/test';

import { installShotsBridge, setTheme, settle, SHOT_VIEWPORTS, shotPath } from './shots-helper';

/**
 * Phase 101 Theme H screenshots for the PR: Settings ▸ MCP's "Let agents edit music" switch (off, on) and
 * the Antigravity registration step, which asks before it edits another tool's config. Appearance only —
 * the behaviour is covered in vitest (`mcp-page.test.tsx`). Run with `MSTUDIO_SHOTS=1`; skipped otherwise.
 */
const OUT = '../../docs/screenshots/p101-h';

test.skip(!process.env['MSTUDIO_SHOTS'], 'set MSTUDIO_SHOTS=1 to write screenshots');
test.describe.configure({ timeout: 90_000 });
test.use({ viewport: SHOT_VIEWPORTS.default });

async function openMusicCard(page: import('@playwright/test').Page, theme: 'light' | 'dark') {
  await page.goto('/');
  await expect(page.getByRole('banner', { name: 'Window title bar' })).toBeVisible({ timeout: 30_000 });
  await setTheme(page, theme);
  await page.getByRole('button', { name: 'Settings' }).click();
  // Hovering the rail expands it over the page; park the pointer in the content first.
  await page.mouse.move(900, 500);
  await settle(page, 300);
  await page.getByRole('navigation', { name: 'Settings pages' }).getByRole('button', { name: 'MCP Server' }).click();
  await page.getByRole('button', { name: 'Let agents edit music' }).click();
  const toggle = page.getByTestId('mcp-allow-music');
  await toggle.scrollIntoViewIfNeeded();
  await expect(toggle).toBeEnabled();
}

for (const theme of ['light', 'dark'] as const) {
  for (const allowMusic of [false, true]) {
    test(`Settings ▸ MCP: Let agents edit music, ${allowMusic ? 'on' : 'off'} (${theme})`, async ({ page }) => {
      await installShotsBridge(page, { mcp: { enabled: true, allowMusic } });
      await openMusicCard(page, theme);
      await settle(page, 400);
      await page.getByTestId('mcp-agy-register').scrollIntoViewIfNeeded();
      await page.screenshot({ path: shotPath(OUT, `settings-mcp-music-${allowMusic ? 'on' : 'off'}-${theme}.png`) });
    });
  }
}

test('Settings ▸ MCP: Antigravity registration asks first (dark)', async ({ page }) => {
  await installShotsBridge(page, { mcp: { enabled: true, allowMusic: true } });
  await openMusicCard(page, 'dark');
  await page.getByTestId('mcp-agy-register-button').click();
  await expect(page.getByTestId('mcp-agy-consent')).toBeVisible();
  await page.getByTestId('mcp-agy-register').scrollIntoViewIfNeeded();
  await settle(page, 400);
  await page.screenshot({ path: shotPath(OUT, 'settings-mcp-music-agy-consent-dark.png') });
});
