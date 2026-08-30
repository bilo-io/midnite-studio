import { expect, test, type Page } from '@playwright/test';

import { fixtures } from './fixtures';
import { installMockBridge } from './mock-bridge';

/**
 * The screenshots for the midnite menu — the row's three marks, the menu open,
 * and the Agent page's skill fields.
 *
 * Run with `MSTUDIO_SHOTS=1`; skipped otherwise, so the normal suite stays fast and
 * does not rewrite committed images on every run.
 */

/** Relative to `packages/app`, Playwright's cwd — hence the `../../`. */
const OUT = '../../docs/screenshots/midnite-menu';

const REPO = 'midnite-studio';

test.beforeEach(async ({ page }) => {
  test.skip(!process.env.MSTUDIO_SHOTS, 'set MSTUDIO_SHOTS=1 to regenerate');
  await installMockBridge(page, fixtures);
  await page.goto('/');
  await expect(page.getByRole('columnheader', { name: 'Commit message' })).toBeVisible();
});

/** `animations: 'disabled'`, so the shell's cascade is settled in every shot. */
async function shoot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: `${OUT}/${name}.png`, animations: 'disabled' });
}

test('the row, closed — three marks rather than three ellipses', async ({ page }) => {
  // Hovered, so the mark's hover colour (plain foreground, over the accent it
  // rests in) is in the picture rather than only described in a comment.
  await page.getByRole('button', { name: `Run a midnite skill on ${REPO}` }).hover();
  await shoot(page, 'row-marks');
});

test('the menu, open', async ({ page }) => {
  await page.getByRole('button', { name: `Run a midnite skill on ${REPO}` }).click();
  await expect(page.getByRole('menuitem', { name: 'Loops' })).toBeVisible();
  await shoot(page, 'menu-open');
});

test('the Agent page, where each entry is pointed', async ({ page }) => {
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Agent', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Skill for Backlog Task' })).toBeVisible();
  await shoot(page, 'settings-agent-skills');
});
