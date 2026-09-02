import { DEFAULT_LOOPS } from '@midnite/studio-shared';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FabLoopCorners } from './fab-loop-corners';
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
}));

vi.mock('../../lib/use-window-focus', () => ({
  useWindowFocused: () => true,
}));

const at = (id: string, patch: Partial<LoopStatus>) => {
  const index = DEFAULT_LOOPS.findIndex((loop) => loop.id === id);
  statuses[index] = { ...IDLE, ...patch };
};

const corner = (id: string) => screen.getByTestId(`fab-loop-corner-${id}`);

beforeEach(() => {
  statuses = DEFAULT_LOOPS.map(() => IDLE);
});

afterEach(cleanup);

describe('FabLoopCorners', () => {
  it('renders nothing while every loop is idle', () => {
    render(<FabLoopCorners />);
    expect(screen.queryByTestId('fab-loop-corners')).toBeNull();
  });

  /**
   * The corner is a function of the loop's index in `DEFAULT_LOOPS`, never of
   * how many are live — start Medic alone and it still takes the bottom-left,
   * so a second loop starting never shuffles the first one's position.
   */
  it('gives each loop the same corner however many are live', () => {
    at('medic', { running: true });
    const solo = render(<FabLoopCorners />);
    expect(corner('medic').dataset.corner).toBe('bl');
    solo.unmount();

    at('innovate', { running: true });
    render(<FabLoopCorners />);
    expect(corner('medic').dataset.corner).toBe('bl');
    expect(corner('innovate').dataset.corner).toBe('tl');
  });

  it('lights only the running loops', () => {
    at('innovate', { running: true });
    at('watchdog', { running: true });
    render(<FabLoopCorners />);
    expect(corner('innovate').dataset.corner).toBe('tl');
    expect(corner('watchdog').dataset.corner).toBe('br');
    expect(screen.queryByTestId('fab-loop-corner-automate')).toBeNull();
  });

  /**
   * Waiting drops the loop's own spectrum for the steady amber every other
   * surface uses, and takes the pulse with it: a corner asking a question has
   * to be spottable against three others, not one more thing in motion.
   */
  it('swaps a waiting loop to the steady amber state', () => {
    at('automate', { running: true, waiting: true });
    at('medic', { running: true });
    render(<FabLoopCorners />);
    expect(corner('automate').className).toContain('is-waiting');
    expect(corner('automate').className).not.toContain('is-pulsing');
    expect(corner('medic').className).toContain('is-pulsing');
    expect(corner('medic').className).not.toContain('is-waiting');
  });
});
