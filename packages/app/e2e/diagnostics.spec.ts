import { expect, test, type Page } from '@playwright/test';

import { fixtures } from '../test-support/fixtures';
import { installMockBridge, type MockFixtures } from '../test-support/mock-bridge';

/**
 * The footer's diagnostics segment (Phase 18 Theme F).
 *
 * The parts worth an assembled app rather than a unit test are all about
 * *which* state renders: the four trust arms are four different footers, and
 * three of them look superficially similar enough that only running the thing
 * shows they are distinct. In particular the two states that must never be
 * confused — "trusted but never measured" and "measured, zero problems" — are
 * one boolean apart in the data and completely different claims to the user.
 */

/**
 * Theme F's shorthand over Theme E's fixture shape.
 *
 * E's mock models the trust grant the way the real store does — a record with a
 * command and a grant timestamp — which is right for the mock and noisy in a
 * spec whose subject is *which footer renders*. This translates the one thing
 * each test actually varies (the trust arm, and the result if there is one)
 * into that record, so a test reads as the state it is about.
 */
const COMMAND = {
  parser: 'eslint' as const,
  ecosystem: 'javascript' as const,
  command: 'node_modules/.bin/eslint',
  args: ['.', '--format', 'json'],
};

const DIAG = (over: {
  trust: 'no-command' | 'untrusted' | 'trusted' | 'command-changed';
  run?: unknown;
  candidates?: unknown[];
}): Partial<MockFixtures> => ({
  ...fixtures,
  diagnostics: {
    trust: {
      state: over.trust,
      // `no-command` is the only arm with nothing configured; every other arm
      // is a statement ABOUT a command, so it has to have one.
      command: over.trust === 'no-command' ? null : COMMAND,
      trustedAt: over.trust === 'trusted' ? 1_700_000_000_000 : null,
    },
    ...(over.run === undefined ? {} : { result: over.run }),
    ...(over.candidates === undefined ? {} : { candidates: over.candidates }),
  },
});

const ROWS = [
  {
    file: 'packages/app/src/features/graph/graph-row.tsx',
    line: 88,
    column: 12,
    severity: 'error' as const,
    ruleId: '@typescript-eslint/no-unsafe-assignment',
    message: 'Unsafe assignment of an `any` value.',
  },
  {
    file: 'packages/desktop/src/main/window.ts',
    line: 41,
    column: 3,
    severity: 'warning' as const,
    ruleId: 'no-console',
    message: 'Unexpected console statement.',
  },
];

async function open(page: Page, over: Partial<MockFixtures>): Promise<void> {
  await installMockBridge(page, { ...fixtures, ...over });
  await page.goto('/');
  await expect(page.getByTestId('status-bar')).toBeVisible();
}

test.describe('diagnostics segment', () => {
  /**
   * The one smoke test kept in Playwright for this view (Phase 82 Theme C).
   *
   * Every other test in this original describe block moved to
   * `diagnostics-segment.bridge.test.tsx` and
   * `monitor-page.bridge.test.tsx` — see the phase 82 PR body for the full
   * removed-test → replacement-test mapping. This one stays, exercising the
   * fullest interaction chain (enable → dialog → confirm → counts) against a
   * real browser and the real bridge, to prove the assembled app still wires
   * the footer, the confirm dialog and the query layer together correctly —
   * exactly the kind of wiring bug a jsdom mount of `DiagnosticsSegment`
   * alone cannot catch.
   */
  test('confirming runs it, and the segment becomes counts', async ({ page }) => {
    await open(page, DIAG({ trust: 'untrusted', run: { ok: true, errorCount: 3, warningCount: 7, rows: ROWS, withheld: 0, ranAt: 1_700_000_000_000, durationMs: 12 } }));
    await page.getByTestId('diagnostics-enable').click();
    await page.getByRole('button', { name: 'Enable and run' }).click();

    await expect(page.getByTestId('diag-errors')).toHaveText('3');
    await expect(page.getByTestId('diag-warnings')).toHaveText('7');
    await expect(page.getByTestId('diagnostics-enable')).toHaveCount(0);
  });
});

/**
 * The two shots Theme F is actually about.
 *
 * Both are states the phase doc argues for in prose, and prose is exactly where
 * a consent dialog is easiest to get wrong: "shows the command" is a sentence
 * anyone would sign off, and only the picture settles whether the command is
 * legible, whether the directory is beside it, and whether the warning reads as
 * a warning rather than as chrome.
 */
test.describe('phase 18 screenshots', () => {
  const SHOTS = '../../docs/screenshots/phase-18';

  test('the trust prompt, and the counts flyout', async ({ page }) => {
    await open(page, DIAG({ trust: 'untrusted' }));
    await page.getByTestId('diagnostics-enable').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('node_modules/.bin/eslint');
    // `toBeVisible()` ignores opacity — Phase 12 learned this the hard way, on
    // a shot of a sync strip that was still mid-fade and therefore not there.
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/diagnostics-trust-prompt.png` });

    await page.keyboard.press('Escape');
    await open(
      page,
      DIAG({
        trust: 'trusted',
        run: {
          ok: true,
          errorCount: 3,
          warningCount: 7,
          rows: ROWS,
          withheld: 0,
          // Recent, so the shot reads "4 minutes ago" rather than the
          // four-figure hour count a fixed epoch produces once the calendar
          // moves past it.
          ranAt: Date.now() - 4 * 60_000,
          durationMs: 812,
        },
      }),
    );
    await expect(page.getByTestId('diag-errors')).toBeVisible();
    await page.getByTestId('diagnostics-segment').click();
    await expect(page.getByTestId('diagnostics-segment-panel')).toBeVisible();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/diagnostics-flyout.png` });
  });
});
