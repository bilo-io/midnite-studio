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
  /*
    One branch, so the sidebar's Local section has something to show: an empty
    ref section hides itself (`hideWhenEmpty`), and the Sidebar-page test below
    needs a section that is visible unfiltered and gone once the view narrows.
  */
  refs: [
    {
      name: 'main',
      fullName: 'refs/heads/main',
      kind: 'localBranch',
      sha: 'a'.repeat(40),
      upstream: null,
      isHead: true,
      worktreePath: null,
    },
  ],
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

test('the Sidebar page reads every view\'s narrowing, edits it live, and resets it', async ({
  page,
}) => {
  await openSettings(page);
  await page
    .getByRole('navigation', { name: 'Settings pages' })
    .getByRole('button', { name: 'Sidebar' })
    .click();
  await expect(page.getByRole('heading', { name: 'Sidebar' })).toBeVisible();

  // The defaults, readable per row: Changes arrives narrowed, Graph whole.
  const changes = page.getByRole('radiogroup', { name: 'Changes' });
  await expect(changes.getByRole('radio', { name: 'Narrowed' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(
    page.getByRole('radiogroup', { name: 'Graph' }).getByRole('radio', { name: 'Everything' }),
  ).toHaveAttribute('aria-checked', 'true');

  // Nothing overridden yet, so there is nothing for reset to do.
  const resetButton = page.getByRole('button', { name: 'Reset to view defaults' });
  await expect(resetButton).toBeDisabled();

  /*
    The Settings row is the live one — Settings IS the active view — so
    flipping it must narrow the panel sitting beside this very page. That is
    the whole claim of the page: same store field as the panel's funnel
    button, seen from the other side.
  */
  await expect(page.getByRole('heading', { name: 'Local' })).toBeVisible();
  await page
    .getByRole('radiogroup', { name: 'Settings' })
    .getByRole('radio', { name: 'Narrowed' })
    .click();
  await expect(page.getByRole('heading', { name: 'Local' })).toHaveCount(0);

  // Reset puts the row — and the panel — back.
  await expect(resetButton).toBeEnabled();
  await resetButton.click();
  await expect(resetButton).toBeDisabled();
  await expect(page.getByRole('heading', { name: 'Local' })).toBeVisible();
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
