/**
 * workflows-dark — Graphs (agentic workflows): the shipped "Research and
 * publish" template, run. The mock's `workflow.run` completes instantly and its
 * `onRunChanged` is a no-op, so an init script captures the app's run-changed
 * subscribers and this spec replays a staged run through them: nodes go
 * running → succeeded in dependency order, so the canvas lights up wave by wave.
 */
import { expect, test, type Page } from '@playwright/test';

import { installMockBridge } from '../../../../../../../packages/app/test-support/mock-bridge';
import { WORKFLOW_TEMPLATES } from '../../../../../../../packages/shared/src/workflow-templates/index';
import { click, glide, glideTo, gotoView, placeCursor, preparePage, Recorder, settlePage, smoothWheel } from '../lib';
import { roadmapFixtures } from '../fixtures/roadmap';

const PICK = ['research-and-publish', 'graph-engineering-diamond', 'harness-bounded-build', 'risk-router'];
const NOW = Date.now();
const WORKFLOWS = PICK.map((id, i) => {
  const t = WORKFLOW_TEMPLATES.find((x) => x.id === id)!;
  return { ...t.workflow, id: `wf-${id}`, createdAt: NOW - (i + 2) * 86_400_000, updatedAt: NOW - (i + 1) * 3_600_000 };
});

/** Init script: remember every `onRunChanged` subscriber and let the spec stage runs. */
function captureRunEvents(): void {
  const w = window as unknown as {
    midniteStudio?: { workflow: Record<string, unknown> };
    __capRunHandlers: Array<(e: unknown) => void>;
    __capEmit: (e: unknown) => void;
  };
  w.__capRunHandlers = [];
  w.__capEmit = (e) => w.__capRunHandlers.forEach((h) => h(e));
  const patch = (): void => {
    const wf = w.midniteStudio?.workflow;
    if (!wf) return void setTimeout(patch, 0);
    // The demo API "is running", so no "it isn't running" banner over the canvas.
    const ms = w.midniteStudio as unknown as { demoApi?: Record<string, unknown> };
    if (ms.demoApi) ms.demoApi['status'] = async () => ({ running: true, port: 4747 });
    // Run starts a run that stays pending; the spec then stages its progress.
    const origRun = wf['run'] as (req: { workflowId: string }) => Promise<{ ok: boolean; value?: Record<string, unknown> }>;
    wf['run'] = async (req: { workflowId: string }) => {
      const res = await origRun(req);
      if (!res.ok || !res.value) return res;
      const nodes = (res.value['nodes'] as Record<string, unknown>[]).filter((n) => n['kind'] !== 'note').map((n) => ({
        nodeId: n['nodeId'], kind: n['kind'], label: n['label'], status: 'pending', truncated: false, gatedDownstream: false,
      }));
      const { endedAt: _e, ...rest } = res.value;
      void _e;
      return { ok: true, value: { ...rest, id: 'run-cap-1', status: 'running', nodes, startedAt: Date.now() } };
    };
    wf['onRunChanged'] = (h: (e: unknown) => void) => {
      w.__capRunHandlers.push(h);
      return () => w.__capRunHandlers.splice(w.__capRunHandlers.indexOf(h), 1);
    };
  };
  patch();
}

/** Topological waves over the non-note nodes. */
function waves(wf: (typeof WORKFLOWS)[number]): string[][] {
  const nodes = (wf.nodes as { id: string; kind: string }[]).filter((n) => n.kind !== 'note' && n.kind !== 'frame');
  const ids = new Set(nodes.map((n) => n.id));
  const edges = (wf.edges as { from: string; to: string }[])
    .map((e) => ({ source: e.from, target: e.to }))
    .filter((e) => ids.has(e.source) && ids.has(e.target));
  const indeg = new Map(nodes.map((n) => [n.id, 0]));
  for (const e of edges) indeg.set(e.target, (indeg.get(e.target) ?? 0) + 1);
  const out: string[][] = [];
  const done = new Set<string>();
  let frontier = nodes.filter((n) => indeg.get(n.id) === 0).map((n) => n.id);
  while (frontier.length) {
    out.push(frontier);
    frontier.forEach((f) => done.add(f));
    const next = new Set<string>();
    for (const e of edges) {
      if (done.has(e.source) && !done.has(e.target)) {
        const ready = edges.filter((x) => x.target === e.target).every((x) => done.has(x.source) || !ids.has(x.source));
        if (ready) next.add(e.target);
      }
    }
    // Back edges (loops) would stall; fall back to anything left.
    if (next.size === 0 && done.size < nodes.length) {
      const rest = nodes.find((n) => !done.has(n.id));
      if (rest) next.add(rest.id);
    }
    frontier = [...next];
  }
  return out;
}

