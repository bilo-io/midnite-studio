/**
 * gitgraph-light — the git graph (Studio's centre view) in the light theme: a
 * history with releases, merged phase branches and four open agent branches,
 * laid out by git-engine's own lane layout. Hover rows, scroll down through the
 * merges and back, then open a commit.
 */
import { expect, test, type Page } from '@playwright/test';

import { installMockBridge } from '../../../../../../../packages/app/test-support/mock-bridge';
import { click, glide, glideTo, placeCursor, preparePage, Recorder, settlePage, smoothWheel } from '../lib';
import { roadmapFixtures } from '../fixtures/roadmap';
import { buildHistory } from '../fixtures/history';
import { terminalSessions } from '../fixtures/agents';

async function openGitGraph(page: Page): Promise<ReturnType<typeof buildHistory>> {
  const h = buildHistory();
  await page.route(/gravatar\.com|avatars\.githubusercontent\.com/, (r) => r.abort());
  await installMockBridge(page, roadmapFixtures({
      graphRows: h.graphRows,
      refs: h.refs,
      commitDetails: h.commitDetails,
      diffs: h.diffs,
      worktrees: h.worktrees,
      terminalSessions: terminalSessions(),
    } as never), { cspGuard: false });
  await preparePage(page, { theme: 'light' });
  await page.addInitScript(() => sessionStorage.setItem('midnite-studio.activeView', 'graph'));
  await page.goto('/graph');
  await expect(page.getByRole('columnheader', { name: 'Commit message' })).toBeVisible({ timeout: 30_000 });
  // Terminal sessions hydrate when the terminal panel first mounts; open and
  // shut it once so the agents' worktrees light their branch badges.
  await page.keyboard.press('Control+`');
  await expect(page.locator('.xterm-screen').first()).toBeVisible({ timeout: 15_000 });
  await page.keyboard.press('Control+`');
  await expect(page.locator('.xterm-screen')).toHaveCount(0, { timeout: 5000 }).catch(() => {});
  await page.evaluate(() => {
    const w = window as unknown as { __mstudioPtyActivity: (p: string, a: string) => boolean };
    for (const p of ['pty-116', 'pty-106', 'pty-89']) w.__mstudioPtyActivity(p, 'thinking');
    w.__mstudioPtyActivity('pty-111', 'waiting');
  });
  // Widen BRANCH / TAG so the branch names read in full.
  const handle = page.getByRole('separator', { name: 'Resize branch and tag column' });
  const hb = await handle.boundingBox();
  if (hb) {
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
    await page.mouse.down();
    await page.mouse.move(hb.x + 260, hb.y + hb.height / 2, { steps: 10 });
    await page.mouse.up();
  }
  await placeCursor(page, 900, 600);
  await settlePage(page, 1200);
  return h;
}

const row = (page: Page, subject: string | RegExp) => page.getByRole('row').filter({ hasText: subject }).first();

test('gitgraph-light', async ({ page }) => {
  await openGitGraph(page);
  const rec = new Recorder(page, 'gitgraph-light');
  await rec.start();
  await page.waitForTimeout(600);
  await glideTo(page, row(page, 'cap visual baselines'), 900, { x: 0.35, y: 0.5 });
  await page.waitForTimeout(300);
  await glideTo(page, row(page, 'radial layout variant'), 700, { x: 0.4, y: 0.5 });
  await page.waitForTimeout(300);
  await glideTo(page, row(page, 'switch models mid-conversation'), 800, { x: 0.4, y: 0.5 });
  await page.waitForTimeout(300);
  await smoothWheel(page, { dy: 300 }, 2200);
  await page.waitForTimeout(300);
  await glideTo(page, row(page, 'Merge pull request #931'), 800, { x: 0.4, y: 0.5 });
  await page.waitForTimeout(400);
  await smoothWheel(page, { dy: -300 }, 1800);
  await glideTo(page, row(page, 'visual-baseline ratchet'), 800, { x: 0.4, y: 0.5 });
  await click(page);
  await page.waitForTimeout(1300);
  await glideTo(page, page.getByRole('button', { name: /scripts\/e2e-budget\.mjs/ }).last(), 900, { x: 0.3, y: 0.5 });
  await click(page);
  await page.waitForTimeout(2200);
  void glide;
  await rec.stop();
});
