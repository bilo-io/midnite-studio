import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useMetricsStore } from '../../../metrics/metrics-store';
import { useMonitorPrefsStore } from '../../../prefs/monitor-prefs-store';
import { createMonitorSegment } from './monitor-cluster';

function setup() {
  const openMonitor = vi.fn();
  const Flyout = ({ onOpenMonitor }: { onOpenMonitor: () => void }) => (
    <button type="button" onClick={onOpenMonitor}>
      Open Monitor
    </button>
  );
  const MonitorCluster = createMonitorSegment({ Flyout, openMonitor });
  const view = render(<MonitorCluster />);
  return { openMonitor, ...view };
}

describe('the frame monitor segment', () => {
  beforeEach(() => {
    useMetricsStore.getState().reset();
    useMonitorPrefsStore.setState({ hiddenMetrics: [] });
  });
  afterEach(cleanup);

  it('renders nothing before the first sample', () => {
    const { container } = setup();
    expect(container.firstChild).toBeNull();
  });

  it('renders a readout once one sample arrives', () => {
    useMetricsStore.getState().push({ at: Date.now(), cpu: 45 });
    setup();
    expect(screen.getByTestId('metric-icon-cpu')).toBeDefined();
    expect(screen.getByText('45%')).toBeDefined();
    // a metric the machine cannot report has no readout at all
    expect(screen.queryByTestId('metric-gpu')).toBeNull();
  });

  it('draws every reported metric, disk as a ring and the rest as sparklines', () => {
    useMetricsStore.getState().push({ at: Date.now(), cpu: 45, memory: 60, gpu: 30, disk: 75 });
    setup();
    expect(screen.getByTestId('monitor-cluster').querySelectorAll('[data-status-bar-graph]')).toHaveLength(4);
    expect(screen.getByTestId('metric-disk').querySelectorAll('circle')).toHaveLength(2);
  });

  it('leaves out a metric the suite prefs hide', () => {
    useMetricsStore.getState().push({ at: Date.now(), cpu: 45, memory: 60 });
    useMonitorPrefsStore.getState().toggleMetric('memory');
    setup();
    expect(screen.getByTestId('metric-cpu')).toBeDefined();
    expect(screen.queryByTestId('metric-memory')).toBeNull();
  });

  it('closes the flyout and calls the hand-off from Open Monitor', async () => {
    useMetricsStore.getState().push({ at: Date.now(), cpu: 45 });
    const { openMonitor } = setup();
    fireEvent.click(screen.getByTestId('monitor-cluster'));
    fireEvent.click(await screen.findByRole('button', { name: 'Open Monitor' }));
    expect(openMonitor).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Open Monitor' })).toBeNull();
  });
});
