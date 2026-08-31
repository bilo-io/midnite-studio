import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useMetricsStore } from '../../store/metrics-store';
import { MonitorFlyout } from './monitor-flyout';

describe('MonitorFlyout', () => {
  beforeEach(() => {
    useMetricsStore.getState().reset();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders metric icons in legends and gauge', () => {
    useMetricsStore.getState().push({
      at: Date.now(),
      cpu: 45,
      memory: 60,
      gpu: 30,
      disk: 75,
      diskBytes: { used: 750_000_000_000, total: 1_000_000_000_000 },
    });

    const { container } = render(<MonitorFlyout />);

    expect(screen.getByText('CPU')).toBeDefined();
    expect(screen.getByText('RAM')).toBeDefined();
    expect(screen.getByText('GPU')).toBeDefined();
    expect(screen.getByText('HDD')).toBeDefined();

    // Verify icons exist inside legends and disk section
    const svgs = container.querySelectorAll('svg');
    expect(svgs.length).toBeGreaterThan(0);
  });
});
