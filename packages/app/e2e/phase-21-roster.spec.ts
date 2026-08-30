import { expect, test, type Page } from '@playwright/test';

import { fixtures } from './fixtures';
import { installMockBridge, type MockFixtures } from './mock-bridge';

/**
 * Phase 21 Themes A–C, as pictures.
 *
 * Two shots, both of the thing the phase changed: the `+` menu, which used to
 * read `New Agent — Claude` exactly once and now names four agents with their
 * own marks and greys the one that is not installed; and the session list,
 * where four agent rows carry four different glyphs rather than four copies of
 * Claude's.
 */

const session = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  kind: 'shell',
  title: 'midnite-studio',
  cwd: '/tmp/midnite-studio',
  repoId: 'repo-1',
  createdAt: 1_787_000_000,
  ...over,
});

/** One of each — the registry's whole reason for existing, in one column. */
const EVERY_AGENT: MockFixtures['terminalSessions'] = [
  { session: session('s-0'), scrollback: '$ git status\r\n' },
  {
    session: session('s-1', { kind: 'agent', agentId: 'claude' }),
    scrollback: 'Welcome to Claude Code\r\n',
  },
  { session: session('s-2', { kind: 'agent', agentId: 'agy' }), scrollback: 'antigravity\r\n' },
  { session: session('s-3', { kind: 'agent', agentId: 'codex' }), scrollback: 'codex\r\n' },
  {
    session: session('s-4', { kind: 'agent', agentId: 'openclaude' }),
    scrollback: 'openclaude\r\n',
  },
];

async function open(page: Page, over: Partial<MockFixtures> = {}): Promise<void> {
  await installMockBridge(page, { ...fixtures, ...over } as MockFixtures);
  await page.goto('/');
  await expect(page.getByRole('columnheader', { name: 'Commit message' })).toBeVisible();
  await page.keyboard.press('Control+`');
}

test.describe('phase 21 screenshots', () => {
  test('the + menu, and a session list with one row per agent', async ({ page }) => {
    await open(page, { terminalSessions: EVERY_AGENT });
    await expect(page.locator('[data-session-row]')).toHaveCount(5);

    // Every mark resolved from the roster, none of them Claude's by default.
    await page.screenshot({ path: '../../docs/screenshots/phase-21-session-list.png' });

    await page.getByRole('button', { name: 'New terminal or agent' }).click();
    await expect(page.getByRole('menuitem', { name: 'OpenClaude', exact: true })).toBeDisabled();
    await page.screenshot({ path: '../../docs/screenshots/phase-21-new-menu.png' });

    /*
      Both themes, because a mark that holds its silhouette on white can lose
      it entirely on near-black at 14px — which is exactly how Phase 19's
      spinner rewrite started.
    */
    await page.keyboard.press('Escape');
    // The theme control is a menu, not a switch — Light / Dark / Time of day.
    await page.getByRole('button', { name: 'Toggle theme' }).click();
    await page.getByRole('menuitemradio', { name: 'Dark', exact: true }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await page.screenshot({ path: '../../docs/screenshots/phase-21-session-list-dark.png' });
  });
});
