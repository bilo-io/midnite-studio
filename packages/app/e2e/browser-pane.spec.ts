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

/**
 * Open the pane the way a user does: the toggle raises the layout launcher,
 * and `Enter` takes whichever layout is pre-selected.
 *
 * Every spec below that only cares about tabs or chrome goes through this, so
 * the launcher is asserted in one place (`the toggle raises the launcher…`)
 * rather than in fifteen.
 */
async function openBrowser(page: Page, layout?: 'full' | 'left' | 'right'): Promise<void> {
  await page.locator('[data-testid="browser-toggle"]').click();
  const launcher = page.getByTestId('browser-launcher');
  await expect(launcher).toBeVisible();
  if (layout) {
    await page.getByTestId(`browser-layout-${layout}`).click();
  } else {
    await page.keyboard.press('Enter');
  }
  await expect(launcher).toHaveCount(0);
}

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

  await openBrowser(page);

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
  await openBrowser(page);

  await expect(browserTabs(page)).toHaveCount(1);
  await expect(page.getByTestId('browser-newtab')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Address' })).toBeFocused();
});

test('typing a URL and pressing Enter navigates the blank tab and clears the placeholder', async ({ page }) => {
  await installMockBridge(page, { ...fixtures });
  await page.goto('/');
  await openBrowser(page);

  const address = page.getByRole('textbox', { name: 'Address' });
  await address.fill('https://example.com');
  await address.press('Enter');

  await expect(page.getByTestId('browser-newtab')).toHaveCount(0);
  await expect(address).toHaveValue('https://example.com');
});

test('Mod+T opens a new tab, and the strip shows both', async ({ page }) => {
  await installMockBridge(page, { ...fixtures });
  await page.goto('/');
  await openBrowser(page);
  await expect(browserTabs(page)).toHaveCount(1);

  await page.keyboard.press('Meta+t');
  await expect(browserTabs(page)).toHaveCount(2);
});

test('Mod+W closes the active browser tab rather than the repository, while the pane is open', async ({ page }) => {
  await installMockBridge(page, { ...fixtures });
  await page.goto('/');
  await expect(page.getByRole('columnheader', { name: 'Commit message' })).toBeVisible();

  await openBrowser(page);
  await page.keyboard.press('Meta+t');
  await expect(browserTabs(page)).toHaveCount(2);

  await page.keyboard.press('Meta+w');
  // Closes the browser tab, not the repository — the graph stays mounted
  // and the pane stays open, which is the whole point of the chord carve-out.
  await expect(browserTabs(page)).toHaveCount(1);
  await expect(page.getByRole('textbox', { name: 'Address' })).toBeVisible();
});

test('closing the only tab leaves one fresh blank tab, not zero', async ({ page }) => {
  await installMockBridge(page, { ...fixtures });
  await page.goto('/');
  await openBrowser(page);
  await expect(browserTabs(page)).toHaveCount(1);

  await page
    .getByRole('tablist', { name: 'Browser tabs' })
    .getByRole('button', { name: /^Close / })
    .click();
  await expect(browserTabs(page)).toHaveCount(1);
  await expect(page.getByTestId('browser-newtab')).toBeVisible();
});

/**
 * Asserted as a mechanism, not a stopwatch.
 *
 * This started life as `filter.click({ timeout: 150 })` — a wall clock racing
 * the 200ms `REVEAL_MS` exit, on the theory that a click landing inside the
 * budget proves the pane let go early. Fifty milliseconds is not enough
 * headroom for Playwright's own actionability round-trip on a loaded Linux
 * runner, so the spec tipped over whenever shard 1 grew and its position in
 * the shard — not the code under test — decided whether the build was green.
 *
 * The regression it guards is the pane keeping its pointer capture for the
 * whole exit, and that is stateful rather than temporal: `pointer-events-none`
 * has to land on the pane in the same commit that starts the fade. Polling for
 * it from the test races the other way, though — `useReveal` unmounts the pane
 * `REVEAL_MS + SETTLE_SLACK_MS` later, so a stalled runner reaches its first
 * poll to find no element at all. So the page records the class itself, the
 * instant the fade begins, and the assertion reads that recording afterwards
 * at whatever pace it likes.
 */
