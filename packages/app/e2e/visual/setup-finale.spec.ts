import { expect, test, type Page } from '@playwright/test';

import { fixtures, installMockBridge, prepareForVisualCapture, setTheme } from '../shots-helper';

/**
 * Phase 98 Theme J's Welcome finale, in both themes: "Welcome to [mark] Midnite
 * Studio" with the gradient wordmark, the line under it, and Back / Get started.
 *
 * Visual layer, not vitest: what this guards is appearance — the brand
 * gradient clipped to text, `font-brand` on "Midnite" only, the mark sitting on
 * the heading's baseline — none of which jsdom renders. The finale's own
 * behaviour (timeline, reduced-motion static render, Get started → completedAt)
 * is covered in `setup-overlay.test.tsx` and `setup-choreography.test.ts`.
 *
 * Reduced motion is switched on *before* Begin, not just before capture:
 * `prepareForVisualCapture` would close the fades, but the completion
 * transition, the mark's FLIP glide and every page's typed title would still
 * have run, and under reduced motion the machine renders the finale as one
 * static frame (Theme B/J's "one frame at 0"). That is the only state stable
 * enough for a byte-exact baseline.
 */
async function openFinale(page: Page): Promise<void> {
  await installMockBridge(page, { ...fixtures, firstRun: true } as never);
  await page.goto('/');
  await prepareForVisualCapture(page);
  const overlay = page.getByTestId('setup-overlay');
  await overlay.getByRole('button', { name: 'Begin setup' }).click();
  // ←/→ walks the pages; the count comes from SETUP_PAGES, so loop until the
  // machine reports the finale rather than hard-coding it.
  await expect(async () => {
    if ((await overlay.getAttribute('data-step')) !== 'finale') await page.keyboard.press('ArrowRight');
    await expect(overlay).toHaveAttribute('data-step', 'finale', { timeout: 500 });
  }).toPass({ timeout: 20_000 });
  await expect(page.getByTestId('setup-finale')).toBeVisible();
}

for (const theme of ['light', 'dark'] as const) {
  test(`the setup Welcome finale (${theme})`, async ({ page }) => {
    await openFinale(page);
    await setTheme(page, theme);

    await expect(page.getByTestId('setup-finale')).toHaveScreenshot(`setup-finale-${theme}.png`);
  });
}
