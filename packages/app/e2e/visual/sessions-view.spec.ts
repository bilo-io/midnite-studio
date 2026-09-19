import { expect, test, type Page } from '@playwright/test';

import {
  clickRailLink,
  fixtures,
  installMockBridge,
  prepareForVisualCapture,
  type MockFixtures,
} from '../shots-helper';

/**
 * Phase 86 Theme H — the merged Sessions list (Theme A), with a live and a
 * closed row side by side: the agent icon leading the label, the status dot
 * in its live/closed colours, and the resume affordance's tooltip target
 * (Theme C) all in one committed crop, rather than only proven by jsdom
 * text/role assertions.
 */
const MAIN = '/tmp/midnite-studio';

const closedSession = (over: Record<string, unknown> = {}) => ({
  id: 'closed-1',
  kind: 'shell',
  title: 'midnite-studio',
  cwd: MAIN,
  repoId: 'repo-1',
  createdAt: 1_700_000_000_000,
  closedAt: 1_700_000_100_000,
  exitCode: 0,
  reason: 'closed',
  transcriptBytes: 128,
  ...over,
});

const data: MockFixtures = {
  ...fixtures,
  closedSessions: [
    closedSession({
      id: 'claude-closed',
      kind: 'agent',
      agentId: 'claude',
      name: 'claude-run',
      createdAt: 1_700_000_000_000,
      closedAt: 1_700_000_300_000,
    }),
  ],
  terminalSessions: [
    {
      session: {
        id: 'claude-live',
        kind: 'agent',
        agentId: 'claude',
        title: 'midnite-studio',
        name: 'claude-live-run',
        cwd: MAIN,
        repoId: 'repo-1',
        createdAt: 1_700_000_400_000,
      },
      live: { ptyId: 'pty-1', pid: 4242, cols: 80, rows: 24 },
    },
  ],
};

async function open(page: Page): Promise<void> {
  await installMockBridge(page, data);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();
  await clickRailLink(page, 'Sessions');
}

test('the Sessions list, one live row above one closed row', async ({ page }) => {
  await open(page);

  const list = page.getByRole('list', { name: /^(Sessions|Closed sessions)$/ });
  await expect(list.getByText('claude-live-run')).toBeVisible();
  await expect(list.getByText('claude-run')).toBeVisible();
  await prepareForVisualCapture(page);

  await expect(list).toHaveScreenshot('sessions-list-live-and-closed.png');
});
