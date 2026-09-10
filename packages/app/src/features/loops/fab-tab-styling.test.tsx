import { DEFAULT_LOOPS } from '@midnite/studio-shared';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FabPanel } from '../../components/fab-panel';
import { useUiStore } from '../../store/ui-store';
import type { LoopStatus } from './loop-status';

const IDLE: LoopStatus = {
  sessionId: undefined,
  phase: undefined,
  activity: undefined,
  running: false,
  waiting: false,
  thinking: false,
};

let statuses: LoopStatus[] = DEFAULT_LOOPS.map(() => IDLE);

vi.mock('./loop-status', () => ({
  useAllLoopStatuses: () => statuses,
  useLoopStatus: () => IDLE,
}));

vi.mock('./use-loop-runs', () => ({
  useLoopRuns: () => ({ data: [] }),
}));

vi.mock('./loop-tab', () => ({
  LoopTab: () => <div data-testid="mock-loop-tab" />,
}));

vi.mock('../../lib/use-window-focus-gate', () => ({
  useWindowFocusGate: () => undefined,
}));

vi.mock('../../services/bridge', () => ({
  bridge: () => ({
    windowRole: 'main',
    window: { detach: vi.fn() },
    terminal: { list: vi.fn().mockResolvedValue({ sessions: [] }) },
  }),
}));

const at = (id: string, patch: Partial<LoopStatus>) => {
  const index = DEFAULT_LOOPS.findIndex((loop) => loop.id === id);
  statuses[index] = { ...IDLE, ...patch };
};

beforeEach(() => {
  statuses = DEFAULT_LOOPS.map(() => IDLE);
  useUiStore.setState({
    fabPanelOpen: true,
    activeFabTab: 'guard',
    loopEnabled: {},
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('FabPanel tab buttons styling and states', () => {
  it('renders tab buttons with .tab-loop-button and data-fab-tab', () => {
    render(<FabPanel isOpen={true} width={400} fitSignal={0} />);

    for (const loop of DEFAULT_LOOPS) {
      const button = screen.getByRole('button', { name: loop.label });
      expect(button.className).toContain('tab-loop-button');
      expect(button.getAttribute('data-fab-tab')).toBe(loop.id);
    }
  });

  it('marks the active tab with .is-selected and data-selected="true"', () => {
    useUiStore.setState({ activeFabTab: 'automate' });
    render(<FabPanel isOpen={true} width={400} fitSignal={0} />);

    const automateBtn = screen.getByRole('button', { name: 'Develop' });
    expect(automateBtn.className).toContain('is-selected');
    expect(automateBtn.getAttribute('data-selected')).toBe('true');

    const innovateBtn = screen.getByRole('button', { name: 'Concepts' });
    expect(innovateBtn.className).not.toContain('is-selected');
    expect(innovateBtn.getAttribute('data-selected')).toBe('false');
  });

  it('renders shimmer on tabs without a running loop', () => {
    render(<FabPanel isOpen={true} width={400} fitSignal={0} />);

    for (const loop of DEFAULT_LOOPS) {
      const shimmer = screen.getByTestId(`loop-shimmer-${loop.id}`);
      expect(shimmer).toBeDefined();
      expect(shimmer.className).toContain('tab-loop-shimmer');
      expect(screen.queryByTestId(`loop-active-arc-${loop.id}`)).toBeNull();
    }
  });

  it('renders rotating arc and hides shimmer when a loop is running on that tab', () => {
    at('watchdog', { running: true });
    render(<FabPanel isOpen={true} width={400} fitSignal={0} />);

    // Watchdog has running loop: has active arc, no shimmer
    const watchdogArc = screen.getByTestId('loop-active-arc-watchdog');
    expect(watchdogArc).toBeDefined();
    expect(watchdogArc.className).toContain('tab-loop-active-arc');
    expect(watchdogArc.getAttribute('data-fab-tab')).toBe('watchdog');
    expect(screen.queryByTestId('loop-shimmer-watchdog')).toBeNull();

    // Idle tabs keep their shimmer and have no active arc
    for (const id of ['innovate', 'automate', 'medic'] as const) {
      expect(screen.getByTestId(`loop-shimmer-${id}`)).toBeDefined();
      expect(screen.queryByTestId(`loop-active-arc-${id}`)).toBeNull();
    }
  });
});

describe('FabPanel "Loop" switch', () => {
  it('renders under the tab bar, off by default', () => {
    render(<FabPanel isOpen={true} width={400} fitSignal={0} />);

    expect(screen.getByTestId('fab-panel-loop-row')).toBeDefined();
    const toggle = screen.getByRole('switch', { name: 'Loop' }) as HTMLInputElement;
    expect(toggle.checked).toBe(false);
  });

  it('recolours the row and the active tab, and turns its icon/label/shimmer white, once on', () => {
    render(<FabPanel isOpen={true} width={400} fitSignal={0} />);

    const toggle = screen.getByRole('switch', { name: 'Loop' }) as HTMLInputElement;
    fireEvent.click(toggle);
    expect(toggle.checked).toBe(true);

    const row = screen.getByTestId('fab-panel-loop-row');
    expect(row.style.backgroundColor).toBe('rgb(var(--fab-spec-3))');

    const guardBtn = screen.getByRole('button', { name: 'Guard' });
    expect(guardBtn.style.backgroundColor).toBe('rgb(var(--fab-spec-3))');
    expect(guardBtn.querySelector('svg')?.getAttribute('class')).toContain('text-white');

    const shimmer = screen.getByTestId('loop-shimmer-guard');
    expect((shimmer as HTMLElement).style.background).toContain('#ffffff');
    // Guard's own glow colour (loop-glow.ts) — must not still be the shimmer's colour.
    expect((shimmer as HTMLElement).style.background).not.toContain('#22c55e');

    // A tab whose own switch is untouched keeps its usual colour.
    const innovateBtn = screen.getByRole('button', { name: 'Concepts' });
    expect(innovateBtn.style.backgroundColor).toBe('');
  });

  it('is per loop id — switching tabs shows each loop own remembered state', () => {
    useUiStore.setState({ loopEnabled: { automate: true } });
    render(<FabPanel isOpen={true} width={400} fitSignal={0} />);

    // Guard (active) has nothing saved — off.
    expect((screen.getByRole('switch', { name: 'Loop' }) as HTMLInputElement).checked).toBe(false);
    const automateBtn = screen.getByRole('button', { name: 'Develop' });
    expect(automateBtn.style.backgroundColor).toBe('rgb(var(--fab-spec-3))');

    // Switching to automate reflects ITS saved state, not guard's.
    fireEvent.click(automateBtn);
    expect((screen.getByRole('switch', { name: 'Loop' }) as HTMLInputElement).checked).toBe(true);
  });
});
