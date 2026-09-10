import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useMetricsStore } from '../../store/metrics-store';
import { BatterySegment } from './battery-segment';

/**
 * Migrated from `e2e/battery-widget.spec.ts` (Phase 82 Theme C, wave 5) — the
 * three tier colour bands (green >70%, orange 30-69%, red <30%) and the
 * click-to-open popover listing every connected device. All 4 of the
 * original tests moved here; none stay in Playwright.
 *
 * `BatterySegment` reads `useMetricsStore` directly rather than through the
 * bridge/fixtures machinery — the same thing `battery-titlebar.test.tsx`
 * (beside it) already establishes for `TitleBarBattery`, one layer up. The
 * e2e original seeded a sample via the mock bridge's `metricsSamples`
 * fixture and let `useMetricsStream`'s `onSample` subscription push it into
 * the store; here the store is fed directly with `.push()`, which is the
 * exact same write that subscription performs, so nothing about the
 * component's own reaction is weakened. `useMetricsStream`'s own effects
 * both guard on `bridge()` returning non-null and no-op otherwise, so no
 * bridge/fixtures setup is needed at all.
 *
 * No `React.lazy` boundary anywhere in this path.
 */

const sample = (battery: Record<string, unknown>) => ({
  at: Date.now(),
  battery,
});

beforeEach(() => {
  useMetricsStore.getState().reset();
});

afterEach(cleanup);

describe('BatterySegment, assembled through the real store', () => {
  it('renders green tier when battery is above 70%', () => {
    useMetricsStore.getState().push(
      sample({
        percent: 85,
        hasBattery: true,
        isCharging: false,
        devices: [{ id: 'internal', name: 'Computer', type: 'internal', percent: 85 }],
      }),
    );
    render(<BatterySegment />);

    const trigger = screen.getByTestId('battery-trigger');
    expect(trigger).toBeTruthy();
    expect(trigger.getAttribute('data-tier')).toBe('high');
    expect(screen.getByTestId('battery-segment').textContent).toContain('85%');
  });

  it('renders orange tier when battery is between 30% and 69%', () => {
    useMetricsStore.getState().push(
      sample({
        percent: 45,
        hasBattery: true,
        isCharging: false,
        devices: [{ id: 'internal', name: 'Computer', type: 'internal', percent: 45 }],
      }),
    );
    render(<BatterySegment />);

    const trigger = screen.getByTestId('battery-trigger');
    expect(trigger).toBeTruthy();
    expect(trigger.getAttribute('data-tier')).toBe('medium');
    expect(screen.getByTestId('battery-segment').textContent).toContain('45%');
  });

  it('renders red tier with glow when battery is below 30%', () => {
    useMetricsStore.getState().push(
      sample({
        percent: 20,
        hasBattery: true,
        isCharging: false,
        devices: [{ id: 'internal', name: 'Computer', type: 'internal', percent: 20 }],
      }),
    );
    render(<BatterySegment />);

    const trigger = screen.getByTestId('battery-trigger');
    expect(trigger).toBeTruthy();
    expect(trigger.getAttribute('data-tier')).toBe('low');
    expect(screen.getByTestId('battery-segment').textContent).toContain('20%');
  });

  it('clicking battery in title bar opens popover listing all connected devices', () => {
    useMetricsStore.getState().push(
      sample({
        percent: 85,
        hasBattery: true,
        isCharging: true,
        devices: [
          { id: 'internal', name: 'MacBook Pro', type: 'internal', percent: 85, isCharging: true },
          { id: 'headphones-1', name: 'AirPods Pro', type: 'headphones', percent: 90 },
          { id: 'keyboard-1', name: 'Magic Keyboard', type: 'keyboard', percent: 60 },
          { id: 'trackpad-1', name: 'Magic Trackpad', type: 'trackpad', percent: 25 },
        ],
      }),
    );
    render(<BatterySegment />);

    const triggerBtn = screen.getByTestId('battery-segment');
    fireEvent.click(triggerBtn);

    const panel = screen.getByTestId('battery-panel');
    expect(panel).toBeTruthy();
    const panelText = within(panel);
    expect(panelText.getByText('Battery & Connected Devices')).toBeTruthy();
    expect(panelText.getByText('MacBook Pro')).toBeTruthy();
    expect(panelText.getByText('AirPods Pro')).toBeTruthy();
    expect(panelText.getByText('Magic Keyboard')).toBeTruthy();
    expect(panelText.getByText('Magic Trackpad')).toBeTruthy();
  });
});
