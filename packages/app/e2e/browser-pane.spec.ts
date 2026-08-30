import { expect, test, type Page } from '@playwright/test';

import { fixtures } from './fixtures';
import { installMockBridge } from './mock-bridge';

/**
 * Phase 32 Themes A–D: the browser pane gets an engine and real tabs.
 *
 * No real page ever loads under Playwright's own Chromium (see
 * `mock-bridge.ts`'s `browser` mock) — these specs exercise the tab model,
 * the chrome shell and the pane's container behaviour, which is everything
 * a mocked bridge can prove. Back/Forward/Reload stay disabled this batch
 * (Theme G owns wiring them); only the address bar and the tab strip are
 * live.
 */

/**
 * The browser's own tabs, scoped to its strip — the workbench keeps its own
 * `role="tab"` elements mounted behind the pane, so an unscoped
 * `getByRole('tab')` counts both.
 */
const browserTabs = (page: Page) =>
  page.getByRole('tablist', { name: 'Browser tabs' }).getByRole('tab');

test.beforeEach(async ({ page }) => {
  // Every spec starts with a clean browser store — it persists to
  // localStorage, and a leftover tab from a previous test would make
  // "opens with exactly one blank tab" flaky.
  //
  // Once per context, not once per load: `addInitScript` runs again on
  // `page.reload()`, and wiping the store there would erase the very tabs a
  // restore spec is about to assert on. `sessionStorage` is the flag because
  // it survives a reload and dies with the (per-test) context.
  await page.addInitScript(() => {
    if (sessionStorage.getItem('mstudio-e2e-browser-cleared')) return;
    sessionStorage.setItem('mstudio-e2e-browser-cleared', '1');
    localStorage.removeItem('midnite-studio.browser');
  });
});

test('the toggle opens the pane over the repositories panel, and the bar stays hit-testable beneath it', async ({
  page,
}) => {
  await installMockBridge(page, { ...fixtures });
  await page.goto('/');
  await expect(page.getByRole('columnheader', { name: 'Commit message' })).toBeVisible();

  const reposAside = page.getByRole('complementary', { name: 'Repositories' });
  await expect(reposAside).toBeVisible();

  await page.locator('[data-testid="browser-toggle"]').click();

  const address = page.getByRole('textbox', { name: 'Address' });
  await expect(address).toBeVisible();
  // Covers the repositories panel — it is still in the DOM (unmounting it
  // would cost a re-fetch of its per-repo status) but painted under the pane.
  await expect(reposAside).toBeVisible();

  const statusBar = page.getByTestId('status-bar');
  await expect(statusBar).toBeVisible();
  const terminalToggle = page.locator('[data-testid="terminal-toggle"]');
  await terminalToggle.click();
  await expect(page.getByRole('button', { name: 'Expand terminal' })).toBeVisible();
});

