#!/usr/bin/env node
/**
 * Idle-CPU report — Phase 36 Theme A, the instrument Theme E is judged by.
 *
 * Theme E's claim is that an app nobody is looking at should do nothing. This
 * measures that: launch the packaged-equivalent app, leave it alone, and report
 * the CPU each process class actually burned.
 *
 * Usage, from the repo root:
 *
 *   moon run app:build desktop:bundle
 *   node scripts/perf/idle-cpu.mjs                    # focused, 5 min
 *   node scripts/perf/idle-cpu.mjs --blurred          # window sent to the back
 *   node scripts/perf/idle-cpu.mjs --seconds=120      # shorter window
 *   node scripts/perf/idle-cpu.mjs --json
 *   node scripts/perf/idle-cpu.mjs --blurred --assert # ...and fail on a spawned git/gh child
 *
 * ## How the number is arrived at
 *
 * NOT `ps -o %cpu`, which on macOS is a decaying average over "up to a minute"
 * of history — it would smear the boot's CPU into an idle measurement and could
 * not be attributed to a window of our choosing. Instead: cumulative CPU time
 * (`ps -o cputime`) per pid at the start and end of the window, differenced and
 * divided by elapsed wall time. That is exactly "percent of one core, averaged
 * over this window", and it cannot be contaminated by what happened before the
 * window opened.
 *
 * Processes are grouped the way the phase talks about them — `main`, `renderer`,
 * `gpu`, `other` (network service, utilities) — by the `--type=` switch Chromium
 * puts in each helper's argv. A pid that appears or disappears mid-window is
 * dropped from the total rather than half-counted.
 *
 * `--blurred` moves focus away with `osascript` (Finder), because "blurred" is
 * the state Theme E's visibility gates key on and it cannot be simulated from
 * inside the app. macOS only, like the app.
 *
 * ## Subprocess census (Phase 84 Theme J.4)
 *
 * CPU/RSS above answer "how busy", not "did anything even run". Themes B/C's
 * whole claim is narrower and more falsifiable: with no window visible, the
 * fetch scheduler and forge poller's gates stay shut, so main spawns **zero**
 * `git`/`gh` child processes over the window — not "few", zero, the same way
 * Theme E's own claim is a number rather than "faster". A start/end CPU
 * snapshot cannot see this: a `git fetch` that starts and exits between the
 * two samples is invisible to a cputime delta (it never contributes any
 * accumulated time to either snapshot) yet is exactly the regression this
 * exists to catch. So a `git`/`gh` census is a genuinely separate mechanism —
 * `pollSubprocessSpawns` samples the whole tree every `POLL_INTERVAL_MS`
 * *throughout* the window (not just at its edges) and remembers every
 * distinct pid it ever saw classified as `git` or `gh`, however briefly it
 * lived. `--assert` fails the run if either count is non-zero against
 * `budgets.json`'s `idleSubprocessSpawns`.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  REPO_ROOT,
  cli,
  discardProfile,
  launch,
  mainWorktree,
  requireBuilt,
  seedProfile,
  sharedMarks,
  sleep,
  stop,
} from './electron-run.mjs';
import { classifyProcess } from './classify-process.mjs';

/** How often the subprocess census samples `ps` during the idle window. */
const POLL_INTERVAL_MS = 2_000;

/**
 * Time between "the app finished booting" and "the window opens".
 *
 * Boot leaves work in flight — the first status pass, the first graph batch,
 * shiki warming a grammar — and none of it is idle behaviour. Fifteen seconds is
 * enough for that to finish and short enough that a 5-minute window still
 * dominates.
 */
const SETTLE_MS = 15_000;

/**
 * One `ps` call, then the whole Electron process tree with its CPU time.
 *
 * One call rather than one per pid: a tree is a dozen processes, and a dozen
 * `ps` spawns per sample cost seconds of wall time INSIDE the measurement
 * window, which both stretches the window and adds CPU that is ours, not the
 * app's.
 *
 * `cputime` formats: `SS.ss`, `MM:SS.ss`, `HH:MM:SS`. Chromium names each helper
 * in its own argv (`--type=renderer`), which is the only reliable way to tell
 * the classes apart — pid order and process names are not stable.
 */
