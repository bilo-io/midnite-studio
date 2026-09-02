import { expect, test, type Page } from '@playwright/test';

import { fixtures } from './fixtures';
import { installMockBridge } from './mock-bridge';

/**
 * Phase 39 Theme G — the density × state screenshot matrix for the shortcut
 * rail, deliberately deferred out of `shortcut-rail.spec.ts` (PR #7's own
 * comment: "Deliberately not a screenshot suite — the density × state matrix
 * belongs to Theme G, which is not in this PR").
 *
 * The four loop launchers this theme's doc also asks for moved to the title
 * bar's agent cluster after PR #7 landed (`components/title-bar-agents.tsx`);
 * their shots live in `fab-loops-shots.spec.ts` and `titlebar-agents.spec.ts`
 * instead. This suite covers only what still lives in the rail: the five
 * toggles across `full` (inactive, one active, one hovered), `compact`, and
 * `collapsed` (the overflow popover).
 *
 * Run with `MSTUDIO_SHOTS=1`; skipped otherwise so the normal suite stays fast.
 */
const OUT = '../../docs/screenshots/p39-g-shortcut-rail';

test.skip(!process.env['MSTUDIO_SHOTS'], 'set MSTUDIO_SHOTS=1 to write screenshots');

async function open(page: Page): Promise<void> {
  await installMockBridge(page, { ...fixtures });
  await page.goto('/');
  await expect(page.getByTestId('status-bar')).toBeVisible();
}

/**
 * The default fixture leaves both zones sparse enough to stay `full` at
 * widths where a real session would already have collapsed — the same reason
 * `shortcut-rail.spec.ts`'s own `openWide` exists. Reused here verbatim so the
 * compact/collapsed shots land at the same thresholds that spec measured.
 */
async function openWide(page: Page): Promise<void> {
  await installMockBridge(page, {
    ...fixtures,
    diagnostics: {
      candidates: [{ id: 'eslint', label: 'ESLint' }],
      trust: { state: 'trusted', command: null, trustedAt: Date.now() },
      result: { total: 3 },
    },
    metricsSamples: [{ at: Date.now(), cpu: 42, memory: 55, gpu: 30, disk: 72 }],
  } as never);
  await page.goto('/');
  await expect(page.getByTestId('status-bar')).toBeVisible();
}

test('full density, at rest', async ({ page }) => {
  await open(page);
  await expect(page.getByTestId('status-bar')).toHaveAttribute('data-density', 'full');
  await page.getByTestId('status-bar-left').screenshot({ path: `${OUT}/full-inactive.png` });
});

test('full density, one toggle active', async ({ page }) => {
  await open(page);
  await page.getByTestId('terminal-toggle').click();
  await expect(page.getByTestId('terminal-toggle')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('status-bar-left').screenshot({ path: `${OUT}/full-active.png` });
});

test('full density, hovered', async ({ page }) => {
  await open(page);
  await page.getByTestId('browser-toggle').hover();
  await expect(page.getByTestId('browser-toggle').locator('.status-label')).toBeVisible();
  await page.getByTestId('status-bar-left').screenshot({ path: `${OUT}/full-hovered.png` });
});

test('compact density', async ({ page }) => {
  await openWide(page);
  await page.setViewportSize({ width: 1080, height: 800 });
  await expect(page.getByTestId('status-bar')).toHaveAttribute('data-density', 'compact');
  await page.getByTestId('status-bar-left').screenshot({ path: `${OUT}/compact.png` });
});

test('collapsed density, overflow popover open', async ({ page }) => {
  await openWide(page);
  await page.setViewportSize({ width: 900, height: 800 });
  await expect(page.getByTestId('status-bar')).toHaveAttribute('data-density', 'collapsed');
  await page.getByTestId('status-overflow').click();
  const panel = page.getByTestId('status-overflow-panel');
  await expect(panel).toBeVisible();
  await panel.screenshot({ path: `${OUT}/collapsed-popover.png` });
});
