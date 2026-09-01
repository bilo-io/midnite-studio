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
 */
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

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

const { BOOT_MARKS, RENDERER_MARKS } = sharedMarks();
const EXPECTED = [...BOOT_MARKS, ...RENDERER_MARKS];

const { flag, value } = cli(process.argv.slice(2));

const seconds = Number(value('seconds', '300'));
const blurred = flag('blurred');
const asJson = flag('json');
const repo = mainWorktree(resolve(value('repo', REPO_ROOT)));

/**
 * Time between "the app finished booting" and "the window opens".
 *
 * Boot leaves work in flight — the first status pass, the first graph batch,
 * shiki warming a grammar — and none of it is idle behaviour. Fifteen seconds is
 * enough for that to finish and short enough that a 5-minute window still
 * dominates.
 */
const SETTLE_MS = 15_000;

if (!Number.isFinite(seconds) || seconds < 10) {
  console.error(`--seconds must be at least 10, got ${value('seconds', '300')}`);
  process.exit(2);
}

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
  const out = execFileSync('ps', ['-Ao', 'pid=,ppid=,cputime=,args='], { encoding: 'utf8' });
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

  const classify = (args) => {
    // The pty broker is an Electron process too, spawned by main and carrying no
    // `--type=`, so without this it would be counted as main's own CPU — and it
    // is precisely the kind of thing this report exists to attribute.
    if (args.includes('broker.js')) return 'broker';
    const type = /--type=([\w-]+)/.exec(args)?.[1];
    if (!type) return 'main';
    if (type === 'renderer') return 'renderer';
    if (type === 'gpu-process') return 'gpu';
    return 'other';
  };

  const snap = new Map();
  const walk = (pid) => {
    const self = rows.find((r) => r.pid === pid);
    if (self) snap.set(pid, { cpu: self.cpu, group: classify(self.args) });
    for (const child of byParent.get(pid) ?? []) walk(child.pid);
  };
  walk(root);
  return snap;
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
await sleep(seconds * 1_000);
const after = snapshot(run.child.pid);
const elapsedS = (Date.now() - startedAt) / 1_000;

const totals = new Map();
for (const [pid, end] of after) {
  const start = before.get(pid);
  // A pid that appeared or disappeared mid-window would otherwise contribute a
  // partial or a whole-life figure to an interval measurement.
  if (!start) continue;
  const pct = ((end.cpu - start.cpu) / elapsedS) * 100;
  totals.set(end.group, (totals.get(end.group) ?? 0) + pct);
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
const mainRss = rssMb(run.child.pid);

await stop(run.child, profile);
discardProfile(profile);

const round = (n) => Math.round(n * 100) / 100;
const report = {
  state: blurred && blurOk ? 'blurred' : 'focused',
  windowSeconds: round(elapsedS),
  cpuPercentOfOneCore: Object.fromEntries(
    ['main', 'renderer', 'gpu', 'broker', 'other'].map((g) => [g, round(totals.get(g) ?? 0)]),
  ),
  mainRssMb: mainRss,
};
report.cpuPercentOfOneCore.total = round(
  Object.values(report.cpuPercentOfOneCore).reduce((a, b) => a + b, 0),
);

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`\nidle CPU — ${report.state}, ${report.windowSeconds}s window, untouched\n`);
  for (const [group, pct] of Object.entries(report.cpuPercentOfOneCore)) {
    console.log(`  ${group.padEnd(9)} ${pct.toFixed(2)} %`);
  }
  console.log(`\n  main RSS at end: ${mainRss === null ? 'unavailable' : `${mainRss} MB`}\n`);
}
