import { expect, test, type Page } from '@playwright/test';

import { installSuiteBridge, VANGUARD_EMPTY_ANSWERS } from '../../test-support/suite-bridge';
import { prepareForVisualCapture } from '../shots-helper';

/**
 * The suite shell's three variants in Vanguard (Phase 123 Theme I.2): framed (a native window frame, so the
 * shell draws its title bar in normal flow), frameless (the shell's own bar with the traffic-light inset),
 * and the nav with a module section collapsed.
 *
 * Browser capability: appearance. Fixed-position chrome, the rail's width and the title bar's inset are
 * real CSS the jsdom suites cannot see; `suite-app-shell.test.tsx` already proves the DOM structure.
 * The title bar's date/time pill follows the real clock, so it is masked.
 */
/** `playwright.visual.config.ts` serves Vanguard on its own port, apart from the functional config's. */
const VANGUARD_URL = `http://localhost:${process.env.MSTUDIO_VISUAL_VANGUARD_PORT ?? 5294}/`;

async function openShell(page: Page, frameless: boolean): Promise<void> {
  await installSuiteBridge(page, { frameless, answers: VANGUARD_EMPTY_ANSWERS });
  await page.setViewportSize({ width: 900, height: 520 });
  await page.goto(VANGUARD_URL);
  await expect(page.locator('.app-shell[data-app="vanguard"]')).toBeVisible();
  await prepareForVisualCapture(page);
}

/** The pointer off the rail (its hover expands it) and the date/time pill masked (it follows the real clock). */
async function capture(page: Page, name: string): Promise<void> {
  await page.mouse.move(600, 300);
  await expect(page.getByRole('complementary', { name: 'Views' })).toHaveCSS('width', '56px');
  await expect(page.locator('#root')).toHaveScreenshot(name, { mask: [page.getByTestId('titlebar-status-pill')] });
}

test('framed: the title bar sits in normal flow under the native frame', async ({ page }) => {
  await openShell(page, false);
  await capture(page, 'shell-framed.png');
});

test('frameless: the shell draws its own title bar and rail', async ({ page }) => {
  await openShell(page, true);
  await capture(page, 'shell-frameless.png');
});

test('nav collapsed: a module section folded to its chevron', async ({ page }) => {
  await openShell(page, true);
  const section = page.locator('button[aria-controls="nav-section-vanguard"]');
  await section.click();
  await expect(section).toHaveAttribute('aria-expanded', 'false');
  await capture(page, 'shell-nav-collapsed.png');
});
