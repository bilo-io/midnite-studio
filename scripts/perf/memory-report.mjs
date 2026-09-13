#!/usr/bin/env node
/**
 * Retention report — Phase 45 Theme A, the instrument every other theme's
 * acceptance is a number this one produces.
 *
 * `scripts/perf/README.md`'s own "What is not measured here" section named
 * renderer heap as the one metric still left to a human, because "a heap
 * number without the diff that produced it is not comparable to anything."
 * This is that diff: run a real action N times against the packaged-
 * equivalent app, sample RSS per process class after each cycle, and report
 * the SLOPE — bytes retained per cycle — rather than a level. A flat line is
 * a pass whatever the level; a rising one is a leak whatever the level.
 *
 * Usage, from the repo root:
 *
 *   moon run app:build desktop:bundle
 *   node scripts/perf/memory-report.mjs --action=terminal            # 20 cycles
 *   node scripts/perf/memory-report.mjs --action=repo --cycles=10
 *   node scripts/perf/memory-report.mjs --action=browser-tabs --json
 *   node scripts/perf/memory-report.mjs --action=terminal --assert   # fail on a budget breach
 *   node scripts/perf/memory-report.mjs --popout=graph               # Phase 84 Theme H.4
 *   node scripts/perf/memory-report.mjs --hidden-sessions=10         # Phase 84 Theme J.1/E.6
 *   node scripts/perf/memory-report.mjs --hidden-tabs=8              # Phase 84 Theme J.1/F.5
 *
 * `--popout=<role>` is a different shape of measurement from `--action` above
 * it — a LEVEL (one before/after delta), not a retained-per-cycle SLOPE — so
 * it reports and asserts against `budgets.json`'s `popoutRss` rather than
 * `retainedPerCycleKb`. See `runPopoutRss` for what it actually drives.
 *
 * `runRetention()` below is the reusable half — `packages/app/e2e/perf/retention.spec.ts`
 * imports it directly rather than shelling out to this file, the same relationship
 * `startup-budget.spec.ts` has with `electron-run.mjs`'s exports.
 *
 * ## One launcher, one number
 *
 * Like every other script here, this drives `electron-run.mjs`, never
 * Playwright's `_electron.launch` — see that file's own docblock, and
 * `startup-budget.spec.ts`'s, for the two things a second launch path gets
 * wrong (the throwaway `--user-data-dir` and the seeded profile). Playwright
 * appears below only as a CDP *client*, attached after the app is already
 * running under `electron-run.mjs`'s launcher — the same way a human would
 * open DevTools on a running app, not a second way to start one.
 *
 * ## Why CDP at all
 *
 * The four actions this phase names — open/close a repo, open/close a
 * terminal session, run a council, open and close browser tabs — are things a
 * *user* does, through the renderer. A perf script has no UI to click, so it
 * attaches to the already-launched app's `--remote-debugging-port` and calls
 * the exact bridge methods the renderer calls, via `page.evaluate`. This
 * deliberately bypasses the renderer's own React/Zustand bookkeeping (session
 * lists, terminal store state): what leaks in this phase lives in **main and
 * the broker**, and driving the real IPC calls those processes see is what
 * exercises it, without needing to reproduce the UI's click path in a script
 * that will never render anything.
 *
 * ## The budget is a slope, not a level
 *
 * Every other number in `budgets.json` is a multiple of a measured baseline —
 * a ceiling on a LEVEL. Retention doesn't work that way: the assertion is
 * that heap returns to where it started after N cycles, so `retainedPerCycleKb`
 * is a tolerance around zero growth. RSS is noisy and V8 does not return
 * memory promptly, so the slope compares the MEDIAN of the last 5 cycles
 * against the median of the first 5 — never first-vs-last, which one GC pause
 * or one slow cycle could swing either way.
 *
 * RSS is also coarse: a leak has to reach several hundred KB before it clears
 * allocator/GC noise, which is why `terminal`'s probe writes real output
 * (~200 KB) rather than a one-line echo. For Theme C specifically — a handful
 * of bytes per session, never freed — the map-size unit tests on
 * `createBrokerServer` are the precise proof; this harness is the end-to-end
 * one, catching what a unit test cannot (that the fix actually reaches a real
 * running broker, socket and all).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  REPO_ROOT,
  cli,
  discardProfile,
  launch,
  mainWorktree,
  median,
  requireBuilt,
  seedProfile,
  sharedMarks,
  sleep,
  stop,
} from './electron-run.mjs';
import { classifyProcess } from './classify-process.mjs';

// Re-exported so `retention.spec.ts` can import this module alone as its
// harness, rather than reaching into `electron-run.mjs` for the setup it
// needs alongside `runRetention` itself.
export { REPO_ROOT, mainWorktree, requireBuilt };

function getExpectedMarks() {
  const { BOOT_MARKS, RENDERER_MARKS } = sharedMarks();
  return [...BOOT_MARKS, ...RENDERER_MARKS];
}

/** How many of the oldest/newest cycles the slope compares — see the module doc. */
export const COMPARE_WINDOW = 5;

/** Settle time after a cycle's action before sampling — lets a pty exit / IPC round-trip land. */
const CYCLE_SETTLE_MS = 400;

/** Settle time after launch before idle measurement — Phase 85 Theme D / Phase 36 Theme G. */
export const SETTLE_MS = 15_000;

/** `DevTools listening on ws://127.0.0.1:PORT/devtools/browser/UUID` — Electron's own line. */
const DEVTOOLS_LINE = /^DevTools listening on (ws:\/\/\S+)$/;

/**
 * `@playwright/test` resolved through the one package in this repo that
 * already depends on it, the same trick `sharedMarks()` uses for the shared
 * bundle: a root-level script has no `node_modules` entry of its own for a
 * package three levels down a workspace member's dependency tree.
 */
function chromiumModule() {
  const appPkg = join(REPO_ROOT, 'packages', 'app', 'package.json');
  const require = createRequire(appPkg);
  return require('@playwright/test').chromium;
}

/**
 * One `ps` call, then RSS for the whole Electron process tree, grouped the
 * way `idle-cpu.mjs`'s `snapshot()` groups CPU — `main`/`renderer`/`broker`/
 * `other`, classified off each row's own argv rather than pid order or name,
 * because neither is stable across a run.
 */
export function rssSnapshotKb(rootPid) {
  const out = execFileSync('ps', ['-Ao', 'pid=,ppid=,rss=,args='], {
    encoding: 'utf8',
    env: { ...process.env, LC_ALL: 'C' },
  });
  const rows = [];
  for (const line of out.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const [pid, ppid, rss, ...rest] = trimmed.split(/\s+/);
    const rssKb = Number(rss);
    if (!Number.isFinite(rssKb)) continue;
    rows.push({ pid: Number(pid), ppid: Number(ppid), rssKb, args: rest.join(' ') });
  }

  const byParent = new Map();
  for (const row of rows) {
    if (!byParent.has(row.ppid)) byParent.set(row.ppid, []);
    byParent.get(row.ppid).push(row);
  }

  const totals = { main: 0, renderer: 0, gpu: 0, broker: 0, other: 0 };
  const walk = (pid) => {
    const self = rows.find((r) => r.pid === pid);
    if (self) {
      const g = classifyProcess(self.args);
      totals[g] = (totals[g] ?? 0) + self.rssKb;
    }
    for (const child of byParent.get(pid) ?? []) walk(child.pid);
  };
  walk(rootPid);
  return totals;
}

/**
 * Median-of-last-5-vs-median-of-first-5, per process group — the module doc's
 * "budget is a slope, not a level" made concrete.
 *
 * `perCycleKb` divides by `n - COMPARE_WINDOW` because that is the distance
 * between the two windows' centres (index `(COMPARE_WINDOW-1)/2` and index
 * `n - 1 - (COMPARE_WINDOW-1)/2`), not the run length — dividing by `n` would
 * understate the slope by counting the two windows' own internal span twice.
 */
