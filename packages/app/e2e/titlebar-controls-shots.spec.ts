import { expect, test, type Page } from '@playwright/test';

import { fixtures, installMockBridge, setTheme, type MockFixtures } from './shots-helper';

/**
 * Ad hoc screenshots of the title bar's right cluster after this branch's two
 * changes: the battery segment moved in from the status bar to sit beside the
 * theme toggle (`TitleBarBattery`), and a dedicated `CompanionLauncher` joined
 * the loop-launcher strip. Run with `MSTUDIO_SHOTS=1`; skipped otherwise, the
 * same convention `titlebar-breadcrumb-shots.spec.ts` and
 * `adhoc-terminal-sidebar-gap` (`terminal.spec.ts`) follow.
 *
 * The loop-launcher strip collapses to one glyph at rest and only reveals the
 * six loop icons plus the companion toggle on hover, so the strip is hovered
 * before the shot — otherwise the companion launcher would be invisible in
 * the very screenshot meant to show it.
 */
test.skip(!process.env['MSTUDIO_SHOTS'], 'set MSTUDIO_SHOTS=1 to write screenshots');

const OUT = '../../docs/screenshots';

async function seedCompanionEnabled(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      const stored = localStorage.getItem('midnite-studio.ui');
      const persisted = stored ? JSON.parse(stored) : { version: 14 };
      persisted.state = { ...persisted.state, companionEnabled: true };
      localStorage.setItem('midnite-studio.ui', JSON.stringify(persisted));
    } catch {
      /* Unparseable profile — the app discards it too. */
    }
  });
}

async function open(page: Page): Promise<void> {
  await seedCompanionEnabled(page);
  const data: MockFixtures = {
    ...fixtures,
    metricsSamples: [
      {
        at: Date.now(),
        battery: {
          percent: 62,
          hasBattery: true,
          isCharging: false,
          devices: [{ id: 'internal', name: 'Computer', type: 'internal', percent: 62 }],
        },
      },
    ],
  };
  await installMockBridge(page, data);
  await page.goto('/');
  await expect(page.getByTestId('status-bar')).toBeVisible();
  await expect(page.getByTestId('battery-trigger')).toBeVisible();

  // Reveal the loop-launcher strip (and the companion toggle riding beside it)
  // by hovering it, the same way a person would before clicking a loop.
  await page.getByTestId('fab-launchers-collapsed').hover();
  await expect(page.getByTestId('companion-launcher')).toBeVisible();
}

test('the title bar right cluster — battery beside theme toggle, companion beside the loops (light)', async ({
  page,
}) => {
  await open(page);
  await setTheme(page, 'light', { settleMs: 200 });
  await page.locator('.titlebar-root').screenshot({ path: `${OUT}/adhoc-titlebar-controls-light.png` });
});

test('the title bar right cluster — battery beside theme toggle, companion beside the loops (dark)', async ({
  page,
}) => {
  await open(page);
  await setTheme(page, 'dark', { settleMs: 200 });
  await page.locator('.titlebar-root').screenshot({ path: `${OUT}/adhoc-titlebar-controls-dark.png` });
});
