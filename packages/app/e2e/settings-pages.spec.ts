import { expect, test, type Page } from '@playwright/test';

import { fixtures } from './fixtures';
import { installMockBridge, type MockFixtures } from './mock-bridge';

/**
 * Settings as pages (Phase 16): the bottom-pinned rail entry, the inner page
 * sidebar, and the Agent page — version card from the mocked probe plus the
 * ~/.claude tree through the claude-home scope.
 */

const settingsFixtures: MockFixtures = {
  ...fixtures,
  fsDirs: {
    'claude:': [
      { name: 'skills', kind: 'dir', size: 0, isIgnored: false },
      { name: 'settings.json', kind: 'file', size: 88, isIgnored: false },
    ],
    'claude:skills': [{ name: 'brainstorm', kind: 'dir', size: 0, isIgnored: false }],
  },
  fsFiles: {
    'claude:settings.json': { kind: 'text', content: '{ "theme": "dark" }', size: 88 },
  },
};

async function openSettings(page: Page): Promise<void> {
  await installMockBridge(page, settingsFixtures);
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('navigation', { name: 'Settings pages' })).toBeVisible();
}

test('settings is one bottom entry, not a workspace nav item', async ({ page }) => {
  await installMockBridge(page, settingsFixtures);
  await page.goto('/');

  // The rail's workspace links: Files, Graph, Changes — no Settings link.
  await expect(page.getByRole('link', { name: 'Files' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Settings' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Settings' })).toBeVisible();
});

test('all four pages are reachable through the inner sidebar', async ({ page }) => {
  await openSettings(page);

  const nav = page.getByRole('navigation', { name: 'Settings pages' });
  await expect(nav.getByRole('button', { name: 'Appearance' })).toBeVisible();

  await nav.getByRole('button', { name: 'Graph' }).click();
  await expect(page.getByRole('heading', { name: 'Graph' })).toBeVisible();

  await nav.getByRole('button', { name: 'Terminal' }).click();
  await expect(page.getByText('Agent roster')).toBeVisible();

  await nav.getByRole('button', { name: 'Appearance' }).click();
  await expect(page.getByText('Interface font')).toBeVisible();
});