export function retentionSlopes(samples) {
  const standardGroups = ['main', 'renderer', 'gpu', 'broker', 'other'];
  const allGroups = new Set(standardGroups);
  for (const s of samples) {
    for (const k of Object.keys(s)) allGroups.add(k);
  }
  const n = samples.length;
  const out = {};
  for (const group of allGroups) {
    const values = samples.map((s) => s[group] ?? 0);
    const firstMedian = median(values.slice(0, COMPARE_WINDOW));
    const lastMedian = median(values.slice(-COMPARE_WINDOW));
    const deltaKb = lastMedian - firstMedian;
    out[group] = {
      firstMedianKb: firstMedian,
      lastMedianKb: lastMedian,
      deltaKb,
      perCycleKb: n > COMPARE_WINDOW ? deltaKb / (n - COMPARE_WINDOW) : deltaKb,
    };
  }
  return out;
}

/** A repo-scoped session id and pty, driven end to end: create, run a command, kill. */
async function terminalCycle(page, ctx) {
  const sessionId = randomUUID();
  await page.evaluate(
    async ({ sessionId, repoId, cwd }) => {
      const api = window.midniteStudio;
      const created = await api.pty.create({
        sessionId,
        kind: 'shell',
        repoId,
        cwd,
        cols: 80,
        rows: 24,
      });
      if (!created.ok) throw new Error(`pty.create failed: ${created.message}`);
      /*
        A few hundred KB of real output, not a one-line echo — Theme C's leak
        is `scrollbackBySession` never being cleared, capped at 2 MB per
        session, and a one-line probe writes bytes an RSS sample cannot
        distinguish from noise. This is large enough that 20 kept sessions
        (~4-6 MB) reads clearly against typical ±few-hundred-KB RSS jitter.
      */
      api.pty.input({ ptyId: created.ptyId, data: 'yes "mstudio-retention-probe" | head -n 20000\n' });
      // Give the shell a beat to actually run the line before it is killed —
      // this is "run a command", not "spawn and immediately murder a shell".
      await new Promise((r) => setTimeout(r, 400));
      api.pty.kill({ ptyId: created.ptyId });
    },
    { sessionId, repoId: ctx.repoId, cwd: ctx.cwd },
  );
}

/** Open the repo, then close it — `RepoOpenRequest`/`RepoCloseRequest`, nothing else. */
async function repoCycle(page, ctx) {
  await page.evaluate(async (path) => {
    const api = window.midniteStudio;
    const opened = await api.repos.open({ path });
    if (!opened.ok) throw new Error(`repos.open failed: ${opened.message}`);
    await api.repos.close({ repoId: opened.repo.id });
  }, ctx.repoPath);
}

/** Ten tabs against `about:blank` — no network dependency, so the cycle is deterministic. */
async function browserTabsCycle(page) {
  await page.evaluate(async () => {
    const api = window.midniteStudio;
    const tabIds = Array.from({ length: 10 }, () => crypto.randomUUID());
    for (const tabId of tabIds) {
      const created = await api.browser.create({ tabId, url: 'about:blank' });
      if (!created.ok) throw new Error(`browser.create failed: ${created.message}`);
    }
    for (const tabId of tabIds) api.browser.close({ tabId });
  });
}

/** Deliberately leaky cycle for heap-diff testing: retains LeakyRetainer across cycles. */
async function leakyCycle(page) {
  await page.evaluate(() => {
    class LeakyRetainer {
      constructor() {
        this.payload = new Array(10000).fill('leak');
      }
    }
    window.__leaks = window.__leaks || [];
    window.__leaks.push(new LeakyRetainer());
  });
}

export const ACTIONS = {
  repo: { label: 'open/close a repo', run: repoCycle },
  terminal: { label: 'open a terminal session, run a command, close it', run: terminalCycle },
  'browser-tabs': { label: 'open and close 10 browser tabs', run: browserTabsCycle },
  'leaky-test': {
    label: 'deliberately leaky cycle (retains LeakyRetainer in window.__leaks across cycles)',
    run: leakyCycle,
  },
  /*
    Named in the phase doc, deliberately not wired to a real run here: a
    council spawns a real `claude`/`codex`/`opencode` subprocess per member,
    which needs an authenticated CLI this harness cannot assume is present,
    and 20 real agent invocations is neither free nor fast. Registered so
    `--action=council` fails with the reason rather than "unknown action",
    and left as the doc's own human-only item once a lightweight stub member
    exists to drive it without a live agent.
  */
  council: {
    label: 'run a council',
    run: async () => {
      throw new Error(
        'not automated: a council run spawns a real, authenticated agent CLI per member. ' +
          'Run this one manually against `moon run desktop:start` and read the numbers off ' +
          'a DevTools heap snapshot, per the phase doc.',
      );
    },
  },
};

/**
 * Capture a complete V8 heap snapshot over a CDP session.
 */
export async function captureHeapSnapshot(cdpSession) {
  let chunks = '';
  const onChunk = ({ chunk }) => {
    chunks += chunk;
  };
  cdpSession.on('HeapProfiler.addHeapSnapshotChunk', onChunk);
  try {
    await cdpSession.send('HeapProfiler.takeHeapSnapshot', { captureNumericValue: false });
  } finally {
    cdpSession.off('HeapProfiler.addHeapSnapshotChunk', onChunk);
  }
  return JSON.parse(chunks);
}

/**
 * Aggregate a parsed V8 heap snapshot by constructor name.
 * Attributes internal hidden backing stores (e.g. array elements) to the owning object,
 * and skips internal V8 hidden/system structures so real constructors are reported.
 */
export function aggregateHeapSnapshot(snapshot) {
  if (!snapshot?.snapshot?.meta || !Array.isArray(snapshot.nodes) || !Array.isArray(snapshot.strings)) {
    return new Map();
  }
  const { node_fields, node_types, edge_fields, edge_types } = snapshot.snapshot.meta;
  const typeOffset = node_fields.indexOf('type');
  const nameOffset = node_fields.indexOf('name');
  const selfSizeOffset = node_fields.indexOf('self_size');
  const edgeCountOffset = node_fields.indexOf('edge_count');
  const nodeStep = node_fields.length;

  const edgeTypeOffset = edge_fields ? edge_fields.indexOf('type') : 0;
  const edgeToNodeOffset = edge_fields ? edge_fields.indexOf('to_node') : 2;
  const edgeStep = edge_fields ? edge_fields.length : 3;

  const hiddenNodeTypeIndex = Array.isArray(node_types?.[0]) ? node_types[0].indexOf('hidden') : 0;
  const internalEdgeTypeIndex = Array.isArray(edge_types?.[0]) ? edge_types[0].indexOf('internal') : 3;
  const hiddenEdgeTypeIndex = Array.isArray(edge_types?.[0]) ? edge_types[0].indexOf('hidden') : 4;

  const { nodes, edges, strings } = snapshot;

  const byConstructor = new Map();
  let edgeIndex = 0;

  for (let i = 0; i < nodes.length; i += nodeStep) {
    const nodeType = nodes[i + typeOffset];
    const nameIndex = nodes[i + nameOffset];
    const selfSize = nodes[i + selfSizeOffset] ?? 0;
    const edgeCount = edgeCountOffset !== -1 ? (nodes[i + edgeCountOffset] ?? 0) : 0;
    const name = strings[nameIndex] || '(anonymous)';

    let extraSize = 0;
    if (edges && edgeCount > 0) {
      for (let e = 0; e < edgeCount; e += 1) {
        const currentEdge = edgeIndex + e * edgeStep;
        const edgeType = edges[currentEdge + edgeTypeOffset];
        if (edgeType === internalEdgeTypeIndex || edgeType === hiddenEdgeTypeIndex) {
          const targetNode = edges[currentEdge + edgeToNodeOffset];
          if (targetNode !== undefined && targetNode < nodes.length) {
            const targetType = nodes[targetNode + typeOffset];
            if (targetType === hiddenNodeTypeIndex) {
              extraSize += nodes[targetNode + selfSizeOffset] ?? 0;
            }
          }
        }
      }
      edgeIndex += edgeCount * edgeStep;
    }

    // Skip internal V8 hidden nodes when aggregating constructors
    if (nodeType === hiddenNodeTypeIndex || name.startsWith('(') || name.startsWith('system /')) {
      continue;
    }

    let entry = byConstructor.get(name);
    if (!entry) {
      entry = { count: 0, selfSize: 0 };
      byConstructor.set(name, entry);
    }
    entry.count += 1;
    entry.selfSize += selfSize + extraSize;
  }
  return byConstructor;
}