function snapshot(root) {
  const out = execFileSync('ps', ['-Ao', 'pid=,ppid=,cputime=,args='], {
    encoding: 'utf8',
    env: { ...process.env, LC_ALL: 'C' },
  });
  const rows = [];
  for (const line of out.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const [pid, ppid, cputime, ...rest] = trimmed.split(/\s+/);
    const parts = String(cputime).split(':').map(Number);
    if (parts.some((n) => !Number.isFinite(n))) continue;
    rows.push({
      pid: Number(pid),
      ppid: Number(ppid),
      cpu: parts.reduce((total, part) => total * 60 + part, 0),
      args: rest.join(' '),
    });
  }

  const byParent = new Map();
  for (const row of rows) {
    if (!byParent.has(row.ppid)) byParent.set(row.ppid, []);
    byParent.get(row.ppid).push(row);
  }

  const snap = new Map();
  const walk = (pid) => {
    const self = rows.find((r) => r.pid === pid);
    if (self) snap.set(pid, { cpu: self.cpu, group: classifyProcess(self.args) });
    for (const child of byParent.get(pid) ?? []) walk(child.pid);
  };
  walk(root);
  return snap;
}

/**
 * Parse one `ps -Ao pid=,ppid=,comm=,args=` capture into rows. Split out from
 * `pollSubprocessSpawns` so `classifyGitGhSpawns` — the part worth a unit test
 * — can be exercised against a fixed table with no real `ps` call.
 */
export function parsePsRows(psOutput) {
  const rows = [];
  for (const line of psOutput.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const [pid, ppid, comm, ...rest] = trimmed.split(/\s+/);
    const pidNum = Number(pid);
    const ppidNum = Number(ppid);
    if (!Number.isFinite(pidNum) || !Number.isFinite(ppidNum)) continue;
    rows.push({ pid: pidNum, ppid: ppidNum, comm, args: rest.join(' ') });
  }
  return rows;
}

/**
 * Which of `rootPid`'s descendants (any depth) are a `git` or `gh` binary.
 * `comm` (not `args`) is what to match on: `args`' first token is whatever
 * the caller invoked it as, which for `GitProcess.spawn`/`execFile('gh', …)`
 * is a full absolute path, while `comm` is the kernel's own resolved basename
 * — exact, not a prefix, so `github-desktop-helper` never matches `gh`.
 */
export function classifyGitGhSpawns(rows, rootPid) {
  const byParent = new Map();
  for (const row of rows) {
    if (!byParent.has(row.ppid)) byParent.set(row.ppid, []);
    byParent.get(row.ppid).push(row);
  }
  const descendantPids = new Set();
  const walk = (pid) => {
    for (const child of byParent.get(pid) ?? []) {
      if (descendantPids.has(child.pid)) continue; // guard a cyclic ppid table
      descendantPids.add(child.pid);
      walk(child.pid);
    }
  };
  walk(rootPid);

  const git = new Map();
  const gh = new Map();
  for (const row of rows) {
    if (!descendantPids.has(row.pid)) continue;
    if (row.comm === 'git') git.set(row.pid, row.args);
    else if (row.comm === 'gh') gh.set(row.pid, row.args);
  }
  return { git, gh };
}

/**
 * Samples the tree every `intervalMs` until `deadline`, folding each sample's
 * `classifyGitGhSpawns` into a running set — a pid seen even once counts,
 * because a subprocess that starts and exits between two samples is the
/**
 * Calculate per-group CPU percent of one core between two snapshots over elapsedS.
 */
