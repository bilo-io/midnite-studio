import { expect, test, type Page } from '@playwright/test';

import { fixtures } from '../test-support/fixtures';
import { installMockBridge, type MockFixtures } from '../test-support/mock-bridge';

/**
 * Cmd+click on a URL in terminal output, driven through the real xterm.
 *
 * The matching and the modifier gate are unit-tested (`terminal-links.test.ts`)
 * against a stubbed terminal. What only the app can show is that xterm ever asks
 * our provider, and that what it answers reaches the screen: the pointer cursor
 * appears the moment the modifier goes down over a link — the DOM-visible half
 * of the same decoration that draws the underline — and the click that follows
 * reaches `openLinkFromEvent` with its modifiers intact: Cmd+click hands an
 * `https:` link to `shell.openExternal`, Cmd+Shift+click opens it in the
 * embedded browser instead (see `link-routing.spec.ts` for the same assertion
 * pattern against a different call site). Real xterm matters for the second
 * one in particular: Shift+click is also xterm's extend-selection gesture, and
 * only a real terminal shows that it does not swallow the activation. A provider registered but never consulted, or one whose ranges are off
 * by a column, looks identical from the outside.
 */

const URL = 'https://example.com/midnite';

async function open(page: Page): Promise<void> {
  await installMockBridge(page, fixtures as MockFixtures);
  await page.goto('/');
  await expect(page.getByRole('columnheader', { name: 'Commit message' })).toBeVisible();
  // `Ctrl+\`` on every platform — macOS reserves Cmd+\` for window cycling.
  await page.keyboard.press('Control+`');
  await expect(page.getByRole('button', { name: 'New terminal or agent' })).toBeVisible();
  // The pty behind the auto-opened shell is created once TerminalView's lazy
  // chunk mounts (Phase 36 Theme C) — a moment after the panel opens, not the
  // same tick.
  await expect(page.locator('.xterm-screen')).toHaveCount(1);
}

/**
 * Clear the fake shell's prompt and print the URL alone on the top row.
 *
 * Polled rather than asserted once: `pty-1` only exists in the mock's
 * bookkeeping once TerminalView's lazy chunk (Phase 36 Theme C) has mounted,
 * a moment after the panel opens rather than in the same tick.
 */
async function printUrl(page: Page): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate((text) => {
          const write = (
            window as unknown as { __mstudioPtyWrite: (id: string, data: string) => boolean }
          ).__mstudioPtyWrite;
          return write('pty-1', `\u001b[2J\u001b[H${text}\r\n`);
        }, URL),
      'the URL was not delivered to pty-1',
    )
    .toBe(true);
}

/**
 * Where to aim the mouse, from the screen's own box.
 *
 * The grid is canvas pixels, so there is no element to hover and no cell to
 * locate — and nothing in the DOM reports the cell size either. Offsets in
 * pixels instead, with enough margin that no plausible cell size changes which
 * cell they land in: 4px down is the first row for any legible font, and 40px
 * across is somewhere inside a URL 27 cells long. The bottom row is empty
 * whatever the pane's dimensions, since the fake shell has printed three lines.
 */
async function aim(
  page: Page,
): Promise<{ url: { x: number; y: number }; blank: { x: number; y: number } }> {
  const box = await page.locator('.xterm-screen').boundingBox();
  expect(box, 'the xterm screen has no box').not.toBeNull();
  return {
    url: { x: box!.x + 40, y: box!.y + 4 },
    blank: { x: box!.x + 40, y: box!.y + box!.height - 4 },
  };
}

const externalUrls = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { __mstudioExternalUrls: string[] }).__mstudioExternalUrls,
  );

/**
 * The browser's own tabs, scoped to its strip — same helper and same
 * `role="tablist"` name as `link-routing.spec.ts` and `browser-pane.spec.ts`,
 * which is the existing pattern for proving a link landed in the embedded
 * browser rather than the system one.
 */
const browserTabs = (page: Page) =>
  page.getByRole('tablist', { name: 'Browser tabs' }).getByRole('tab');

/** xterm's own pointer-cursor decoration, the one DOM trace a link leaves. */
const screenClasses = (page: Page) =>
  page
    .locator('.xterm-screen')
    .getAttribute('class')
    .then((value) => value ?? '');

test.describe('terminal links', () => {
  test('Cmd+click opens a URL in the system browser, Cmd+Shift+click in Midnite; a bare click neither', async ({
    page,
  }) => {
    await open(page);
    await printUrl(page);

    const { x, y } = (await aim(page)).url;
    await page.mouse.move(x, y);

    // Hovered, no modifier: no decoration, and a click is just a click.
    await expect.poll(() => screenClasses(page)).not.toContain('xterm-cursor-pointer');
    await page.mouse.click(x, y);
    expect(await externalUrls(page)).toEqual([]);
    await expect(browserTabs(page)).toHaveCount(0);

    // The modifier goes down while the mouse is already parked on the link.
    await page.keyboard.down('Meta');
    await expect.poll(() => screenClasses(page)).toContain('xterm-cursor-pointer');

    await page.mouse.down();
    await page.mouse.up();
    await page.keyboard.up('Meta');

    // Cmd alone is "leave the app", even though the stored preference is
    // 'in-app' — so the link reaches `shell.openExternal`, and no tab opens.
    await expect.poll(() => externalUrls(page)).toEqual([URL]);
    await expect(browserTabs(page)).toHaveCount(0);
    await expect.poll(() => screenClasses(page)).not.toContain('xterm-cursor-pointer');

    // Same link, Shift added on top: "open it here" rather than "leave".
    await page.keyboard.down('Meta');
    await page.keyboard.down('Shift');
    await expect.poll(() => screenClasses(page)).toContain('xterm-cursor-pointer');

    await page.mouse.down();
    await page.mouse.up();
    await page.keyboard.up('Shift');
    await page.keyboard.up('Meta');

    // `example.com` has no native view, so "open it here" lands in the
    // embedded browser — never the system one.
    await expect(browserTabs(page)).toHaveCount(1);
    await expect(browserTabs(page)).toHaveAccessibleName(/example\.com/);
    expect(await externalUrls(page)).toEqual([URL]);
  });

  test('leaves output that is not a link alone', async ({ page }) => {
    await open(page);
    await printUrl(page);

    // The bottom row: empty grid, nothing to decorate or open.
    const { x, y } = (await aim(page)).blank;
    await page.mouse.move(x, y);
    await page.keyboard.down('Meta');
    await page.mouse.click(x, y);
    await page.keyboard.up('Meta');

    expect(await screenClasses(page)).not.toContain('xterm-cursor-pointer');
    expect(await externalUrls(page)).toEqual([]);
    await expect(browserTabs(page)).toHaveCount(0);
  });
});
