import { expect, test, type Page } from '@playwright/test';

import { fixtures } from '../test-support/fixtures';
import { clickRailLink, installMockBridge, type MockFixtures } from '../test-support/mock-bridge';

/**
 * Phase 86 Theme D/H — the Sessions manager's own live pane
 * (`live-session-terminal.tsx`). Needs a real browser: `live-session-terminal
 * .test.tsx` already proves the component's wiring against a fake xterm
 * `Terminal`, but only a genuine `@xterm/xterm` instance can show that
 * selecting a running session really attaches a real, focused, typeable
 * terminal — xterm v6 defaults to its DOM renderer (no WebGL/Canvas addon is
 * loaded here, unlike `terminal-view.tsx`), so keystrokes and the fake
 * shell's echo land in the DOM as real text nodes, not canvas pixels.
 */
const MAIN = '/tmp/midnite-studio';

const data: MockFixtures = {
  ...fixtures,
  terminalSessions: [
    {
      session: {
        id: 'live-session-1',
        kind: 'shell',
        title: 'midnite-studio',
        name: 'sessions-pane-run',
        cwd: MAIN,
        repoId: 'repo-1',
        createdAt: 1_700_000_000_000,
      },
      scrollback: '$ ',
      live: { ptyId: 'pty-sessions-1', pid: 5150, cols: 80, rows: 24 },
    },
  ],
};

async function open(page: Page): Promise<void> {
  await installMockBridge(page, data);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();
  await clickRailLink(page, 'Sessions');
}

test('selecting a running session embeds its real, interactive xterm in the Sessions pane', async ({
  page,
}) => {
  await open(page);

  const list = page.getByRole('list', { name: /^(Sessions|Closed sessions)$/ });
  await list.getByText('sessions-pane-run').click();

  // One real xterm, attached to the existing pty — never a second process,
  // and never the read-only `TranscriptView` a closed row would show.
  const screen = page.locator('.xterm-screen');
  await expect(screen).toHaveCount(1);
  await expect(screen).toContainText('$');

  // A genuine keystroke, echoed back by the fake shell through the real pty
  // round trip (`sendInput` → `pty.input` → the mock's own `feed`), landing
  // in the DOM renderer's actual text nodes.
  await screen.click();
  await page.keyboard.type('pwd');
  await page.keyboard.press('Enter');
  await expect(screen).toContainText('pwd');
});
