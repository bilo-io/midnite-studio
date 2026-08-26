import { expect, test, type Page } from '@playwright/test';

import { fixtures } from './fixtures';
import { installMockBridge, type MockFixtures } from './mock-bridge';

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
  await expect(page.locator('footer').filter({ hasText: 'Terminal' })).toBeVisible();
}

test.describe('diagnostics segment', () => {
  test('a repo with no linter shows nothing at all', async ({ page }) => {
    // Deliberately silent, unlike every other absent state in this feature: a
    // repository with no linter has no diagnostics to be broken, and an
    // "enable" button leading to "we found nothing" is worse than no button.
    await open(page, DIAG({ trust: 'no-command', candidates: [] }));
    await expect(page.getByTestId('diagnostics-enable')).toHaveCount(0);
    await expect(page.getByTestId('diagnostics-segment')).toHaveCount(0);
  });

  test('an untrusted repo offers to enable, rather than rendering nothing', async ({ page }) => {
    await open(page, DIAG({ trust: 'untrusted' }));
    const enable = page.getByTestId('diagnostics-enable');
    await expect(enable).toBeVisible();
    await expect(enable).toContainText('Enable diagnostics');
  });

  test('the trust prompt shows the literal command and the resolved directory', async ({
    page,
  }) => {
    // This is the app's first execution of code from a folder the user merely
    // opened. The only honest way to ask is to show exactly what runs, where.
    await open(page, DIAG({ trust: 'untrusted' }));
    await page.getByTestId('diagnostics-enable').click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('node_modules/.bin/eslint . --format json');
    await expect(dialog).toContainText('/tmp/midnite-git');
    await expect(dialog).toContainText('runs a program from the repository itself');
    // And it says WHY this command was offered — the detector's evidence.
    await expect(dialog).toContainText('eslint.config.mjs');
  });

  test('cancelling the prompt leaves diagnostics off', async ({ page }) => {
    await open(page, DIAG({ trust: 'untrusted' }));
    await page.getByTestId('diagnostics-enable').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');

    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByTestId('diagnostics-enable')).toBeVisible();
    // Nothing was executed on a prompt the user declined.
    expect(await page.evaluate(() => (window as never as { __mgitDiagRuns: () => number }).__mgitDiagRuns())).toBe(0);
  });

  test('confirming runs it, and the segment becomes counts', async ({ page }) => {
    await open(page, DIAG({ trust: 'untrusted', run: { ok: true, errorCount: 3, warningCount: 7, rows: ROWS, withheld: 0, ranAt: 1_700_000_000_000, durationMs: 12 } }));
    await page.getByTestId('diagnostics-enable').click();
    await page.getByRole('button', { name: 'Enable and run' }).click();

    await expect(page.getByTestId('diag-errors')).toHaveText('3');
    await expect(page.getByTestId('diag-warnings')).toHaveText('7');
    await expect(page.getByTestId('diagnostics-enable')).toHaveCount(0);
  });

  test('"command changed" is a different state from "never enabled"', async ({ page }) => {
    // The command you approved is not the command that would run now. Rendering
    // that the same as "you never enabled this" would quietly re-use consent
    // the user gave for something else.
    await open(page, DIAG({ trust: 'command-changed' }));
    const control = page.getByTestId('diagnostics-enable');
    await expect(control).toContainText('Diagnostics command changed');

    await control.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('not the command you approved');
    await expect(page.getByRole('button', { name: 'Run the new command' })).toBeVisible();
  });

  test('trusted but never measured is NOT a green zero', async ({ page }) => {
    // The trap `useWorktreeStatuses` documents: a query in flight reporting
    // every checkout clean. "No problems" is a claim, and you have to have
    // looked to make it.
    await open(page, DIAG({ trust: 'trusted', run: { ok: false, reason: 'no-command' } }));
    const segment = page.getByTestId('diagnostics-segment');
    await expect(segment).toContainText('not measured');
    await expect(segment).not.toContainText('No problems');
    await expect(page.getByTestId('diag-errors')).toHaveCount(0);
  });

  test('a genuinely clean repo says so', async ({ page }) => {
    await open(page, DIAG({ trust: 'trusted', run: { ok: true, errorCount: 0, warningCount: 0, rows: [], withheld: 0, ranAt: 1_700_000_000_000, durationMs: 12 } }));
    await expect(page.getByTestId('diagnostics-segment')).toContainText('No problems');
  });

  test('the flyout lists problems as file:line with rule and message', async ({ page }) => {
    await open(page, DIAG({ trust: 'trusted', run: { ok: true, errorCount: 1, warningCount: 1, rows: ROWS, withheld: 0, ranAt: 1_700_000_000_000, durationMs: 12 } }));
    await page.getByTestId('diagnostics-segment').click();

    const panel = page.getByTestId('diagnostics-segment-panel');
    await expect(panel).toContainText('packages/app/src/features/graph/graph-row.tsx:88:12');
    await expect(panel).toContainText('Unsafe assignment of an `any` value.');
    await expect(panel).toContainText('@typescript-eslint/no-unsafe-assignment');
  });

  test('a capped list says what it withheld', async ({ page }) => {
    // Phase 17's EXPAND_ALL_LIMIT rule: a cap is fine, a cap you cannot see is
    // a list that lies about its own length.
    await open(page, DIAG({ trust: 'trusted', run: { ok: true, errorCount: 900, warningCount: 100, rows: ROWS, withheld: 998, ranAt: 1_700_000_000_000, durationMs: 12 } }));
    await page.getByTestId('diagnostics-segment').click();

    const panel = page.getByTestId('diagnostics-segment-panel');
    await expect(panel).toContainText('Showing 2 of 1,000');
    await expect(panel).toContainText('998 not listed');
    // The COUNTS are still complete, even though the rows are not.
    await expect(page.getByTestId('diag-errors')).toHaveText('900');
  });

  test('a failure explains itself instead of showing a zero', async ({ page }) => {
    await open(page, DIAG({ trust: 'trusted', run: { ok: false, reason: 'timed-out' } }));
    await page.getByTestId('diagnostics-segment').click();
    await expect(page.getByTestId('diagnostics-segment-panel')).toContainText(
      'did not finish in time',
    );
  });

  test('the flyout says diagnostics do not re-run on file changes', async ({ page }) => {
    await open(page, DIAG({ trust: 'trusted', run: { ok: true, errorCount: 1, warningCount: 0, rows: ROWS, withheld: 0, ranAt: Date.now(), durationMs: 12 } }));
    await page.getByTestId('diagnostics-segment').click();
    await expect(page.getByTestId('diagnostics-segment-panel')).toContainText(
      'Does not re-run on file changes',
    );
  });

  test('the linter runs once for a trusted repo, not once per render', async ({ page }) => {
    await open(page, DIAG({ trust: 'trusted', run: { ok: true, errorCount: 1, warningCount: 0, rows: ROWS, withheld: 0, ranAt: 1_700_000_000_000, durationMs: 12 } }));
    await expect(page.getByTestId('diag-errors')).toBeVisible();

    // Open and close the flyout a few times: re-rendering is not re-measuring.
    for (let i = 0; i < 3; i += 1) {
      await page.getByTestId('diagnostics-segment').click();
      await page.keyboard.press('Escape');
    }
    expect(await page.evaluate(() => (window as never as { __mgitDiagRuns: () => number }).__mgitDiagRuns())).toBe(1);
  });

  test('Re-run measures again, on demand', async ({ page }) => {
    await open(page, DIAG({ trust: 'trusted', run: { ok: true, errorCount: 1, warningCount: 0, rows: ROWS, withheld: 0, ranAt: 1_700_000_000_000, durationMs: 12 } }));
    await page.getByTestId('diagnostics-segment').click();
    await page.getByRole('button', { name: 'Re-run' }).click();

    await expect
      .poll(() => page.evaluate(() => (window as never as { __mgitDiagRuns: () => number }).__mgitDiagRuns()))
      .toBe(2);
  });

  test('Disable revokes trust and takes the counts away with it', async ({ page }) => {
    // Leaving the last numbers on screen would keep showing the output of a
    // command the user just withdrew permission for.
    await open(page, DIAG({ trust: 'trusted', run: { ok: true, errorCount: 4, warningCount: 0, rows: ROWS, withheld: 0, ranAt: 1_700_000_000_000, durationMs: 12 } }));
    await page.getByTestId('diagnostics-segment').click();
    await page.getByRole('button', { name: 'Disable' }).click();

    await expect(page.getByTestId('diag-errors')).toHaveCount(0);
    await expect(page.getByTestId('diagnostics-enable')).toBeVisible();
  });

  test('the settings page shows the trusted command and can revoke it', async ({ page }) => {
    await open(page, DIAG({ trust: 'trusted', run: { ok: true, errorCount: 1, warningCount: 0, rows: ROWS, withheld: 0, ranAt: 1_700_000_000_000, durationMs: 12 } }));
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('button', { name: 'Monitor & Diagnostics' }).click();

    // Consent you can no longer inspect is not much better than none.
    await expect(page.getByText('node_modules/.bin/eslint . --format json')).toBeVisible();
    await page.getByTestId('diag-revoke').click();
    await expect(page.getByTestId('diag-revoke')).toHaveCount(0);
  });

  test('hiding a metric in settings removes its footer readout', async ({ page }) => {
    await open(page, {
      metricsSamples: [0, 1, 2].map((i) => ({
        at: 1_700_000_000_000 + i * 2_000,
        cpu: 30,
        memory: 50,
        gpu: 20,
        disk: 60,
      })),
    });
    await expect(page.getByTestId('metric-gpu')).toBeVisible();

    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('button', { name: 'Monitor & Diagnostics' }).click();
    await page.getByRole('checkbox', { name: 'GPU' }).uncheck();

    await expect(page.getByTestId('metric-gpu')).toHaveCount(0);
    // The others are untouched — this is a per-metric preference, not a switch.
    await expect(page.getByTestId('metric-cpu')).toBeVisible();
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
