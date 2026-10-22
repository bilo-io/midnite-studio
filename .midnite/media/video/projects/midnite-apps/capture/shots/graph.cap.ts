/**
 * Tasks ▸ dependency graph footage.
 *   graph-partial-dark — mixed done / in-progress / todo phases, slow pan + zoom, hovers.
 *   graph-agents-dark  — same graph with agents running on 4 nodes (one waiting), zoom to a
 *                        running node, open its detail pane and the Agent tab.
 */
import { expect, test, type Page } from '@playwright/test';

import { clickRailLink, installMockBridge } from '../../../../../../../packages/app/test-support/mock-bridge';
import { click, glide, glideTo, placeCursor, preparePage, Recorder, settlePage, smoothWheel } from '../lib';
import { BOARD, roadmapFixtures } from '../fixtures/roadmap';
import { RUNS, terminalSessions } from '../fixtures/agents';
import { agentScript, playAgentScript } from '../fixtures/agent-output';

// xterm's WebGL addon mis-sizes at DSF 2 headless; the DOM renderer is crisp. Glows are CSS.
test.use({
  launchOptions: { args: ['--force-color-profile=srgb', '--hide-scrollbars', '--disable-webgl', '--disable-webgl2'] },
});

async function openGraph(page: Page, withAgents: boolean): Promise<void> {
  await page.route(/gravatar\.com|avatars\.githubusercontent\.com/, (r) => r.abort());
  const extra = withAgents ? { terminalSessions: terminalSessions() } : {};
  await installMockBridge(page, roadmapFixtures(extra as never), { cspGuard: false });
  await preparePage(page, { theme: 'dark', ui: { terminalFontSize: 13 } });
  await page.goto('/');
  await expect(page.getByRole('navigation', { name: 'Views' })).toBeVisible({ timeout: 30_000 });
  await clickRailLink(page, 'Tasks');
  await page.getByRole('combobox', { name: 'Task source' }).selectOption(BOARD.id);
  await page.getByTestId('projects-view-mode-slot').getByRole('button', { name: 'Graph view' }).click();
  await expect(page.getByTestId('project-graph-view')).toBeVisible();
  await page.getByRole('button', { name: /Legend/ }).click().catch(() => {});
  if (withAgents) {
    await page.evaluate(() => {
      const w = window as unknown as { __mstudioPtyActivity: (p: string, a: string) => boolean };
      w.__mstudioPtyActivity('pty-116', 'thinking');
      w.__mstudioPtyActivity('pty-106', 'thinking');
      w.__mstudioPtyActivity('pty-89', 'thinking');
      w.__mstudioPtyActivity('pty-111', 'waiting');
    });
  }
  // Fit, then park the cursor on empty canvas.
  await page.getByRole('application', { name: 'Dependency graph' }).press('Home');
  // Home's fit leaves the bottom rank clipped; ease out a touch so all 16 phases show.
  await placeCursor(page, 760, 560);
  await smoothWheel(page, { dy: 22 }, 250, 'Control');
  await placeCursor(page, 760, 760);
  await settlePage(page, 1200);
}

/** Union box of every graph node, in viewport px. */
async function nodesBox(page: Page): Promise<{ x: number; y: number; w: number; h: number }> {
  return page.evaluate(() => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const el of document.querySelectorAll('[data-graph-node]')) {
      const r = el.getBoundingClientRect();
      x0 = Math.min(x0, r.left); y0 = Math.min(y0, r.top);
      x1 = Math.max(x1, r.right); y1 = Math.max(y1, r.bottom);
    }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  });
}

/**
 * Ease out to a framing that shows the whole roadmap: zoom about the graph's own
 * centre in measured passes (the wheel→scale curve is not exactly exponential),
 * then pan it to the canvas centre.
 */
async function frameAll(page: Page, target = { w: 1240, cx: 752, cy: 520 }): Promise<void> {
  for (const ms of [1300, 450, 250]) {
    const now = await nodesBox(page);
    const ratio = now.w / target.w;
    if (Math.abs(ratio - 1) < 0.015) break;
    const cx = now.x + now.w / 2;
    const cy = now.y + now.h / 2;
    await glide(page, Math.min(Math.max(cx, 200), 1300), Math.min(Math.max(cy, 220), 820), ms === 1300 ? 500 : 150);
    await smoothWheel(page, { dy: Math.log(ratio) / 0.01 }, ms, 'Control');
  }
  const after = await nodesBox(page);
  // Plain wheel pans; the graph moves opposite the delta.
  await smoothWheel(page, { dx: after.x + after.w / 2 - target.cx, dy: after.y + after.h / 2 - target.cy }, 1000);
}

const node = (page: Page, n: number) => page.locator(`[data-graph-node][data-node-key="#${n}"]`);

test('graph-partial-dark', async ({ page }) => {
  await openGraph(page, false);
  const rec = new Recorder(page, 'graph-partial-dark');
  await rec.start();
  await page.waitForTimeout(600);
  // Hover a finished phase, then a half-done one.
  await glideTo(page, node(page, 842), 1100, { x: 0.55, y: 0.45 });
  await page.waitForTimeout(500);
  await glideTo(page, node(page, 860), 900, { x: 0.5, y: 0.5 });
  await page.waitForTimeout(400);
  await glideTo(page, node(page, 930), 1000, { x: 0.45, y: 0.55 });
  await page.waitForTimeout(300);
  // Zoom in around Phase 113 / 116.
  await smoothWheel(page, { dy: -55 }, 1600, 'Control');
  await page.waitForTimeout(250);
  // Pan right/down across the in-flight phases.
  await smoothWheel(page, { dx: 360, dy: 120 }, 2200);
  await glideTo(page, node(page, 950), 900, { x: 0.6, y: 0.5 });
  await page.waitForTimeout(500);
  await glideTo(page, node(page, 925), 800, { x: 0.5, y: 0.5 });
  await page.waitForTimeout(300);
  // Ease back out to the opening framing of the whole roadmap.
  await frameAll(page);
  await page.waitForTimeout(800);
  console.log('[capture] end', JSON.stringify(await nodesBox(page)));
  await rec.stop();
});

test('graph-agents-dark', async ({ page }) => {
  await openGraph(page, true);
  // Stream agent output into each live pty for the whole clip.
  const stop = playAgentScript(page, RUNS.map((r) => ({ pty: r.pty, lines: agentScript(r) })));
  await page.waitForTimeout(1500);
  const rec = new Recorder(page, 'graph-agents-dark');
  await rec.start();
  await page.waitForTimeout(700);
  await glideTo(page, node(page, 860), 1100, { x: 0.5, y: 0.55 });
  await page.waitForTimeout(500);
  await glideTo(page, node(page, 925), 1000, { x: 0.5, y: 0.5 });
  await page.waitForTimeout(400);
  await glideTo(page, node(page, 950), 1000, { x: 0.45, y: 0.5 });
  await page.waitForTimeout(200);
  // Zoom toward the running Phase 116 node.
  await smoothWheel(page, { dy: -60 }, 1800, 'Control');
  await page.waitForTimeout(500);
  // Open its detail pane...
  const b = await node(page, 950).boundingBox();
  if (b) await glide(page, b.x + b.width * 0.4, b.y + b.height * 0.3, 500);
  await click(page);
  await page.waitForTimeout(1400);
  // ...then reveal its live terminal from the node's >_ button.
  await glideTo(page, node(page, 950).getByTestId('graph-node-terminal-toggle'), 900);
  await click(page);
  await page.waitForTimeout(3800);
  await stop();
  await rec.stop();
});
