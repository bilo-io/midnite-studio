import { expect, test, type Page } from '@playwright/test';

import { installShotsBridge, prepareForVisualCapture, SHOT_VIEWPORTS } from './shots-helper';

/**
 * Before/after visual for the browser tab strip's shrink-to-ellipsis floor
 * and its now-hidden scrollbar chrome (ad hoc task, not a `.midnite/tasks/`
 * phase — see docs/screenshots/adhoc-browser-tab-ux/).
 *
 * Ten tabs at the default 1280px viewport is comfortably more than the strip
 * can show at each one's `max-w-[12rem]` ceiling, so this is exactly the
 * "too many tabs" case `tab-strip.tsx`'s shrink/floor logic exists for. A mix
 * of long-hostname (navigated) and blank "New Tab" tabs, rather than ten
 * identical labels, is what the floor actually looks like in practice: some
 * tabs still show an ellipsised sliver of their label, others are down to
 * just the favicon.
 *
 * Run with `MSTUDIO_SHOTS=1`; skipped otherwise, matching every other
 * `*-shots.spec.ts` in this suite.
 */
const OUT = '../../docs/screenshots/adhoc-browser-tab-ux';

const LONG_HOSTS = [
  'https://this-is-a-very-long-subdomain-name-for-demo-purposes.example.com',
  'https://another-extremely-long-repository-dashboard-hostname.example.org',
  'https://a-third-tab-with-a-long-descriptive-hostname-too.example.net',
];

async function openBrowserWithManyTabs(page: Page, count: number): Promise<void> {
  await installShotsBridge(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();

  await page.locator('[data-testid="browser-toggle"]').click();
  const launcher = page.getByTestId('browser-launcher');
  await expect(launcher).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(launcher).toHaveCount(0);

  const address = page.getByRole('textbox', { name: 'Address' });
  await address.fill(LONG_HOSTS[0]!);
  await address.press('Enter');

  for (let i = 1; i < count; i += 1) {
    await page.keyboard.press('Meta+t');
    // Every third tab stays blank ("New Tab") — the rest navigate to a long
    // hostname, so the strip shows both label shapes at once.
    if (i % 3 !== 0) {
      const url = LONG_HOSTS[i % LONG_HOSTS.length]!;
      await page.getByRole('textbox', { name: 'Address' }).fill(url);
      await page.getByRole('textbox', { name: 'Address' }).press('Enter');
    }
  }
}

/** Same two-step dark sequence every `*-shots.spec.ts` dark case uses. */
async function goDark(page: Page): Promise<void> {
  await page.emulateMedia({ colorScheme: 'dark' });
}
async function paintDark(page: Page): Promise<void> {
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  await page.waitForTimeout(400);
}

test.describe('Browser tab strip — shrink-to-ellipsis floor, hidden scrollbar', () => {
  test.skip(!process.env.MSTUDIO_SHOTS, 'set MSTUDIO_SHOTS=1 to regenerate');
  test.use({ viewport: SHOT_VIEWPORTS.default });

  test('ten tabs, light', async ({ page }) => {
    await openBrowserWithManyTabs(page, 10);
    await prepareForVisualCapture(page);
    await page.waitForTimeout(300);
    await page
      .getByRole('tablist', { name: 'Browser tabs' })
      .screenshot({ path: `${OUT}/tab-strip-crowded-light.png` });
  });

  test('ten tabs, dark', async ({ page }) => {
    await goDark(page);
    await openBrowserWithManyTabs(page, 10);
    await paintDark(page);
    await prepareForVisualCapture(page);
    await page.waitForTimeout(300);
    await page
      .getByRole('tablist', { name: 'Browser tabs' })
      .screenshot({ path: `${OUT}/tab-strip-crowded-dark.png` });
  });
});
