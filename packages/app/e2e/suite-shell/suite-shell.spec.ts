import { expect, test, type Page } from '@playwright/test';

import { AGENTS_EMPTY_ANSWERS, installSuiteBridge, SUITE_APP_URLS, VANGUARD_EMPTY_ANSWERS } from '../../test-support/suite-bridge';

/**
 * The suite shell, in two hosts that render it (Phase 123 Theme I.1): Vanguard and Agents.
 *
 * The phase names Vanguard and Vault, but Vault was retired into Vanguard (Phase 124), so the second host is
 * Agents. Each app is served by its own Vite server (`playwright.config.ts`) and driven through a deep-proxy
 * `window.midniteStudio` (`test-support/suite-bridge.ts`).
 *
 * Browser capability: real keyboard dispatch (`Mod+,` goes through the frame's window-level `keydown`
 * dispatcher, which jsdom's synthetic events do not exercise end to end), real `dblclick` hit-testing on the
 * title bar's drag region against its interactive children, and real layout for the fixed rail and title bar.
 * Everything else about the shell (nav config, chords, panels) is a vitest in `packages/frame`.
 */
const APPS = [
  { id: 'vanguard', name: 'Midnite Vanguard', url: SUITE_APP_URLS.vanguard, answers: VANGUARD_EMPTY_ANSWERS },
  { id: 'agents', name: 'Midnite Agents', url: SUITE_APP_URLS.agents, answers: AGENTS_EMPTY_ANSWERS },
] as const;

/** Uncaught renderer errors this test saw; a pane that throws unmounts the shell, so none is expected. */
const pageErrors: string[] = [];

async function open(page: Page, app: (typeof APPS)[number], frameless = true): Promise<void> {
  await installSuiteBridge(page, { frameless, answers: app.answers });
  await page.setViewportSize({ width: 1200, height: 760 });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(app.url);
  await expect(page.locator(`.app-shell[data-app="${app.id}"]`)).toBeVisible();
}

for (const app of APPS) {
  test.describe(`${app.name}`, () => {
    test.beforeEach(() => {
      pageErrors.length = 0;
    });
    test.afterEach(() => {
      expect(pageErrors).toEqual([]);
    });

    test('renders the shell (title bar, logo, rail, Settings row) and navigates the rail', async ({ page }) => {
      await open(page, app);
      await expect(page.getByRole('banner', { name: 'Window title bar' })).toContainText(app.name);
      await expect(page.getByTestId('app-logo-tile').getByRole('img', { name: app.name })).toBeVisible();
      const rail = page.getByRole('complementary', { name: 'Views' });
      await expect(rail).toBeVisible();
      await expect(rail.locator('a[data-view]').first()).toHaveAttribute('aria-current', 'page');
      await expect(rail.getByRole('button', { name: 'Settings' })).toBeVisible();

      // Rail navigation: the clicked row becomes the current one.
      const rows = rail.locator('a[data-view]');
      expect(await rows.count()).toBeGreaterThan(1);
      const second = rows.nth(1);
      await second.click();
      await expect(second).toHaveAttribute('aria-current', 'page');
      await expect(rows.first()).not.toHaveAttribute('aria-current', 'page');
    });

    test('opens Settings from the rail and from Mod+, and leaves it again', async ({ page }) => {
      await open(page, app);
      const settings = page.getByTestId('suite-settings');
      await page.getByRole('complementary', { name: 'Views' }).getByRole('button', { name: 'Settings' }).click();
      await expect(settings).toBeVisible();

      // Back to a view through the rail, then the chord. `Mod` is Cmd on macOS and Ctrl elsewhere.
      await page.getByRole('complementary', { name: 'Views' }).locator('a[data-view]').first().click();
      await expect(settings).toHaveCount(0);
      await page.keyboard.press('ControlOrMeta+,');
      await expect(settings).toBeVisible();
    });

    test('double-clicking the title bar toggles maximise; a control in it does not', async ({ page }) => {
      await open(page, app);
      const calls = () => page.evaluate(() => window.__shellCalls?.toggleMaximize ?? -1);
      expect(await calls()).toBe(0);
      // The bar's own title text sits in the drag region.
      await page.getByRole('banner', { name: 'Window title bar' }).getByText(app.name).dblclick();
      expect(await calls()).toBe(1);
      await page.getByRole('button', { name: 'Toggle theme' }).dblclick();
      expect(await calls()).toBe(1);
    });
  });
}
