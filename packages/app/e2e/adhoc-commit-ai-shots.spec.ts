import { expect, test, type Page } from '@playwright/test';

import { fixtures, installMockBridge, type MockFixtures, setReducedMotion, setTheme, shotPath } from './shots-helper';

/**
 * "Write with AI" on the commit box (ad hoc) — the sparkles button at the
 * right of the message input, at rest and with its tooltip. Real browser for
 * real paint: absolute placement over the autogrowing textarea, the gradient
 * border and the tooltip bubble.
 *
 * Run with `MSTUDIO_SHOTS=1`; skipped otherwise so the normal suite stays fast.
 */
const OUT = '../../docs/screenshots/adhoc-commit-ai';

test.skip(!process.env['MSTUDIO_SHOTS'], 'set MSTUDIO_SHOTS=1 to write screenshots');

const DATA: MockFixtures = {
  ...fixtures,
  statusEntries: [
    { path: 'README.md', origPath: null, staged: 'unmodified', unstaged: 'modified', conflicted: false, similarity: null },
    { path: 'src/a.ts', origPath: null, staged: 'unmodified', unstaged: 'modified', conflicted: false, similarity: null },
    { path: 'src/b.ts', origPath: null, staged: 'unmodified', unstaged: 'modified', conflicted: false, similarity: null },
  ],
};

async function open(page: Page, theme: 'light' | 'dark') {
  await page.setViewportSize({ width: 1440, height: 900 });
  await installMockBridge(page, DATA);
  await page.goto('/');
  await setTheme(page, theme);
  await setReducedMotion(page);
  await expect(page.getByText('feat(phase-11): package, install and run from /Applications').first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('button', { name: /^3 uncommitted changes/ })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /^3 uncommitted changes/ }).click();
}

for (const theme of ['light', 'dark'] as const) {
  test(`commit box with the Write with AI button, ${theme}`, async ({ page }) => {
    await open(page, theme);
    const box = page.getByPlaceholder('Commit message').filter({ visible: true });
    const wrapper = box.locator('xpath=../..');
    await page.mouse.move(1400, 880);
    await wrapper.screenshot({ path: shotPath(OUT, `rest-${theme}`) });

    await page.getByRole('button', { name: 'Write with AI' }).filter({ visible: true }).hover();
    await page.waitForTimeout(600);
    const region = await wrapper.boundingBox();
    await page.screenshot({
      path: shotPath(OUT, `tooltip-${theme}`),
      clip: { x: region!.x - 20, y: Math.max(0, region!.y - 50), width: region!.width + 40, height: region!.height + 100 },
    });
  });
}
