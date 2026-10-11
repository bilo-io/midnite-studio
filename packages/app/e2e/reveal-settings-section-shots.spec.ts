import { expect, test, type Page } from '@playwright/test';

import { installShotsBridge, setReducedMotion, setTheme, shotPath } from './shots-helper';

/**
 * Phase 112 Theme F — the ring a reveal puts on a settings section after it
 * scrolls to it. Driven through the real `revealResource` engine (imported off
 * the dev server, so it is the app's own module instance), not by setting the
 * attribute by hand.
 *
 * Run with `MSTUDIO_SHOTS=1`; skipped otherwise, like every `*-shots.spec.ts`.
 */
const OUT = '../../docs/screenshots/p112-ef';

test.skip(!process.env['MSTUDIO_SHOTS'], 'set MSTUDIO_SHOTS=1 to regenerate');
test.setTimeout(240_000);
expect.configure({ timeout: 60_000 });

async function reveal(page: Page, theme: 'light' | 'dark'): Promise<void> {
  await installShotsBridge(page, {});
  await page.goto('/');
  await expect(page.getByRole('columnheader', { name: 'Commit message' })).toBeVisible();
  await setReducedMotion(page);
  await setTheme(page, theme, { settleMs: 200 });
  await page.evaluate(async (path) => {
    const mod = await import(/* @vite-ignore */ path);
    return mod.revealResource({ kind: 'setting', page: 'terminal', section: 'memory' }, { caller: 'companion' });
  }, '/src/features/companion/reveal/reveal.ts');
  // Off the rail: the expanded rail would cover the settings nav.
  await page.mouse.move(900, 500);
  await expect(page.locator('[data-settings-section="memory"].settings-section-highlight')).toBeVisible();
}

for (const theme of ['light', 'dark'] as const) {
  test(`Settings ▸ Terminal ▸ Memory, revealed — ${theme}`, async ({ page }) => {
    await reveal(page, theme);
    await page.screenshot({ path: shotPath(OUT, `settings-section-reveal-${theme}.png`) });
  });
}
