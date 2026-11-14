// e2e-capability: xterm, multi-view
import { expect, test, type Page } from '@playwright/test';

import { fixtures } from '../test-support/fixtures';
import { clickRailLink, installMockBridge, type MockFixtures } from '../test-support/mock-bridge';

/**
 * Phase 146 Theme E — Unified Sessions + Chats sidebar selection and
 * `Chat | Terminal` view toggling. Needs a real browser: verifies the full
 * Sessions view + ChatPane + real `@xterm/xterm` mount when toggling a unified
 * agent session between Chat and Terminal views across the preload bridge.
 */
const MAIN = '/tmp/midnite-studio';

const data: MockFixtures = {
  ...fixtures,
  chats: {
    seed: [
      {
        id: 'chat-claude-1',
        title: 'Refactor auth flow',
        engine: 'claude',
        model: null,
        mode: 'edit',
        repoId: 'repo-1',
        repoName: 'midnite-studio',
        repoPath: MAIN,
        pinned: false,
        createdAt: 1_700_000_000_000,
        updatedAt: 1_700_000_010_000,
        session: { engine: 'claude', id: 'conv-claude-1', cwd: MAIN },
        messages: [
          { id: 'm1', role: 'user', text: 'Inspect the auth middleware', createdAt: 1_700_000_000_000, status: 'done' },
          {
            id: 'm2',
            role: 'assistant',
            text: 'I inspected the auth middleware and found a missing null check.',
            createdAt: 1_700_000_005_000,
            status: 'done',
          },
        ],
      },
      {
        id: 'chat-cursor-1',
        title: 'Cursor handoff session',
        engine: 'cursor',
        model: null,
        mode: 'edit',
        repoId: 'repo-1',
        repoName: 'midnite-studio',
        repoPath: MAIN,
        pinned: false,
        createdAt: 1_700_000_000_000,
        updatedAt: 1_700_000_008_000,
        session: null,
        messages: [
          { id: 'm3', role: 'user', text: 'Review sidebar layout', createdAt: 1_700_000_001_000, status: 'done' },
          { id: 'm4', role: 'assistant', text: 'Sidebar layout looks clean.', createdAt: 1_700_000_004_000, status: 'done' },
        ],
      },
    ],
  },
};

async function openSessions(page: Page): Promise<void> {
  await installMockBridge(page, data);
  await page.goto('/');
  await expect(page.getByRole('banner', { name: 'Window title bar' })).toBeVisible();
  await clickRailLink(page, 'Sessions');
}

test('unified sidebar selection and Chat | Terminal view toggle with real xterm', async ({ page }) => {
  await openSessions(page);

  const list = page.getByRole('list', { name: 'Sessions' });
  await expect(list.getByText('Refactor auth flow')).toBeVisible();
  await expect(list.getByText('Cursor handoff session')).toBeVisible();

  // Select the Claude unified chat session -> renders in Chat view by default
  await list.getByText('Refactor auth flow').click();
  await expect(page.getByTestId('chat-pane')).toBeVisible();
  await expect(page.getByTestId('chat-title')).toHaveText('Refactor auth flow');
  await expect(page.getByTestId('session-view-toggle-chat')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('session-view-toggle-terminal')).toHaveAttribute('aria-pressed', 'false');

  // Toggle to Terminal -> mounts a real interactive xterm
  await page.getByTestId('session-view-toggle-terminal').click();
  await expect(page.getByTestId('session-view-toggle-terminal')).toHaveAttribute('aria-pressed', 'true');
  const screen = page.locator('.xterm-screen');
  await expect(screen).toHaveCount(1);
  await expect(screen).toContainText('claude$');

  // Toggle back to Chat -> shows the Chat thread again
  await page.getByTestId('session-view-toggle-chat').click();
  await expect(page.getByTestId('session-view-toggle-chat')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('chat-pane')).toBeVisible();
  await expect(page.getByTestId('chat-handoff-only-banner')).toHaveCount(0);

  // Select handoff-only (cursor) session -> toggle to Terminal and back shows the one-way handoff banner
  await list.getByText('Cursor handoff session').click();
  await expect(page.getByTestId('chat-title')).toHaveText('Cursor handoff session');
  await page.getByTestId('session-view-toggle-terminal').click();
  await expect(page.locator('.xterm-screen')).toContainText('cursor$');

  await page.getByTestId('session-view-toggle-chat').click();
  await expect(page.getByTestId('chat-handoff-only-banner')).toBeVisible();
});