test('the pages are grouped under collapsible category headers', async ({ page }) => {
  await openSettings(page);
  const nav = page.getByRole('navigation', { name: 'Settings pages' });

  // Three categories, each a disclosure trigger over its own page list.
  const tools = nav.getByRole('button', { name: 'Tools' });
  await expect(nav.getByRole('button', { name: 'General' })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await expect(tools).toHaveAttribute('aria-expanded', 'true');
  await expect(nav.getByRole('button', { name: 'System' })).toBeVisible();

  /*
    Folded is asserted through `inert` on the clipped region rather than through
    the buttons' visibility, and that is not a workaround — it is the stronger
    claim. `<Collapse>` folds by animating a grid track to `0fr` over an
    `overflow-hidden` child, so the buttons inside keep boxes of their own and
    Playwright still calls them visible; what actually takes them out of the tab
    order and the accessibility tree is the `inert` attribute. Assert that, and a
    regression to painted-but-focusable fails here.
  */
  const toolsBody = page.locator('#settings-group-tools > div');
  await expect(toolsBody).not.toHaveAttribute('inert');

  await tools.click();
  await expect(tools).toHaveAttribute('aria-expanded', 'false');
  await expect(toolsBody).toHaveAttribute('inert', '');

  // Folding one category leaves the others alone.
  await expect(page.locator('#settings-group-general > div')).not.toHaveAttribute('inert');
  await expect(nav.getByRole('button', { name: 'Appearance' })).toBeVisible();

  await tools.click();
  await expect(tools).toHaveAttribute('aria-expanded', 'true');
  await expect(toolsBody).not.toHaveAttribute('inert');
});

test('a folded category stays folded across a reload', async ({ page }) => {
  await openSettings(page);
  const nav = page.getByRole('navigation', { name: 'Settings pages' });

  await nav.getByRole('button', { name: 'System' }).click();
  await expect(page.locator('#settings-group-system > div')).toHaveAttribute('inert', '');

  await page.reload();
  await page.getByRole('button', { name: 'Settings' }).click();

  const afterReload = page.getByRole('navigation', { name: 'Settings pages' });
  await expect(afterReload.getByRole('button', { name: 'System' })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  await expect(page.locator('#settings-group-system > div')).toHaveAttribute('inert', '');
  // Only that one — the rest come back open, not all-collapsed.
  await expect(afterReload.getByRole('button', { name: 'General' })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
});

test('the side-navigation mode is settable from Appearance, not just the rail chevron', async ({
  page,
}) => {
  await openSettings(page);

  // Same store field the rail's pin writes, so the two must agree.
  const modes = page.getByRole('radiogroup', { name: 'Side navigation' });
  await expect(modes.getByRole('radio', { name: 'Auto' })).toHaveAttribute(
    'aria-checked',
    'true',
  );

  await modes.getByRole('radio', { name: 'Locked open' }).click();
  await expect(modes.getByRole('radio', { name: 'Locked open' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  // The rail's own pin is the other face of this control; expanded means pinned.
  await expect(page.getByRole('button', { name: 'Unlock navigation' })).toBeVisible();

  // `collapsed` is reachable here and nowhere else — the rail's pin is two-state.
  await modes.getByRole('radio', { name: 'Locked closed' }).click();
  await expect(modes.getByRole('radio', { name: 'Locked closed' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
});

/**
 * The other direction of the same field — and the part that makes the lock a
 * lock rather than a preference.
 *
 * `auto` hover-expands the rail as an OVERLAY: the page keeps its 3.5rem
 * offset and nothing reflows. `expanded` is the only mode that moves content,
 * which `AppFrame` publishes as `--nav-offset` on the root element. Asserting
 * the variable is the only way to tell the two expanded-looking rails apart —
 * they render identically.
 */
test('the rail pin locks and unlocks, and only the lock shifts the page', async ({ page }) => {
  await openSettings(page);

  const navOffset = () =>
    page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--nav-offset').trim(),
    );
  const modes = page.getByRole('radiogroup', { name: 'Side navigation' });

  // Off the rail first: `openSettings` clicks the rail's own footer button, so
  // the pointer is still over it and `auto` is holding it hover-expanded.
  await page.mouse.move(800, 400);

  // Collapsed at rest, so the pin does not exist yet: it would be asking the
  // user to lock open a rail whose contents they cannot see.
  await expect(page.getByRole('button', { name: 'Keep navigation expanded' })).toHaveCount(0);

  // Hover-expanded — the rail is wide, but the page has not moved.
  await page.getByRole('navigation', { name: 'Views' }).hover();
  const pin = page.getByRole('button', { name: 'Keep navigation expanded' });
  await expect(pin).toBeVisible();
  await expect(pin).toHaveAttribute('aria-pressed', 'false');
  expect(await navOffset()).toBe('3.5rem');

  await pin.click();

  // Locked: now the content shifts, and the Appearance control agrees without
  // a reload — one store field, seen from two places.
  expect(await navOffset()).toBe('16rem');
  await expect(page.getByRole('button', { name: 'Unlock navigation' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(modes.getByRole('radio', { name: 'Locked open' })).toHaveAttribute(
    'aria-checked',
    'true',
  );

  // And back. Two-state by design: unlocking lands on `auto`, never on
  // `collapsed` — a three-state pin is a menu wearing a pin's clothes.
  await page.getByRole('button', { name: 'Unlock navigation' }).click();
  await expect(modes.getByRole('radio', { name: 'Auto' })).toHaveAttribute('aria-checked', 'true');
  expect(await navOffset()).toBe('3.5rem');
});

test('the Agent page shows the version card and browses ~/.claude', async ({ page }) => {
  await openSettings(page);

  await page
    .getByRole('navigation', { name: 'Settings pages' })
    .getByRole('button', { name: 'Agent' })
    .click();

  // Version card, from the mocked login-shell probe.
  await expect(page.getByText('v2.1.34')).toBeVisible();
  await expect(page.getByText('via npm')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Update' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Uninstall…' })).toBeVisible();

  // The ~/.claude tree is lazy like the repo one.
  await expect(page.getByRole('treeitem', { name: /settings\.json/ })).toBeVisible();
  await page.getByRole('treeitem', { name: /^skills$/ }).click();
  await expect(page.getByRole('treeitem', { name: /brainstorm/ })).toBeVisible();

  await page.waitForTimeout(400);
  await page.screenshot({ path: '../../docs/screenshots/phase-16/settings-agent.png' });
});
