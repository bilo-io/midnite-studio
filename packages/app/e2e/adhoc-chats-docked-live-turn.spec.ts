import { expect, test, type Page } from '@playwright/test';

import { fixtures } from '../test-support/fixtures';
import { clickRailLink, installMockBridge } from '../test-support/mock-bridge';
import { shotPath } from './shots-helper';

/**
 * Chats thread layout: docked live thinking panel while streaming, with thread
 * and composer edges aligned and the edit-mode footnote removed.
 *
 * Run with `MSTUDIO_SHOTS=1`.
 */
const OUT = '../../docs/screenshots/adhoc-chats-docked-live-turn';
test.skip(!process.env['MSTUDIO_SHOTS'], 'set MSTUDIO_SHOTS=1 to write screenshots');

const NOW = Date.now();

const chat = {
  id: 'dock-1',
  title: 'Docked live turn test',
  engine: 'claude',
  model: null,
  mode: 'ask',
  repoId: null,
  repoName: null,
  repoPath: null,
  pinned: false,
  createdAt: NOW - 120_000,
  updatedAt: NOW - 1000,
  session: null,
  messages: [
    { id: 'u1', role: 'user', text: 'What is the capital of France?', createdAt: NOW - 120_000, status: 'done' },
    {
      id: 'a1',
      role: 'assistant',
      text: 'The capital of France is Paris.',
      createdAt: NOW - 119_000,
      status: 'done',
      engine: 'claude',
      thinking: 'This is a straightforward geography question.',
      thinkingMs: 1_200,
      finishedAt: NOW - 114_500,
      usage: { outputTokens: 84, contextTokens: 12_300, contextWindow: 200_000 },
    },
    ...[1, 2, 3, 4].flatMap((i) => [
      { id: `fu${i}`, role: 'user', text: `Earlier question ${i}: tell me more about Paris landmarks.`, createdAt: NOW - 100_000 + i, status: 'done' },
      { id: `fa${i}`, role: 'assistant', text: `Earlier answer ${i}: the Louvre, the Eiffel Tower and Notre-Dame are among the best known landmarks in the city.`, createdAt: NOW - 99_000 + i, status: 'done', engine: 'claude' },
    ]),
    { id: 'u2', role: 'user', text: 'What is its population?', createdAt: NOW - 20_000, status: 'done' },
    {
      id: 'a2',
      role: 'assistant',
      text: 'The population of Paris proper is approximately 2.2 million people, making it the second-largest city in France by population.',
      createdAt: NOW - 19_000,
      status: 'streaming',
      engine: 'claude',
      thinking: 'The user is asking about Paris population. I should provide current estimates.',
      usage: { outputTokens: 312, contextTokens: 15_900, contextWindow: 200_000 },
    },
  ],
};

async function open(page: Page): Promise<void> {
  await installMockBridge(page, { ...fixtures, chats: { seed: [chat], reply: 'ok' } });
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto('/');
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'no-preference' });
  await page.evaluate(() => {
    document.documentElement.classList.remove('dark');
    document.documentElement.setAttribute('data-motion', 'full');
  });
  await clickRailLink(page, 'Chats');
  await page.getByRole('button', { name: /Docked live turn test/ }).click();
  await expect(page.getByTestId('chat-pane')).toBeVisible();
}

test('thread and composer edges aligned', async ({ page }) => {
  await open(page);
  const column = page.getByTestId('chat-thread').locator('> div > div');
  const dock = page.getByTestId('chat-dock').locator('> div');
  const composer = page.getByTestId('chat-composer');
  const [c, d, k] = [await column.boundingBox(), await dock.boundingBox(), await composer.boundingBox()];
  expect(c && d && k).toBeTruthy();
  for (const box of [c!, d!]) {
    expect(Math.abs(box.x - k!.x)).toBeLessThan(1.5);
    expect(Math.abs(box.width - k!.width)).toBeLessThan(1.5);
  }
  await page.screenshot({ path: shotPath(OUT, 'thread-composer-aligned') });
});

test('live turn docked above composer while thread scrolled up', async ({ page }) => {
  await open(page);
  await page.getByTestId('chat-thread').evaluate((el) => {
    el.scrollTop = 0;
  });
  await page.waitForTimeout(300);
  const dock = page.getByTestId('chat-dock');
  await expect(dock.getByTestId('thinking-panel')).toBeVisible();
  const [d, k] = [await dock.boundingBox(), await page.getByTestId('chat-composer').boundingBox()];
  expect(d!.y + d!.height).toBeLessThanOrEqual(k!.y + 1);
  await expect(page.getByTestId('chat-thread').getByText(/second-largest city/)).toHaveCount(0);
  await page.screenshot({ path: shotPath(OUT, 'live-turn-docked-scrolled') });
});

test("finished turn's inline record with footnote gone", async ({ page }) => {
  await open(page);
  await page.getByTestId('chat-thread').evaluate((el) => {
    el.scrollTop = 0;
  });
  await page.waitForTimeout(300);
  await expect(page.getByText(/Edits happen in this chat/)).toHaveCount(0);
  await expect(page.getByText('Agents can make mistakes. Check important output.')).toHaveCount(0);
  await expect(page.locator('[data-message-id="a1"]')).toBeVisible();
  await page.screenshot({ path: shotPath(OUT, 'finished-turn-inline-record') });
});
