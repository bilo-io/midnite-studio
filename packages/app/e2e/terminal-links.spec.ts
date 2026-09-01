import { expect, test, type Page } from '@playwright/test';

import { fixtures } from './fixtures';
import { installMockBridge, type MockFixtures } from './mock-bridge';

/**
 * Cmd+click on a URL in terminal output, driven through the real xterm.
 *
 * The matching and the modifier gate are unit-tested (`terminal-links.test.ts`)
 * against a stubbed terminal. What only the app can show is that xterm ever asks
 * our provider, and that what it answers reaches the screen: the pointer cursor
 * appears the moment the modifier goes down over a link — the DOM-visible half
 * of the same decoration that draws the underline — and the click that follows
 * hands `shell.openExternal` the URL. A provider registered but never consulted,
 * or one whose ranges are off by a column, looks identical from the outside.
 */

const URL = 'https://example.com/midnite';

async function open(page: Page): Promise<void> {
  await installMockBridge(page, fixtures as MockFixtures);
  await page.goto('/');
  await expect(page.getByRole('columnheader', { name: 'Commit message' })).toBeVisible();
  // `Ctrl+\`` on every platform — macOS reserves Cmd+\` for window cycling.
  await page.keyboard.press('Control+`');
  await expect(page.getByRole('button', { name: 'New terminal or agent' })).toBeVisible();
}

/** Clear the fake shell's prompt and print the URL alone on the top row. */
async function printUrl(page: Page): Promise<void> {
  const delivered = await page.evaluate((text) => {
    const write = (window as unknown as { __mstudioPtyWrite: (id: string, data: string) => boolean })
      .__mstudioPtyWrite;
    return write('pty-1', `\u001b[2J\u001b[H${text}\r\n`);
  }, URL);
  expect(delivered, 'the URL was not delivered to pty-1').toBe(true);
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
async function aim(page: Page): Promise<{ url: { x: number; y: number }; blank: { x: number; y: number } }> {
  const box = await page.locator('.xterm-screen').boundingBox();
  expect(box, 'the xterm screen has no box').not.toBeNull();
  return {
    url: { x: box!.x + 40, y: box!.y + 4 },
    blank: { x: box!.x + 40, y: box!.y + box!.height - 4 },
  };
}

const externalUrls = (page: Page) =>
  page.evaluate(() => (window as unknown as { __mstudioExternalUrls: string[] }).__mstudioExternalUrls);

/** xterm's own pointer-cursor decoration, the one DOM trace a link leaves. */
const screenClasses = (page: Page) =>
  page.locator('.xterm-screen').getAttribute('class').then((value) => value ?? '');

test.describe('terminal links', () => {
  test('Cmd+click opens a URL in the output; a bare click does not', async ({ page }) => {
    await open(page);
    await printUrl(page);

    const { x, y } = (await aim(page)).url;
    await page.mouse.move(x, y);

    // Hovered, no modifier: no decoration, and a click is just a click.
    await expect.poll(() => screenClasses(page)).not.toContain('xterm-cursor-pointer');
    await page.mouse.click(x, y);
    expect(await externalUrls(page)).toEqual([]);

    // The modifier goes down while the mouse is already parked on the link.
    await page.keyboard.down('Meta');
    await expect.poll(() => screenClasses(page)).toContain('xterm-cursor-pointer');

    await page.mouse.down();
    await page.mouse.up();
    await page.keyboard.up('Meta');

    await expect.poll(() => externalUrls(page)).toEqual([URL]);
    await expect.poll(() => screenClasses(page)).not.toContain('xterm-cursor-pointer');
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
  });
});
