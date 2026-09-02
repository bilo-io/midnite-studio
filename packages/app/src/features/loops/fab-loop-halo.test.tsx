import { DEFAULT_LOOPS } from '@midnite/studio-shared';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FabLoopHalo } from './fab-loop-halo';
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
let focused = true;

vi.mock('./loop-status', () => ({
  useAllLoopStatuses: () => statuses,
}));

vi.mock('../../lib/use-window-focus', () => ({
  useWindowFocused: () => focused,
}));

const at = (id: string, patch: Partial<LoopStatus>) => {
  const index = DEFAULT_LOOPS.findIndex((loop) => loop.id === id);
  statuses[index] = { ...IDLE, ...patch };
};

const halo = () => screen.getByTestId('fab-loop-halo');

beforeEach(() => {
  statuses = DEFAULT_LOOPS.map(() => IDLE);
  focused = true;
});

afterEach(cleanup);

describe('FabLoopHalo', () => {
  it('renders nothing while every loop is idle', () => {
    render(<FabLoopHalo tab="innovate" />);
    expect(screen.queryByTestId('fab-loop-halo')).toBeNull();
  });

  /**
   * ONE halo however many loops are live, and it wears the ACTIVE TAB, not
   * the running loop: the halo is the panel's rim seen from outside, and the
   * rim follows the tab you are looking at. Which loops are live is the ring's
   * job (and the tab dots'), not this one's.
   */
  it('wears the active tab, not the running loop, and is one span however many run', () => {
    at('medic', { running: true });
    at('watchdog', { running: true });
    render(<FabLoopHalo tab="innovate" />);
    expect(screen.getAllByTestId('fab-loop-halo')).toHaveLength(1);
    expect(halo().dataset['fabTab']).toBe('innovate');
  });

  /**
   * Waiting drops the tab's spectrum for the steady amber every other surface
   * uses, and takes the pulse with it: a halo asking a question has to be
   * spottable at a glance, not one more thing in motion.
   */
  it('swaps to the steady amber state while any loop is waiting', () => {
    at('automate', { running: true, waiting: true });
    at('medic', { running: true, thinking: true });
    render(<FabLoopHalo tab="automate" />);
    expect(halo().className).toContain('is-waiting');
    expect(halo().className).not.toContain('is-pulsing');
    // Waiting outranks thinking on the one shared halo.
    expect(halo().className).not.toContain('is-thinking');
  });

  it('breathes faster while a loop is thinking', () => {
    at('medic', { running: true, thinking: true });
    render(<FabLoopHalo tab="medic" />);
    expect(halo().className).toContain('is-pulsing');
    expect(halo().className).toContain('is-thinking');
  });

  /** Blurred, the halo keeps its colour and arc and only the breathing stops. */
  it('stops pulsing when the window loses focus', () => {
    focused = false;
    at('medic', { running: true });
    render(<FabLoopHalo tab="medic" />);
    expect(halo().className).not.toContain('is-pulsing');
    expect(halo().className).not.toContain('is-waiting');
  });
});
