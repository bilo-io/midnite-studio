import { expect, test, type Page } from '@playwright/test';

import { fixtures } from './fixtures';
import { installMockBridge, type MockFixtures } from './mock-bridge';

/**
 * Dragging a splitter past its own bound, and what that does.
 *
 * Three panes (the repositories sidebar, the terminal, the FAB panel) stop
 * dead at a minimum width or height, which leaves a user who wants the pane
 * *gone* holding a splitter that no longer follows them. Past the bound the
 * gesture now means something: shut the pane, or — for the terminal, dragged
 * the other way, to the top of the column — maximize it.
 *
 * Asserted through the DOM rather than through the store, because the part
 * that broke in practice is always the sign of the delta: the terminal's
 * splitter is ABOVE its panel and the FAB panel's is to its LEFT, so both
 * invert, and a spec that only reads state would pass with the two outcomes
 * swapped.
 */

async function open(page: Page, over: Partial<MockFixtures> = {}): Promise<void> {
  await installMockBridge(page, { ...fixtures, ...over } as MockFixtures);
  await page.goto('/');
  await expect(page.getByRole('columnheader', { name: 'Commit message' })).toBeVisible();
}

/** The reveal tween's own duration (`REVEAL_MS` in `use-reveal.ts`), plus slack. */
const SETTLE_WAIT_MS = 300;

const repos = (page: Page) => page.getByRole('complementary', { name: 'Repositories' });
const frame = (page: Page) => page.locator('[data-terminal-frame]');
const fabPanel = (page: Page) => page.getByRole('button', { name: 'Guard', exact: true });

/**
 * Drag a splitter to an absolute point, in steps.
 *
 * Stepped rather than a single jump because the snap is armed by a
 * `pointermove` past the bound: one move to the target would work, but several
 * is what the pointer actually does, and it is the shape that catches a handler
 * that recomputes its origin mid-drag.
 */
async function dragSeparator(page: Page, name: string, to: { x?: number; y?: number }) {
  const handle = page.getByRole('separator', { name });
  /*
    `hover()` rather than a `mouse.move` to a measured centre, and this is not a
    stylistic preference: the shell's layout is still settling by a pixel or two
    when the graph first paints, and a splitter is FIVE pixels wide. A centre
    measured a moment earlier lands beside it often enough to make the suite
    flaky — silently, because a mousedown on nothing raises no error and leaves
    the pane at the width it started with. `hover()` waits for the element to
    stop moving and asserts the point actually hits it.
  */
  await handle.hover();
  const box = (await handle.boundingBox())!;
  const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.down();
  await page.mouse.move(to.x ?? from.x, to.y ?? from.y, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(SETTLE_WAIT_MS);
}

/** `Ctrl+\`` on every platform — macOS reserves Cmd+\` for window cycling. */
async function toggleTerminal(page: Page): Promise<void> {
  await page.keyboard.press('Control+`');
  await page.waitForTimeout(SETTLE_WAIT_MS);
}

test('dragging the repositories splitter past its minimum closes the panel', async ({ page }) => {
  await open(page);
  await expect(repos(page)).toBeVisible();

  await dragSeparator(page, 'Resize repositories sidebar', { x: 4 });

  await expect(repos(page)).toHaveCount(0);
});

test('a drag that stops at the minimum leaves the repositories panel open', async ({ page }) => {
  await open(page);

  /*
    Far enough left to hit the 180px minimum, but not far enough past it to arm
    the snap — the nav rail sits between the window edge and the panel, so this
    lands the panel a little under its minimum rather than well under it. The
    assertion that keeps the slop honest: an over-eager threshold would close
    the panel on any firm drag leftwards.
  */
  await dragSeparator(page, 'Resize repositories sidebar', { x: 200 });

  await expect(repos(page)).toBeVisible();
  expect((await repos(page).boundingBox())?.width).toBe(180);
});

test(
  'dragging the terminal splitter to the top maximizes it, and to the bottom closes it',
  /*
    Used to carry `@linux-red`: this is the one spec in the file that mounts a
    terminal via `toggleTerminal`'s `Control+\`` press, and that chord never
    opened the panel on the CI runner at all — not a WebGL/GPU problem as
    first diagnosed, but `navigator.platform` genuinely reading `'Linux'`
    there, which `chordFromEvent` resolves a bare Ctrl to `Mod` under, and
    `Mod+\`` never matches `terminal.toggle`'s registered `Ctrl+\``. Phase 38
    Theme I's `mock-bridge.ts` fix pins `navigator.platform` to `'MacIntel'`
    for every spec, closing this exact wall for `terminal-links`,
    `terminal-reveal`, `phase-21-roster` and five others — this file just
    hadn't had its tag dropped yet.
  */
  async ({ page }) => {
    await open(page);
    await toggleTerminal(page);
    await expect(frame(page)).toHaveCount(1);

    const viewport = page.viewportSize()!;
    await dragSeparator(page, 'Resize terminal', { y: 8 });

    /*
      Maximized, not merely tall: the splitter is gone (there is nothing left to
      resize against) and the panel's own restore control has appeared. Height
      alone could not tell the two apart — a drag stopping just short of the top
      is also nearly the height of the column.
    */
    await expect(page.getByRole('separator', { name: 'Resize terminal' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Restore terminal height' })).toBeVisible();

    // And back down, past the bottom of the window: the panel closes rather than
    // sitting at its minimum height.
    await page.getByRole('button', { name: 'Restore terminal height' }).click();
    await page.waitForTimeout(SETTLE_WAIT_MS);
    await dragSeparator(page, 'Resize terminal', { y: viewport.height - 4 });

    await expect(frame(page)).toHaveCount(0);
  },
);

test('the FAB panel drags out to 60% of the window, and past its minimum it closes', async ({
  page,
}) => {
  await open(page);
  // The FAB opens the quick-access menu (Phase 58 Theme E); its `L` row opens
  // the Loops panel this spec is actually after.
  await page.getByRole('button', { name: 'Open quick access panel' }).click();
  await page.keyboard.press('l');
  await expect(fabPanel(page)).toBeVisible();
  await page.waitForTimeout(SETTLE_WAIT_MS);

  const viewport = page.viewportSize()!;
  const box = page.locator('[data-fab-panel-frame]');

  // All the way left. The old ceiling was a flat 640px; the panel now stops at
  // FAB_PANEL_MAX_SHARE of the window, which at this viewport is wider than that.
  await dragSeparator(page, 'Resize quick access panel', { x: 4 });
  const widest = (await box.boundingBox())?.width ?? 0;
  expect(widest).toBeCloseTo(Math.round(viewport.width * 0.6), -1);
  expect(widest).toBeGreaterThan(640);

  await dragSeparator(page, 'Resize quick access panel', { x: viewport.width - 4 });
  await expect(fabPanel(page)).toHaveCount(0);
});
