import { expect, test } from '@playwright/test';

import { fixtures } from './fixtures';
import { installMockBridge } from './mock-bridge';

/**
 * The rail's bottom strip, and the one thing about it only the assembled app
 * can show: that its hairline is the status bar's hairline.
 *
 * The two elements have no DOM relationship — the rail is `position: fixed`
 * down the left edge, owned by `@bilo-io/shell`; the status bar is the last row
 * of the in-flow content box — so the alignment is arithmetic between a
 * hard-coded height and a padding this repo does not own. A unit test can only
 * assert the class names that were *intended* to produce it (and
 * `version-pill.test.tsx` does). Whether they actually did is a measurement.
 */
test('the rail version strip lines up with the status bar', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await installMockBridge(page, { ...fixtures });
  await page.goto('/');

  const strip = page.getByTestId('rail-version');
  const statusBar = page.getByTestId('status-bar');
  const rail = page.getByRole('complementary', { name: 'Views' });
  await expect(strip).toBeVisible();
  await expect(statusBar).toBeVisible();

  /*
    Polled rather than measured once. The rail's width and `<main>`'s padding
    are both `transition`-ed (`@bilo-io/shell`), and the rail settles from
    expanded to collapsed on first paint — a single `boundingBox()` on load
    reads boxes mid-animation and compares numbers neither element will keep.
  */
  const geometry = async () => {
    const [s, b, r] = await Promise.all([
      strip.boundingBox(),
      statusBar.boundingBox(),
      rail.boundingBox(),
    ]);
    return {
      // Same height, and the rules that cap them start at the same y…
      height: s!.height - b!.height,
      top: s!.y - b!.y,
      // …and both sit on the window's bottom edge, so neither can drift under
      // the other's padding.
      bottom: s!.y + s!.height - (b!.y + b!.height),
      // The strip spans the rail's padding box: flush with its left edge, and
      // stopping 1px short on the right — the rail's own border, which is the
      // only thing allowed between the two hairlines.
      railLeft: s!.x - r!.x,
      railRight: s!.x + s!.width - (r!.x + r!.width),
    };
  };

  const SPANS_THE_RAIL = { height: 0, top: 0, bottom: 0, railLeft: 0, railRight: -1 };
  await expect.poll(geometry).toEqual(SPANS_THE_RAIL);

  /*
    And with the rail hovered open, which is the case a `rem` width would have
    got wrong. Only the geometry against the rail is re-checked, not the seam
    with the status bar: a hover-expanded rail *overlays* the content — shell
    republishes `--nav-offset` from `navMode`, not from the hover — so `<main>`
    deliberately stays where it was.
  */
  await rail.hover();
  await expect(strip).toHaveClass(/px-2/);
  await expect.poll(geometry).toEqual(SPANS_THE_RAIL);

  // The seam itself, in the state the window actually sits in: the rail's outer
  // edge is where the status bar begins.
  await page.mouse.move(700, 400);
  await expect(strip).toHaveClass(/px-1/);
  await expect
    .poll(async () => {
      const [r, b] = await Promise.all([rail.boundingBox(), statusBar.boundingBox()]);
      return r!.x + r!.width - b!.x;
    })
    .toBe(0);
});

/**
 * The pill is the version *and* the way to its notes — the same contract
 * midnite web's own version pill has.
 */
test('the version pill opens this build’s release notes', async ({ page }) => {
  await installMockBridge(page, { ...fixtures });
  await page.goto('/');

  const pill = page.getByTestId('version-pill');
  await expect(pill).toHaveText('v1.2.3');

  await pill.click();
  const panel = page.getByTestId('version-pill-panel');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("What's new in v1.2.3");
  await expect(panel).toContainText('A version pill in the rail.');
  await expect(panel.getByText('Full changelog')).toBeVisible();

  /*
    And it sits ABOVE the pill rather than over it. The panel is anchored by
    subtracting its own height, and its content arrives after it mounts — so
    before `popover.tsx` grew a ResizeObserver, the panel was placed against the
    height of an empty box and then hung down across its own trigger and off the
    bottom of the window.
  */
  const panelBox = (await panel.boundingBox())!;
  const pillBox = (await pill.boundingBox())!;
  expect(panelBox.y + panelBox.height).toBeLessThanOrEqual(pillBox.y);
  expect(panelBox.y).toBeGreaterThan(0);

  // Escape dismisses and hands focus back, like every other popover here.
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(pill).toBeFocused();
});
