import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useMetricsStore } from '../../store/metrics-store';
import { useUiStore } from '../../store/ui-store';
import { MonitorCluster } from './monitor-cluster';

describe('MonitorCluster', () => {
  beforeEach(() => {
    useMetricsStore.getState().reset();
    useUiStore.setState({ hiddenMetrics: [] });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders nothing when no metrics have arrived yet', () => {
    const { container } = render(<MonitorCluster />);
    expect(container.firstChild).toBeNull();
  });

  it('renders icons for all 4 metrics when values are present', () => {
    useMetricsStore.getState().push({
      at: Date.now(),
      cpu: 45,
      memory: 60,
      gpu: 30,
      disk: 75,
    });

    render(<MonitorCluster />);

    expect(screen.getByTestId('metric-icon-cpu')).toBeDefined();
    expect(screen.getByTestId('metric-icon-memory')).toBeDefined();
    expect(screen.getByTestId('metric-icon-gpu')).toBeDefined();
    expect(screen.getByTestId('metric-icon-disk')).toBeDefined();

    expect(screen.getByTestId('metric-cpu')).toBeDefined();
    expect(screen.getByTestId('metric-memory')).toBeDefined();
    expect(screen.getByTestId('metric-gpu')).toBeDefined();
    expect(screen.getByTestId('metric-disk')).toBeDefined();

    const cpuText = screen.getByText('45%');
    expect(cpuText.style.color).toBe('rgb(52, 148, 244)');
    const memText = screen.getByText('60%');
    expect(memText.style.color).toBe('rgb(187, 103, 228)');
  });

  it('shows tooltip on focus for metric', async () => {
    useMetricsStore.getState().push({
      at: Date.now(),
      cpu: 25,
      memory: 50,
      gpu: 15,
      disk: 80,
    });

    render(<MonitorCluster />);

    const cpuTrigger = screen.getByTestId('metric-cpu');
    fireEvent.focus(cpuTrigger);

    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip.textContent).toBe('CPU');
  });

  it('shows HDD tooltip on focus for disk metric', async () => {
    useMetricsStore.getState().push({
      at: Date.now(),
      cpu: 25,
      memory: 50,
      gpu: 15,
      disk: 80,
    });

    render(<MonitorCluster />);

    const diskTrigger = screen.getByTestId('metric-disk');
    fireEvent.focus(diskTrigger);

    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip.textContent).toBe('HDD');
  });
});
