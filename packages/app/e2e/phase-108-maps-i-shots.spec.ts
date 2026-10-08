import { expect, test } from '@playwright/test';

import { installShotsBridge, setTheme, settle, SHOT_VIEWPORTS, shotPath } from './shots-helper';

/**
 * Phase 108 Theme I screenshots for the PR: Settings ▸ MCP's new "Let agents capture maps" switch, on and
 * off, in both themes. Appearance only — the toggle's behaviour is covered in vitest (`mcp-page.test.tsx`).
 * Run with `MSTUDIO_SHOTS=1`; skipped otherwise.
 */
const OUT = '../../docs/screenshots/phase-108-maps-i';

test.skip(!process.env['MSTUDIO_SHOTS'], 'set MSTUDIO_SHOTS=1 to write screenshots');
test.describe.configure({ timeout: 90_000 });
test.use({ viewport: SHOT_VIEWPORTS.default });

for (const theme of ['light', 'dark'] as const) {
  for (const allowMaps of [false, true]) {
    test(`Settings ▸ MCP: Let agents capture maps, ${allowMaps ? 'on' : 'off'} (${theme})`, async ({ page }) => {
      await installShotsBridge(page, { mcp: { enabled: true, allowMaps } });
      await page.goto('/');
      await expect(page.getByRole('banner', { name: 'Window title bar' })).toBeVisible({ timeout: 30_000 });
      await setTheme(page, theme);
      await page.getByRole('button', { name: 'Settings' }).click();
      await page.getByRole('navigation', { name: 'Settings pages' }).getByRole('button', { name: 'MCP Server' }).click();
      await page.getByRole('button', { name: 'Let agents capture maps' }).click();
      const toggle = page.getByTestId('mcp-allow-maps');
      await toggle.scrollIntoViewIfNeeded();
      await expect(toggle).toBeEnabled();
      await settle(page, 400);
      await page.screenshot({ path: shotPath(OUT, `settings-mcp-maps-${allowMaps ? 'on' : 'off'}-${theme}.png`) });
    });
  }
}
