import { expect, test, type Locator, type Page } from '@playwright/test';

import { fixtures } from './fixtures';
import { installMockBridge } from './mock-bridge';

/**
 * The gradient-glow panels: they have to still be there a second after opening.
 *
 * `packages/app/src/styles.css` used to carry a verbatim copy of
 * `@bilo-io/ui`'s `.gradient-border`, pasted in *after* `@tailwind utilities`.
 * Unlayered CSS beats a utility at equal specificity, so its
 * `position: relative` overrode the `fixed` on every panel wearing the class.
 * `style={{ left, top }}` then meant "offset from my static position at the end
 * of <body>" instead of viewport coordinates, and the panel mounted about a
 * viewport below the fold. The document grew a scroll range to reach it, the
 * focus trap's `.focus()` scrolled to reveal it, and the Popover's own
 * scroll-to-dismiss listener read that scroll as the user scrolling away and
 * closed it — one frame after it opened.
 *
 * Every assertion here is a different face of that one bug, because the
 * obvious one is not enough on its own: `toBeVisible()` passed throughout (the
 * panel really was in the DOM and painted, just off-screen), and so did every
 * existing spec that clicked a trigger and asserted on the panel in the same
 * tick.
 */

/** The status bar is the only surface with two `Popover`s side by side. */
const PANELS = [
  { trigger: 'notification-bell', panel: 'notification-bell-panel' },
  { trigger: 'assistant-menu', panel: 'assistant-menu-panel' },
] as const;

test.beforeEach(async ({ page }) => {
  await installMockBridge(page, fixtures);
  await page.goto('/');
  await expect(page.getByRole('columnheader', { name: 'Commit message' })).toBeVisible();
});

const open = (page: Page, trigger: string): Promise<void> =>
  page.getByTestId(trigger).click();

for (const { trigger, panel } of PANELS) {
  test(`the ${trigger} panel is still open a second after it opens`, async ({ page }) => {
    await open(page, trigger);
    const target = page.getByTestId(panel);
    await expect(target).toBeVisible();

    // The whole bug lived in the gap between "it mounted" and "it is still
    // here": the dismiss came from a scroll event one frame later.
    await page.waitForTimeout(1000);
    await expect(target).toBeVisible();
  });

  test(`the ${trigger} panel is positioned against the viewport, not the document`, async ({
    page,
  }) => {
    await open(page, trigger);
    const target = page.getByTestId(panel);
    await expect(target).toBeVisible();

    expect(await target.evaluate((el) => getComputedStyle(el).position)).toBe('fixed');

    // The consequence worth asserting separately, because it is what turned a
    // mispositioned panel into a self-dismissing one: nothing may push the
    // document past the viewport, or focusing the panel scrolls to reach it.
    const overflow = await page.evaluate(() => {
      const se = document.scrollingElement as HTMLElement;
      return { scrollHeight: se.scrollHeight, clientHeight: se.clientHeight, scrollTop: se.scrollTop };
    });
    expect(overflow.scrollHeight).toBe(overflow.clientHeight);
    expect(overflow.scrollTop).toBe(0);

    // And it sits where it was asked to sit.
    const box = (await target.boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  });
}

/**
 * The halo is drawn by exactly one pseudo-element.
 *
 * The local copy had drifted from upstream's `::after` to `::before`, so both
 * rules matched and the panel wore two blurred conic gradients. The local rules
 * override upstream's pseudo in place now; a `::before` growing `content` again
 * means the copy has come back.
 */
test('the glow is one pseudo-element, not two', async ({ page }) => {
  await open(page, 'assistant-menu');
  const target = page.getByTestId('assistant-menu-panel');
  await expect(target).toBeVisible();

  const pseudos = await target.evaluate((el) => ({
    before: getComputedStyle(el, '::before').content,
    after: getComputedStyle(el, '::after').content,
    afterMaskComposite: getComputedStyle(el, '::after').maskComposite,
  }));
  expect(pseudos.before).toBe('none');
  expect(pseudos.after).toBe('""');
  // The halo is masked into a ring. Without this it paints over the panel's own
  // fill — a negative z-index cannot escape the stacking context the panel owns
  // — and the text underneath becomes unreadable.
  expect(pseudos.afterMaskComposite).toContain('exclude');
});

/**
 * Scroll-to-dismiss is about the *anchor* moving, not the user reading. The
 * notifications list is `overflow-y-auto`, so a capture-phase listener that
 * closes on any scroll closed the panel on its own first wheel event.
 */
test('scrolling inside a panel does not dismiss it', async ({ page }) => {
  await open(page, 'notification-bell');
  const target = page.getByTestId('notification-bell-panel');
  await expect(target).toBeVisible();

  await target.evaluate((el) => {
    el.scrollTop = 1;
    el.dispatchEvent(new Event('scroll', { bubbles: false }));
  });
  await page.waitForTimeout(100);
  await expect(target).toBeVisible();
});

/** The menu surfaces share the class and so shared the positioning bug. */
test('the theme menu is positioned against the viewport', async ({ page }) => {
  await page.getByRole('button', { name: 'Toggle theme' }).click();
  const menu: Locator = page.getByRole('menu', { name: 'Theme' });
  await expect(menu).toBeVisible();
  expect(await menu.evaluate((el) => getComputedStyle(el).position)).toBe('fixed');
});