/**
 * Diff two aggregated heap snapshots and return the top retained constructors by delta selfSize.
 */
export function diffHeapSnapshots(snap1, snap2, topN = 10) {
  const agg1 = aggregateHeapSnapshot(snap1);
  const agg2 = aggregateHeapSnapshot(snap2);
  const diffs = [];

  for (const [name, entry2] of agg2.entries()) {
    const entry1 = agg1.get(name) ?? { count: 0, selfSize: 0 };
    const deltaCount = entry2.count - entry1.count;
    const deltaSize = entry2.selfSize - entry1.selfSize;
    if (deltaSize > 0 || deltaCount > 0) {
      diffs.push({
        constructor: name,
        deltaCount,
        deltaSize,
        size1: entry1.selfSize,
        size2: entry2.selfSize,
        count1: entry1.count,
        count2: entry2.count,
      });
    }
  }

  diffs.sort((a, b) => b.deltaSize - a.deltaSize || b.deltaCount - a.deltaCount);
  return diffs.slice(0, topN);
}

/**
 * Compute linear regression slope, intercept, and R^2 for a series of { t, value } points.
 */
export function linearFit(points) {
  const n = points.length;
  if (n === 0) return { slopeKbPerSec: 0, slopeKbPerHour: 0, interceptKb: 0, r2: 0 };
  if (n === 1) return { slopeKbPerSec: 0, slopeKbPerHour: 0, interceptKb: points[0].value, r2: 1 };

  let sumX = 0;
  let sumY = 0;
  for (const p of points) {
    sumX += p.t;
    sumY += p.value;
  }
  const meanX = sumX / n;
  const meanY = sumY / n;

  let num = 0;
  let den = 0;
  let ssTot = 0;
  for (const p of points) {
    const dx = p.t - meanX;
    const dy = p.value - meanY;
    num += dx * dy;
    den += dx * dx;
    ssTot += dy * dy;
  }

  const slope = den !== 0 ? num / den : 0;
  const intercept = meanY - slope * meanX;

  let ssRes = 0;
  for (const p of points) {
    const fitY = slope * p.t + intercept;
    const res = p.value - fitY;
    ssRes += res * res;
  }
  const r2 = ssTot !== 0 ? Math.max(0, 1 - ssRes / ssTot) : 1;

  return {
    slopeKbPerSec: slope,
    slopeKbPerHour: slope * 3600,
    interceptKb: intercept,
    r2,
  };
}

/**
 * The whole measurement: launch, attach CDP, drive `cycles` of `actionName`,
 * sample RSS after each, tear down, return samples + slopes.
 *
 * The one function both the CLI below and `retention.spec.ts` call — see the
 * module doc for why the spec imports this rather than shelling out.
 */
export async function runRetention({ actionName, cycles, repo, heapDiff = false }) {
  const action = ACTIONS[actionName];
  if (!action) {
    throw new Error(`unknown action '${actionName}'. Known actions: ${Object.keys(ACTIONS).join(', ')}`);
  }
  if (!Number.isFinite(cycles) || cycles < COMPARE_WINDOW * 2) {
    throw new Error(`cycles must be at least ${COMPARE_WINDOW * 2}, got ${cycles}`);
  }

  requireBuilt();

  /*
    A short prefix, not `os.tmpdir()`'s default — this harness needs the REAL
    broker for the `terminal` action, and `os.tmpdir()`'s per-user macOS path
    plus a dev build's `<version>-<hash>-dev` socket name can cross the
    104-byte `sun_path` limit `broker-client.ts` checks, silently falling back
    to an in-process pty that never exercises what Theme C fixes.
  */
  const expected = getExpectedMarks();
  const profile = await seedProfile(repo, expected, { tmpPrefix: '/tmp/mstudio-perf-' });

  let devtoolsUrl = null;
  process.stderr.write(`launching with CDP + --expose-gc for '${action.label}' × ${cycles}…\n`);
  const run = await launch({
    profile,
    repo,
    extraArgs: ['--remote-debugging-port=0', '--js-flags=--expose-gc'],
    until: (marks) => expected.every((n) => marks.has(n)) && devtoolsUrl !== null,
    onLine: (line) => {
      const m = DEVTOOLS_LINE.exec(line.trim());
      if (m) devtoolsUrl = m[1];
    },
  });

  if (!run.child.pid || !devtoolsUrl) {
    await stop(run.child, profile);
    discardProfile(profile);
    throw new Error('the app did not start, or never printed a DevTools endpoint');
  }

  const browser = await chromiumModule().connectOverCDP(devtoolsUrl);
  try {
    // The only non-devtools target in a single-window run — a second
    // BrowserWindow would need a real selector, which nothing here opens.
    const page = browser.contexts()[0]?.pages().find((p) => !p.url().startsWith('devtools://'));
    if (!page) throw new Error('CDP connected but no app page was found');

    let cdpSession = null;
    let snap1 = null;
    let snapN = null;
    if (heapDiff) {
      cdpSession = await page.context().newCDPSession(page);
      await cdpSession.send('HeapProfiler.enable');
    }

    const ctx = { repoPath: repo, repoId: '', cwd: repo };
    if (actionName === 'terminal') {
      // The pty needs a real, opened repo's id — not just a path — so open it
      // once, outside the timed loop, and reuse it for every cycle.
      ctx.repoId = await page.evaluate(async (path) => {
        const opened = await window.midniteStudio.repos.open({ path });
        if (!opened.ok) throw new Error(`repos.open (setup) failed: ${opened.message}`);
        return opened.repo.id;
      }, repo);
    }

    process.stderr.write('settling before the timed loop…\n');
    await sleep(3_000);

    const samples = [];
    for (let i = 0; i < cycles; i += 1) {
      await action.run(page, ctx);
      await sleep(CYCLE_SETTLE_MS);
      // Renderer GC only — main and the broker cannot be forced from outside,
      // so their numbers carry whatever V8 has not reclaimed yet. That is the
      // actual measurement, not noise to average away.
      await page
        .evaluate(() => {
          if (typeof globalThis.gc === 'function') globalThis.gc();
        })
        .catch(() => {});
      samples.push(rssSnapshotKb(run.child.pid));

      if (heapDiff && cdpSession) {
        if (i === 0) {
          process.stderr.write('taking heap snapshot after cycle 1…\n');
          snap1 = await captureHeapSnapshot(cdpSession);
        } else if (i === cycles - 1) {
          process.stderr.write(`taking heap snapshot after cycle ${cycles}…\n`);
          snapN = await captureHeapSnapshot(cdpSession);
        }
      }
    }

    let diff = null;
    if (heapDiff && snap1 && snapN) {
      diff = diffHeapSnapshots(snap1, snapN);
      if (cdpSession) {
        await cdpSession.send('HeapProfiler.disable').catch(() => {});
      }
    }

    return {
      action,
      samples,
      slopes: retentionSlopes(samples),
      ...(heapDiff ? { heapDiff: diff } : {}),
    };
  } finally {
    await browser.close();
    await stop(run.child, profile);
    discardProfile(profile);
  }
}

