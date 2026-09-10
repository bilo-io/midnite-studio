import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { DiagnosticsCommand } from '@midnite/studio-shared';

import { fixtures } from '../../../test-support/fixtures';
import type { MockFixtures } from '../../../test-support/mock-bridge';
import { renderView } from '../../../test-support/render';
import { DiagnosticsSegment } from './diagnostics-segment';

/**
 * Phase 82 Theme B's harness proof — modelled on `e2e/diagnostics.spec.ts`
 * (18 tests, sampled 100% jsdom-portable: no computed CSS, no
 * `getBoundingClientRect`, no pointer drag, nothing this file's own
 * `renderView` + `buildMockBridge` stack cannot reproduce under jsdom).
 *
 * Unlike `diagnostics-segment.test.tsx` beside this file — which mocks every
 * `services/queries` hook individually to pin exact class names and colour
 * tokens — this file goes through the REAL `services/queries` hooks, the
 * real `bridge()`, and the same `MockFixtures` shape an e2e spec would pass
 * to `installMockBridge`. That is the whole point: proving a spec can move
 * from `e2e/` to here as a *data* change (the same `DIAG()`-shaped fixture,
 * the same assertions) rather than a rewrite onto hand-mocked hooks.
 *
 * Deliberately does NOT delete `e2e/diagnostics.spec.ts` — Theme C owns the
 * migration waves. This test existing alongside the untouched e2e spec,
 * temporarily asserting the same things twice, is what proves the harness
 * carries real work rather than merely compiling.
 */

const COMMAND: DiagnosticsCommand = {
  parser: 'eslint',
  ecosystem: 'javascript',
  command: 'node_modules/.bin/eslint',
  args: ['.', '--format', 'json'],
};

/** The e2e spec's own `DIAG()` shorthand, restated here for the same reason it exists there. */
function diag(over: {
  trust: 'no-command' | 'untrusted' | 'trusted' | 'command-changed';
  run?: unknown;
  candidates?: unknown[];
}): MockFixtures {
  return {
    ...fixtures,
    diagnostics: {
      trust: {
        state: over.trust,
        command: over.trust === 'no-command' ? null : COMMAND,
        trustedAt: over.trust === 'trusted' ? 1_700_000_000_000 : null,
      },
      ...(over.run === undefined ? {} : { result: over.run }),
      ...(over.candidates === undefined ? {} : { candidates: over.candidates }),
    },
  };
}

/** Every test in this file looks at `repo-1` — `useActiveWorktree()`'s only input. */
const UI_STATE = { selectedRepoId: 'repo-1' };

afterEach(cleanup);

