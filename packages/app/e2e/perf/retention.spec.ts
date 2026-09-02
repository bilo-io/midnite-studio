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
 * `terminal` is the action asserted here, not `repo` or `browser-tabs`: it is
 * the one that exercises the broker (Theme C's fix lives there), and it is
 * the phase doc's own acceptance test for that theme.
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

test('retention stays inside its budget for a real terminal session cycle', async () => {
  // 20 cycles of create/run/kill against a real broker — minutes, not seconds.
  test.setTimeout(10 * 60 * 1000);

  const harness = (await import(`${PERF_DIR}/memory-report.mjs`)) as unknown as Harness;
  const budgets = JSON.parse(await readFile(`${PERF_DIR}/budgets.json`, 'utf8'));

  const limit = budgets.retainedPerCycleKb;
  expect(typeof limit).toBe('number');

  const repo = harness.mainWorktree(harness.REPO_ROOT);
  const { slopes } = await harness.runRetention({ actionName: 'terminal', cycles: 20, repo });

  for (const [group, slope] of Object.entries(slopes)) {
    expect(Math.abs(slope.perCycleKb), `${group}: ${JSON.stringify(slope)}`).toBeLessThanOrEqual(limit);
  }
});
