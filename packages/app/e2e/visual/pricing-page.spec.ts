import { expect, test } from '@playwright/test';

/**
 * Phase 90 Theme K — the phase's one visual baseline: the pricing page's
 * three-column grid at desktop width.
 *
 * The pricing page lives in `packages/website` (public marketing, off this
 * app's dependency graph — see CLAUDE.md's package-boundaries section), not
 * in `packages/app`, so this spec navigates to the SECOND `webServer` entry
 * `playwright.visual.config.ts` starts (the website's own `vite` dev server,
 * unmodified, on its own fixed port) rather than the app's `baseURL`. The
 * committed baseline still lands under this package's
 * `e2e/visual/__screenshots__/` — the one directory `scripts/visual-budget.mjs`
 * and the `visual` CI job already know to look at, and the ~100/3MB cap
 * counts against — rather than opening a second, uncounted screenshots
 * corpus under `packages/website`.
 *
 * This is appearance ("does the pricing grid look right at its own
 * breakpoint"), exactly what `moon run app:visual`'s locator-cropped
 * `toHaveScreenshot` layer is for, and not a functional assertion — the
 * page's actual behaviour (which route renders which tier, the early-access
 * links) already has its own `pricing-page.test.tsx` under jsdom.
 */
const WEBSITE_PORT = Number(process.env.MSTUDIO_VISUAL_WEBSITE_PORT ?? 5174);

test('the pricing page, three columns at desktop width', async ({ page }) => {
  // The site's own reduced-motion path: `tokens.css` zeroes the entrance
  // transition's duration tokens under this media query, so `Reveal`'s
  // fade-up lands instantly rather than racing the screenshot.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1280, height: 900 });

  await page.goto(`http://localhost:${WEBSITE_PORT}/pricing/`);
  await page.evaluate(() => document.fonts.ready);

  const columns = page.getByTestId('pricing-columns');
  await expect(columns).toBeVisible();
  await expect(columns).toHaveScreenshot('pricing-columns-desktop.png');
});
