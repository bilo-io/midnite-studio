import { dirname, resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';

/**
 * Retention, against a budget — Phase 45 Theme A/F.
 *
 * Same relationship to `memory-report.mjs` that `startup-budget.spec.ts` has
 * to `electron-run.mjs`: this imports the reusable function directly rather
 * than shelling out to the CLI, so there is exactly one retention
 * implementation, not a script and a re-implementation of it in a spec.
 *
 * All three automatable actions run here — the phase doc's own "flat growth
 * for all four registered actions" (`council` is `ACTIONS`' own documented
 * exception: it spawns a real, authenticated agent CLI per member, which this
 * harness cannot assume is present). `terminal` keeps the full 20 cycles —
 * it is the one that exercises the broker (Theme C's fix lives there), and
 * is the phase doc's own acceptance test for that theme specifically.
 * `repo` runs at 10: its cycle is one process (main), and 10 already gives a
 * flat, stable slope. `browser-tabs` needs the full 20, not 10 — each cycle
 * spins up ten real Chromium renderer/GPU/utility subprocesses, and at 10
 * cycles the "other" group's own process-pool warm-up (measured, not this
 * repo's leak — see the perCycleKb of `other` fall from ~740 at 10 cycles to
 * ~230 at 20 when this was checked by hand) reads as a false-positive slope.
 * 20 is where it actually flattens.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const PERF_DIR = resolve(HERE, '..', '..', '..', '..', 'scripts', 'perf');

type Harness = {
  REPO_ROOT: string;
  requireBuilt: () => void;
  mainWorktree: (path: string) => string;
  runRetention: (opts: { actionName: string; cycles: number; repo: string }) => Promise<{
    action: { label: string };
    samples: Array<Record<string, number>>;
    slopes: Record<string, { firstMedianKb: number; lastMedianKb: number; deltaKb: number; perCycleKb: number }>;
  }>;
};

async function assertFlat(
  harness: Harness,
  actionName: string,
  cycles: number,
  limit: number,
  repo: string,
): Promise<void> {
  const { slopes } = await harness.runRetention({ actionName, cycles, repo });
  for (const [group, slope] of Object.entries(slopes)) {
    expect(
      Math.abs(slope.perCycleKb),
      `${actionName}/${group}: ${JSON.stringify(slope)}`,
    ).toBeLessThanOrEqual(limit);
  }
}

test('retention stays inside its budget for a real terminal session cycle', async () => {
  // 20 cycles of create/run/kill against a real broker — minutes, not seconds.
  test.setTimeout(10 * 60 * 1000);

  const harness = (await import(`${PERF_DIR}/memory-report.mjs`)) as unknown as Harness;
  const budgets = JSON.parse(await readFile(`${PERF_DIR}/budgets.json`, 'utf8'));

  const limit = budgets.retainedPerCycleKb;
  expect(typeof limit).toBe('number');

  const repo = harness.mainWorktree(harness.REPO_ROOT);
  await assertFlat(harness, 'terminal', 20, limit, repo);
});

test('retention stays inside its budget for a repo open/close cycle', async () => {
  test.setTimeout(6 * 60 * 1000);

  const harness = (await import(`${PERF_DIR}/memory-report.mjs`)) as unknown as Harness;
  const budgets = JSON.parse(await readFile(`${PERF_DIR}/budgets.json`, 'utf8'));
  const limit = budgets.retainedPerCycleKb;

  const repo = harness.mainWorktree(harness.REPO_ROOT);
  await assertFlat(harness, 'repo', 10, limit, repo);
});

test('retention stays inside its budget for a browser-tabs open/close cycle', async () => {
  test.setTimeout(10 * 60 * 1000);

  const harness = (await import(`${PERF_DIR}/memory-report.mjs`)) as unknown as Harness;
  const budgets = JSON.parse(await readFile(`${PERF_DIR}/budgets.json`, 'utf8'));
  const limit = budgets.retainedPerCycleKb;

  const repo = harness.mainWorktree(harness.REPO_ROOT);
  await assertFlat(harness, 'browser-tabs', 20, limit, repo);
});