/**
 * Soak mode: hours rather than cycles. Launch once, drive a light repeating workload,
 * sample `rssSnapshotKb` every interval, and emit an RSS-over-time series per group plus linear fit.
 */
export async function runSoak({ repo, durationS = 3600, intervalS = 60 }) {
  requireBuilt();
  const expected = getExpectedMarks();
  const profile = await seedProfile(repo, expected, { tmpPrefix: '/tmp/mstudio-perf-' });

  let devtoolsUrl = null;
  process.stderr.write(
    `launching with CDP for soak test (${durationS}s duration, ${intervalS}s interval)…\n`,
  );
  const run = await launch({
    profile,
    repo,
    extraArgs: ['--remote-debugging-port=0', '--js-flags=--expose-gc'],
    until: (marks) => expected.every((n) => marks.has(n)) && devtoolsUrl !== null,
    onLine: (line) => {
      const m = DEVTOOLS_LINE.exec(line.trim());
      if (m) devtoolsUrl = m[1];
    },
  });

  if (!run.child.pid || !devtoolsUrl) {
    await stop(run.child, profile);
    discardProfile(profile);
    throw new Error('the app did not start, or never printed a DevTools endpoint');
  }

  const browser = await chromiumModule().connectOverCDP(devtoolsUrl);
  try {
    const page = browser.contexts()[0]?.pages().find((p) => !p.url().startsWith('devtools://'));
    if (!page) throw new Error('CDP connected but no app page was found');

    const ctx = { repoPath: repo, repoId: '', cwd: repo };
    ctx.repoId = await page.evaluate(async (path) => {
      const opened = await window.midniteStudio.repos.open({ path });
      if (!opened.ok) throw new Error(`repos.open failed: ${opened.message}`);
      return opened.repo.id;
    }, repo);

    process.stderr.write('settling before soak run…\n');
    await sleep(3_000);

    const startTime = Date.now();
    const series = [];

    const initialRss = rssSnapshotKb(run.child.pid);
    series.push({ t: 0, rss: initialRss });

    let iteration = 0;
    while ((Date.now() - startTime) / 1000 < durationS) {
      iteration += 1;
      const elapsedBefore = Math.round((Date.now() - startTime) / 1000);
      process.stderr.write(`soak cycle #${iteration} (elapsed: ${elapsedBefore}s / ${durationS}s)…\n`);

      await repoCycle(page, ctx).catch((err) => process.stderr.write(`repo cycle err: ${err.message}\n`));
      await sleep(CYCLE_SETTLE_MS);

      await terminalCycle(page, ctx).catch((err) =>
        process.stderr.write(`terminal cycle err: ${err.message}\n`),
      );
      await sleep(CYCLE_SETTLE_MS);

      await browserTabsCycle(page).catch((err) =>
        process.stderr.write(`browser-tabs cycle err: ${err.message}\n`),
      );
      await sleep(CYCLE_SETTLE_MS);

      await page
        .evaluate(() => {
          if (typeof globalThis.gc === 'function') globalThis.gc();
        })
        .catch(() => {});

      const elapsedNow = (Date.now() - startTime) / 1000;
      const nextTarget = series.length * intervalS;
      const waitTimeS = Math.max(0, Math.min(nextTarget - elapsedNow, durationS - elapsedNow));
      if (waitTimeS > 0) {
        await sleep(waitTimeS * 1000);
      }

      const currentElapsed = Math.round((Date.now() - startTime) / 1000);
      const sample = rssSnapshotKb(run.child.pid);
      series.push({ t: currentElapsed, rss: sample });

      if (currentElapsed >= durationS) break;
    }

    const allGroups = new Set(['main', 'renderer', 'gpu', 'broker', 'other']);
    for (const item of series) {
      for (const k of Object.keys(item.rss)) allGroups.add(k);
    }

    const fit = {};
    for (const group of allGroups) {
      const points = series.map((item) => ({ t: item.t, value: item.rss[group] ?? 0 }));
      fit[group] = linearFit(points);
    }

    return { durationS, intervalS, series, fit };
  } finally {
    await browser.close();
    await stop(run.child, profile);
    discardProfile(profile);
  }
}

/**
 * Heap sampler log line:
 * `[perf] ${processName} heap rss=${toMb(rss)} heapUsed=${toMb(heapUsed)} heapTotal=${toMb(heapTotal)} external=${toMb(external)} arrayBuffers=${toMb(arrayBuffers)}`
 * Emitted by `startHeapSampler` in `heap-sampler.ts` every 10s when MSTUDIO_PERF=1.
 */
export const HEAP_LOG_LINE =
  /^\[perf\] (main|broker) heap rss=(\d+) heapUsed=(\d+) heapTotal=(\d+) external=(\d+) arrayBuffers=(\d+)$/;

/**
 * Parse a heap sampler log line into structured metrics.
 * @param {string} line
 * @returns {{ process: 'main' | 'broker', rssMb: number, heapUsedMb: number, heapTotalMb: number, externalMb: number, arrayBuffersMb: number } | null}
 */
export function parseHeapLogLine(line) {
  if (typeof line !== 'string') return null;
  const trimmed = line.trim();
  const m = HEAP_LOG_LINE.exec(trimmed);
  if (!m) return null;
  return {
    process: m[1],
    rssMb: Number(m[2]),
    heapUsedMb: Number(m[3]),
    heapTotalMb: Number(m[4]),
    externalMb: Number(m[5]),
    arrayBuffersMb: Number(m[6]),
  };
}

/**
 * Summarize an idle series of samples per process group and across the whole tree.
 * @param {Array<{ t: number, rss: Record<string, number>, heap: { main: any, broker: any } }>} samples
 */
export function summarizeIdleSamples(samples) {
  if (!Array.isArray(samples) || samples.length === 0) {
    return {
      groups: {},
      total: { startKb: 0, endKb: 0, minKb: 0, maxKb: 0, medianKb: 0 },
    };
  }

  const standardGroups = ['main', 'renderer', 'gpu', 'broker', 'other'];
  const allGroups = new Set(standardGroups);
  for (const s of samples) {
    if (s.rss) {
      for (const k of Object.keys(s.rss)) allGroups.add(k);
    }
  }

  const groups = {};
  for (const group of allGroups) {
    const values = samples.map((s) => s.rss?.[group] ?? 0);
    const startKb = values[0];
    const endKb = values[values.length - 1];
    const minKb = Math.min(...values);
    const maxKb = Math.max(...values);
    const medianKb = median(values);

    let heapUsedMb = null;
    let heapTotalMb = null;
    if (group === 'main' || group === 'broker') {
      const heapSamples = samples
        .map((s) => s.heap?.[group])
        .filter((h) => h !== null && h !== undefined && Number.isFinite(h.heapUsedMb));
      if (heapSamples.length > 0) {
        heapUsedMb = median(heapSamples.map((h) => h.heapUsedMb));
        heapTotalMb = median(heapSamples.map((h) => h.heapTotalMb));
      }
    }

    groups[group] = {
      startKb,
      endKb,
      minKb,
      maxKb,
      medianKb,
      heapUsedMb,
      heapTotalMb,
    };
  }

  const totalValues = samples.map((s) =>
    s.rss ? Object.values(s.rss).reduce((a, b) => a + b, 0) : 0,
  );
  const total = {
    startKb: totalValues[0],
    endKb: totalValues[totalValues.length - 1],
    minKb: Math.min(...totalValues),
    maxKb: Math.max(...totalValues),
    medianKb: median(totalValues),
  };

  return { groups, total };
}

