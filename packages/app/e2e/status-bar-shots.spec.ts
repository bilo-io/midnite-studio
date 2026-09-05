import { expect, test, type Page } from '@playwright/test';

import {
  fixtures,
  installMockBridge,
  type MockFixtures,
  REPRODUCIBLE_NOW_MS,
  REPRODUCIBLE_REMOTE,
  settle,
  setTheme,
  shotPath,
} from './shots-helper';

/**
 * The committed screenshots the Phase 27 doc's own Verification checklist
 * asks for: the full-width bar open and shut, `compact` and `collapsed`
 * densities, the overflow popover open, and the browser pane open — each in
 * both themes, following `actions-shots.spec.ts`'s dark pattern.
 *
 * Gated behind `MSTUDIO_SHOTS`, like `shots.spec.ts` and `dashboard-shots.spec.ts` —
 * these are new committed images, not an existing set a normal run must keep
 * passing, so they should not regenerate silently on every `app:e2e`.
 */

const OUT = '../../docs/screenshots/phase-27-status-bar';

const FAILING_PR = {
  number: 7,
  title: 'x',
  state: 'open',
  isDraft: false,
  reviewDecision: null,
  checks: 'failing',
  headBranch: 'main',
  author: 'me',
  url: 'https://example.com/pr/7',
  mergedAt: null,
  closedAt: null,
};

const data: MockFixtures = {
  ...fixtures,
  remotes: [REPRODUCIBLE_REMOTE],
  diagnostics: {
    candidates: [{ id: 'eslint', label: 'ESLint' }],
    trust: { state: 'trusted', command: null, trustedAt: REPRODUCIBLE_NOW_MS },
    result: { total: 3 },
  },
  metricsSamples: [{ at: REPRODUCIBLE_NOW_MS, cpu: 42, memory: 55, gpu: 30, disk: 72 }],
  forge: { pulls: [FAILING_PR] },
};

async function land(page: Page): Promise<void> {
  await installMockBridge(page, data);
  await page.goto('/');
  await expect(page.getByTestId('status-bar')).toBeVisible();
  await settle(page, 300);
}

test.describe('status bar screenshots', () => {
  test.skip(!process.env.MSTUDIO_SHOTS, 'set MSTUDIO_SHOTS=1 to regenerate');

  for (const theme of ['light', 'dark'] as const) {
    test(theme, async ({ page }) => {
      await setTheme(page, theme);
      await land(page);

      const bar = page.getByTestId('status-bar');

      // Full density, repositories panel open — the phase's own premise: the
      // bar spans the whole content area, not just the view's width.
      await bar.screenshot({ path: shotPath(OUT, `status-bar-full-${theme}.png`) });

      // Shut — the bar's left edge does not move (Theme A).
      await page.getByRole('button', { name: 'Toggle Repositories' }).click();
      await settle(page, 250);
      await bar.screenshot({ path: shotPath(OUT, `status-bar-repos-shut-${theme}.png`) });
      await page.getByRole('button', { name: 'Toggle Repositories' }).click();
      await settle(page, 250);

      // Compact — labels drop to icons.
      await page.setViewportSize({ width: 900, height: 800 });
      await expect(bar).toHaveAttribute('data-density', 'compact');
      await bar.screenshot({ path: shotPath(OUT, `status-bar-compact-${theme}.png`) });

      // Collapsed, then the overflow popover open. A taller viewport here so
      // the popover's full segment list — up to the checks-verdict pill at
      // the bottom — fits in frame instead of clipping against the window.
      await page.setViewportSize({ width: 780, height: 950 });
      await expect(bar).toHaveAttribute('data-density', 'collapsed');
      await bar.screenshot({ path: shotPath(OUT, `status-bar-collapsed-${theme}.png`) });
      await page.getByTestId('status-overflow').click();
      await expect(page.getByTestId('status-overflow-panel')).toBeVisible();
      await settle(page, 200);
      await page.screenshot({ path: shotPath(OUT, `status-bar-overflow-popover-${theme}.png`) });
      await page.keyboard.press('Escape');

      // Back to full width for the browser pane, which covers the whole
      // content row while leaving the bar visible beneath it.
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.locator('[title^="Toggle browser"]').click();
      // The toggle raises the layout launcher first; full screen is what this
      // shot is about, and it is the pre-selected option.
      await page.getByTestId('browser-layout-full').click();
      await expect(page.getByRole('textbox', { name: 'Address' })).toBeVisible();
      await settle(page, 300);
      await page.screenshot({ path: shotPath(OUT, `status-bar-browser-pane-${theme}.png`) });
    });
  }
});
