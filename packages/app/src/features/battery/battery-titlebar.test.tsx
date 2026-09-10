import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useMetricsStore } from '../../store/metrics-store';
import { TitleBarBattery } from './battery-titlebar';

describe('TitleBarBattery', () => {
  beforeEach(() => {
    useMetricsStore.getState().reset();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders nothing when no battery is present', () => {
    const { container } = render(<TitleBarBattery />);
    expect(container.firstChild).toBeNull();
  });

  it('renders battery segment and separator when battery is present', () => {
    useMetricsStore.getState().push({
      at: Date.now(),
      battery: {
        percent: 85,
        hasBattery: true,
        isCharging: false,
        devices: [{ id: 'internal', name: 'Computer', type: 'internal', percent: 85 }],
      },
    });

    render(<TitleBarBattery />);
    expect(screen.getByTestId('battery-segment')).toBeDefined();
    expect(screen.getByText('85%')).toBeDefined();
  });
});
