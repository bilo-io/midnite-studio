import type { Page } from '@playwright/test';

/**
 * Viewport widths that land the status bar's density on the correct side of
 * its own breakpoint, measured against whatever fonts this browser actually
 * has — not a pixel guessed against macOS's (Phase 38 Theme I).
 *
 * `densityFor` (`lib/density.ts`) decides purely from measured content width:
 * `fullWidth`/`compactWidth`, the bar's natural `scrollWidth` with every
 * segment showing its label and icon-only respectively. Those numbers move
 * with the font a runner substitutes for the label text, which is exactly why
 * `shortcut-rail.spec.ts` and `status-bar.spec.ts` picked a viewport that was
 * green on macOS and red on CI: a hard-coded pixel value assumes macOS's
 * measurement. This reads the same two numbers from whichever machine the
 * spec is actually running on — see the measuring function below for why it
 * cannot just replay `use-overflow.ts`'s own version of the read — so a
 * viewport picked relative to them is unambiguous regardless of what
 * substitutes for the font.
 */
export async function densityViewportWidths(
  page: Page,
  testId = 'status-bar',
): Promise<{ compact: number; collapsed: number }> {
  const viewport = page.viewportSize();
  if (!viewport) throw new Error('densityViewportWidths needs a viewport already set');

  const { clientWidth, fullWidth, compactWidth } = await page.evaluate((id) => {
    const el = document.querySelector(`[data-testid="${id}"]`) as HTMLElement;
    const clientWidth = el.clientWidth;
    const restoreDensity = el.dataset.density;
    const restoreWidth = el.style.width;
    /*
      `use-overflow.ts`'s own version of this dance reads `scrollWidth`
      without forcing a width, and that is honest there because it only ever
      runs once the ResizeObserver has already narrowed the bar past what its
      content wants — an actual overflow to report. Read from a wide test
      viewport, the same call is a no-op: nothing overflows a `1fr` grid track
      that has room to spare, so `scrollWidth` just echoes `clientWidth`
      regardless of density. Forcing the element itself down to 1px first
      manufactures that overflow unconditionally, so `scrollWidth` reports the
      content's true natural width independent of whatever the viewport
      happens to be.
    */
    el.style.width = '1px';
    el.dataset.density = 'full';
    const fullWidth = el.scrollWidth;
    el.dataset.density = 'compact';
    const compactWidth = el.scrollWidth;
    el.style.width = restoreWidth;
    if (restoreDensity === undefined) delete el.dataset.density;
    else el.dataset.density = restoreDensity;
    return { clientWidth, fullWidth, compactWidth };
  }, testId);

  /*
    The bar sits inside window chrome (the nav rail, padding) that does not
    scale with the window — measured once, this offset turns a target CONTENT
    width into the WINDOW width that produces it, and holds across the resizes
    below because none of that chrome is itself density-dependent.
  */
  const chrome = viewport.width - clientWidth;

  return {
    // Comfortably between the two thresholds, same reasoning the specs'
    // own hard-coded numbers used to reach for — just measured instead of
    // guessed.
    compact: Math.round((fullWidth + compactWidth) / 2) + chrome,
    // Comfortably under `compactWidth`, so hysteresis on the way down can
    // never leave it reading `compact`.
    collapsed: Math.round(compactWidth * 0.85) + chrome,
  };
}