export function computeCpuDeltas(startSnap, endSnap, elapsedS) {
  const totals = new Map();
  for (const [pid, end] of endSnap) {
    const start = startSnap.get(pid);
    if (!start) continue;
    const pct = ((end.cpu - start.cpu) / elapsedS) * 100;
    totals.set(end.group, (totals.get(end.group) ?? 0) + pct);
  }
  const round = (n) => Math.round(n * 100) / 100;
  const groups = [
    'main',
    'renderer',
    'gpu',
    'broker',
    ...Array.from(totals.keys()).filter(
      (g) => !['main', 'renderer', 'gpu', 'broker', 'other'].includes(g),
    ),
    'other',
  ];
  const cpuPercentOfOneCore = Object.fromEntries(
    groups.map((g) => [g, round(totals.get(g) ?? 0)]),
  );
  cpuPercentOfOneCore.total = round(
    Object.values(cpuPercentOfOneCore).reduce((a, b) => a + b, 0),
  );
  return cpuPercentOfOneCore;
}

/**
 * Subprocess census over the idle window.
 *
 * Samples `ps` every `intervalMs` and counts every distinct pid seen with a
 * comm/argv matching `git` or `gh`. If `onSample` is provided, it is invoked
 * after each census tick so caller can record periodic snapshots.
 *
 * Catches subprocesses that start and exit within the window — the
 * exact case a start/end CPU snapshot cannot see.
 */
export async function pollSubprocessSpawns(rootPid, deadline, intervalMs, onSample) {
  const git = new Map();
  const gh = new Map();
  let samples = 0;
  while (Date.now() < deadline) {
    const out = execFileSync('ps', ['-Ao', 'pid=,ppid=,comm=,args='], {
      encoding: 'utf8',
      env: { ...process.env, LC_ALL: 'C' },
    });
    const seen = classifyGitGhSpawns(parsePsRows(out), rootPid);
    for (const [pid, args] of seen.git) git.set(pid, args);
    for (const [pid, args] of seen.gh) gh.set(pid, args);
    samples += 1;
    if (onSample) await onSample(Date.now());
    await sleep(Math.max(0, Math.min(intervalMs, deadline - Date.now())));
  }
  return { gitSpawns: [...git.values()], ghSpawns: [...gh.values()], samples };
}

/** RSS is a bonus reading, taken at the end of the idle window. */
function rssMb(pid) {
  try {
    const out = execFileSync('ps', ['-o', 'rss=', '-p', String(pid)], { encoding: 'utf8' });
    const kb = Number(out.trim());
    return Number.isFinite(kb) ? Math.round(kb / 1024) : null;
  } catch {
    return null;
  }
}

