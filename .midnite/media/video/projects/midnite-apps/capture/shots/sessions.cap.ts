/**
 * sessions-dark — the Sessions view: four live agent sessions, each in its own
 * worktree, streaming output; click between them.
 *
 * WebGL is disabled for this file: xterm's WebGL addon mis-sizes its canvas in
 * headless chromium at deviceScaleFactor 2 (shows a 2x-zoomed quadrant); with
 * WebGL off it falls back to the DOM renderer, which is crisp.
 */
import { expect, test } from '@playwright/test';

import { installMockBridge } from '../../../../../../../packages/app/test-support/mock-bridge';
import { click, glideTo, gotoView, placeCursor, preparePage, Recorder, settlePage } from '../lib';
import { roadmapFixtures } from '../fixtures/roadmap';
import { RUNS, terminalSessions } from '../fixtures/agents';
import { agentScript, playAgentScript } from '../fixtures/agent-output';

test.use({
  launchOptions: { args: ['--force-color-profile=srgb', '--hide-scrollbars', '--disable-webgl', '--disable-webgl2'] },
});

const closed = (id: string, agentId: string, name: string, minsAgo: number, mins: number) => ({
  id,
  kind: 'agent',
  agentId,
  title: 'midnite-studio',
  name,
  cwd: `/tmp/midnite-studio/.worktrees/${name}`,
  repoId: 'repo-1',
  createdAt: Date.now() - minsAgo * 60_000,
  closedAt: Date.now() - (minsAgo - mins) * 60_000,
  exitCode: 0,
  reason: 'exited',
  transcriptBytes: 48_213,
});

test('sessions-dark', async ({ page }) => {
  // Each live session starts with the first part of its transcript already on screen.
  const scrollback: Record<string, string> = {};
  for (const r of RUNS) scrollback[r.pty] = agentScript(r).slice(0, 10).map((s) => s.text).join('');
  const sessions = terminalSessions(RUNS, scrollback).map((s, i) => ({
    ...s,
    session: { ...s.session, title: 'midnite-studio', name: RUNS[i]!.slug, surface: undefined, taskRef: undefined },
  }));
  await installMockBridge(
    page,
    roadmapFixtures({
      terminalSessions: sessions,
      closedSessions: [
        closed('c-113', 'claude', 'phase-113-midnite-apps-split', 180, 42),
        closed('c-108', 'codex', 'phase-108-maps', 300, 65),
        closed('c-105', 'claude', 'phase-105-terrain', 420, 51),
      ],
    } as never),
    { cspGuard: false },
  );
  await preparePage(page, { theme: 'dark', ui: { terminalFontSize: 13 } });
  await page.goto('/');
  await expect(page.getByRole('navigation', { name: 'Views' })).toBeVisible({ timeout: 30_000 });
  await page.evaluate(() => {
    const w = window as unknown as { __mstudioPtyActivity: (p: string, a: string) => boolean };
    w.__mstudioPtyActivity('pty-116', 'thinking');
    w.__mstudioPtyActivity('pty-106', 'thinking');
    w.__mstudioPtyActivity('pty-89', 'thinking');
    w.__mstudioPtyActivity('pty-111', 'waiting');
  });
  await gotoView(page, 'Sessions');
  const list = page.getByRole('list', { name: /^(Sessions|Closed sessions)$/ });
  await expect(list).toBeVisible();
  await list.getByText(RUNS[0]!.slug).first().click();
  await expect(page.locator('.xterm-screen')).toHaveCount(1);
  // Widen the list so session names read in full.
  const sep = await page.getByRole('separator', { name: 'Resize the sessions list' }).boundingBox();
  if (sep) {
    await page.mouse.move(sep.x + sep.width / 2, sep.y + sep.height / 2);
    await page.mouse.down();
    await page.mouse.move(sep.x + 190, sep.y + sep.height / 2, { steps: 8 });
    await page.mouse.up();
  }
  await placeCursor(page, 900, 600);
  const stop = playAgentScript(page, RUNS.map((r) => ({ pty: r.pty, lines: agentScript(r).slice(10).concat(agentScript(r).slice(2, 10)) })));
  await settlePage(page, 1500);

  const rec = new Recorder(page, 'sessions-dark');
  await rec.start();
  await page.waitForTimeout(2200);
  for (const r of [RUNS[1]!, RUNS[2]!]) {
    await glideTo(page, list.getByText(r.slug).first(), 1000);
    await page.waitForTimeout(200);
    await click(page);
    await page.waitForTimeout(2600);
  }
  await glideTo(page, list.getByText(RUNS[0]!.slug).first(), 900);
  await click(page);
  await page.waitForTimeout(1800);
  await stop();
  await rec.stop();
});
