import { expect, test, type Page } from '@playwright/test';

import { installShotsBridge, SHOT_VIEWPORTS } from './shots-helper';

/**
 * The committed screenshots for Phase 57 Theme F — the new Settings ▸ MCP
 * Server page, light and dark. `openMcpSettings` passes `mcp: { enabled: true }`
 * to `installShotsBridge` (the fixture is off by default, matching the real
 * app — see `MockFixtures.mcp`'s own doc comment), which reports the server on
 * with a couple of sample audit-ring entries, so both shots show the
 * populated state rather than the off-by-default empty one.
 *
 * Run with `MSTUDIO_SHOTS=1`; skipped otherwise, matching every other
 * `*-shots.spec.ts` in this suite.
 */
const OUT = '../../docs/screenshots/p57-ef';

async function openMcpSettings(page: Page): Promise<void> {
  await installShotsBridge(page, { mcp: { enabled: true } });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();
  // The bottom-of-rail Settings entry is a plain button, not a router link.
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('navigation', { name: 'Settings pages' }).getByRole('button', { name: 'MCP Server' }).click();
  await expect(page.getByText('Enable MCP server').first()).toBeVisible();
  await expect(page.getByText('Listening')).toBeVisible();
}

/** Same two-step dark sequence every `*-shots.spec.ts` dark case uses. */
async function goDark(page: Page): Promise<void> {
  await page.emulateMedia({ colorScheme: 'dark' });
}
async function paintDark(page: Page): Promise<void> {
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  await page.waitForTimeout(400);
}

const SETTLE_MS = 300;

test.describe('Settings ▸ MCP Server screenshots', () => {
  test.skip(!process.env.MSTUDIO_SHOTS, 'set MSTUDIO_SHOTS=1 to regenerate');
  test.use({ viewport: SHOT_VIEWPORTS.default });

  test('MCP Server settings, light', async ({ page }) => {
    await openMcpSettings(page);
    await page.waitForTimeout(SETTLE_MS);
    await page.screenshot({ path: `${OUT}/settings-mcp-light.png` });
  });

  test('MCP Server settings, dark', async ({ page }) => {
    await goDark(page);
    await openMcpSettings(page);
    await paintDark(page);
    await page.screenshot({ path: `${OUT}/settings-mcp-dark.png` });
  });
});
