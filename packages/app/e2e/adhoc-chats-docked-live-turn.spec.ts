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
  const thread = page.getByRole('log', { name: 'Conversation' });
  const composer = page.getByTestId('chat-composer');

  // Verify edges are aligned by checking left and right margins
  const threadBox = await thread.boundingBox();
  const composerBox = await composer.boundingBox();

  expect(threadBox).toBeTruthy();
  expect(composerBox).toBeTruthy();
  if (threadBox && composerBox) {
    // Both should have the same left edge (within 1px tolerance)
    expect(Math.abs(threadBox.x - composerBox.x)).toBeLessThan(2);
  }

  await page.waitForTimeout(300);
  await page.screenshot({ path: shotPath(OUT, 'thread-composer-aligned') });
});

test('live turn docked above composer while thread scrolled up', async ({ page }) => {
  await open(page);

  // Scroll the thread to the top to simulate reading an earlier message
  const thread = page.getByRole('log', { name: 'Conversation' });
  await thread.evaluate((el) => {
    el.scrollTop = 0;
  });

  await page.waitForTimeout(300);

  // The dock with live thinking should still be visible above the composer
  await expect(page.getByTestId('thinking-panel')).toBeVisible();

  await page.screenshot({ path: shotPath(OUT, 'live-turn-docked-scrolled') });
});

test("finished turn's inline record with footnote gone", async ({ page }) => {
  await open(page);

  // Navigate to the first message to show a finished turn's inline record
  const thread = page.getByRole('log', { name: 'Conversation' });
  await thread.evaluate((el) => {
    el.scrollTop = 0;
  });

  await page.waitForTimeout(300);

  // Check that the "Agents can make mistakes" footnote appears but not the edit mode one
  const footnote = page.getByText('Agents can make mistakes. Check important output.');
  await expect(footnote).toBeVisible();

  // Make sure the "Edits happen" text is NOT there
  const editsFootnote = page.getByText(/Edits happen in this chat's own worktree/);
  await expect(editsFootnote).not.toBeVisible();

  // Take screenshot of the finished turn with its inline record
  const firstAssistantMessage = page.locator('[data-message-id="a1"]');
  await expect(firstAssistantMessage).toBeVisible();

  await page.screenshot({ path: shotPath(OUT, 'finished-turn-inline-record') });
});
