import { expect, test } from '@playwright/test';

import { installShotsBridge, setTheme, settle, SHOT_VIEWPORTS, shotPath } from './shots-helper';

/**
 * Phase 109 Theme D screenshots for the PR: Settings ▸ MCP's new "Let agents change companion
 * settings" switch, off and on. Appearance only — the behaviour is covered in vitest
 * (`mcp-page.test.tsx`, `ui-requests-settings.test.ts`, `companion-tools.test.ts`). Run with
 * `MSTUDIO_SHOTS=1`; skipped otherwise.
 */
const OUT = '../../docs/screenshots/p109-d';

test.skip(!process.env['MSTUDIO_SHOTS'], 'set MSTUDIO_SHOTS=1 to write screenshots');
test.describe.configure({ timeout: 90_000 });
test.use({ viewport: SHOT_VIEWPORTS.default });

async function openCompanionCard(page: import('@playwright/test').Page, theme: 'light' | 'dark') {
  await page.goto('/');
  await expect(page.getByRole('banner', { name: 'Window title bar' })).toBeVisible({ timeout: 30_000 });
  await setTheme(page, theme);
  await page.getByRole('button', { name: 'Settings' }).click();
  // Hovering the rail expands it over the page; park the pointer in the content first.
  await page.mouse.move(900, 500);
  await settle(page, 300);
  await page.getByRole('navigation', { name: 'Settings pages' }).getByRole('button', { name: 'MCP Server' }).click();
  await page.getByRole('button', { name: 'Let agents change companion settings' }).click();
  const toggle = page.getByTestId('mcp-allow-companion-settings');
  await toggle.scrollIntoViewIfNeeded();
  await expect(toggle).toBeEnabled();
}

for (const theme of ['light', 'dark'] as const) {
  for (const allowCompanionSettings of [false, true]) {
    test(`Settings ▸ MCP: Let agents change companion settings, ${allowCompanionSettings ? 'on' : 'off'} (${theme})`, async ({
      page,
    }) => {
      await installShotsBridge(page, { mcp: { enabled: true, allowCompanionSettings } });
      await openCompanionCard(page, theme);
      await settle(page, 400);
      await page.screenshot({
        path: shotPath(OUT, `settings-mcp-companion-${allowCompanionSettings ? 'on' : 'off'}-${theme}.png`),
      });
    });
  }
}
