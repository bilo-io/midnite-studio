// e2e-capability: real layout (virtualizer measurement), rAF frame timing — a median frame gap
// over a 60-frame scroll of a wide graph cannot be observed in jsdom.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test, type Page } from '@playwright/test';

import { fixtures } from '../../test-support/fixtures';

/**
 * The virtualized commit-graph scroll, against a budget — Phase 77 Theme B.
 *
 * Modelled on `diff-scroll.spec.ts`: same shared `budgets.json`, same rAF-driven scroll (wheel
 * events would measure input dispatch as much as layout), same median-gap assertion. It
 * synthesises its rows in-spec against the mock bridge, exactly as that spec synthesises its
 * hunk — the `e2e/perf/` specs take no repo. The rows are WIDE on purpose: `LANES` live lanes, all
 * but the commit's own arriving as `through` columns, which is the shape Theme B made cheap.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const budgets = JSON.parse(
  readFileSync(resolve(HERE, '..', '..', '..', '..', 'scripts', 'perf', 'budgets.json'), 'utf8'),
);

const ROW_COUNT = 5000;
const LANES = 40;

const sha = (i: number) => `${i}`.padStart(40, 'a');

const graphRows = Array.from({ length: ROW_COUNT }, (_, i) => {
  const lane = i % LANES;
  return {
    row: i,
    lane,
    colorIdx: lane % 10,
    // Every lane but the commit's own passes straight through this row's band.
    through: Array.from({ length: LANES }, (_, l) => (l === lane ? -1 : l % 10)),
    laneCount: LANES,
    edges: [{ fromLane: lane, toLane: lane, type: 'straight', colorIdx: lane % 10 }],
    commit: {
      sha: sha(i),
      parents: i === ROW_COUNT - 1 ? [] : [sha(i + 1)],
      authorName: 'Ada Lovelace',
      authorEmail: 'ada@example.com',
      authorDate: 1_787_000_000 - i * 60,
      committerDate: 1_787_000_000 - i * 60,
      subject: `perf: commit ${i}`,
      refs: [],
      coAuthors: [],
      sessionTrailers: [],
    },
  };
});

async function openWideGraph(page: Page): Promise<void> {
  const { installMockBridge } = await import('../../test-support/mock-bridge');
  await installMockBridge(page, { ...fixtures, graphRows });
  await page.goto('/graph');
  await expect(page.getByRole('grid')).toBeVisible();
}

test('the graph scroll stays inside its median-frame-gap budget', async ({ page }) => {
  await openWideGraph(page);

  const frames = await page.evaluate(async (steps: number) => {
    const pane = document.querySelector('[role="grid"]');
    if (!(pane instanceof HTMLElement)) return null;

    const gaps: number[] = [];
    let previous = performance.now();

    for (let step = 0; step < steps; step += 1) {
      pane.scrollTop = step * 240;
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          const now = performance.now();
          gaps.push(now - previous);
          previous = now;
          resolve();
        });
      });
    }
    return { gaps, scrollTop: pane.scrollTop, rows: pane.querySelectorAll('[role="row"]').length };
  }, 60);

  expect(frames).not.toBeNull();
  if (frames === null) return;

  // It actually moved, and the list is still windowed at the far end of the scroll.
  expect(frames.scrollTop).toBeGreaterThan(1000);
  expect(frames.rows).toBeLessThan(200);

  const sorted = [...frames.gaps].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  // Printed unconditionally: reading it off a passing run is how the budget is rebaselined.
  console.log(`[perf] graph-scroll median frame gap: ${median.toFixed(1)} ms (budget ${budgets.graphScrollMedianGapMs} ms)`);
  expect(median).toBeLessThan(budgets.graphScrollMedianGapMs);
});