/**
 * Format per-group summary table as a readable text table.
 */
export function formatIdleTable(summary) {
  const groupKeys = Object.keys(summary.groups);
  const maxGroupLen = Math.max(11, ...groupKeys.map((k) => k.length), 'TOTAL'.length);
  const colWidths = { start: 11, end: 11, median: 12, heapUsed: 13, heapTotal: 13 };
  const totalWidth =
    maxGroupLen + colWidths.start + colWidths.end + colWidths.median + colWidths.heapUsed + colWidths.heapTotal + 10;

  const lines = [];
  lines.push(
    `  ${'Group'.padEnd(maxGroupLen)} ${'Start (KB)'.padStart(colWidths.start)} ${'End (KB)'.padStart(colWidths.end)} ` +
      `${'Median (KB)'.padStart(colWidths.median)}   ${'V8 HeapUsed'.padStart(colWidths.heapUsed)}   ${'V8 HeapTotal'.padStart(colWidths.heapTotal)}`,
  );
  lines.push('  ' + '-'.repeat(totalWidth));
  for (const [group, g] of Object.entries(summary.groups)) {
    const heapUsed = g.heapUsedMb !== null && g.heapUsedMb !== undefined ? `${g.heapUsedMb} MB` : '—';
    const heapTotal = g.heapTotalMb !== null && g.heapTotalMb !== undefined ? `${g.heapTotalMb} MB` : '—';
    lines.push(
      `  ${group.padEnd(maxGroupLen)} ${String(g.startKb).padStart(colWidths.start)} ${String(g.endKb).padStart(colWidths.end)} ` +
        `${String(g.medianKb).padStart(colWidths.median)}   ${heapUsed.padStart(colWidths.heapUsed)}   ${heapTotal.padStart(colWidths.heapTotal)}`,
    );
  }
  lines.push('  ' + '-'.repeat(totalWidth));
  const tot = summary.total;
  lines.push(
    `  ${'TOTAL'.padEnd(maxGroupLen)} ${String(tot.startKb).padStart(colWidths.start)} ${String(tot.endKb).padStart(colWidths.end)} ` +
      `${String(tot.medianKb).padStart(colWidths.median)}   ${'—'.padStart(colWidths.heapUsed)}   ${'—'.padStart(colWidths.heapTotal)}`,
  );
  return lines.join('\n');
}

/**
 * Print detailed report for an idle measurement run.
 */
export function printIdleReport(res) {
  const { state, seconds, interval, series, summary } = res;
  const stateLabels = {
    cold: 'cold with one repo open',
    views: 'after six heavy views visited once',
    popout: 'after detached popout',
  };
  const label = stateLabels[state] ?? state;
  console.log(`\nidle memory — ${label} (${seconds}s duration, ${interval}s interval, ${series.length} samples)\n`);
  console.log('Series:');
  for (const s of series) {
    const parts = Object.entries(s.rss).map(([k, v]) => `${k}=${v}KB`);
    const totKb = Object.values(s.rss).reduce((a, b) => a + b, 0);
    const totMb = (totKb / 1024).toFixed(1);
    console.log(`  t=${s.t}s: ${parts.join(' ')} | TOTAL=${totKb}KB (~${totMb}MB)`);
    const heapParts = [];
    if (s.heap?.main) heapParts.push(`main V8: used=${s.heap.main.heapUsedMb}MB total=${s.heap.main.heapTotalMb}MB`);
    if (s.heap?.broker) heapParts.push(`broker V8: used=${s.heap.broker.heapUsedMb}MB total=${s.heap.broker.heapTotalMb}MB`);
    if (heapParts.length > 0) {
      console.log(`    ${heapParts.join(' | ')}`);
    }
  }
  console.log('\nPer-group summary:');
  console.log(formatIdleTable(summary));
  console.log(`\nTotal idle RSS (median): ${summary.total.medianKb}KB (~${(summary.total.medianKb / 1024).toFixed(1)}MB)\n`);
}

/**
 * Idle memory mode — Phase 85 Theme D.
 * Launch packaged app with a repo open, settle past SETTLE_MS, and sample on an interval timer for `seconds`.
 * Supports three states: 'cold', 'views' (6 heavy views visited once), 'popout' (after detached popout).
 */
export async function runIdle({ repo, seconds = 60, interval = 60, state = 'cold' }) {
  requireBuilt();
  const expected = getExpectedMarks();
  const profile = await seedProfile(repo, expected, { tmpPrefix: '/tmp/mstudio-perf-' });

  let devtoolsUrl = null;
  const heapEvents = [];
  const latestHeap = { main: null, broker: null };

  process.stderr.write(
    `launching with CDP for idle measurement (state='${state}', ${seconds}s duration, ${interval}s interval)…\n`,
  );
  const run = await launch({
    profile,
    repo,
    extraArgs: ['--remote-debugging-port=0', '--js-flags=--expose-gc'],
    until: (marks) => expected.every((n) => marks.has(n)) && devtoolsUrl !== null,
    onLine: (line) => {
      const m = DEVTOOLS_LINE.exec(line.trim());
      if (m) devtoolsUrl = m[1];
      const heap = parseHeapLogLine(line);
      if (heap) {
        heapEvents.push({ ...heap, timestamp: Date.now() });
        latestHeap[heap.process] = heap;
      }
    },
  });

  if (!run.child.pid || !devtoolsUrl) {
    await stop(run.child, profile);
    discardProfile(profile);
    throw new Error('the app did not start, or never printed a DevTools endpoint');
  }

  const browser = await chromiumModule().connectOverCDP(devtoolsUrl);
  try {
    const page = browser.contexts()[0]?.pages().find((p) => !p.url().startsWith('devtools://'));
    if (!page) throw new Error('CDP connected but no app page was found');

    await page.evaluate(async (path) => {
      const opened = await window.midniteStudio.repos.open({ path });
      if (!opened.ok) throw new Error(`repos.open (setup) failed: ${opened.message}`);
    }, repo);

    process.stderr.write(`settling past SETTLE_MS (${SETTLE_MS}ms) with repo open…\n`);
    await sleep(SETTLE_MS);

    if (state === 'views') {
      const HEAVY_VIEWS = ['graph', 'changes', 'files', 'actions', 'reviews', 'issues'];
      for (const view of HEAVY_VIEWS) {
        process.stderr.write(`visiting view '${view}'…\n`);
        await page.evaluate((viewId) => {
          const link = document.querySelector(`a[href="/${viewId}"]`);
          if (link) {
            link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
          }
        }, view);
        await sleep(2_000);
      }
      await page.evaluate(() => {
        const link = document.querySelector('a[href="/graph"]');
        if (link) link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      });
      process.stderr.write(`settling after visiting 6 heavy views (${SETTLE_MS}ms)…\n`);
      await sleep(SETTLE_MS);
    } else if (state === 'popout') {
      const role = 'graph';
      process.stderr.write(`detaching '${role}' popout…\n`);
      await page.evaluate((r) => window.midniteStudio.window.detach({ role: r }), role);
      const opened = await page
        .waitForFunction(
          async (r) => {
            const windows = await window.midniteStudio.window.list();
            return windows.some((w) => w.role === r);
          },
          role,
          { timeout: 15_000 },
        )
        .catch(() => null);
      if (!opened) throw new Error(`popout for role '${role}' never appeared in window.list()`);
      process.stderr.write(`settling after popout (${SETTLE_MS}ms)…\n`);
      await sleep(SETTLE_MS);
    }

    process.stderr.write(`sampling idle RSS for ${seconds}s (interval: ${interval}s)…\n`);
    const startTime = Date.now();
    const series = [];

    const initialRss = rssSnapshotKb(run.child.pid);
    series.push({
      t: 0,
      rss: initialRss,
      heap: {
        main: latestHeap.main ? { ...latestHeap.main } : null,
        broker: latestHeap.broker ? { ...latestHeap.broker } : null,
      },
    });

    while ((Date.now() - startTime) / 1000 < seconds) {
      const elapsedNow = (Date.now() - startTime) / 1000;
      const nextTarget = series.length * interval;
      const waitTimeS = Math.max(0, Math.min(nextTarget - elapsedNow, seconds - elapsedNow));
      if (waitTimeS > 0) {
        await sleep(waitTimeS * 1000);
      }

      const currentElapsed = Math.round((Date.now() - startTime) / 1000);
      const sample = rssSnapshotKb(run.child.pid);
      series.push({
        t: currentElapsed,
        rss: sample,
        heap: {
          main: latestHeap.main ? { ...latestHeap.main } : null,
          broker: latestHeap.broker ? { ...latestHeap.broker } : null,
        },
      });

      if (currentElapsed >= seconds) break;
    }

    const summary = summarizeIdleSamples(series);
    return {
      state,
      seconds,
      interval,
      series,
      summary,
      totalRssKb: summary.total.medianKb,
      heapEvents,
    };
  } finally {
    await browser.close();
    await stop(run.child, profile);
    discardProfile(profile);
  }
}

