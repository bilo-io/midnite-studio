#!/usr/bin/env node
/**
 * Guard sweep wall-clock — Phase 122 Theme H's budget: a sweep over this repo (one 1 695-entry lockfile, the
 * given repos' lockfiles, a day of agent trail) finishes in under 60 s with warm caches and under 5 minutes cold.
 *
 * Usage, from the repo root:
 *
 *   node scripts/perf/guard-sweep.mjs                       # cold then warm, this repo, feeds on (network)
 *   node scripts/perf/guard-sweep.mjs --offline             # feeds off: the local checks and lockfile walk only
 *   node scripts/perf/guard-sweep.mjs --repos=/a,/b         # sweep these repos instead
 *   node scripts/perf/guard-sweep.mjs --json
 *   node scripts/perf/guard-sweep.mjs --assert              # fail past budgets.json's guardSweep budgets
 *
 * ## What is measured
 *
 * The real `runGuardSweep` with the default checks and real resolvers, bundled on the fly with esbuild (resolved
 * from apps/launcher, as `scripts/validate-catalog.mjs` does) so no packaged app is needed: a sweep is main-side
 * code over the runtime, and the window adds nothing to it. Run 1 uses an empty throwaway userData (cold: no
 * feed cache, no ledger); run 2 reuses it (warm). Feeds go over the platform `fetch` here, not `guardedFetch`,
 * because the egress switches are the app's; the host list is the same one the registry carries.
 * Findings are written only to the throwaway ledger. Nothing is sent but package coordinates and CVE ids, and the
 * script reads the machine only through the same read-only probes the app uses. Needs `pnpm install`.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir, tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const execFileAsync = promisify(execFile);

async function loadRuntime(outDir) {
  const { build } = createRequire(join(REPO_ROOT, 'apps/launcher/package.json'))('esbuild');
  const outfile = join(outDir, 'runtime.cjs');
  await build({
    entryPoints: [join(REPO_ROOT, 'packages/runtime/src/index.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    outfile,
    logLevel: 'error',
    external: ['electron', 'node-pty'],
  });
  return createRequire(outfile)(outfile);
}

const scratch = mkdtempSync(join(tmpdir(), 'guard-sweep-perf-'));
try {
  const rt = await loadRuntime(scratch);
  const userData = join(scratch, 'userData');
  mkdirSync(userData, { recursive: true });
  const repos = (value('repos') ?? REPO_ROOT).split(',').filter(Boolean);
  const offline = flag('offline');
  const budgets = JSON.parse(readFileSync(join(REPO_ROOT, 'scripts/perf/budgets.json'), 'utf8')).guardSweep ?? {};

  const sweep = async () => {
    const started = performance.now();
    const result = await rt.runGuardSweep({
      userData,
      checks: rt.defaultGuardChecks(),
      ledger: rt.createFindingsLedger({ userData }),
      context: {
        resolvers: rt.createGuardResolvers({
          userData,
          home: homedir(),
          repos: () => repos,
          fetch: offline ? async () => { throw new Error('offline'); } : (url, init) => fetch(url, init),
          allowConfigRead: () => false,
          exec: async (file, a) => (await execFileAsync(file, [...a], { timeout: 60_000, maxBuffer: 16 * 1024 * 1024 })).stdout,
        }),
      },
    });
    return {
      ms: Math.round(performance.now() - started),
      findings: result.findings.length,
      checks: result.record.checksRun.length,
      skipped: Object.keys(result.record.inputsSkipped),
    };
  };

  const cold = await sweep();
  const warm = await sweep();
  const report = { repos, offline, cold, warm, budgets };
  if (flag('json')) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`guard sweep over ${repos.length} repo(s)${offline ? ' (offline)' : ''}`);
    for (const [name, r] of [['cold', cold], ['warm', warm]]) {
      console.log(`  ${name}: ${(r.ms / 1000).toFixed(1)} s, ${r.checks} checks, ${r.findings} findings${r.skipped.length ? `, skipped ${r.skipped.join(', ')}` : ''}`);
    }
  }
  if (flag('assert')) {
    const failures = [];
    if (budgets.coldMs && cold.ms > budgets.coldMs) failures.push(`cold ${cold.ms} ms > ${budgets.coldMs} ms`);
    if (budgets.warmMs && warm.ms > budgets.warmMs) failures.push(`warm ${warm.ms} ms > ${budgets.warmMs} ms`);
    if (failures.length) {
      console.error(`guard sweep over budget: ${failures.join('; ')}`);
      process.exitCode = 1;
    }
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