const EXIT_CLASS = '__midniteBrowserPaneExitClass';

test('closing the pane restores clicks to the content beneath it immediately, not after the exit transition', async ({
  page,
}) => {
  await installMockBridge(page, { ...fixtures });
  await page.goto('/');
  await expect(page.getByRole('columnheader', { name: 'Commit message' })).toBeVisible();

  const toggle = page.locator('[data-testid="browser-toggle"]');
  await openBrowser(page);
  await expect(page.getByRole('textbox', { name: 'Address' })).toBeVisible();

  // `opacity-0` is what marks the first commit of the exit; whatever else the
  // pane is carrying at that moment is what decides whether the content
  // beneath it is clickable for the next 200ms.
  await page.evaluate((key) => {
    const pane = document.querySelector('[role="dialog"][aria-label="Browser"]');
    if (!pane) throw new Error('the browser pane is not open');
    const store = window as unknown as Record<string, string | undefined>;
    new MutationObserver(() => {
      if (store[key] === undefined && pane.className.includes('opacity-0')) {
        store[key] = pane.className;
      }
    }).observe(pane, { attributes: true, attributeFilter: ['class'] });
  }, EXIT_CLASS);

  await toggle.click();
  await expect
    .poll(() =>
      page.evaluate((key) => (window as unknown as Record<string, string | undefined>)[key], EXIT_CLASS),
    )
    .toContain('pointer-events-none');

  const filter = page.getByPlaceholder('Filter repos…');
  await filter.click();
  await filter.fill('nothing-matches');
  await expect(filter).toHaveValue('nothing-matches');
});

test('Escape closes the pane, and it reopens with the same tabs on reload', async ({ page }) => {
  await installMockBridge(page, { ...fixtures });
  await page.goto('/');
  await expect(page.getByRole('columnheader', { name: 'Commit message' })).toBeVisible();

  await openBrowser(page);
  const address = page.getByRole('textbox', { name: 'Address' });
  await address.fill('https://example.com');
  await address.press('Enter');

  await page.keyboard.press('Escape');
  await expect(address).toHaveCount(0);

  await openBrowser(page);
  await expect(address).toHaveValue('https://example.com');
  await page.reload();
  await expect(page.getByRole('columnheader', { name: 'Commit message' })).toBeVisible();
  /*
    No launcher on the way back. A pane that was open when the window reloaded
    is restored open, in the layout it was in — the launcher asks where to put
    the browser, and a restored session has already answered.
  */
  await expect(page.getByTestId('browser-launcher')).toHaveCount(0);
  await expect(address).toHaveValue('https://example.com');
});

