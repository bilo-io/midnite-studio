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
  // `quickAccessOpen` is a real, shared store field now that this component
  // renders `QuickAccessMenu` off it rather than its own local `open` state
  // — reset explicitly, or a prior test's click leaks into this one.
  useUiStore.setState({
    fabPanelOpen: false,
    activeFabTab: 'innovate',
    quickAccessOpen: false,
    companionPanelOpen: false,
    companionEnabled: false,
    companionDetached: false,
    fabDetached: false,
    lastOpenedPanel: null,
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const trigger = () => screen.getByTestId('assistant-menu');

describe('AssistantMenu', () => {
  /*
   * Neither panel docked is the common case, and this segment used to wear a
   * quick-access trigger button for it — removed as a redundant second
   * control for the same action the large FAB's own `onClick` already
   * performs (see the component's doc comment). It renders nothing at all
   * now, so the status-bar segment collapses cleanly rather than showing a
   * stray second FAB.
   */
  it('renders nothing while neither panel is docked', () => {
    const { container } = render(<AssistantMenu />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId('assistant-menu')).toBeNull();
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
    // Clicking the mini-FAB toggles `fabPanelOpen`, not `quickAccessOpen`.
    expect(useUiStore.getState().quickAccessOpen).toBe(false);
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

  /**
   * Phase 79's Companion drives the identical morph the Loops panel already
   * did — the rest of this describe block is Loops-only coverage; this one
   * is the Companion's.
   */
  describe('the Companion panel', () => {
    it('wears the FAB look and closes the panel when clicked', () => {
      useUiStore.setState({ companionPanelOpen: true, companionEnabled: true });
      render(<AssistantMenu />);
      const button = trigger();
      expect(button.getAttribute('aria-label')).toBe('Close the Companion');

      fireEvent.click(button);
      expect(useUiStore.getState().companionPanelOpen).toBe(false);
      // Never the Loops flag — this click is the Companion's own close.
      expect(useUiStore.getState().fabPanelOpen).toBe(false);
    });

    it('is suppressed while detached — a detached panel is not showing here', () => {
      useUiStore.setState({
        companionPanelOpen: true,
        companionEnabled: true,
        companionDetached: true,
      });
      const { container } = render(<AssistantMenu />);
      expect(container).toBeEmptyDOMElement();
    });

    it('is suppressed while the companion is disabled', () => {
      useUiStore.setState({ companionPanelOpen: true, companionEnabled: false });
      const { container } = render(<AssistantMenu />);
      expect(container).toBeEmptyDOMElement();
    });

    it('acts on whichever panel was opened most recently when both are open', () => {
      useUiStore.setState({
        fabPanelOpen: true,
        companionPanelOpen: true,
        companionEnabled: true,
        lastOpenedPanel: 'companion',
      });
      render(<AssistantMenu />);
      expect(trigger().getAttribute('aria-label')).toBe('Close the Companion');
      fireEvent.click(trigger());
      expect(useUiStore.getState().companionPanelOpen).toBe(false);
      // The Loops panel is untouched by a click that closed the Companion.
      expect(useUiStore.getState().fabPanelOpen).toBe(true);
    });

    it('falls back to Loops when both are open and neither was recorded as most recent', () => {
      useUiStore.setState({
        fabPanelOpen: true,
        companionPanelOpen: true,
        companionEnabled: true,
        lastOpenedPanel: null,
      });
      render(<AssistantMenu />);
      expect(trigger().getAttribute('aria-label')).toBe('Close quick access panel');
    });

    it('acts on Loops when only Loops is open, regardless of lastOpenedPanel', () => {
      useUiStore.setState({
        fabPanelOpen: true,
        companionPanelOpen: false,
        lastOpenedPanel: 'companion',
      });
      render(<AssistantMenu />);
      expect(trigger().getAttribute('aria-label')).toBe('Close quick access panel');
    });
  });
});