/**
 * A page popout's own RSS, as a before/after delta (Phase 84 Theme H.4) —
 * the level counterpart to `runRetention`'s slope: how much a SINGLE popout
 * costs, not whether repeating an action leaks.
 *
 * `role` is one of `PAGE_WINDOW_ROLES` (`window.ts`) — `graph` is what the
 * phase doc's own Verification section asks for, since it is the one
 * keep-alive-eligible view (Theme G) most likely to sit open in a popout for
 * a while. Total renderer RSS is sampled once with only the main window open
 * (after a real repo is opened, so the delta is not measuring "opening a
 * popout with nothing to show"), the popout is opened via `window.detach`,
 * and sampled again once `window.list()` reports it present and a settle
 * delay has let it finish streaming. The delta is attributed to the popout:
 * on a single-window baseline nothing else changes total renderer RSS in
 * between, and `rssSnapshotKb` groups every `--type=renderer` process
 * together rather than by window, so a delta is the only way to isolate one
 * without a second, popout-specific classifier.
 */
export async function runPopoutRss({ role, repo }) {
  requireBuilt();

  const expected = getExpectedMarks();
  const profile = await seedProfile(repo, expected, { tmpPrefix: '/tmp/mstudio-perf-' });

  let devtoolsUrl = null;
  process.stderr.write(`launching with CDP for a '${role}' popout…\n`);
  const run = await launch({
    profile,
    repo,
    extraArgs: ['--remote-debugging-port=0'],
    until: (marks) => expected.every((n) => marks.has(n)) && devtoolsUrl !== null,
    onLine: (line) => {
      const m = DEVTOOLS_LINE.exec(line.trim());
      if (m) devtoolsUrl = m[1];
    },
  });

  if (!run.child.pid || !devtoolsUrl) {
    await stop(run.child, profile);
    discardProfile(profile);
    throw new Error('the app did not start, or never printed a DevTools endpoint');
  }

  const browser = await chromiumModule().connectOverCDP(devtoolsUrl);
  try {
    const page = browser.contexts()[0]?.pages().find((p) => !p.url().startsWith('devtools://'));
    if (!page) throw new Error('CDP connected but no app page was found');

    await page.evaluate(async (path) => {
      const opened = await window.midniteStudio.repos.open({ path });
      if (!opened.ok) throw new Error(`repos.open (setup) failed: ${opened.message}`);
    }, repo);

    process.stderr.write('settling before the baseline sample…\n');
    await sleep(3_000);
    const before = rssSnapshotKb(run.child.pid);

    await page.evaluate((r) => window.midniteStudio.window.detach({ role: r }), role);

    // `window.list()` is the real signal ("the popout exists"); a fixed
    // settle on top of it is what the retention harness's own cycles rely on
    // too, for the same reason — a page role streams its own data once
    // mounted, and that has no single event this script can await instead.
    const opened = await page
      .waitForFunction(
        async (r) => {
          const windows = await window.midniteStudio.window.list();
          return windows.some((w) => w.role === r);
        },
        role,
        { timeout: 15_000 },
      )
      .catch(() => null);
    if (!opened) throw new Error(`popout for role '${role}' never appeared in window.list()`);

    process.stderr.write('settling for the popout to finish its first render…\n');
    await sleep(4_000);
    const after = rssSnapshotKb(run.child.pid);

    return { role, before, after, popoutRssKb: after.renderer - before.renderer };
  } finally {
    await browser.close();
    await stop(run.child, profile);
    discardProfile(profile);
  }
}

/**
 * RSS with N terminal sessions alive but none rendered, as a before/after
 * delta (Phase 84 Theme J.1/J.3 — the owed E.6 number) — the LEVEL
 * counterpart to `runRetention`'s slope, same relationship `runPopoutRss` has
 * to it: how much N sessions cost at rest, not whether opening/closing one
 * repeatedly leaks.
 *
 * Driven at the `pty.create`/`pty.kill` IPC layer, same as `terminalCycle`
 * above and for the same reason (this harness has no UI to click) — but here
 * every session is created and left running rather than killed each cycle.
 * That "left running, nothing watching it" state is exactly what
 * `session-mount-policy.ts` reduces a UI session to once it disposes the
 * xterm past the keep-recent window: main/broker still hold the pty and its
 * scrollback, nothing renders it. Sampling `main`+`broker` RSS before vs.
 * after N such sessions exist isolates that per-session floor without
 * needing to drive the terminal panel's own tab strip through Playwright.
 */
export async function runHiddenSessionsRss({ repo, sessions = 10 }) {
  requireBuilt();

  const expected = getExpectedMarks();
  const profile = await seedProfile(repo, expected, { tmpPrefix: '/tmp/mstudio-perf-' });

  let devtoolsUrl = null;
  process.stderr.write(`launching with CDP for ${sessions} hidden terminal sessions…\n`);
  const run = await launch({
    profile,
    repo,
    extraArgs: ['--remote-debugging-port=0'],
    until: (marks) => expected.every((n) => marks.has(n)) && devtoolsUrl !== null,
    onLine: (line) => {
      const m = DEVTOOLS_LINE.exec(line.trim());
      if (m) devtoolsUrl = m[1];
    },
  });

  if (!run.child.pid || !devtoolsUrl) {
    await stop(run.child, profile);
    discardProfile(profile);
    throw new Error('the app did not start, or never printed a DevTools endpoint');
  }

  const browser = await chromiumModule().connectOverCDP(devtoolsUrl);
  try {
    const page = browser.contexts()[0]?.pages().find((p) => !p.url().startsWith('devtools://'));
    if (!page) throw new Error('CDP connected but no app page was found');

    const repoId = await page.evaluate(async (path) => {
      const opened = await window.midniteStudio.repos.open({ path });
      if (!opened.ok) throw new Error(`repos.open (setup) failed: ${opened.message}`);
      return opened.repo.id;
    }, repo);

    process.stderr.write('settling before the baseline sample…\n');
    await sleep(3_000);
    const before = rssSnapshotKb(run.child.pid);

    const sessionIds = Array.from({ length: sessions }, () => randomUUID());
    const ptyIds = await page.evaluate(
      async ({ sessionIds, repoId, cwd }) => {
        const api = window.midniteStudio;
        const ids = [];
        for (const sessionId of sessionIds) {
          const created = await api.pty.create({
            sessionId,
            kind: 'shell',
            repoId,
            cwd,
            cols: 80,
            rows: 24,
          });
          if (!created.ok) throw new Error(`pty.create failed: ${created.message}`);
          ids.push(created.ptyId);
        }
        return ids;
      },
      { sessionIds, repoId, cwd: repo },
    );

    process.stderr.write(`settling with ${sessions} sessions alive, none rendered…\n`);
    await sleep(3_000);
    const afterOpen = rssSnapshotKb(run.child.pid);

    await page.evaluate((ids) => {
      const api = window.midniteStudio;
      for (const ptyId of ids) api.pty.kill({ ptyId });
    }, ptyIds);

    await sleep(2_000);
    const afterClose = rssSnapshotKb(run.child.pid);

    const heldKb = afterOpen.main + afterOpen.broker - (before.main + before.broker);
    return {
      sessions,
      before,
      afterOpen,
      afterClose,
      heldKb,
      perSessionKb: heldKb / sessions,
    };
  } finally {
    await browser.close();
    await stop(run.child, profile);
    discardProfile(profile);
  }
}

