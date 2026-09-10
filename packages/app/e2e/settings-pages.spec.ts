import { expect, test, type Page } from '@playwright/test';

import { fixtures } from '../test-support/fixtures';
import { installMockBridge, type MockFixtures } from '../test-support/mock-bridge';

/**
 * Settings as pages (Phase 16): the bottom-pinned rail entry, the inner page
 * sidebar, and the Agent page — version card from the mocked probe plus the
 * ~/.claude tree through the claude-home scope.
 *
 * **Four of this spec's original eight tests moved to
 * `settings-view.bridge.test.tsx` under jsdom** (Phase 82 Theme C, wave 1):
 * page navigation, the collapsible category headers' `inert` marking, the
 * Sidebar page's view-filter rows, and the Agent page. The four remaining
 * here are genuine stragglers: "settings is one bottom entry" needs the
 * app's outer rail (a different component); "a folded category stays folded
 * across a reload" needs an actual page reload to prove `zustand/persist`
 * rehydration, which a jsdom test cannot honestly fake without resetting and
 * re-importing the store module fresh; the nav lock/pin pair both read
 * `getComputedStyle(...).getPropertyValue('--nav-offset')` and real pointer
 * hover — neither reproducible under jsdom.
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

  // The rail's workspace links: Explorer, Graph, Changes — no Settings link.
  await expect(page.getByRole('link', { name: 'Explorer' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Settings' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Settings' })).toBeVisible();
});

test('a folded category stays folded across a reload', async ({ page }) => {
  await openSettings(page);
  const nav = page.getByRole('navigation', { name: 'Settings pages' });

  await nav.getByRole('button', { name: 'System Info' }).click();
  await expect(page.locator('#settings-group-system > div')).toHaveAttribute('inert', '');

  await page.reload();
  // No re-opening step: a reload now restores the view you were on, so
  // Settings is still the active page. Clicking "Settings" again would also
  // be ambiguous — with the page open, that name matches both the rail item
  // and the Location breadcrumb, which is a strict-mode violation.
  const afterReload = page.getByRole('navigation', { name: 'Settings pages' });
  await expect(afterReload.getByRole('button', { name: 'System Info' })).toHaveAttribute(
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

test('the side-navigation lock lives on the Sidebar page, and locked closed means closed', async ({
  page,
}) => {
  await openSettings(page);
  await page
    .getByRole('navigation', { name: 'Settings pages' })
    .getByRole('button', { name: 'Sidebar' })
    .click();

  // Same store field the rail's pin writes, so the two must agree.
  const modes = page.getByRole('radiogroup', { name: 'Side navigation' });
  await expect(modes.getByRole('radio', { name: 'Auto' })).toHaveAttribute(
    'aria-checked',
    'true',
  );

  await modes.getByRole('radio', { name: 'Locked open' }).click();
  // The rail's own pin is the other face of this control; expanded means pinned.
  await expect(page.getByRole('button', { name: 'Unlock navigation' })).toBeVisible();

  // `collapsed` is reachable here and nowhere else — the rail's pin is two-state.
  await modes.getByRole('radio', { name: 'Locked closed' }).click();
  await expect(modes.getByRole('radio', { name: 'Locked closed' })).toHaveAttribute(
    'aria-checked',
    'true',
  );

  /*
    Locked closed means CLOSED: hovering the rail must not expand it. The proof
    is the tooltip — AppFrame renders one against a rail item only while the
    rail is collapsed, so a visible tooltip and a hover in progress together
    say the hover did not expand anything. In `auto` this same hover would have
    expanded the rail and the label would be in-flow text, not a tooltip.
  */
  await page.getByRole('link', { name: 'Explorer' }).hover();
  await expect(page.getByRole('tooltip')).toHaveText('Explorer');
  // And the expanded rail's furniture stays gone — no pin to unlock.
  await expect(page.getByRole('button', { name: 'Unlock navigation' })).toHaveCount(0);
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

  // Locked: now the content shifts, and the settings control agrees without a
  // reload — one store field, seen from two places. The control lives on the
  // Sidebar page (locking the nav is a sidebar decision, not a theme one), so
  // the second view of the field is a page away.
  expect(await navOffset()).toBe('16rem');
  await expect(page.getByRole('button', { name: 'Unlock navigation' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page
    .getByRole('navigation', { name: 'Settings pages' })
    .getByRole('button', { name: 'Sidebar' })
    .click();
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

/**
 * The Agent page's own functional assertions (version card, Update/Uninstall
 * buttons, browsing `~/.claude`) moved to `settings-view.bridge.test.tsx`
 * under jsdom. What is left here is the one thing that migration cannot
 * carry: this spec's own screenshot capture — Theme D's territory to build a
 * real pixel-diff layer around, not Theme C's, per the same reasoning
 * `diagnostics.spec.ts`'s "phase 18 screenshots" block was left in Playwright
 * (i.e. not migrated to jsdom). The capture itself is gated behind
 * `MSTUDIO_SHOTS` (Phase 82 Theme A's follow-up item) — same as that
 * `diagnostics.spec.ts` block's own two calls — so a routine run keeps its
 * assertions but takes no picture.
 */
test('the Agent page screenshot', async ({ page }) => {
  await openSettings(page);

  await page
    .getByRole('navigation', { name: 'Settings pages' })
    .getByRole('button', { name: 'Agent' })
    .click();
  await expect(page.getByRole('treeitem', { name: /brainstorm/ })).toHaveCount(0);
  await page.getByRole('treeitem', { name: /^skills$/ }).click();
  await expect(page.getByRole('treeitem', { name: /brainstorm/ })).toBeVisible();

  await page.waitForTimeout(400);
  if (process.env.MSTUDIO_SHOTS) {
    await page.screenshot({ path: '../../docs/screenshots/phase-16/settings-agent.png' });
  }
});
