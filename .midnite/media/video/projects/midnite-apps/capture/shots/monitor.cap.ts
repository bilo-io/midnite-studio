/**
 * monitor-dark — Monitor ▸ System health (Studio's Monitor view): CPU, RAM and
 * GPU timelines drawing live, then the live agent sessions and their token
 * spend, then Cleaner ▸ Memory's process table (Midnite Studio, node, claude,
 * codex, vite) over its own CPU & RAM charts.
 *
 * The mock's metrics stream fires its fixture once, so the spec keeps pushing
 * samples through the mock's own `__mstudioPushMetric` hook. `at` advances 5 s
 * per push, so the 5-minute window holds ~60 points and scrolls one per push.
 */
import { expect, test, type Page } from '@playwright/test';

import { installMockBridge } from '../../../../../../../packages/app/test-support/mock-bridge';
import { click, glide, glideTo, gotoView, placeCursor, preparePage, Recorder, settlePage, smoothWheel } from '../lib';
import { RUNS, terminalSessions } from '../fixtures/agents';
import { roadmapFixtures } from '../fixtures/roadmap';

const PROBE = process.env['CAP_PROBE'];
const shot = async (page: Page, n: string) => {
  if (PROBE) await page.screenshot({ path: `${PROBE}/monitor-${n}.png` });
};

const GB = 1024 ** 3;
const MB = 1024 ** 2;
const START = Date.now() - 60 * 5000;

/** A deterministic, organic-looking series: two slow waves plus bursts. */
function sample(i: number) {
  const s = (k: number, p: number) => Math.sin(i / k + p);
  const burst = i % 23 < 4 ? 22 : 0;
  const cpu = Math.max(6, Math.min(96, 34 + 14 * s(5, 0) + 8 * s(1.7, 1) + burst));
  const memory = Math.max(40, Math.min(92, 63 + 4 * s(11, 2) + 1.5 * s(2.3, 0)));
  const gpu = Math.max(3, Math.min(97, 28 + 18 * s(4, 3) + 10 * s(1.3, 0.5) + (i % 31 < 6 ? 30 : 0)));
  return {
    at: START + i * 5000,
    cpu,
    memory,
    gpu,
    disk: 71.4,
    memoryBytes: { used: Math.round((memory / 100) * 36 * GB), total: 36 * GB },
    diskBytes: { used: Math.round(0.714 * 994 * GB), total: 994 * GB },
    cpuInfo: { cores: 14, load1: +(cpu / 9).toFixed(2) },
    battery: { percent: 86, charging: true, onAc: true, minutesToEmpty: null, minutesToFull: 38 },
  };
}