async function openGraphs(page: Page): Promise<void> {
  await installMockBridge(page, roadmapFixtures({ appWorkflows: WORKFLOWS } as never), { cspGuard: false });
  await page.addInitScript(captureRunEvents);
  await preparePage(page, { theme: 'dark' });
  await page.goto('/');
  await expect(page.getByRole('navigation', { name: 'Views' })).toBeVisible({ timeout: 30_000 });
  await expect(async () => {
    await gotoView(page, 'Graphs');
    await expect(page.getByRole('button', { name: 'New graph' })).toBeVisible({ timeout: 800 });
  }).toPass({ timeout: 8000 });
  await page.getByText(WORKFLOWS[0]!.name, { exact: true }).first().click();
  await expect(page.getByRole('application', { name: 'Graph canvas' })).toBeVisible();
  await placeCursor(page, 900, 600);
  await settlePage(page, 1500);
}

/** Replays a staged run: each wave goes running, then succeeded. */
async function stageRun(page: Page, stepMs: number): Promise<void> {
  const wf = WORKFLOWS[0]!;
  const plan = waves(wf);
  await page.evaluate(
    async ({ wf, plan, stepMs }) => {
      const w = window as unknown as { __capEmit: (e: unknown) => void };
      const t0 = Date.now();
      const nodes = (wf.nodes as { id: string; kind: string; label: string }[]).filter((n) => n.kind !== 'note').map((n) => ({
        nodeId: n.id,
        kind: n.kind,
        label: n.label,
        status: 'pending',
        truncated: false,
        gatedDownstream: false,
      }));
      const emit = (status: string) =>
        w.__capEmit({
          workflowId: wf.id,
          run: { id: 'run-cap-1', workflowId: wf.id, workflowName: wf.name, status, nodes: nodes.map((n) => ({ ...n })), edges: wf.edges, startedAt: t0 },
        });
      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
      emit('running');
      for (const wave of plan) {
        for (const id of wave) Object.assign(nodes.find((n) => n.nodeId === id)!, { status: 'running', startedAt: Date.now() });
        emit('running');
        await sleep(stepMs);
        for (const id of wave) Object.assign(nodes.find((n) => n.nodeId === id)!, { status: 'succeeded', endedAt: Date.now() });
        emit('running');
        await sleep(120);
      }
      emit('completed');
    },
    { wf, plan, stepMs },
  );
}

/** Screen x-extent of the flow's nodes. */
async function nodesX(page: Page): Promise<{ left: number; right: number; cy: number }> {
  return page.evaluate(() => {
    const r = [...document.querySelectorAll('.react-flow__node')].map((n) => n.getBoundingClientRect()).filter((b) => b.width > 0);
    return {
      left: Math.min(...r.map((b) => b.left)),
      right: Math.max(...r.map((b) => b.right)),
      cy: (Math.min(...r.map((b) => b.top)) + Math.max(...r.map((b) => b.bottom))) / 2,
    };
  });
}

test('workflows-dark', async ({ page }) => {
  await openGraphs(page);
  const canvas = page.getByRole('application', { name: 'Graph canvas' });
  const zoomIn = page.getByRole('button', { name: /zoom in/i });
  for (let i = 0; i < 4; i++) {
    await zoomIn.click();
    await page.waitForTimeout(250);
  }
  const cb = (await canvas.boundingBox())!;
  // Wheel-to-pixels varies with zoom; measure it once, then pan closed-loop so
  // the Trigger sits just inside the canvas's left edge, chain ~36% down.
  await page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2);
  const a = await nodesX(page);
  await smoothWheel(page, { dx: 200 }, 300);
  await page.waitForTimeout(300);
  const ratio = (a.left - (await nodesX(page)).left) / 200;
  console.log('[capture] wheel ratio', ratio.toFixed(3));
  for (let pass = 0; pass < 3; pass++) {
    const nx = await nodesX(page);
    const dx = (nx.left - (cb.x + 56)) / ratio;
    const dy = (nx.cy - (cb.y + cb.height * 0.36)) / ratio;
    await smoothWheel(page, { dx, dy }, 300);
    await page.waitForTimeout(300);
  }
  const nx = await nodesX(page);
  console.log('[capture] nodes', JSON.stringify(nx), JSON.stringify(cb));
  await placeCursor(page, cb.x + cb.width * 0.6, cb.y + cb.height * 0.75);
  await settlePage(page, 800);
  const span = (nx.right - nx.left - (cb.width - 100)) / ratio;
  const rec = new Recorder(page, 'workflows-dark');
  await rec.start();
  await page.waitForTimeout(600);
  await glide(page, cb.x + 120, nx.cy + 10, 900);
  await page.waitForTimeout(250);
  await glideTo(page, page.getByRole('button', { name: 'Run', exact: true }), 1000);
  await click(page);
  const run = stageRun(page, 560);
  await page.waitForTimeout(500);
  await page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height * 0.3);
  if (span > 0) await smoothWheel(page, { dx: span }, 6200);
  await run;
  await page.waitForTimeout(300);
  await glide(page, cb.x + cb.width * 0.55, cb.y + cb.height * 0.72, 900);
  await page.waitForTimeout(1500);
  await rec.stop();
});
