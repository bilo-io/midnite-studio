import { expect, test, type Locator, type Page } from '@playwright/test';

import { fixtures } from './fixtures';
import { installMockBridge } from './mock-bridge';

/**
 * Floating layers vs. the title bar.
 *
 * `@bilo-io/shell` draws `<TitleBar>` at `z-[60]` — higher than the `z-50` that
 * reads as "on top" in a plain Tailwind app. So every overlay this app opened
 * from a control IN the title bar slid UNDER it: the breadcrumb's repo
 * switcher, the theme menu, and any context menu raised from that strip. The
 * fix is the named `z-menu`/`z-popover`/`z-dialog`/`z-tooltip` scale in
 * `tailwind.config.ts`, all of which clear the shell's chrome.
 *
 * Visibility is NOT the assertion, and neither is the bounding box. An occluded
 * menu is `toBeVisible()`, is positioned correctly, and passes Playwright's own
 * actionability checks — which is exactly why the bug survived a suite this
 * size. Only hit-testing answers the question a human is actually asking: at
 * these coordinates, is the menu the thing the cursor lands on?
 */

/**
 * Hit-test the menu where it overlaps the title bar.
 *
 * The overlap is the whole test. A menu hanging off a title-bar control clears
 * the bar within a row or two, so probing its CENTRE asks about a point no
 * z-index dispute was ever happening at — an earlier draft of this spec did
 * exactly that and passed against the bug. So the probe is the centre of the
 * intersection, and no intersection at all throws rather than passing quietly:
 * a menu that stopped overlapping the bar has moved, and this spec would be
 * asserting nothing.
 */
async function overlapsTitleBarOnTop(page: Page, menu: Locator): Promise<boolean> {
  return page.evaluate((element) => {
    const bar = document.querySelector('header.fixed.top-0');
    if (!bar) throw new Error('no title bar — the mock bridge must report a frameless window');
    const menuRect = (element as Element).getBoundingClientRect();
    const barRect = bar.getBoundingClientRect();
    const top = Math.max(menuRect.top, barRect.top);
    const bottom = Math.min(menuRect.bottom, barRect.bottom);
    const left = Math.max(menuRect.left, barRect.left);
    const right = Math.min(menuRect.right, barRect.right);
    if (bottom - top < 2 || right - left < 2) {
      throw new Error(
        `menu does not overlap the title bar (menu top ${menuRect.top}, bar bottom ${barRect.bottom}) — nothing to assert`,
      );
    }
    // The deepest element at the point, walked back up: a hit on the menu's own
    // row, label or icon counts. Only a hit outside its subtree is a failure.
    const hit = document.elementFromPoint((left + right) / 2, (top + bottom) / 2);
    return hit ? (element as Element).contains(hit) : false;
  }, await menu.elementHandle());
}

test.beforeEach(async ({ page }) => {
  await installMockBridge(page, fixtures);
  await page.goto('/');
  await expect(page.getByRole('columnheader', { name: 'Commit message' })).toBeVisible();
});

test('the theme menu paints over the title bar it hangs from', async ({ page }) => {
  await page.getByRole('button', { name: 'Toggle theme' }).click();

  const menu = page.getByRole('menu', { name: 'Theme' });
  await expect(menu).toBeVisible();
  expect(await overlapsTitleBarOnTop(page, menu)).toBe(true);
});

/**
 * The breadcrumb's repo switcher opens the shared `<ContextMenu>` through
 * `useDialogs().openMenu`, and so does the title bar's reload button on
 * right-click. Driven through the reload button because the mock bridge reports
 * a single repository, which leaves the repo crumb inert by design — the menu
 * component, the z-index and the strip it opens over are the same. It is also
 * the worse case of the two: `openMenu` places the menu at the CURSOR, which
 * for any title-bar control is mid-bar, so roughly half the bar's height of
 * menu was buried rather than a couple of pixels.
 */
test('a context menu raised from the title bar paints over it', async ({ page }) => {
  await page
    .getByRole('button', { name: /^Reload window \(.* right-click for hard reload\)$/ })
    .click({ button: 'right' });

  const menu = page.getByRole('menu').filter({ has: page.getByText('Hard Reload') });
  await expect(menu).toBeVisible();
  expect(await overlapsTitleBarOnTop(page, menu)).toBe(true);
});

/**
 * One Escape, one dismissal (Phase 62).
 *
 * Both handlers used to be `window` listeners with no idea the other existed:
 * `graph-view` mounted one whenever a commit was selected, `ContextMenu`
 * mounted its own, and `stopPropagation` cannot separate two listeners on the
 * same target. So the single keypress meant to close the menu also threw away
 * the selection the user had spent a click getting to — and the detail panel
 * with it.
 *
 * The menu is a blocking entry at `menu`; the selection is a passive entry at
 * `inline`. Blocking outranks passive outright, so exactly one of them hears
 * the key. This is the assertion, not the paint order the rest of this file is
 * about — but it is the same question ("which surface is on top?") answered for
 * the keyboard instead of the compositor, which is why it lives here.
 */
test('Escape closes a context menu without clearing the graph selection', async ({ page }) => {
  const row = page.locator('[role="row"]').filter({ hasText: 'feat(phase-11)' }).first();
  await row.click();
  await expect(row).toHaveAttribute('aria-selected', 'true');

  await row.click({ button: 'right' });
  const menu = page.getByRole('menu').filter({ has: page.getByText('Create branch here…') });
  await expect(menu).toBeVisible();

  await page.keyboard.press('Escape');

  await expect(menu).toHaveCount(0);
  // The whole point: one press, one dismissal. The row is still selected.
  await expect(row).toHaveAttribute('aria-selected', 'true');

  // And a second press is now the selection's, which is what makes this an
  // ordering fix rather than a swallowed key.
  await page.keyboard.press('Escape');
  await expect(row).toHaveAttribute('aria-selected', 'false');
});
