import type { MidniteStudioBridge } from '@midnite/studio-shared';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useMetricsStore } from '../../../store/metrics-store';
import { OptimizerMetrics } from './optimizer-metrics';

/**
 * The Optimizer's System charts (adhoc: optimizer polish) — they read
 * `longSeries`, and they start the metrics stream themselves so a detached
 * Optimizer window (which has no status bar) still fills in.
 */

function installBridge() {
  const start = vi.fn();
  (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = {
    metrics: { onSample: vi.fn(() => () => {}), start, stop: vi.fn() },
  } as unknown as Partial<MidniteStudioBridge>;
  return { start };
}

afterEach(() => {
  cleanup();
  delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
  useMetricsStore.getState().reset();
});

describe('OptimizerMetrics', () => {
  it('says it is waiting rather than drawing an empty box', () => {
    installBridge();
    useMetricsStore.getState().reset();
    render(<OptimizerMetrics metrics={['cpu', 'memory']} />);

    expect(screen.getByText('Waiting for the first sample…')).toBeTruthy();
  });

  it('drives the metrics stream itself', () => {
    const { start } = installBridge();
    render(<OptimizerMetrics metrics={['cpu']} />);

    expect(start).toHaveBeenCalled();
  });

  it('charts the long window, and names it', () => {
    installBridge();
    useMetricsStore.getState().push({ at: 1_000, cpu: 40 });
    useMetricsStore.getState().push({ at: 3_000, cpu: 60 });
    render(<OptimizerMetrics metrics={['cpu']} />);

    expect(screen.getByRole('img', { name: 'CPU over the last 15 minutes' })).toBeTruthy();
    expect(screen.getByText('last 15 minutes')).toBeTruthy();
  });

  it('names a metric this machine cannot read instead of drawing a flat zero', () => {
    installBridge();
    useMetricsStore.getState().push({ at: 1_000, cpu: 40 });
    render(<OptimizerMetrics metrics={['cpu', 'gpu']} />);

    expect(screen.getByText('Not readable on this machine: GPU')).toBeTruthy();
  });

  it('stops waiting once a sample proves the metric is simply unreadable', () => {
    installBridge();
    // A sample with no GPU field at all — a machine whose GPU counter cannot
    // be read. The GPU tab asks for exactly this one metric, so "waiting"
    // would never resolve.
    useMetricsStore.getState().push({ at: 1_000, cpu: 40 });
    render(<OptimizerMetrics metrics={['gpu']} />);

    expect(screen.queryByText('Waiting for the first sample…')).toBeNull();
    expect(screen.getByText('Not readable on this machine: GPU')).toBeTruthy();
  });

  it('draws disk as a capacity meter, never as a fourth chart', () => {
    installBridge();
    useMetricsStore.getState().push({ at: 1_000, cpu: 40, disk: 72 });
    render(<OptimizerMetrics metrics={['cpu']} showDisk />);

    const meter = screen.getByRole('meter', { name: 'Disk capacity used' });
    expect(meter.getAttribute('aria-valuenow')).toBe('72');
    expect(screen.queryByRole('img', { name: /HDD over/ })).toBeNull();
  });
});