/**
 * RSS with N browser tabs open and none active/audible, as a before/after
 * delta (Phase 84 Theme J.1 — the owed F.5 number) — `runHiddenSessionsRss`'s
 * sibling for tabs rather than terminal sessions. A `WebContentsView` tab is
 * itself a `--type=renderer` Chromium process, the same group the main
 * window's own renderer falls into (`rssSnapshotKb`'s classifier does not
 * distinguish them), so the delta on `renderer` here is the same
 * "before/after with N extra live-but-unfocused renderers" shape
 * `runPopoutRss` already uses for a single popout — just N tabs instead of
 * one window.
 */
export async function runHiddenTabsRss({ repo, tabs = 8 }) {
  requireBuilt();

  const expected = getExpectedMarks();
  const profile = await seedProfile(repo, expected, { tmpPrefix: '/tmp/mstudio-perf-' });

  let devtoolsUrl = null;
  process.stderr.write(`launching with CDP for ${tabs} hidden browser tabs…\n`);
  const run = await launch({
    profile,
    repo,
    extraArgs: ['--remote-debugging-port=0'],
    until: (marks) => expected.every((n) => marks.has(n)) && devtoolsUrl !== null,
    onLine: (line) => {
      const m = DEVTOOLS_LINE.exec(line.trim());
      if (m) devtoolsUrl = m[1];
    },
  });

  if (!run.child.pid || !devtoolsUrl) {
    await stop(run.child, profile);
    discardProfile(profile);
    throw new Error('the app did not start, or never printed a DevTools endpoint');
  }

  const browser = await chromiumModule().connectOverCDP(devtoolsUrl);
  try {
    const page = browser.contexts()[0]?.pages().find((p) => !p.url().startsWith('devtools://'));
    if (!page) throw new Error('CDP connected but no app page was found');

    // A repo open, same as `runPopoutRss`/`runHiddenSessionsRss` — a real
    // session always has one, and it gives the renderer's own boot-time work
    // (graph batch, shiki grammars) somewhere to finish before the baseline
    // sample, instead of that work landing inside the "N tabs" delta.
    await page.evaluate(async (path) => {
      const opened = await window.midniteStudio.repos.open({ path });
      if (!opened.ok) throw new Error(`repos.open (setup) failed: ${opened.message}`);
    }, repo);

    process.stderr.write('settling before the baseline sample…\n');
    await sleep(10_000);
    const before = rssSnapshotKb(run.child.pid);

    const tabIds = Array.from({ length: tabs }, () => randomUUID());
    await page.evaluate(async (ids) => {
      const api = window.midniteStudio;
      for (const tabId of ids) {
        const created = await api.browser.create({ tabId, url: 'about:blank' });
        if (!created.ok) throw new Error(`browser.create failed: ${created.message}`);
      }
    }, tabIds);

    process.stderr.write(`settling with ${tabs} tabs open, one active…\n`);
    await sleep(4_000);
    const afterOpen = rssSnapshotKb(run.child.pid);

    await page.evaluate((ids) => {
      const api = window.midniteStudio;
      for (const tabId of ids) api.browser.close({ tabId });
    }, tabIds);

    await sleep(2_000);
    const afterClose = rssSnapshotKb(run.child.pid);

    const heldKb = afterOpen.renderer - before.renderer;
    return {
      tabs,
      before,
      afterOpen,
      afterClose,
      heldKb,
      perTabKb: heldKb / tabs,
    };
  } finally {
    await browser.close();
    await stop(run.child, profile);
    discardProfile(profile);
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const { flag, value } = cli(process.argv.slice(2));
  const cycles = Number(value('cycles', '20'));
  const actionName = value('action', '');
  const popoutRole = value('popout', '');
  const hiddenSessions = value('hidden-sessions', '');
  const hiddenTabs = value('hidden-tabs', '');
  const isSoak = flag('soak');
  const isIdle = flag('idle');
  const heapDiff = flag('heap-diff');
  const asJson = flag('json');
  const doAssert = flag('assert');
  const repo = mainWorktree(resolve(value('repo', REPO_ROOT)));

  if (!actionName && !popoutRole && !hiddenSessions && !hiddenTabs && !isSoak && !isIdle) {
    console.error(
      `--action, --popout, --hidden-sessions, --hidden-tabs, --soak or --idle is required. Known actions: ` +
        `${Object.keys(ACTIONS).join(', ')}`,
    );
    process.exit(2);
  }

  if (hiddenTabs) {
    const tabs = Number(hiddenTabs);
    if (!Number.isFinite(tabs) || tabs < 1) {
      console.error(`--hidden-tabs must be a positive number, got '${hiddenTabs}'`);
      process.exit(2);
    }
    let tabsResult;
    try {
      tabsResult = await runHiddenTabsRss({ repo, tabs });
    } catch (err) {
      console.error(err.message);
      process.exit(2);
    }
    const { before, afterOpen, afterClose, heldKb, perTabKb } = tabsResult;

    if (asJson) {
      console.log(JSON.stringify({ tabs, before, afterOpen, afterClose, heldKb, perTabKb }, null, 2));
    } else {
      console.log(`\nhidden-tab RSS — ${tabs} tabs open, none active\n`);
      console.log(
        `  renderer before=${before.renderer}KB afterOpen=${afterOpen.renderer}KB ` +
          `afterClose=${afterClose.renderer}KB`,
      );
      console.log(`  heldKb=${heldKb}KB  ~${perTabKb.toFixed(1)} KB/tab\n`);
    }

    if (doAssert) {
      const budgetsPath = join(REPO_ROOT, 'scripts', 'perf', 'budgets.json');
      const budgets = JSON.parse(readFileSync(budgetsPath, 'utf8'));
      const limit = budgets.hiddenBrowserTabRss;
      if (typeof limit !== 'number') {
        console.error(`--assert needs budgets.json's hiddenBrowserTabRss, which is not set.`);
        process.exit(2);
      }
      if (perTabKb > limit) {
        console.error(`hidden-tab RSS budget breached: ${perTabKb.toFixed(1)}KB/tab > ${limit}KB/tab`);
        process.exit(1);
      }
      console.log('hidden-tab RSS budget ok');
    }
    process.exit(0);
  }

  if (hiddenSessions) {
    const sessions = Number(hiddenSessions);
    if (!Number.isFinite(sessions) || sessions < 1) {
      console.error(`--hidden-sessions must be a positive number, got '${hiddenSessions}'`);
      process.exit(2);
    }
    let hiddenResult;
    try {
      hiddenResult = await runHiddenSessionsRss({ repo, sessions });
    } catch (err) {
      console.error(err.message);
      process.exit(2);
    }
    const { before, afterOpen, afterClose, heldKb, perSessionKb } = hiddenResult;

    if (asJson) {
      console.log(
        JSON.stringify({ sessions, before, afterOpen, afterClose, heldKb, perSessionKb }, null, 2),
      );
    } else {
      console.log(`\nhidden-session RSS — ${sessions} sessions alive, none rendered\n`);
      console.log(
        `  main+broker before=${before.main + before.broker}KB ` +
          `afterOpen=${afterOpen.main + afterOpen.broker}KB ` +
          `afterClose=${afterClose.main + afterClose.broker}KB`,
      );
      console.log(`  heldKb=${heldKb}KB  ~${perSessionKb.toFixed(1)} KB/session\n`);
    }

    if (doAssert) {
      const budgetsPath = join(REPO_ROOT, 'scripts', 'perf', 'budgets.json');
      const budgets = JSON.parse(readFileSync(budgetsPath, 'utf8'));
      const limit = budgets.hiddenTerminalSessionRss;
      if (typeof limit !== 'number') {
        console.error(`--assert needs budgets.json's hiddenTerminalSessionRss, which is not set.`);
        process.exit(2);
      }
      if (perSessionKb > limit) {
        console.error(
          `hidden-session RSS budget breached: ${perSessionKb.toFixed(1)}KB/session > ${limit}KB/session`,
        );
        process.exit(1);
      }
      console.log('hidden-session RSS budget ok');
    }
    process.exit(0);
  }

  if (popoutRole) {
    let popoutResult;
    try {
      popoutResult = await runPopoutRss({ role: popoutRole, repo });
    } catch (err) {
      console.error(err.message);
      process.exit(2);
    }
    const { before, after, popoutRssKb } = popoutResult;

    if (asJson) {
      console.log(JSON.stringify({ popout: popoutRole, before, after, popoutRssKb }, null, 2));
    } else {
      console.log(`\npopout RSS — '${popoutRole}'\n`);
      console.log(`  renderer before=${before.renderer}KB after=${after.renderer}KB`);
      console.log(`  popoutRssKb ~${popoutRssKb}KB\n`);
    }

    if (doAssert) {
      const budgetsPath = join(REPO_ROOT, 'scripts', 'perf', 'budgets.json');
      const budgets = JSON.parse(readFileSync(budgetsPath, 'utf8'));
      const limit = budgets.popoutRss;
      if (typeof limit !== 'number') {
        console.error(`--assert needs budgets.json's popoutRss, which is not set.`);
        process.exit(2);
      }
      if (popoutRssKb > limit) {
        console.error(`popout RSS budget breached: ${popoutRssKb}KB > ${limit}KB`);
        process.exit(1);
      }
      console.log('popout RSS budget ok');
    }
    process.exit(0);
  }

  if (isSoak) {
    const durationS = Number(value('duration', value('seconds', '3600')));
    const intervalS = Number(value('interval', '60'));
    let soakResult;
    try {
      soakResult = await runSoak({ repo, durationS, intervalS });
    } catch (err) {
      console.error(err.message);
      process.exit(2);
    }
    const { series, fit } = soakResult;
    if (asJson) {
      console.log(JSON.stringify({ soak: { durationS, intervalS }, series, fit }, null, 2));
    } else {
      console.log(`\nsoak — ${durationS}s duration, ${intervalS}s interval (${series.length} samples)\n`);
      for (const [group, f] of Object.entries(fit)) {
        console.log(
          `  ${group.padEnd(9)} slope=${f.slopeKbPerHour >= 0 ? '+' : ''}${f.slopeKbPerHour.toFixed(1)} KB/h ` +
            `(${f.slopeKbPerSec >= 0 ? '+' : ''}${f.slopeKbPerSec.toFixed(3)} KB/s) ` +
            `intercept=${f.interceptKb.toFixed(0)}KB R²=${f.r2.toFixed(3)}`,
        );
      }
      console.log('');
    }
    process.exit(0);
  }

  if (isIdle) {
    const seconds = Number(value('seconds', '60'));
    const interval = Number(value('interval', '60'));
    const state = value('state', 'cold');

    const statesToRun = state === 'all' ? ['cold', 'views', 'popout'] : [state];
    const results = [];

    for (const s of statesToRun) {
      let idleResult;
      try {
        idleResult = await runIdle({ repo, seconds, interval, state: s });
      } catch (err) {
        console.error(err.message);
        process.exit(2);
      }
      results.push(idleResult);
    }

    if (asJson) {
      console.log(
        JSON.stringify(
          results.length === 1 ? results[0] : { states: results },
          null,
          2,
        ),
      );
    } else {
      for (const res of results) {
        printIdleReport(res);
      }
    }

    if (doAssert) {
      const budgetsPath = join(REPO_ROOT, 'scripts', 'perf', 'budgets.json');
      const budgets = JSON.parse(readFileSync(budgetsPath, 'utf8'));
      const limit = budgets.idleRss;
      if (typeof limit !== 'number') {
        console.error(`--assert needs budgets.json's idleRss, which is not set.`);
        process.exit(2);
      }
      const targetResult = results.find((r) => r.state === 'cold') ?? results[0];
      if (targetResult.totalRssKb > limit) {
        console.error(
          `idle RSS budget breached: ${targetResult.totalRssKb}KB > ${limit}KB`,
        );
        process.exit(1);
      }
      console.log('idle RSS budget ok');
    }
    process.exit(0);
  }

  let result;
  try {
    result = await runRetention({ actionName, cycles, repo, heapDiff });
  } catch (err) {
    console.error(err.message);
    process.exit(2);
  }
  const { action, samples, slopes, heapDiff: heapDiffResult } = result;

  if (asJson) {
    console.log(
      JSON.stringify(
        {
          action: actionName,
          cycles,
          samples,
          slopes,
          ...(heapDiffResult ? { heapDiff: heapDiffResult } : {}),
        },
        null,
        2,
      ),
    );
  } else {
    console.log(`\nretention — '${action.label}' × ${cycles}\n`);
    for (const [group, s] of Object.entries(slopes)) {
      console.log(
        `  ${group.padEnd(9)} first5=${s.firstMedianKb}KB last5=${s.lastMedianKb}KB ` +
          `Δ=${s.deltaKb >= 0 ? '+' : ''}${s.deltaKb}KB  ~${s.perCycleKb.toFixed(1)} KB/cycle`,
      );
    }
    console.log('');

    if (heapDiffResult) {
      console.log(`heap diff — top retained constructors (cycle 1 -> cycle ${cycles}):`);
      for (const item of heapDiffResult) {
        console.log(
          `  ${item.constructor.padEnd(30)} Δcount=${item.deltaCount >= 0 ? '+' : ''}${item.deltaCount} ` +
            `ΔselfSize=${item.deltaSize >= 0 ? '+' : ''}${(item.deltaSize / 1024).toFixed(1)}KB`,
        );
      }
      console.log('');
    }
  }

  if (doAssert) {
    const budgetsPath = join(REPO_ROOT, 'scripts', 'perf', 'budgets.json');
    const budgets = JSON.parse(readFileSync(budgetsPath, 'utf8'));
    const defaultLimit = budgets.retainedPerCycleKb ?? 500;
    const actionBudgets = budgets.retention?.[actionName] ?? {};

    const breaches = Object.entries(slopes)
      .map(([group, s]) => {
        const limit =
          actionBudgets[group] ??
          actionBudgets.default ??
          budgets.retention?.default ??
          defaultLimit;
        return { group, perCycleKb: s.perCycleKb, limit };
      })
      .filter(({ perCycleKb, limit }) => perCycleKb > limit)
      .map(({ group, perCycleKb, limit }) => `${group} ${perCycleKb.toFixed(1)} KB/cycle > ${limit} KB/cycle`);

    if (breaches.length > 0) {
      console.error(`retention budget breached:\n  ${breaches.join('\n  ')}`);
      process.exit(1);
    }
    console.log('retention budget ok');
  }
}
