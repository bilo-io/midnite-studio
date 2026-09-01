import { test, expect, type Page } from '@playwright/test';

import { fixtures } from './fixtures';
import { installMockBridge, type MockFixtures } from './mock-bridge';

/**
 * The Phase 35 screenshots — the FAB loop console in its three states.
 *
 * Not assertions (`fab-loops.spec.ts` carries those); these produce the PNGs
 * the phase's PR embeds, from the same mocked bridge the suite uses so the
 * picture is reproducible.
 *
 * Run with `MSTUDIO_SHOTS=1`; skipped otherwise so the normal suite stays fast.
 */
const OUT = '../../docs/screenshots/p35-abcde';
/** Themes F–I's own shot, kept apart so a rerun of one slice does not rewrite the other's. */
const OUT_FGHI = '../../docs/screenshots/p35-fghi';

test.skip(!process.env['MSTUDIO_SHOTS'], 'set MSTUDIO_SHOTS=1 to write screenshots');

async function open(page: Page): Promise<void> {
  await installMockBridge(page, fixtures as MockFixtures);
  await page.goto('/');
  await expect(page.getByRole('columnheader', { name: 'Commit message' })).toBeVisible();
}

async function openFab(page: Page, tab?: string): Promise<void> {
  await page.getByRole('button', { name: 'Open quick access panel' }).click();
  await expect(page.getByRole('button', { name: 'Innovate', exact: true })).toBeVisible();
  if (tab) await page.getByRole('button', { name: tab, exact: true }).click();
  await page.waitForTimeout(400);
}

test('the composer, idle', async ({ page }) => {
  await open(page);
  await openFab(page, 'Watchdog');
  await page.getByTestId('loop-composer-watchdog').getByLabel('Watch dependabot PRs').check();
  await page.screenshot({ path: `${OUT}/composer-idle.png` });
});

test('a running loop — slim strip, glowing Stop, live dots', async ({ page }) => {
  await open(page);
  await openFab(page, 'Watchdog');
  const composer = page.getByTestId('loop-composer-watchdog');
  await composer.getByLabel('Watch dependabot PRs').check();
  await composer.getByPlaceholder('Extra instructions…').fill('Skip drafts.');
  await composer.getByTestId('loop-start').click();
  await expect(composer.getByTestId('loop-stop')).toBeVisible();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/loop-running.png` });
});

test('run history, expanded', async ({ page }) => {
  await open(page);
  await openFab(page, 'Watchdog');
  const composer = page.getByTestId('loop-composer-watchdog');
  await composer.getByLabel('Watch dependabot PRs').check();
  await composer.getByTestId('loop-start').click();
  await composer.getByTestId('loop-stop').click();

  const history = page.getByTestId('loop-history').nth(2);
  await history.getByRole('button', { name: /History \(1\)/ }).click();
  await history.getByRole('button', { name: /stopped/ }).click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}/loop-history.png` });
});

test('Settings — the Loops section', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('navigation', { name: 'Settings pages' })).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Settings pages' })
    .getByRole('button', { name: 'Agent' })
    .click();
  await page.getByRole('button', { name: 'Loops' }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/settings-loops.png` });
});

/**
 * Themes F–I ship no new UI, so there is no before/after to take. The one
 * surface they touch that has never been photographed is the waiting notice:
 * `useLoopAttention` pushes it into `toast-store` and the status bar's
 * `NotificationBell` is what renders it, so this is what "the loop is waiting
 * for you" actually looks like when the panel is shut.
 */
test('the waiting notice, in the bell', async ({ page }) => {
  await open(page);
  await openFab(page);
  await page.getByTestId('loop-composer-innovate').getByTestId('loop-start').click();
  await expect(page.getByTestId('loop-composer-innovate').getByTestId('loop-stop')).toBeVisible();

  // Panel shut — the case the notice exists for.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  await page.evaluate(() => {
    (
      window as unknown as {
        __mstudioPtyActivity: (p: string, a: string) => boolean;
      }
    ).__mstudioPtyActivity('pty-1', 'waiting');
  });

  await page.getByTestId('notification-bell').click();
  await expect(page.getByText('Innovate is waiting for input.')).toBeVisible();
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT_FGHI}/waiting-notice.png` });
});
