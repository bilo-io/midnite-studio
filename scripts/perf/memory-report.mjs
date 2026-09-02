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

// Re-exported so `retention.spec.ts` can import this module alone as its
// harness, rather than reaching into `electron-run.mjs` for the setup it
// needs alongside `runRetention` itself.
export { REPO_ROOT, mainWorktree, requireBuilt };

const { BOOT_MARKS, RENDERER_MARKS } = sharedMarks();
const EXPECTED = [...BOOT_MARKS, ...RENDERER_MARKS];

/** How many of the oldest/newest cycles the slope compares — see the module doc. */
export const COMPARE_WINDOW = 5;

/** Settle time after a cycle's action before sampling — lets a pty exit / IPC round-trip land. */
const CYCLE_SETTLE_MS = 400;

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
  const out = execFileSync('ps', ['-Ao', 'pid=,ppid=,rss=,args='], { encoding: 'utf8' });
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

  // The broker carries no `--type=` (it is not a Chromium helper), so without
  // naming it explicitly it would be counted as main's own RSS — exactly the
  // attribution mistake `idle-cpu.mjs`'s own classifier was written to avoid.
  const classify = (args) => {
    if (args.includes('broker.js')) return 'broker';
    const type = /--type=([\w-]+)/.exec(args)?.[1];
    if (!type) return 'main';
    if (type === 'renderer') return 'renderer';
    return 'other';
  };

  const totals = { main: 0, renderer: 0, broker: 0, other: 0 };
  const walk = (pid) => {
    const self = rows.find((r) => r.pid === pid);
    if (self) totals[classify(self.args)] += self.rssKb;
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
  const groups = ['main', 'renderer', 'broker', 'other'];
  const n = samples.length;
  const out = {};
  for (const group of groups) {
    const values = samples.map((s) => s[group]);
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

export const ACTIONS = {
  repo: { label: 'open/close a repo', run: repoCycle },
  terminal: { label: 'open a terminal session, run a command, close it', run: terminalCycle },
  'browser-tabs': { label: 'open and close 10 browser tabs', run: browserTabsCycle },
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
 * The whole measurement: launch, attach CDP, drive `cycles` of `actionName`,
 * sample RSS after each, tear down, return samples + slopes.
 *
 * The one function both the CLI below and `retention.spec.ts` call — see the
 * module doc for why the spec imports this rather than shelling out.
 */
export async function runRetention({ actionName, cycles, repo }) {
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
  const profile = await seedProfile(repo, EXPECTED, { tmpPrefix: '/tmp/mstudio-perf-' });

  let devtoolsUrl = null;
  process.stderr.write(`launching with CDP + --expose-gc for '${action.label}' × ${cycles}…\n`);
  const run = await launch({
    profile,
    repo,
    extraArgs: ['--remote-debugging-port=0', '--js-flags=--expose-gc'],
    until: (marks) => EXPECTED.every((n) => marks.has(n)) && devtoolsUrl !== null,
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
    }

    return { action, samples, slopes: retentionSlopes(samples) };
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
  const asJson = flag('json');
  const doAssert = flag('assert');
  const repo = mainWorktree(resolve(value('repo', REPO_ROOT)));

  if (!actionName) {
    console.error(`--action is required. Known actions: ${Object.keys(ACTIONS).join(', ')}`);
    process.exit(2);
  }

  let result;
  try {
    result = await runRetention({ actionName, cycles, repo });
  } catch (err) {
    console.error(err.message);
    process.exit(2);
  }
  const { action, samples, slopes } = result;

  if (asJson) {
    console.log(JSON.stringify({ action: actionName, cycles, samples, slopes }, null, 2));
  } else {
    console.log(`\nretention — '${action.label}' × ${cycles}\n`);
    for (const [group, s] of Object.entries(slopes)) {
      console.log(
        `  ${group.padEnd(9)} first5=${s.firstMedianKb}KB last5=${s.lastMedianKb}KB ` +
          `Δ=${s.deltaKb >= 0 ? '+' : ''}${s.deltaKb}KB  ~${s.perCycleKb.toFixed(1)} KB/cycle`,
      );
    }
    console.log('');
  }

  if (doAssert) {
    const budgetsPath = join(REPO_ROOT, 'scripts', 'perf', 'budgets.json');
    const budgets = JSON.parse(readFileSync(budgetsPath, 'utf8'));
    const limit = budgets.retainedPerCycleKb;
    if (typeof limit !== 'number') {
      console.error(`--assert needs budgets.json's retainedPerCycleKb, which is not set.`);
      process.exit(2);
    }
    const breaches = Object.entries(slopes)
      .filter(([, s]) => Math.abs(s.perCycleKb) > limit)
      .map(([group, s]) => `${group} ${s.perCycleKb.toFixed(1)} KB/cycle > ${limit} KB/cycle`);
    if (breaches.length > 0) {
      console.error(`retention budget breached:\n  ${breaches.join('\n  ')}`);
      process.exit(1);
    }
    console.log('retention budget ok');
  }
}
