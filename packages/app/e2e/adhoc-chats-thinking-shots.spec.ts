import { expect, test, type Page } from '@playwright/test';

import { fixtures } from '../test-support/fixtures';
import { clickRailLink, installMockBridge, shotPath } from './shots-helper';

/**
 * Chats' thinking panel (ad hoc) — the rainbow ring on the collapsed pill and on
 * the expanded panel, the usage metrics at the far right, and the pill's centre
 * line against the provider icon's. Needs a real browser: the ring is a masked
 * conic gradient and the alignment is real layout (`getBoundingClientRect`),
 * neither of which jsdom does. The states and toggle are vitest
 * (`src/features/chats/thinking-panel.test.tsx`).
 *
 * Run with `MSTUDIO_SHOTS=1`.
 */
const OUT = '../../docs/screenshots/adhoc-chats-thinking';
test.skip(!process.env['MSTUDIO_SHOTS'], 'set MSTUDIO_SHOTS=1 to write screenshots');

const NOW = Date.now();
const REASONING =
  'The user wants the retry to back off. Let me look at how the queue schedules work first — ' +
  'write-queue.ts serialises per repo, so a retry has to re-enter the queue rather than sleep inside it.\n\n' +
  'Exponential with jitter, capped at 30s, is the conventional choice here.';

const chat = {
  id: 'think-1',
  title: 'Retry with backoff',
  engine: 'claude',
  model: null,
  mode: 'ask',
  repoId: null,
  repoName: null,
  repoPath: null,
  pinned: false,
  createdAt: NOW - 60_000,
  updatedAt: NOW - 1000,
  session: null,
  messages: [
    { id: 'u1', role: 'user', text: 'How should the push retry back off?', createdAt: NOW - 60_000, status: 'done' },
    {
      id: 'a1',
      role: 'assistant',
      text: 'Re-enter the write queue with **exponential backoff and jitter**, capped at 30 seconds.',
      createdAt: NOW - 59_000,
      status: 'done',
      engine: 'claude',
      thinking: REASONING,
      thinkingMs: 8_200,
      finishedAt: NOW - 44_500,
      usage: { outputTokens: 1_284, contextTokens: 46_200, contextWindow: 200_000 },
    },
    { id: 'u2', role: 'user', text: 'And for fetch?', createdAt: NOW - 20_000, status: 'done' },
    {
      id: 'a2',
      role: 'assistant',
      text: '',
      createdAt: NOW - 19_000,
      status: 'streaming',
      engine: 'claude',
      thinking: 'Fetch is read-only, so it does not need the queue at all…',
      usage: { outputTokens: 312, contextTokens: 47_900, contextWindow: 200_000 },
    },
  ],
};

async function open(page: Page, scheme: 'dark' | 'light'): Promise<void> {
  await installMockBridge(page, { ...fixtures, chats: { seed: [chat], reply: 'ok' } });
  await page.setViewportSize({ width: 1100, height: 760 });
  await page.goto('/');
  await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'no-preference' });
  await page.evaluate((s) => {
    document.documentElement.classList.toggle('dark', s === 'dark');
    document.documentElement.setAttribute('data-motion', 'full');
  }, scheme);
  await clickRailLink(page, 'Chats');
  await page.getByRole('button', { name: /Retry with backoff/ }).click();
  await expect(page.getByTestId('thinking-panel')).toHaveCount(2);
}

test('collapsed and expanded, dark', async ({ page }) => {
  await open(page, 'dark');
  const log = page.getByRole('log', { name: 'Conversation' });

  // The pill's centre line is the provider icon's, to the pixel, in both states.
  const offset = () =>
    page.evaluate(() => {
      const article = document.querySelector('[data-message-id="a1"]')!;
      const icon = article.querySelector('span[aria-hidden]')!.getBoundingClientRect();
      const pill = article.querySelector('[data-testid="thinking-toggle"]')!.getBoundingClientRect();
      return Math.abs(icon.top + icon.height / 2 - (pill.top + pill.height / 2));
    });
  expect(await offset()).toBeLessThan(0.5);

  await page.waitForTimeout(500);
  await log.screenshot({ path: shotPath(OUT, 'collapsed-dark.png') });

  await page.locator('[data-message-id="a1"]').getByTestId('thinking-toggle').click();
  await expect(page.getByTestId('thinking-body')).toBeVisible();
  expect(await offset()).toBeLessThan(0.5);
  await page.locator('[data-message-id="a2"]').getByTestId('thinking-toggle').click();
  await page.waitForTimeout(500);
  await log.screenshot({ path: shotPath(OUT, 'expanded-dark.png') });
});

test('collapsed, light', async ({ page }) => {
  await open(page, 'light');
  await page.waitForTimeout(500);
  await page.getByRole('log', { name: 'Conversation' }).screenshot({ path: shotPath(OUT, 'collapsed-light.png') });
});
