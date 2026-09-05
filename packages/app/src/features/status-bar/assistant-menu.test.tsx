import { DEFAULT_LOOPS } from '@midnite/studio-shared';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useUiStore } from '../../store/ui-store';
import type { LoopStatus } from '../loops/loop-status';

import { AssistantMenu } from './assistant-menu';

const IDLE: LoopStatus = {
  sessionId: undefined,
  phase: undefined,
  activity: undefined,
  running: false,
  waiting: false,
  thinking: false,
};

let statuses: LoopStatus[] = DEFAULT_LOOPS.map(() => IDLE);

vi.mock('../loops/loop-status', () => ({
  useAllLoopStatuses: () => statuses,
}));

beforeEach(() => {
  statuses = DEFAULT_LOOPS.map(() => IDLE);
  useUiStore.setState({ fabPanelOpen: false, activeFabTab: 'innovate' });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const trigger = () => screen.getByTestId('assistant-menu');

describe('AssistantMenu', () => {
  it('opens the quick-access menu while the FAB panel is closed', () => {
    render(<AssistantMenu />);
    expect(trigger().getAttribute('aria-label')).toBe('Midnite Assistant');
    fireEvent.click(trigger());
    expect(screen.getByRole('menuitem', { name: /Loops/ })).toBeDefined();
    expect(screen.getByRole('menuitem', { name: /Notes/ })).toBeDefined();
  });

  /**
   * The rightmost statusbar slot wears the FAB's own look while its panel is
   * open, rather than its usual quick-access trigger — the two never show at
   * once.
   */
  it('wears the FAB look, not its own quick-access trigger, while the FAB panel is open', () => {
    useUiStore.setState({ fabPanelOpen: true, activeFabTab: 'medic' });
    render(<AssistantMenu />);
    const button = trigger();
    expect(button.getAttribute('aria-label')).toBe('Close quick access panel');
    expect(button.getAttribute('data-fab-tab')).toBe('medic');
    fireEvent.click(button);
    expect(screen.queryByRole('menuitem', { name: /Loops/ })).toBeNull();
  });

  it('closes the FAB panel when clicked while open', () => {
    useUiStore.setState({ fabPanelOpen: true, activeFabTab: 'innovate' });
    render(<AssistantMenu />);
    fireEvent.click(trigger());
    expect(useUiStore.getState().fabPanelOpen).toBe(false);
  });

  it('glows while a loop is live, same as the large FAB', () => {
    statuses = DEFAULT_LOOPS.map((loop) =>
      loop.id === 'watchdog' ? { ...IDLE, running: true } : IDLE,
    );
    useUiStore.setState({ fabPanelOpen: true, activeFabTab: 'watchdog' });
    render(<AssistantMenu />);
    expect(trigger().className).toContain('loop-run-glow');
    expect(trigger().getAttribute('data-loops-running')).toBe('true');
    expect(screen.getByTestId('fab-loop-halo')).toBeDefined();
  });

  it('does not glow with nothing running', () => {
    useUiStore.setState({ fabPanelOpen: true, activeFabTab: 'innovate' });
    render(<AssistantMenu />);
    expect(trigger().className).not.toContain('loop-run-glow');
    expect(screen.queryByTestId('fab-loop-halo')).toBeNull();
  });
});
