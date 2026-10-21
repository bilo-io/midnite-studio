import { expect, test, type Locator, type Page } from '@playwright/test';

import { fixtures } from '../test-support/fixtures';
import { clickRailLink, installMockBridge, type MockFixtures } from '../test-support/mock-bridge';

/**
 * The Chats page's layout and scroll behaviour — the two things that need a real
 * layout engine (`scrollHeight` / `clientHeight` / `getBoundingClientRect`),
 * which jsdom reports as 0. Everything else about the page (filters, streaming,
 * markdown, Stop, the review card and modal) is vitest in
 * `src/features/chats/*.test.tsx`; `chat-thread.test.tsx` covers the scroll
 * DECISIONS against faked geometry, and this file proves they hold against real
 * boxes.
 */

const NOW = Date.now();

const longChat = () => ({
  id: 'long-1',
  title: 'A long conversation',
  engine: 'claude',
  model: null,
  mode: 'ask',
  repoId: null,
  repoName: null,
  repoPath: null,
  pinned: false,
  createdAt: NOW - 86_400_000,
  updatedAt: NOW - 1000,
  session: null,
  messages: Array.from({ length: 30 }, (_, i) => ({
    id: `m-${i}`,
    role: i % 2 === 0 ? 'user' : 'assistant',
    text: `${i % 2 === 0 ? 'Question' : 'Answer'} number ${i}. ${'This sentence fills a line of the thread. '.repeat(8)}`,
    createdAt: NOW - (30 - i) * 1000,
    status: 'done',
  })),
});

const data = (reply = 'ok'): MockFixtures => ({ ...fixtures, chats: { seed: [longChat()], reply } });

async function openLongChat(page: Page): Promise<Locator> {
  await installMockBridge(page, data('A reply. '.repeat(120)));
  await page.goto('/');
  await clickRailLink(page, 'Chats');
  await page.getByRole('button', { name: /A long conversation/ }).click();
  const log = page.getByRole('log', { name: 'Conversation' });
  await expect(log).toBeVisible();
  return log;
}

const fromBottom = (log: Locator) => log.evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight);

test('the composer is centred and pinned to the bottom while the thread scrolls inside the page', async ({ page }) => {
  const log = await openLongChat(page);
  const composer = page.getByTestId('chat-composer');
  await expect(composer).toBeVisible();

  const geometry = await page.evaluate(() => {
    const box = (id: string) => document.querySelector(`[data-testid="${id}"]`)!.getBoundingClientRect();
    const pane = document.querySelector('[data-testid="chat-pane"]')!.getBoundingClientRect();
    const composerBox = box('chat-composer');
    return {
      viewportHeight: window.innerHeight,
      documentScrolls: document.documentElement.scrollHeight > window.innerHeight + 1,
      composerBottom: composerBox.bottom,
      composerCentreOffset: Math.abs(composerBox.left + composerBox.width / 2 - (pane.left + pane.width / 2)),
      composerWidth: composerBox.width,
      paneWidth: pane.width,
    };
  });

  // The page itself never scrolls: the thread is the scroller, the composer stays put under it.
  expect(geometry.documentScrolls).toBe(false);
  expect(geometry.composerBottom).toBeLessThanOrEqual(geometry.viewportHeight);
  expect(geometry.composerBottom).toBeGreaterThan(geometry.viewportHeight - 80);
  // Centred in the pane, in a readable column rather than edge to edge.
  expect(geometry.composerCentreOffset).toBeLessThan(2);
  expect(geometry.composerWidth).toBeLessThanOrEqual(768 + 1);
  expect(geometry.composerWidth).toBeLessThan(geometry.paneWidth);
  expect(await log.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
});

test('the thread stays pinned to the bottom while a reply streams, lets go when the reader scrolls up, and jumps back', async ({ page }) => {
  const log = await openLongChat(page);
  // Opening a chat lands on its end.
  await expect.poll(() => fromBottom(log)).toBeLessThan(4);

  await page.getByRole('textbox', { name: 'Message' }).fill('Please write something long');
  await page.getByTestId('chat-input-send').click();
  await expect(page.getByTestId('chat-message-assistant').last()).toContainText('A reply.');
  await expect(page.getByRole('button', { name: 'Stop' })).toBeHidden();
  // Still at the bottom after the whole reply (and its markdown) has landed.
  await expect.poll(() => fromBottom(log)).toBeLessThan(4);
  await expect(page.getByTestId('chat-jump-latest')).toBeHidden();

  // The reader scrolls up with a real wheel: the thread lets go and offers a way back.
  await log.hover();
  await page.mouse.wheel(0, -1500);
  await expect(page.getByTestId('chat-jump-latest')).toBeVisible();
  expect(await fromBottom(log)).toBeGreaterThan(200);

  await page.getByTestId('chat-jump-latest').click();
  await expect.poll(() => fromBottom(log)).toBeLessThan(4);
  await expect(page.getByTestId('chat-jump-latest')).toBeHidden();
});
