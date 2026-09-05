import { expect, test, type Page } from '@playwright/test';

import { fixtures } from './fixtures';
import { installMockBridge, type MockFixtures } from './mock-bridge';

/**
 * Where focus goes when the overlay closes (Phase 68).
 *
 * Eleven overlays trapped focus; three restored it, each by a different
 * mechanism, and eight dropped it on the floor — where "the floor" is `<body>`,
 * so the next Tab restarts at the top of the document and a screen-reader user
 * loses their place completely. Theme A moved restoration inside
 * `useFocusTrap`, which is why the eight needed no edit of their own; this
 * spec is the assertion that they actually got it.
 *
 * Each case is deliberately shaped the same way: focus a KNOWN trigger, open
 * the overlay from it, dismiss, and assert the trigger has focus again. Not
 * "focus is somewhere sensible" — `toBeFocused()` on the exact element the user
 * left, because every bug this phase fixed still leaves focus *somewhere*.
 *
 * `toBeFocused()`, not `toHaveFocus()`: the former is Playwright's and the
 * latter is jest-dom's, and this is a Playwright suite.
 */

const base: MockFixtures = { ...fixtures };

async function openApp(page: Page): Promise<void> {
  await installMockBridge(page, base);
  await page.goto('/');
  await expect(page.getByRole('columnheader', { name: 'Commit message' })).toBeVisible();
}

/**
 * One of the eight, and the one whose trigger is a plain toolbar button — the
 * simplest possible statement of the rule.
 *
 * The launcher is `browser-launcher.tsx`, which has never had a line of
 * restoration code and still does not: everything asserted here arrives from
 * the `useFocusTrap(containerRef, true)` it already called.
 */
test('the browser launcher hands focus back to the toggle that raised it', async ({ page }) => {
  await openApp(page);

  const toggle = page.locator('[data-testid="browser-toggle"]');
  await toggle.click();
  await expect(page.getByTestId('browser-launcher')).toBeVisible();

  await page.keyboard.press('Escape');

  await expect(page.getByTestId('browser-launcher')).toHaveCount(0);
  await expect(toggle).toBeFocused();
});

/**
 * A second of the eight, through a different shell: `stash-push-dialog.tsx` is
 * `ConfirmDialog`'s skeleton copied byte for byte, which is exactly why the
 * defect propagated and exactly why one hook fixes all of them.
 */
test('the stash dialog hands focus back to the heading action', async ({ page }) => {
  await installMockBridge(page, {
    ...base,
    statusEntries: [
      {
        path: 'src/a.ts',
        origPath: null,
        staged: 'unmodified',
        unstaged: 'modified',
        conflicted: false,
        similarity: null,
      },
    ],
  });
  await page.goto('/');

  // The rail is icon-collapsed until hovered, and a cold click races its own
  // expansion — hover first and wait for the label, as `changes-panel.spec.ts`
  // spells out at length.
  const link = page.getByRole('link', { name: 'Changes' });
  await link.hover();
  await expect(link.getByText('Changes', { exact: true })).toBeVisible();
  await link.click();

  const action = page.getByRole('button', { name: 'Stash changes' });
  await action.click();
  await expect(page.getByRole('dialog', { name: 'Stash changes' })).toBeVisible();

  await page.keyboard.press('Escape');

  await expect(page.getByRole('dialog', { name: 'Stash changes' })).toHaveCount(0);
  await expect(action).toBeFocused();
});

/**
 * Theme C: an open context menu is operable from the keyboard, and closing it
 * puts the user back on the row they right-clicked.
 *
 * The menu is portalled to the end of `<body>`, so before this phase reaching
 * its first item by keyboard meant tabbing through the entire rest of the
 * document — and the menu declared `role="menu"` the whole time.
 */
test('a context menu takes focus on open and returns the row on Escape', async ({ page }) => {
  await openApp(page);

  const row = page.locator('[role="row"]').filter({ hasText: 'feat(phase-11)' }).first();
  await row.click();
  await row.click({ button: 'right' });

  const menu = page.getByRole('menu').filter({ has: page.getByText('Create branch here…') });
  await expect(menu).toBeVisible();

  // Focus is inside the menu, on a row rather than on the container: the
  // container only holds it when a menu has no selectable row at all.
  expect(await menu.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  expect(await page.evaluate(() => document.activeElement?.getAttribute('role'))).toBe('menuitem');

  // Arrow keys move within the menu — the half of the ARIA menu contract that
  // was advertised and unimplemented.
  const firstLabel = await page.evaluate(() => document.activeElement?.textContent);
  await page.keyboard.press('ArrowDown');
  expect(await page.evaluate(() => document.activeElement?.textContent)).not.toBe(firstLabel);

  await page.keyboard.press('Escape');

  await expect(menu).toHaveCount(0);
  await expect(row).toBeFocused();
});

/**
 * Theme D: `multi-select-menu.tsx` autofocused its search box and then had
 * nothing to say about focus ever again — Tab walked out into the toolbar
 * behind it, and dismissing it left focus on the removed input.
 */
test('the author filter hands focus back to its trigger', async ({ page }) => {
  await openApp(page);

  const trigger = page.getByRole('button', { name: /All authors/ });
  await trigger.click();
  await expect(page.getByRole('listbox')).toBeVisible();

  await page.keyboard.press('Escape');

  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(trigger).toBeFocused();
});