const PROCESSES = [
  { pid: 4021, name: 'Midnite Studio', argv: '/Applications/Midnite Studio.app/Contents/MacOS/Midnite Studio', rssBytes: 812 * MB, cpuPercent: 11.4, ours: true },
  { pid: 4038, name: 'Midnite Studio Helper (Renderer)', argv: 'Midnite Studio Helper (Renderer) --type=renderer', rssBytes: 1460 * MB, cpuPercent: 18.2, ours: true },
  { pid: 4052, name: 'Midnite Studio Helper (GPU)', argv: 'Midnite Studio Helper (GPU) --type=gpu-process', rssBytes: 388 * MB, cpuPercent: 6.1, ours: true },
  { pid: 5110, name: 'claude', argv: 'claude --resume phase-116-test-suite-diet', rssBytes: 612 * MB, cpuPercent: 14.8, ours: false },
  { pid: 5131, name: 'codex', argv: 'codex --cd .worktrees/phase-111-voice-agent', rssBytes: 344 * MB, cpuPercent: 9.3, ours: false },
  { pid: 5167, name: 'node', argv: 'node /Users/bilo/.proto/bin/moon run desktop:start', rssBytes: 702 * MB, cpuPercent: 7.7, ours: false },
  { pid: 5168, name: 'vite', argv: 'node node_modules/.bin/vite --port 5293', rssBytes: 529 * MB, cpuPercent: 12.6, ours: false },
  { pid: 5203, name: 'node', argv: 'node node_modules/.bin/vitest --shard=1/2', rssBytes: 1180 * MB, cpuPercent: 31.5, ours: false },
  { pid: 5240, name: 'pnpm', argv: 'pnpm install --frozen-lockfile', rssBytes: 214 * MB, cpuPercent: 2.4, ours: false },
  { pid: 611, name: 'WindowServer', argv: '/System/Library/PrivateFrameworks/SkyLight.framework/Resources/WindowServer', rssBytes: 402 * MB, cpuPercent: 5.2, ours: false },
  { pid: 702, name: 'Google Chrome', argv: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', rssBytes: 1320 * MB, cpuPercent: 4.1, ours: false },
  { pid: 388, name: 'Spotlight', argv: '/System/Library/CoreServices/Spotlight.app/Contents/MacOS/Spotlight', rssBytes: 96 * MB, cpuPercent: 0.6, ours: false },
];

function monitorInit(seed: { processes: typeof PROCESSES }): void {
  const w = window as unknown as { midniteStudio?: Record<string, unknown> };
  const b = w.midniteStudio;
  if (!b) return;
  b['monitorAgentUsage'] = async () => ({
    sessions: [
      { sessionId: 'sess-950', agentId: 'claude', title: 'Phase 116 · Test suite diet', totals: { input: 182_400, output: 41_900, cacheRead: 3_870_000, cacheCreate: 212_000, model: 'claude-opus-4-1' } },
      { sessionId: 'sess-925', agentId: 'codex', title: 'Phase 111 · Voice agent', totals: { input: 96_300, output: 18_200, cacheRead: 1_140_000, cacheCreate: 0, model: 'gpt-5-codex' } },
      { sessionId: 'sess-910', agentId: 'claude', title: 'Phase 106 · 2D Assets', totals: { input: 64_800, output: 12_700, cacheRead: 905_000, cacheCreate: 88_000, model: 'claude-sonnet-4-5' } },
      { sessionId: 'sess-860', agentId: 'agy', title: 'Phase 89 · Knowledge variants', totals: { input: 22_100, output: 5_400, cacheRead: 0, cacheCreate: 0, model: 'gemini-2.5-pro' } },
    ],
    agents: [
      { agentId: 'claude', sessions: 2, totals: { input: 247_200, output: 54_600, cacheRead: 4_775_000, cacheCreate: 300_000 } },
      { agentId: 'codex', sessions: 1, totals: { input: 96_300, output: 18_200, cacheRead: 1_140_000, cacheCreate: 0 } },
      { agentId: 'agy', sessions: 1, totals: { input: 22_100, output: 5_400, cacheRead: 0, cacheCreate: 0 } },
    ],
  });
  const health = b['systemHealth'] as (() => Promise<Record<string, unknown>>) | undefined;
  if (health) {
    b['systemHealth'] = async () => ({
      ...(await health()),
      ollama: { path: '/opt/homebrew/bin/ollama', version: 'ollama version 0.12.6' },
      ollamaDaemon: { reachable: true, version: '0.12.6', host: '127.0.0.1:11434' },
    });
  }
  // Fresh CPU readings on every poll, so the table re-sorts like a live `ps`.
  const opt = b['optimizer'] as Record<string, unknown> | undefined;
  const orig = opt?.['processes'] as (() => Promise<{ ok: boolean; value: Record<string, unknown> }>) | undefined;
  if (opt && orig) {
    let tick = 0;
    opt['processes'] = async () => {
      const r = await orig();
      tick += 1;
      const jitter = (pid: number, cpu: number) => Math.max(0.1, +(cpu * (0.75 + 0.5 * Math.abs(Math.sin(pid * 0.37 + tick * 1.9)))).toFixed(1));
      return { ...r, value: { ...r.value, processes: seed.processes.map((p) => ({ ppid: 1, ...p, cpuPercent: jitter(p.pid, p.cpuPercent) })) } };
    };
  }
}

async function open(page: Page): Promise<void> {
  const seedSamples = Array.from({ length: 60 }, (_, i) => sample(i));
  await installMockBridge(
    page,
    roadmapFixtures({
      metricsSamples: seedSamples,
      terminalSessions: terminalSessions(RUNS),
      optimizer: {
        processes: PROCESSES,
        gpu: { model: 'Apple M4 Max (40-core GPU)', vramBytes: null, loadPercent: 31 },
        memory: { totalBytes: 36 * GB, wiredBytes: 5.1 * GB, activeBytes: 11.8 * GB, compressedBytes: 3.4 * GB, cachedBytes: 6.2 * GB, freeBytes: 9.5 * GB },
      },
    } as never),
    { cspGuard: false },
  );
  await page.addInitScript(monitorInit, { processes: PROCESSES });
  await preparePage(page, { theme: 'dark', ui: { optimizerEnabled: true } });
  await page.goto('/');
  await expect(page.getByRole('navigation', { name: 'Views' })).toBeVisible({ timeout: 30_000 });
  // Visit Cleaner ▸ Memory once, so the Optimizer reopens on that tab later (its tab is in-memory state).
  await expect(async () => {
    await gotoView(page, 'Optimizer');
    await expect(page.getByRole('navigation', { name: 'Optimizer tabs' })).toBeVisible({ timeout: 800 });
  }).toPass({ timeout: 8000 });
  await page.getByRole('navigation', { name: 'Optimizer tabs' }).getByRole('button', { name: /Memory/ }).click();
  await expect(page.getByText('Processes', { exact: true }).first()).toBeVisible();
  await expect(async () => {
    await gotoView(page, 'Monitor');
    await expect(page.getByRole('heading', { name: 'Token spend' })).toBeVisible({ timeout: 800 });
  }).toPass({ timeout: 8000 });
  await expect(page.getByText('Phase 116 · Test suite diet').first()).toBeVisible({ timeout: 10_000 });
  await placeCursor(page, 900, 420);
  await settlePage(page, 900);
}

/** Push one sample every `everyMs` in the page, on its own timer, until stopped. */
async function startPushing(page: Page, from: number, everyMs: number): Promise<void> {
  const series = Array.from({ length: 200 }, (_, k) => sample(from + k));
  await page.evaluate(
    ({ series, everyMs }) => {
      let k = 0;
      const push = (window as unknown as { __mstudioPushMetric: (s: unknown) => void }).__mstudioPushMetric;
      (window as unknown as { __capTimer: number }).__capTimer = window.setInterval(() => {
        if (k < series.length) push(series[k++]);
      }, everyMs);
    },
    { series, everyMs },
  );
}

test('monitor-dark', async ({ page }) => {
  await open(page);
  await startPushing(page, 60, 260);
  await page.waitForTimeout(600);
  await shot(page, '0');
  const rec = PROBE ? null : new Recorder(page, 'monitor-dark');
  await rec?.start();
  await page.waitForTimeout(700);

  // Usage: the three timelines drawing.
  await glide(page, 640, 300, 1200);
  await page.waitForTimeout(500);
  await glide(page, 1080, 330, 1100);
  await page.waitForTimeout(900);
  await shot(page, '1');

  // Sessions and token spend, below the charts.
  await glideTo(page, page.getByText('Phase 116 · Test suite diet').first(), 700, { x: 0.3, y: 0.5 });
  await page.waitForTimeout(500);
  await glideTo(page, page.getByText('Phase 116 · Test suite diet').last(), 600, { x: 0.3, y: 0.5 });
  await page.waitForTimeout(700);
  await shot(page, '2');

  // Cleaner ▸ Memory: the process table over CPU & RAM, sorted by CPU.
  await expect(async () => {
    await gotoView(page, 'Optimizer');
    await expect(page.getByRole('navigation', { name: 'Optimizer tabs' })).toBeVisible({ timeout: 800 });
  }).toPass({ timeout: 6000 });
  await expect(page.getByText('Processes', { exact: true }).first()).toBeVisible();
  await glide(page, 760, 300, 700);
  await page.waitForTimeout(400);
  await shot(page, '3');
  await glideTo(page, page.getByRole('columnheader', { name: /CPU/ }).getByRole('button').first(), 600);
  await click(page);
  await page.waitForTimeout(800);
  // The table scrolls inside its own pane: wheel down past node and the renderer to claude, vite, codex.
  await glide(page, 520, 745, 500);
  await smoothWheel(page, { dy: 110 }, 900);
  await page.waitForTimeout(700);
  await glide(page, 260, 760, 600);
  await smoothWheel(page, { dy: 110 }, 900);
  await page.waitForTimeout(900);
  await shot(page, '4');
  await rec?.stop();
});