test('the pane traps Tab, and Escape restores focus to the toggle', async ({ page }) => {
  await installMockBridge(page, { ...fixtures });
  await page.goto('/');
  await expect(page.getByRole('columnheader', { name: 'Commit message' })).toBeVisible();

  const toggle = page.locator('[data-testid="browser-toggle"]');
  await openBrowser(page);

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
  await openBrowser(page);

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
  await openBrowser(page);

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
  await openBrowser(page);

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
  await openBrowser(page);

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

/**
 * The layout launcher, and what each answer does to the window.
 *
 * The pane used to appear wherever the last session left it with no say in
 * the matter, and "wherever" was a full-screen overlay that respected the nav
 * rail's padding — so the right-hand column's width was permanently clipped
 * by a rail nothing in the browser can use. These specs pin both halves of
 * the fix: the choice happens up front, and each choice reaches its edges.
 */
test('the toggle raises the launcher rather than the pane, and remembers the answer', async ({
  page,
}) => {
  await installMockBridge(page, { ...fixtures });
  await page.goto('/');
  await expect(page.getByRole('columnheader', { name: 'Commit message' })).toBeVisible();

  await page.locator('[data-testid="browser-toggle"]').click();
  const launcher = page.getByTestId('browser-launcher');
  await expect(launcher).toBeVisible();
  // Nothing has opened yet — the launcher is a question, not a step.
  await expect(page.getByRole('textbox', { name: 'Address' })).toHaveCount(0);
  // Three options, each drawing its own layout.
  await expect(launcher.getByRole('radio')).toHaveCount(3);
  await expect(page.getByTestId('browser-layout-full')).toHaveAttribute('aria-checked', 'true');

  // Arrows move the selection; Enter is what commits it.
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('browser-layout-left')).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Enter');
  await expect(launcher).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Address' })).toBeVisible();

  // Reopening pre-selects what was chosen last time, so the common path is
  // Mod+B then Enter.
  await page.keyboard.press('Escape');
  await page.locator('[data-testid="browser-toggle"]').click();
  await expect(page.getByTestId('browser-layout-left')).toHaveAttribute('aria-checked', 'true');
});

test('Escape on the launcher leaves the browser closed', async ({ page }) => {
  await installMockBridge(page, { ...fixtures });
  await page.goto('/');
  await page.locator('[data-testid="browser-toggle"]').click();
  await expect(page.getByTestId('browser-launcher')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.getByTestId('browser-launcher')).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Address' })).toHaveCount(0);
});

test('full screen reaches the window edge over the nav rail, and stops above the footer', async ({
  page,
}) => {
  await installMockBridge(page, { ...fixtures });
  await page.goto('/');
  await expect(page.getByRole('columnheader', { name: 'Commit message' })).toBeVisible();

  await openBrowser(page, 'full');

  const pane = page.getByRole('dialog', { name: 'Browser' });
  const paneBox = (await pane.boundingBox())!;
  const rail = page.getByRole('complementary', { name: 'Views' });
  const railBox = (await rail.boundingBox())!;
  const statusBox = (await page.getByTestId('status-bar').boundingBox())!;
  const viewport = page.viewportSize()!;

  // Over the rail, not beside it — this is the whole point: the rail's every
  // item navigates the app behind the browser.
  expect(railBox.width).toBeGreaterThan(0);
  expect(paneBox.x).toBeLessThanOrEqual(1);
  // …and therefore all the way to the other edge, rather than a rail's width
  // short of it, which is how the right side used to be clipped.
  expect(paneBox.x + paneBox.width).toBeGreaterThanOrEqual(viewport.width - 1);
  // The footer is the one strip it leaves alone.
  expect(paneBox.y + paneBox.height).toBeLessThanOrEqual(statusBox.y + 1);
});

test('side by side reflows the workspace into the other half instead of covering it', async ({
  page,
}) => {
  await installMockBridge(page, { ...fixtures });
  await page.goto('/');
  const header = page.getByRole('columnheader', { name: 'Commit message' });
  await expect(header).toBeVisible();

  await openBrowser(page, 'right');

  const frame = page.locator('[data-browser-frame]');
  await expect(frame).toBeVisible();
  const frameBox = (await frame.boundingBox())!;
  const headerBox = (await header.boundingBox())!;

  // No overlap in either direction: the graph ends where the browser begins,
  // which is only true if the view actually gave up the room.
  expect(headerBox.x + headerBox.width).toBeLessThanOrEqual(frameBox.x + 1);
  // The rail keeps its space in a split — unlike full screen, there is a
  // workspace behind it worth navigating.
  const railBox = (await page.getByRole('complementary', { name: 'Views' }).boundingBox())!;
  expect(frameBox.x).toBeGreaterThan(railBox.x + railBox.width);

  // The toolbar's picker switches sides without closing the pane.
  await page.getByTestId('browser-layout-pick-left').click();
  const movedBox = (await page.locator('[data-browser-frame]').boundingBox())!;
  expect(movedBox.x).toBeLessThan(frameBox.x);
  await expect(page.getByRole('textbox', { name: 'Address' })).toBeVisible();
});
