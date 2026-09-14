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
      disk: 5,
      diskBytes: { used: 50_000_000_000, total: 1_000_000_000_000 },
    });

    const { container } = render(<MonitorFlyout />);

    expect(screen.getByText('CPU')).toBeDefined();
    expect(screen.getByText('RAM')).toBeDefined();
    expect(screen.getByText('GPU')).toBeDefined();
    expect(screen.getByText('HDD')).toBeDefined();

    // Verify icons exist inside legends and disk section
    const svgs = container.querySelectorAll('svg');
    expect(svgs.length).toBeGreaterThan(0);

    const diskLabel = screen.getByText('HDD').closest('span')!;
    const diskIcon = diskLabel.querySelector('svg')!;
    const diskValue = screen.getByText('50.0 GB / 1.0 TB');
    const diskGauge = screen.getByRole('meter', { name: 'Disk capacity used' });
    const diskBar = diskGauge.firstElementChild as HTMLElement;

    expect(diskLabel.style.color).toBe('rgb(62, 178, 52)');
    expect(diskIcon.style.color).toBe(diskLabel.style.color);
    expect(diskValue.style.color).toBe(diskLabel.style.color);
    expect(diskBar.style.backgroundColor).toBe(diskLabel.style.color);
  });
});
