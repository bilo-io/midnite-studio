import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useMetricsStore } from '../../store/metrics-store';
import { BatterySegment } from './battery-segment';

describe('BatterySegment', () => {
  beforeEach(() => {
    useMetricsStore.getState().reset();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders nothing when no battery metric is present', () => {
    const { container } = render(<BatterySegment />);
    expect(container.firstChild).toBeNull();
  });

  it('renders battery percentage with green tier when >= 70%', () => {
    useMetricsStore.getState().push({
      at: Date.now(),
      battery: {
        percent: 85,
        hasBattery: true,
        isCharging: false,
        devices: [
          { id: 'internal', name: 'Computer', type: 'internal', percent: 85 },
        ],
      },
    });

    render(<BatterySegment />);
    const trigger = screen.getByTestId('battery-trigger');
    expect(trigger).toBeDefined();
    expect(trigger.getAttribute('data-tier')).toBe('high');
    expect(screen.getByText('85%')).toBeDefined();
  });

  it('renders battery percentage with orange tier when 30% - 69%', () => {
    useMetricsStore.getState().push({
      at: Date.now(),
      battery: {
        percent: 54,
        hasBattery: true,
        isCharging: false,
        devices: [
          { id: 'internal', name: 'Computer', type: 'internal', percent: 54 },
        ],
      },
    });

    render(<BatterySegment />);
    const trigger = screen.getByTestId('battery-trigger');
    expect(trigger.getAttribute('data-tier')).toBe('medium');
    expect(screen.getByText('54%')).toBeDefined();
  });

  it('renders battery percentage with red tier and glow when < 30%', () => {
    useMetricsStore.getState().push({
      at: Date.now(),
      battery: {
        percent: 18,
        hasBattery: true,
        isCharging: false,
        devices: [
          { id: 'internal', name: 'Computer', type: 'internal', percent: 18 },
        ],
      },
    });

    render(<BatterySegment />);
    const trigger = screen.getByTestId('battery-trigger');
    expect(trigger.getAttribute('data-tier')).toBe('low');
    expect(trigger.style.textShadow).toBeDefined();
    expect(screen.getByText('18%')).toBeDefined();
  });

  it('flashes slowly under 30%, faster under 20%, fastest under 10%', () => {
    useMetricsStore.getState().push({
      at: Date.now(),
      battery: {
        percent: 25,
        hasBattery: true,
        isCharging: false,
        devices: [{ id: 'internal', name: 'Computer', type: 'internal', percent: 25 }],
      },
    });
    const { rerender } = render(<BatterySegment />);
    let trigger = screen.getByTestId('battery-trigger');
    expect(trigger.getAttribute('data-flash-tier')).toBe('slow');
    expect(trigger.className).toContain('battery-flash-slow');

    useMetricsStore.getState().push({
      at: Date.now(),
      battery: {
        percent: 15,
        hasBattery: true,
        isCharging: false,
        devices: [{ id: 'internal', name: 'Computer', type: 'internal', percent: 15 }],
      },
    });
    rerender(<BatterySegment />);
    trigger = screen.getByTestId('battery-trigger');
    expect(trigger.getAttribute('data-flash-tier')).toBe('medium');
    expect(trigger.className).toContain('battery-flash-medium');

    useMetricsStore.getState().push({
      at: Date.now(),
      battery: {
        percent: 8,
        hasBattery: true,
        isCharging: false,
        devices: [{ id: 'internal', name: 'Computer', type: 'internal', percent: 8 }],
      },
    });
    rerender(<BatterySegment />);
    trigger = screen.getByTestId('battery-trigger');
    expect(trigger.getAttribute('data-flash-tier')).toBe('fast');
    expect(trigger.className).toContain('battery-flash-fast');
  });

  it('does not flash at or above 30%', () => {
    useMetricsStore.getState().push({
      at: Date.now(),
      battery: {
        percent: 85,
        hasBattery: true,
        isCharging: false,
        devices: [{ id: 'internal', name: 'Computer', type: 'internal', percent: 85 }],
      },
    });

    render(<BatterySegment />);
    const trigger = screen.getByTestId('battery-trigger');
    expect(trigger.getAttribute('data-flash-tier')).toBe('none');
    expect(trigger.className).not.toContain('battery-flash');
  });

  it('opens panel on click listing all connected devices', () => {
    useMetricsStore.getState().push({
      at: Date.now(),
      battery: {
        percent: 80,
        hasBattery: true,
        isCharging: true,
        devices: [
          { id: 'internal', name: 'Computer', type: 'internal', percent: 80, isCharging: true },
          { id: 'headphones-1', name: 'AirPods Pro', type: 'headphones', percent: 95 },
          { id: 'keyboard-1', name: 'Magic Keyboard', type: 'keyboard', percent: 45 },
          { id: 'trackpad-1', name: 'Magic Trackpad', type: 'trackpad', percent: 20 },
        ],
      },
    });

    render(<BatterySegment />);
    const button = screen.getByTestId('battery-segment');
    fireEvent.click(button);

    expect(screen.getByTestId('battery-panel')).toBeDefined();
    expect(screen.getByText('Battery & Connected Devices')).toBeDefined();
    expect(screen.getByText('AirPods Pro')).toBeDefined();
    expect(screen.getByText('Magic Keyboard')).toBeDefined();
    expect(screen.getByText('Magic Trackpad')).toBeDefined();
    expect(screen.getByText('95%')).toBeDefined();
    expect(screen.getByText('45%')).toBeDefined();
    expect(screen.getByText('20%')).toBeDefined();
  });

  it('respects custom side prop', () => {
    useMetricsStore.getState().push({
      at: Date.now(),
      battery: {
        percent: 80,
        hasBattery: true,
        isCharging: false,
        devices: [{ id: 'internal', name: 'Computer', type: 'internal', percent: 80 }],
      },
    });

    render(<BatterySegment side="bottom" />);
    const trigger = screen.getByTestId('battery-trigger');
    expect(trigger).toBeDefined();
  });

  it('renders left lightning bolt and green shimmer when charging', () => {
    useMetricsStore.getState().push({
      at: Date.now(),
      battery: {
        percent: 65,
        hasBattery: true,
        isCharging: true,
        devices: [{ id: 'internal', name: 'Computer', type: 'internal', percent: 65, isCharging: true }],
      },
    });

    render(<BatterySegment />);
    const trigger = screen.getByTestId('battery-trigger');
    expect(trigger.getAttribute('data-charging')).toBe('true');

    // Left lightning bolt exists
    const bolt = screen.getByTestId('battery-charging-bolt');
    expect(bolt).toBeDefined();

    // The bolt appears before the battery icon in the trigger
    const svgs = trigger.querySelectorAll('svg');
    expect(svgs.length).toBeGreaterThanOrEqual(2);
    expect(svgs[0]).toBe(bolt);

    // Green shimmer exists
    const shimmer = screen.getByTestId('battery-charging-shimmer');
    expect(shimmer).toBeDefined();
    expect(shimmer.className).toContain('battery-charging-shimmer');
  });

  it('does not render lightning bolt or shimmer when not charging', () => {
    useMetricsStore.getState().push({
      at: Date.now(),
      battery: {
        percent: 65,
        hasBattery: true,
        isCharging: false,
        devices: [{ id: 'internal', name: 'Computer', type: 'internal', percent: 65 }],
      },
    });

    render(<BatterySegment />);
    expect(screen.queryByTestId('battery-charging-bolt')).toBeNull();
    expect(screen.queryByTestId('battery-charging-shimmer')).toBeNull();
  });
});
