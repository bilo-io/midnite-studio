import { expect, test, type Page } from '@playwright/test';

import { fixtures } from './fixtures';
import { installMockBridge, type MockFixtures } from './mock-bridge';

/**
 * The xterm chunk split, and the preload that pays for it — Phase 36 Theme C.
 *
 * `@xterm/xterm` plus the webgl addon left the entry chunk, which is 394 KB off a
 * boot the terminal is not part of: the panel starts closed. The risk that buys
 * is a visible fallback frame on `Ctrl+\``, which is one keystroke and is meant
 * to feel instant — so `app.tsx` warms the chunk through `idlePreload` after
 * first paint, and `terminal-panel.tsx` and `loops/loop-tab.tsx` both reach it
 * through the single `lazy-terminal-view` module rather than importing it twice.
 *
 * ## What this asserts, and what it deliberately does not
 *
 * It asserts the **mechanism**: the chunk is requested before anyone touches the
 * terminal, and it is requested once however many boundaries mount it. Those are
 * the two things a later edit can silently undo — deleting the `idlePreload` call,
 * or re-adding a direct `terminal-view` import in one of the two consumers.
 *
 * It does **not** assert "no spinner frame appears on toggle", even though that is
 * the user-visible promise, because this suite runs against the Vite dev server
 * (see `playwright.config.ts`) where a dynamic import is an unbundled module
 * waterfall — xterm is dozens of requests — and reliably exceeds
 * `DelayedFallback`'s 120ms. That number says nothing about the single hashed
 * chunk the packaged app loads off `file://`. Asserting it here would be
 * asserting the dev server's module graph. The bundled equivalent is
 * `e2e/perf/bundle-budget.spec.ts`'s absence check plus the 394 KB
 * `terminal-view` chunk it implies.
 */

/** `Ctrl+\`` on every platform — macOS reserves Cmd+\` for window cycling. */
const toggleTerminal = (page: Page) => page.keyboard.press('Control+`');

/** Requests whose URL names the terminal-view module, however it is chunked. */
const terminalViewRequests = (page: Page) =>
  page.evaluate(
    () =>
      performance
        .getEntriesByType('resource')
        .map((e) => e.name)
        .filter((name) => /terminal-view/.test(name)),
  );

async function open(page: Page): Promise<void> {
  await installMockBridge(page, { ...fixtures } as MockFixtures);
  await page.goto('/');
  await expect(page.getByRole('columnheader', { name: 'Commit message' })).toBeVisible();
}

test.describe('lazy terminal view', () => {
  test('the xterm chunk is preloaded at idle, before anything opens a terminal', async ({
    page,
  }) => {
    await open(page);

    /*
      `idlePreload` schedules through `requestIdleCallback`, so it lands after
      first paint but on the browser's own timetable — polled rather than awaited
      on a fixed delay, which would be a bet on how busy the machine is.
    */
    await expect
      .poll(async () => (await terminalViewRequests(page)).length, { timeout: 10_000 })
      .toBeGreaterThan(0);

    // Nothing has touched the terminal. If this ever passes only *after* a toggle,
    // the preload is gone and the split has become a visible cost.
    expect(await page.locator('[data-terminal-frame]').count()).toBe(0);
  });

  test('both consumers share one fetch of the chunk', async ({ page }) => {
    await open(page);
    await expect
      .poll(async () => (await terminalViewRequests(page)).length, { timeout: 10_000 })
      .toBeGreaterThan(0);

    // Mount it for real, twice, through the terminal panel.
    await toggleTerminal(page);
    await expect(page.locator('.xterm-screen')).toBeVisible();
    await toggleTerminal(page);
    await toggleTerminal(page);
    await expect(page.locator('.xterm-screen')).toBeVisible();

    /*
      One request, however many boundaries mount it: two `lazy()` calls over the
      same `import()` specifier share its resolved promise, and the browser caches
      the module besides. More than one distinct URL means someone added a second
      import path to `terminal-view` — which is exactly how xterm would find its
      way back into the entry chunk without anything failing.
    */
    const distinct = new Set(await terminalViewRequests(page));
    expect(
      [...distinct],
      'terminal-view is being fetched under more than one URL — a second static or dynamic ' +
        'import bypassed features/terminal/lazy-terminal-view.tsx.',
    ).toHaveLength(1);
  });

  test('the terminal still opens to a live xterm, not a stuck fallback', async ({ page }) => {
    await open(page);
    await toggleTerminal(page);

    // The real thing resolves. `DelayedFallback` renders null then a spinner, so a
    // boundary that never resolved would leave a spinner here forever.
    await expect(page.locator('.xterm-screen')).toBeVisible();
    await expect(page.locator('[data-terminal-frame] [role="status"]')).toHaveCount(0);
  });
});