function sendToBack() {
  try {
    // Activating another app is what makes the window blurred AND occluded,
    // which is the state the visibility gates actually see.
    execFileSync('osascript', ['-e', 'tell application "Finder" to activate']);
    return true;
  } catch {
    return false;
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const { BOOT_MARKS, RENDERER_MARKS } = sharedMarks();
  const EXPECTED = [...BOOT_MARKS, ...RENDERER_MARKS];

  const { flag, value } = cli(process.argv.slice(2));

  const seconds = Number(value('seconds', '300'));
  const withSeries = flag('series');
  const seriesIntervalS = Number(value('series-interval', '10'));
  const blurred = flag('blurred');
  const asJson = flag('json');
  const doAssert = flag('assert');
  const repo = mainWorktree(resolve(value('repo', REPO_ROOT)));

  if (!Number.isFinite(seconds) || seconds < 10) {
    console.error(`--seconds must be at least 10, got ${value('seconds', '300')}`);
    process.exit(2);
  }

  requireBuilt();

  const profile = await seedProfile(repo, EXPECTED);
  process.stderr.write(`launching for a ${seconds}s ${blurred ? 'blurred' : 'focused'} window…\n`);
  const run = await launch({ profile, repo, until: (m) => EXPECTED.every((n) => m.has(n)) });

  if (!run.child.pid) {
    console.error('the app did not start');
    discardProfile(profile);
    process.exit(2);
  }

  let blurOk = true;
  if (blurred) {
    blurOk = sendToBack();
    if (!blurOk) console.error('warning: could not move focus away — numbers are FOCUSED');
  }

  await sleep(SETTLE_MS);
  const startedAt = Date.now();
  const before = snapshot(run.child.pid);
  const round = (n) => Math.round(n * 100) / 100;

  const series = [];
  let lastSampleTime = startedAt;
  let lastSampleSnap = before;
  const onSample = withSeries
    ? async (now) => {
        if (now - lastSampleTime >= seriesIntervalS * 1_000) {
          const currentSnap = snapshot(run.child.pid);
          const intervalS = (now - lastSampleTime) / 1_000;
          series.push({
            elapsedSeconds: round((now - startedAt) / 1_000),
            cpuPercentOfOneCore: computeCpuDeltas(lastSampleSnap, currentSnap, intervalS),
          });
          lastSampleTime = now;
          lastSampleSnap = currentSnap;
        }
      }
    : undefined;

  const census = await pollSubprocessSpawns(
    run.child.pid,
    startedAt + seconds * 1_000,
    POLL_INTERVAL_MS,
    onSample,
  );
  const after = snapshot(run.child.pid);
  const elapsedS = (Date.now() - startedAt) / 1_000;

  if (withSeries && Date.now() - lastSampleTime >= 1_000) {
    const finalIntervalS = (Date.now() - lastSampleTime) / 1_000;
    series.push({
      elapsedSeconds: round((Date.now() - startedAt) / 1_000),
      cpuPercentOfOneCore: computeCpuDeltas(lastSampleSnap, after, finalIntervalS),
    });
  }

  const cpuPercentOfOneCore = computeCpuDeltas(before, after, elapsedS);
  const mainRss = rssMb(run.child.pid);

  await stop(run.child, profile);
  discardProfile(profile);

  const report = {
    state: blurred && blurOk ? 'blurred' : 'focused',
    windowSeconds: round(elapsedS),
    cpuPercentOfOneCore,
    ...(withSeries ? { series } : {}),
    mainRssMb: mainRss,
    subprocessSpawns: {
      git: census.gitSpawns.length,
      gh: census.ghSpawns.length,
      samples: census.samples,
    },
  };

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`\nidle CPU — ${report.state}, ${report.windowSeconds}s window, untouched\n`);
    for (const [group, pct] of Object.entries(report.cpuPercentOfOneCore)) {
      console.log(`  ${group.padEnd(9)} ${pct.toFixed(2)} %`);
    }
    if (withSeries && series.length > 0) {
      console.log(`\n  per-sample series (${series.length} samples, interval ~${seriesIntervalS}s):`);
      for (const sample of series) {
        console.log(
          `    [+${sample.elapsedSeconds}s] total: ${sample.cpuPercentOfOneCore.total.toFixed(2)}% ` +
            `(renderer: ${sample.cpuPercentOfOneCore.renderer.toFixed(2)}%, gpu: ${sample.cpuPercentOfOneCore.gpu.toFixed(2)}%, main: ${sample.cpuPercentOfOneCore.main.toFixed(2)}%)`,
        );
      }
    }
    console.log(`\n  main RSS at end: ${mainRss === null ? 'unavailable' : `${mainRss} MB`}\n`);
    console.log(
      `  subprocess census (${census.samples} samples): git=${report.subprocessSpawns.git} ` +
        `gh=${report.subprocessSpawns.gh}\n`,
    );
    if (report.subprocessSpawns.git > 0) {
      console.log(`    git: ${census.gitSpawns.join('\n         ')}`);
    }
    if (report.subprocessSpawns.gh > 0) {
      console.log(`    gh:  ${census.ghSpawns.join('\n         ')}`);
    }
  }

  if (doAssert) {
    const budgetsPath = join(REPO_ROOT, 'scripts', 'perf', 'budgets.json');
    const budgets = JSON.parse(readFileSync(budgetsPath, 'utf8'));
    const limit = budgets.idleSubprocessSpawns;
    if (typeof limit !== 'number') {
      console.error(`--assert needs budgets.json's idleSubprocessSpawns, which is not set.`);
      process.exit(2);
    }
    const total = report.subprocessSpawns.git + report.subprocessSpawns.gh;
    if (total > limit) {
      console.error(
        `idle subprocess-spawn budget breached: ${total} > ${limit} ` +
          `(git=${report.subprocessSpawns.git}, gh=${report.subprocessSpawns.gh})`,
      );
      process.exit(1);
    }
    console.log('idle subprocess-spawn budget ok');
  }
}