describe('DiagnosticsSegment, assembled through the real bridge', () => {
  it('a repo with no linter shows nothing at all', async () => {
    renderView(<DiagnosticsSegment />, {
      fixtures: diag({ trust: 'no-command', candidates: [] }),
      uiState: UI_STATE,
    });

    // `trust.isLoading` is true for one tick — give the query a chance to
    // settle before asserting the steady state is genuinely silent.
    await waitFor(() => expect(screen.queryByTestId('diagnostics-enable')).toBeNull());
    expect(screen.queryByTestId('diagnostics-segment')).toBeNull();
  });

  it('an untrusted repo offers to enable, rather than rendering nothing', async () => {
    renderView(<DiagnosticsSegment />, {
      fixtures: diag({ trust: 'untrusted' }),
      uiState: UI_STATE,
    });

    const enable = await screen.findByTestId('diagnostics-enable');
    expect(enable.textContent).toContain('Enable diagnostics');
  });

  it('confirming runs it, and the segment becomes counts', async () => {
    renderView(<DiagnosticsSegment />, {
      fixtures: diag({
        trust: 'untrusted',
        run: {
          ok: true,
          errorCount: 3,
          warningCount: 7,
          rows: [],
          withheld: 0,
          ranAt: 1_700_000_000_000,
          durationMs: 12,
        },
      }),
      uiState: UI_STATE,
    });

    fireEvent.click(await screen.findByTestId('diagnostics-enable'));
    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toContain('node_modules/.bin/eslint . --format json');

    fireEvent.click(screen.getByRole('button', { name: 'Enable and run' }));

    expect((await screen.findByTestId('diag-errors')).textContent).toBe('3');
    expect(screen.getByTestId('diag-warnings').textContent).toBe('7');
    expect(screen.queryByTestId('diagnostics-enable')).toBeNull();
  });

  it('trusted but never measured is NOT a green zero', async () => {
    renderView(<DiagnosticsSegment />, {
      fixtures: diag({ trust: 'trusted', run: { ok: false, reason: 'no-command' } }),
      uiState: UI_STATE,
    });

    const segment = await screen.findByTestId('diagnostics-segment');
    expect(segment.textContent).toContain('not measured');
    expect(segment.textContent).not.toContain('No problems');
    expect(screen.queryByTestId('diag-errors')).toBeNull();
  });

  it('a genuinely clean repo says so', async () => {
    renderView(<DiagnosticsSegment />, {
      fixtures: diag({
        trust: 'trusted',
        run: {
          ok: true,
          errorCount: 0,
          warningCount: 0,
          rows: [],
          withheld: 0,
          ranAt: 1_700_000_000_000,
          durationMs: 12,
        },
      }),
      uiState: UI_STATE,
    });

    expect((await screen.findByTestId('diagnostics-segment')).textContent).toContain('No problems');
  });

  it('the flyout lists problems as file:line with rule and message', async () => {
    const rows = [
      {
        file: 'packages/app/src/features/graph/graph-row.tsx',
        line: 88,
        column: 12,
        severity: 'error' as const,
        ruleId: '@typescript-eslint/no-unsafe-assignment',
        message: 'Unsafe assignment of an `any` value.',
      },
    ];
    renderView(<DiagnosticsSegment />, {
      fixtures: diag({
        trust: 'trusted',
        run: {
          ok: true,
          errorCount: 1,
          warningCount: 0,
          rows,
          withheld: 0,
          ranAt: 1_700_000_000_000,
          durationMs: 12,
        },
      }),
      uiState: UI_STATE,
    });

    fireEvent.click(await screen.findByTestId('diagnostics-segment'));

    const panel = await screen.findByTestId('diagnostics-segment-panel');
    expect(panel.textContent).toContain('packages/app/src/features/graph/graph-row.tsx:88:12');
    expect(panel.textContent).toContain('Unsafe assignment of an `any` value.');
    expect(panel.textContent).toContain('@typescript-eslint/no-unsafe-assignment');
  });

  // --- migrated from e2e/diagnostics.spec.ts (Phase 82 Theme C, wave 1) -----

  it('the trust prompt shows the literal command and the resolved directory', async () => {
    // This is the app's first execution of code from a folder the user
    // merely opened. The only honest way to ask is to show exactly what
    // runs, where, and why the command was even proposed (the detector's
    // own evidence — `DEFAULT_CANDIDATES` in the mock bridge).
    renderView(<DiagnosticsSegment />, {
      fixtures: diag({ trust: 'untrusted' }),
      uiState: UI_STATE,
    });

    await screen.findByTestId('diagnostics-enable');
    // `askToEnable` reads `useDiagCandidates`'s data at click time (to cite
    // its evidence in the dialog body) rather than reactively, so the click
    // has to be retried until that query has actually settled — unlike the
    // button itself, which renders whether or not the candidates have
    // arrived. Re-clicking is harmless: each click just replaces `confirm`
    // with an equivalent object once the data is the same.
    await waitFor(() => {
      fireEvent.click(screen.getByTestId('diagnostics-enable'));
      expect(screen.getByRole('dialog').textContent).toContain('eslint.config.mjs');
    });

    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toContain('node_modules/.bin/eslint . --format json');
    expect(dialog.textContent).toContain('/tmp/midnite-studio');
    expect(dialog.textContent).toContain('runs a program from the repository itself');
  });

  it('cancelling the prompt leaves diagnostics off', async () => {
    renderView(<DiagnosticsSegment />, {
      fixtures: diag({ trust: 'untrusted' }),
      uiState: UI_STATE,
    });

    fireEvent.click(await screen.findByTestId('diagnostics-enable'));
    expect(await screen.findByRole('dialog')).toBeTruthy();
    // The shared dismissal stack (`use-dismiss.ts`) listens on `window`.
    fireEvent.keyDown(window, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByTestId('diagnostics-enable')).toBeTruthy();
    // Nothing was executed on a prompt the user declined.
    expect((window as unknown as { __mstudioDiagRuns: () => number }).__mstudioDiagRuns()).toBe(0);
  });

  it('"command changed" is a different state from "never enabled"', async () => {
    // The command you approved is not the command that would run now.
    // Rendering that the same as "you never enabled this" would quietly
    // re-use consent the user gave for something else.
    renderView(<DiagnosticsSegment />, {
      fixtures: diag({ trust: 'command-changed' }),
      uiState: UI_STATE,
    });

    const control = await screen.findByTestId('diagnostics-enable');
    expect(control.textContent).toContain('Diagnostics command changed');

    fireEvent.click(control);
    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toContain('not the command you approved');
    expect(screen.getByRole('button', { name: 'Run the new command' })).toBeTruthy();
  });

  it('a capped list says what it withheld', async () => {
    // Phase 17's EXPAND_ALL_LIMIT rule: a cap is fine, a cap you cannot see
    // is a list that lies about its own length.
    const rows = [
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
    renderView(<DiagnosticsSegment />, {
      fixtures: diag({
        trust: 'trusted',
        run: {
          ok: true,
          errorCount: 900,
          warningCount: 100,
          rows,
          withheld: 998,
          ranAt: 1_700_000_000_000,
          durationMs: 12,
        },
      }),
      uiState: UI_STATE,
    });

    fireEvent.click(await screen.findByTestId('diagnostics-segment'));

    const panel = await screen.findByTestId('diagnostics-segment-panel');
    expect(panel.textContent).toContain('Showing 2 of 1,000');
    expect(panel.textContent).toContain('998 not listed');
    // The COUNTS are still complete, even though the rows are not.
    expect(screen.getByTestId('diag-errors').textContent).toBe('900');
  });

  it('a failure explains itself instead of showing a zero', async () => {
    renderView(<DiagnosticsSegment />, {
      fixtures: diag({ trust: 'trusted', run: { ok: false, reason: 'timed-out' } }),
      uiState: UI_STATE,
    });

    fireEvent.click(await screen.findByTestId('diagnostics-segment'));
    const panel = await screen.findByTestId('diagnostics-segment-panel');
    expect(panel.textContent).toContain('did not finish in time');
  });

  it('the flyout says diagnostics do not re-run on file changes', async () => {
    renderView(<DiagnosticsSegment />, {
      fixtures: diag({
        trust: 'trusted',
        run: {
          ok: true,
          errorCount: 1,
          warningCount: 0,
          rows: [],
          withheld: 0,
          ranAt: Date.now(),
          durationMs: 12,
        },
      }),
      uiState: UI_STATE,
    });

    fireEvent.click(await screen.findByTestId('diagnostics-segment'));
    const panel = await screen.findByTestId('diagnostics-segment-panel');
    expect(panel.textContent).toContain('Does not re-run on file changes');
  });

  it('the linter runs once for a trusted repo, not once per render', async () => {
    renderView(<DiagnosticsSegment />, {
      fixtures: diag({
        trust: 'trusted',
        run: {
          ok: true,
          errorCount: 1,
          warningCount: 0,
          rows: [],
          withheld: 0,
          ranAt: 1_700_000_000_000,
          durationMs: 12,
        },
      }),
      uiState: UI_STATE,
    });
    await screen.findByTestId('diag-errors');

    // Open and close the flyout a few times: re-rendering is not re-measuring.
    for (let i = 0; i < 3; i += 1) {
      fireEvent.click(screen.getByTestId('diagnostics-segment'));
      fireEvent.keyDown(window, { key: 'Escape' });
    }
    expect((window as unknown as { __mstudioDiagRuns: () => number }).__mstudioDiagRuns()).toBe(1);
  });

  it('Re-run measures again, on demand', async () => {
    renderView(<DiagnosticsSegment />, {
      fixtures: diag({
        trust: 'trusted',
        run: {
          ok: true,
          errorCount: 1,
          warningCount: 0,
          rows: [],
          withheld: 0,
          ranAt: 1_700_000_000_000,
          durationMs: 12,
        },
      }),
      uiState: UI_STATE,
    });

    fireEvent.click(await screen.findByTestId('diagnostics-segment'));
    fireEvent.click(screen.getByRole('button', { name: 'Re-run' }));

    await waitFor(() =>
      expect(
        (window as unknown as { __mstudioDiagRuns: () => number }).__mstudioDiagRuns(),
      ).toBe(2),
    );
  });

  it('Disable revokes trust and takes the counts away with it', async () => {
    // Leaving the last numbers on screen would keep showing the output of a
    // command the user just withdrew permission for.
    renderView(<DiagnosticsSegment />, {
      fixtures: diag({
        trust: 'trusted',
        run: {
          ok: true,
          errorCount: 4,
          warningCount: 0,
          rows: [],
          withheld: 0,
          ranAt: 1_700_000_000_000,
          durationMs: 12,
        },
      }),
      uiState: UI_STATE,
    });

    fireEvent.click(await screen.findByTestId('diagnostics-segment'));
    fireEvent.click(screen.getByRole('button', { name: 'Disable' }));

    await waitFor(() => expect(screen.queryByTestId('diag-errors')).toBeNull());
    expect(await screen.findByTestId('diagnostics-enable')).toBeTruthy();
  });
});
