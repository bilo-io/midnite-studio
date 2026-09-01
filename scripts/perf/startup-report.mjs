#!/usr/bin/env node
/**
 * Cold-start report — Phase 36 Theme A.
 *
 * Launches the app in **packaged-equivalent** mode (`MSTUDIO_USE_BUILT_RENDERER=1`
 * against the esbuild-bundled main), reads the `[perf] …` lines both processes
 * log under `MSTUDIO_PERF=1`, and prints a stage-by-stage table. `--runs=5`
 * repeats it and prints per-mark medians, which is the phase's official mode:
 * dev-mode numbers are noise and a single run is a coin toss.
 *
 * Usage, from the repo root:
 *
 *   moon run app:build desktop:bundle
 *   node scripts/perf/startup-report.mjs            # one run
 *   node scripts/perf/startup-report.mjs --runs=5   # the official number
 *   node scripts/perf/startup-report.mjs --rss      # also sample main's RSS
 *   node scripts/perf/startup-report.mjs --json     # machine-readable
 *   node scripts/perf/startup-report.mjs --repo=/path/to/bigger/repo
 *
 * Exits non-zero when a run is missing a mark, or when `repos-restored` does not
 * precede `create-window` — Theme B's ordering guarantee (restore BEFORE the
 * window opens, so the sidebar never flashes its empty state) is policed here
 * rather than in a comment, because that is the kind of invariant a later
 * "let's parallelise boot" refactor silently reverses.
 *
 * A plain `child_process` spawn on purpose: the marks arrive as log lines, so
 * pulling Playwright's `_electron` in would add a browser download and a test
 * framework to a script whose whole job is to read stdout. The launching,
 * profile isolation and seeding all live in ./electron-run.mjs, which documents
 * why each is necessary.
 */
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

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
  stop,
} from './electron-run.mjs';

const { BOOT_MARKS, RENDERER_MARKS } = sharedMarks();

/** Every mark a complete run must produce, in boot order. */
const EXPECTED = [...BOOT_MARKS, ...RENDERER_MARKS];

const { flag, value } = cli(process.argv.slice(2));

const runs = Number(value('runs', '1'));
const wantRss = flag('rss');
const asJson = flag('json');
/** The repository the runs open and select, so there is a graph to stream. */
const repo = mainWorktree(resolve(value('repo', REPO_ROOT)));

if (!Number.isInteger(runs) || runs < 1) {
  console.error(`--runs must be a positive integer, got ${value('runs', '1')}`);
  process.exit(2);
}

/**
 * Main's resident size, from outside.
 *
 * `ps` rather than asking main to report its own `process.memoryUsage()`: the
 * measurement stays entirely dev-side, which is the phase's rule about never
 * shipping perf code into the product.
 */
function sampleRss(pid) {
  try {
    const out = execFileSync('ps', ['-o', 'rss=', '-p', String(pid)], { encoding: 'utf8' });
    const kb = Number(out.trim());
    return Number.isFinite(kb) ? Math.round(kb / 1024) : null;
  } catch {
    return null;
  }
}

const hasAll = (marks) => EXPECTED.every((name) => marks.has(name));

requireBuilt();

const profile = await seedProfile(repo, EXPECTED);
const results = [];
for (let i = 0; i < runs; i += 1) {
  process.stderr.write(`run ${i + 1}/${runs}…\n`);
  const run = await launch({ profile, repo, until: hasAll });
  results.push({
    marks: run.marks,
    rssMb: wantRss && run.child.pid ? sampleRss(run.child.pid) : null,
  });
  await stop(run.child, profile);
}
discardProfile(profile);

/** A mark ANY run failed to produce — a partial mark is as broken as a missing one. */
const missing = EXPECTED.filter((name) => results.some((r) => !r.marks.has(name)));

const table = EXPECTED.map((name) => {
  const values = results.map((r) => r.marks.get(name)).filter((v) => typeof v === 'number');
  return {
    mark: name,
    process: BOOT_MARKS.includes(name) ? 'main' : 'renderer',
    ms: values.length > 0 ? median(values) : null,
    runs: values.length,
  };
});

if (asJson) {
  console.log(JSON.stringify({ runs, table, rssMb: results.map((r) => r.rssMb), missing }, null, 2));
} else {
  const width = Math.max(...EXPECTED.map((n) => n.length));
  console.log(`\ncold start — packaged-equivalent, ${runs} run${runs === 1 ? '' : 's'} (median)\n`);
  for (const row of table) {
    const ms = row.ms === null ? 'MISSING' : `${row.ms} ms`;
    console.log(`  ${row.mark.padEnd(width)}  ${row.process.padEnd(8)} ${ms.padStart(9)}`);
  }
  if (wantRss) {
    const seen = results.map((r) => r.rssMb).filter((v) => typeof v === 'number');
    console.log(`\n  main RSS at first paint: ${seen.length ? `${median(seen)} MB` : 'unavailable'}`);
  }
  console.log('');
}

let failed = false;
if (missing.length > 0) {
  console.error(`missing marks: ${missing.join(', ')}`);
  failed = true;
}

// Theme B's ordering guarantee, asserted rather than assumed.
const restored = table.find((r) => r.mark === 'repos-restored')?.ms;
const created = table.find((r) => r.mark === 'create-window')?.ms;
if (typeof restored === 'number' && typeof created === 'number' && restored > created) {
  console.error(
    `repos-restored (${restored} ms) must precede create-window (${created} ms) — ` +
      'the sidebar would show its empty state for a frame.',
  );
  failed = true;
}

process.exit(failed ? 1 : 0);