test('opening the pane creates one blank tab, focused on the address bar', async ({ page }) => {
  await installMockBridge(page, { ...fixtures });
  await page.goto('/');
  await page.locator('[data-testid="browser-toggle"]').click();

  await expect(browserTabs(page)).toHaveCount(1);
  await expect(page.getByTestId('browser-newtab')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Address' })).toBeFocused();
});

test('typing a URL and pressing Enter navigates the blank tab and clears the placeholder', async ({ page }) => {
  await installMockBridge(page, { ...fixtures });
  await page.goto('/');
  await page.locator('[data-testid="browser-toggle"]').click();

  const address = page.getByRole('textbox', { name: 'Address' });
  await address.fill('https://example.com');
  await address.press('Enter');

  await expect(page.getByTestId('browser-newtab')).toHaveCount(0);
  await expect(address).toHaveValue('https://example.com');
});

test('Mod+T opens a new tab, and the strip shows both', async ({ page }) => {
  await installMockBridge(page, { ...fixtures });
  await page.goto('/');
  await page.locator('[data-testid="browser-toggle"]').click();
  await expect(browserTabs(page)).toHaveCount(1);

  await page.keyboard.press('ControlOrMeta+t');
  await expect(browserTabs(page)).toHaveCount(2);
});

test('Mod+W closes the active browser tab rather than the repository, while the pane is open', async ({ page }) => {
  await installMockBridge(page, { ...fixtures });
  await page.goto('/');
  await expect(page.getByRole('columnheader', { name: 'Commit message' })).toBeVisible();

  await page.locator('[data-testid="browser-toggle"]').click();
  await page.keyboard.press('ControlOrMeta+t');
  await expect(browserTabs(page)).toHaveCount(2);

  await page.keyboard.press('ControlOrMeta+w');
  // Closes the browser tab, not the repository — the graph stays mounted
  // and the pane stays open, which is the whole point of the chord carve-out.
  await expect(browserTabs(page)).toHaveCount(1);
  await expect(page.getByRole('textbox', { name: 'Address' })).toBeVisible();
});

test('closing the only tab leaves one fresh blank tab, not zero', async ({ page }) => {
  await installMockBridge(page, { ...fixtures });
  await page.goto('/');
  await page.locator('[data-testid="browser-toggle"]').click();
  await expect(browserTabs(page)).toHaveCount(1);

  await page
    .getByRole('tablist', { name: 'Browser tabs' })
    .getByRole('button', { name: /^Close / })
    .click();
  await expect(browserTabs(page)).toHaveCount(1);
  await expect(page.getByTestId('browser-newtab')).toBeVisible();
});

test('closing the pane restores clicks to the content beneath it immediately, not after the exit transition', async ({
  page,
}) => {
  await installMockBridge(page, { ...fixtures });
  await page.goto('/');
  await expect(page.getByRole('columnheader', { name: 'Commit message' })).toBeVisible();

  const toggle = page.locator('[data-testid="browser-toggle"]');
  await toggle.click();
  await expect(page.getByRole('textbox', { name: 'Address' })).toBeVisible();

  await toggle.click();
  const filter = page.getByPlaceholder('Filter repos…');
  await filter.click({ timeout: 150 });
  await filter.fill('nothing-matches');
  await expect(filter).toHaveValue('nothing-matches');
});

test('Escape closes the pane, and it reopens with the same tabs on reload', async ({ page }) => {
  await installMockBridge(page, { ...fixtures });
  await page.goto('/');
  await expect(page.getByRole('columnheader', { name: 'Commit message' })).toBeVisible();

  await page.locator('[data-testid="browser-toggle"]').click();
  const address = page.getByRole('textbox', { name: 'Address' });
  await address.fill('https://example.com');
  await address.press('Enter');

  await page.keyboard.press('Escape');
  await expect(address).toHaveCount(0);

  await page.locator('[data-testid="browser-toggle"]').click();
  await expect(address).toHaveValue('https://example.com');
  await page.reload();
  await expect(page.getByRole('columnheader', { name: 'Commit message' })).toBeVisible();
  await page.locator('[data-testid="browser-toggle"]').click();
  await expect(address).toHaveValue('https://example.com');
});

test('the pane traps Tab, and Escape restores focus to the toggle', async ({ page }) => {
  await installMockBridge(page, { ...fixtures });
  await page.goto('/');
  await expect(page.getByRole('columnheader', { name: 'Commit message' })).toBeVisible();

  const toggle = page.locator('[data-testid="browser-toggle"]');
  await toggle.click();

  const address = page.getByRole('textbox', { name: 'Address' });
  await expect(address).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(address).toHaveCount(0);
  await expect(toggle).toBeFocused();
});

test('a crashed view is surfaced as tab state with a reload affordance, not a blank rectangle', async ({
  page,
}) => {
  await installMockBridge(page, { ...fixtures });
  await page.goto('/');
  await page.locator('[data-testid="browser-toggle"]').click();

  const address = page.getByRole('textbox', { name: 'Address' });
  await address.fill('https://example.com');
  await address.press('Enter');

  await page.evaluate(() => {
    const tabId = (window as unknown as { __mstudioBrowserTabs: () => string[] }).__mstudioBrowserTabs()[0];
    (window as unknown as { __mstudioBrowserEvent: (e: unknown) => void }).__mstudioBrowserEvent({
      kind: 'destroyed',
      tabId,
      reason: 'crashed',
    });
  });

  const crashed = page.getByTestId('browser-crashed');
  await expect(crashed).toBeVisible();
  await crashed.getByRole('button', { name: 'Reload page' }).click();
  await expect(crashed).toHaveCount(0);
});

test('a window.open from a page becomes a new tab beside its opener', async ({ page }) => {
  await installMockBridge(page, { ...fixtures });
  await page.goto('/');
  await page.locator('[data-testid="browser-toggle"]').click();

  const address = page.getByRole('textbox', { name: 'Address' });
  await address.fill('https://example.com');
  await address.press('Enter');
  await expect(browserTabs(page)).toHaveCount(1);

  await page.evaluate(() => {
    const tabId = (window as unknown as { __mstudioBrowserTabs: () => string[] }).__mstudioBrowserTabs()[0];
    (window as unknown as { __mstudioBrowserEvent: (e: unknown) => void }).__mstudioBrowserEvent({
      kind: 'open-tab',
      tabId,
      url: 'https://opened.example',
    });
  });

  await expect(browserTabs(page)).toHaveCount(2);
  await expect(address).toHaveValue('https://opened.example');
});

test('a blocked download is reported as a notification naming the file', async ({ page }) => {
  await installMockBridge(page, { ...fixtures });
  await page.goto('/');
  await page.locator('[data-testid="browser-toggle"]').click();

  const address = page.getByRole('textbox', { name: 'Address' });
  await address.fill('https://example.com');
  await address.press('Enter');

  await page.evaluate(() => {
    const tabId = (window as unknown as { __mstudioBrowserTabs: () => string[] }).__mstudioBrowserTabs()[0];
    (window as unknown as { __mstudioBrowserEvent: (e: unknown) => void }).__mstudioBrowserEvent({
      kind: 'download-blocked',
      tabId,
      filename: 'ubuntu.iso',
    });
  });

  await page.keyboard.press('Escape');
  await page.locator('[data-testid="notification-bell"]').click();
  await expect(page.getByText(/Download blocked: ubuntu\.iso/)).toBeVisible();
});

test('a tab can be put in a new group, which then renames inline and collapses', async ({ page }) => {
  await installMockBridge(page, { ...fixtures });
  await page.goto('/');
  await page.locator('[data-testid="browser-toggle"]').click();

  const tab = browserTabs(page).first();
  await tab.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Move to group' }).hover();
  await page.getByRole('menuitem', { name: 'New group…' }).click();

  await page.getByRole('textbox', { name: 'Group name' }).fill('Docs');
  await page.getByRole('button', { name: 'Create group' }).click();

  const chip = page.getByRole('button', { name: 'Docs tab group' });
  await expect(chip).toBeVisible();
  await expect(chip).toHaveAttribute('aria-expanded', 'true');

  // Double-click renames in place; Enter commits.
  await chip.dblclick();
  const rename = page.getByRole('textbox', { name: 'Group name' });
  await rename.fill('Reading');
  await rename.press('Enter');
  await expect(page.getByRole('button', { name: 'Reading tab group' })).toBeVisible();

  await page.getByRole('button', { name: 'Reading tab group' }).click();
  await expect(page.getByRole('button', { name: 'Reading tab group' })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  await expect(browserTabs(page)).toHaveCount(0);
});
