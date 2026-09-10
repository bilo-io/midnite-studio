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
});
