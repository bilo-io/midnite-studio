import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test, type Page } from '@playwright/test';

import { COMMIT_SHA, fixtures } from '../fixtures';

/**
 * The virtualized diff scroll, against a budget — Phase 36 Theme H.
 *
 * Moved out of `e2e/diff-scroll-perf.spec.ts`, whose own header made the case for
 * this file existing: it argued a timing threshold has to be written "not to fail
 * on a busy runner", and a threshold loose enough for that is too loose to be a
 * budget. The two structural row-count assertions it sits beside are exact and
 * stayed behind in the default gate. This is Phase 26's open question resolved
 * as both, each in the place it belongs.
 *
 * The number is read from `scripts/perf/budgets.json` — the one budget source,
 * shared with `bundle-report.mjs --assert` and the other two specs here.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const budgets = JSON.parse(
  readFileSync(resolve(HERE, '..', '..', '..', '..', 'scripts', 'perf', 'budgets.json'), 'utf8'),
);

/** Big enough that a virtualizer failing to window is unmissable. */
const ROW_COUNT = 4000;

const bigDiff = {
  path: 'pnpm-lock.yaml',
  oldPath: 'pnpm-lock.yaml',
  change: 'modified',
  binary: false,
  oldMode: null,
  newMode: null,
  hunks: [
    {
      oldStart: 1,
      oldLines: 1,
      newStart: 1,
      newLines: ROW_COUNT,
      heading: '',
      lines: Array.from({ length: ROW_COUNT }, (_, index) => ({
        kind: 'add',
        oldNo: null,
        newNo: index + 1,
        text: `  '@scope/package-${index}': 1.0.${index}`,
        ranges: [],
        noNewline: false,
      })),
    },
  ],
  insertions: ROW_COUNT,
  deletions: 0,
  contextLines: 3,
  combined: false,
  truncated: false,
  droppedLines: 0,
};

async function openBigDiff(page: Page): Promise<void> {
  const { installMockBridge } = await import('../mock-bridge');
  await installMockBridge(page, {
    ...fixtures,
    diffs: { ...fixtures.diffs, [`${COMMIT_SHA}:pnpm-lock.yaml`]: bigDiff },
  });
  await page.goto('/');

  await page.getByText('feat(phase-11): package, install and run from /Applications').click();
  await page.getByRole('button', { name: /pnpm-lock\.yaml/ }).click();
  await expect(page.getByTestId('diff-view')).toBeVisible();
}

test('the diff scroll stays inside its median-frame-gap budget', async ({ page }) => {
  await openBigDiff(page);

  /*
    Scroll inside the pane's own scroller, one step per animation frame, and
    record the gap between frames. Driving it from rAF rather than from
    Playwright's wheel events is what makes the numbers mean anything: a wheel
    event is delivered on the browser's own schedule, so the gaps would measure
    input dispatch as much as layout.
  */
  const frames = await page.evaluate(async (steps: number) => {
    const pane = document.querySelector('[data-testid="diff-view"] .overflow-auto');
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
    return { gaps, scrollTop: pane.scrollTop, rows: pane.querySelectorAll('[data-line-kind]').length };
  }, 60);

  expect(frames).not.toBeNull();
  if (frames === null) return;

  // It actually moved — a scroller that never scrolled would pass every timing
  // assertion below for the wrong reason.
  expect(frames.scrollTop).toBeGreaterThan(1000);

  // Still windowed at the far end of the scroll, not accumulating rows behind
  // itself. This is the measurement-loop symptom, and it is exact.
  expect(frames.rows).toBeLessThan(400);

  /*
    A median rather than a max, because a single 300ms hitch on a machine sharing
    a core is noise rather than a regression. The threshold now comes from
    `scripts/perf/budgets.json` instead of being a literal here — one number, read
    by this spec and by `bundle-report.mjs --assert`, rebaselined in one place.
  */
  const sorted = [...frames.gaps].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  // Printed unconditionally: the number is the point of the suite, and reading it
  // off a passing run is how the budget gets rebaselined without guesswork.
  console.log(`[perf] diff-scroll median frame gap: ${median.toFixed(1)} ms (budget ${budgets.diffScrollMedianGapMs} ms)`);
  expect(median).toBeLessThan(budgets.diffScrollMedianGapMs);
});
