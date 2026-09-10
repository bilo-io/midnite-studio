import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { fixtures } from '../../../../test-support/fixtures';
import type { MockFixtures } from '../../../../test-support/mock-bridge';
import { renderView } from '../../../../test-support/render';
import { MonitorCluster } from '../../monitor/monitor-cluster';
import { MonitorPage } from './monitor-page';

/**
 * Migrated from `e2e/diagnostics.spec.ts` (Phase 82 Theme C, wave 1) — the
 * two tests there that cross from the footer into the Settings ▸ Monitor &
 * Diagnostics page. The e2e spec reaches this page by clicking through the
 * title bar's Settings button; this file mounts `MonitorPage` directly
 * instead, which is the jsdom-portable equivalent of that navigation — both
 * `MonitorPage` and `MonitorCluster` read their state from the same global
 * `useUiStore`/`useMetricsStore` singletons and the same bridge queries the
 * real app wires them to, so mounting them side by side here reproduces the
 * cross-component behaviour (revoking trust, hiding a metric) without
 * needing the settings-panel chrome that gets you there in a real browser.
 */

const COMMAND = {
  parser: 'eslint' as const,
  ecosystem: 'javascript' as const,
  command: 'node_modules/.bin/eslint',
  args: ['.', '--format', 'json'],
};

const UI_STATE = { selectedRepoId: 'repo-1' };

afterEach(cleanup);

describe('MonitorPage, assembled through the real bridge', () => {
  it('shows the trusted command and can revoke it', async () => {
    const fx: MockFixtures = {
      ...fixtures,
      diagnostics: {
        trust: { state: 'trusted', command: COMMAND, trustedAt: 1_700_000_000_000 },
        result: {
          ok: true,
          errorCount: 1,
          warningCount: 0,
          rows: [],
          withheld: 0,
          ranAt: 1_700_000_000_000,
          durationMs: 12,
        },
      },
    };
    renderView(<MonitorPage />, { fixtures: fx, uiState: UI_STATE });

    // Consent you can no longer inspect is not much better than none.
    expect(await screen.findByText('node_modules/.bin/eslint . --format json')).toBeTruthy();
    fireEvent.click(screen.getByTestId('diag-revoke'));
    await waitFor(() => expect(screen.queryByTestId('diag-revoke')).toBeNull());
  });

  it("hiding a metric removes its footer readout, and leaves the others alone", async () => {
    const fx: MockFixtures = {
      ...fixtures,
      metricsSamples: [0, 1, 2].map((i) => ({
        at: 1_700_000_000_000 + i * 2_000,
        cpu: 30,
        memory: 50,
        gpu: 20,
        disk: 60,
      })),
    };
    renderView(
      <>
        <MonitorPage />
        <MonitorCluster />
      </>,
      { fixtures: fx, uiState: UI_STATE },
    );

    expect(await screen.findByTestId('metric-gpu')).toBeTruthy();

    fireEvent.click(screen.getByRole('checkbox', { name: 'GPU' }));

    await waitFor(() => expect(screen.queryByTestId('metric-gpu')).toBeNull());
    // The others are untouched — this is a per-metric preference, not a switch.
    expect(screen.getByTestId('metric-cpu')).toBeTruthy();
  });
});
