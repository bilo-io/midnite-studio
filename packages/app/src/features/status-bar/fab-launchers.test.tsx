import { DEFAULT_LOOPS } from '@midnite/studio-shared';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useUiStore } from '../../store/ui-store';
import type { LoopStatus } from '../loops/loop-status';

import { FabLaunchers } from './fab-launchers';

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

const strip = () => screen.getByTestId('fab-launchers');
const launcher = (id: string) => screen.getByTestId(`loop-launcher-${id}`);

/** Force the four-launcher form without depending on a live loop. */
function renderExpanded() {
  render(<FabLaunchers />);
  fireEvent.pointerEnter(strip());
}

beforeEach(() => {
  statuses = DEFAULT_LOOPS.map(() => IDLE);
  useUiStore.setState({ fabPanelOpen: false, activeFabTab: 'innovate' });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('FabLaunchers', () => {
  /**
   * `FabLoopDots` renders nothing when nothing is running, on the argument that
   * the FAB should look untouched. That does not transfer here: these launchers
   * are how a loop is *started*, so hiding them until one runs is circular.
   * Collapsing to one glyph keeps the resting bar quiet without removing the
   * affordance.
   */
  it('collapses to a single glyph at rest', () => {
    render(<FabLaunchers />);
    expect(strip().dataset.expanded).toBe('false');
    expect(screen.getByTestId('fab-launchers-collapsed')).toBeDefined();
    expect(screen.queryByTestId('loop-launcher-innovate')).toBeNull();
  });

  it('expands to four on hover', () => {
    renderExpanded();
    expect(strip().dataset.expanded).toBe('true');
    for (const loop of DEFAULT_LOOPS) expect(launcher(loop.id)).toBeDefined();
  });

  it('expands on its own the moment any loop goes live', () => {
    statuses = DEFAULT_LOOPS.map((loop) =>
      loop.id === 'watchdog' ? { ...IDLE, running: true } : IDLE,
    );
    render(<FabLaunchers />);
    expect(strip().dataset.expanded).toBe('true');
  });

  it('renders the four launchers in DEFAULT_LOOPS order', () => {
    renderExpanded();
    const ids = Array.from(strip().querySelectorAll('[data-testid^="loop-launcher-"]')).map(
      (el) => el.getAttribute('data-testid'),
    );
    expect(ids).toEqual(DEFAULT_LOOPS.map((loop) => `loop-launcher-${loop.id}`));
  });

  it('opens the FAB on the clicked loop tab', () => {
    renderExpanded();
    fireEvent.click(launcher('medic'));
    expect(useUiStore.getState().fabPanelOpen).toBe(true);
    expect(useUiStore.getState().activeFabTab).toBe('medic');
  });

  it('closes the panel when the already-open tab is clicked', () => {
    useUiStore.setState({ fabPanelOpen: true, activeFabTab: 'medic' });
    renderExpanded();
    fireEvent.click(launcher('medic'));
    expect(useUiStore.getState().fabPanelOpen).toBe(false);
  });

  it('marks a running loop, and only that loop', () => {
    statuses = DEFAULT_LOOPS.map((loop) =>
      loop.id === 'automate' ? { ...IDLE, running: true } : IDLE,
    );
    render(<FabLaunchers />);
    expect(launcher('automate').dataset.loopState).toBe('running');
    expect(launcher('innovate').dataset.loopState).toBe('idle');
  });

  /**
   * Amber outranks the loop's own colour — established by
   * `.loop-run-glow.is-waiting`, the FAB tab dot and `fab-loop-dots.tsx`. A loop
   * with a question on screen has to look identical in all four places.
   */
  it('gives a waiting loop amber, dropping its own colour', () => {
    statuses = DEFAULT_LOOPS.map((loop) =>
      loop.id === 'innovate' ? { ...IDLE, running: true, waiting: true } : IDLE,
    );
    render(<FabLaunchers />);
    const el = launcher('innovate');
    expect(el.dataset.loopState).toBe('waiting');
    expect(el.className).toContain('is-waiting');
    expect(el.className).not.toContain('is-running');
    expect(el.style.getPropertyValue('--loop-launcher-color')).toBe('#f59e0b');
  });

  /** Glow and ring are separate channels: both can be on at once. */
  it('carries both states when the open tab is also the running one', () => {
    statuses = DEFAULT_LOOPS.map((loop) =>
      loop.id === 'watchdog' ? { ...IDLE, running: true } : IDLE,
    );
    useUiStore.setState({ fabPanelOpen: true, activeFabTab: 'watchdog' });
    render(<FabLaunchers />);
    const el = launcher('watchdog');
    expect(el.className).toContain('is-running');
    expect(el.className).toContain('is-open');
    expect(el.getAttribute('aria-pressed')).toBe('true');
  });

  it('marks only the open tab, running or not', () => {
    useUiStore.setState({ fabPanelOpen: true, activeFabTab: 'automate' });
    renderExpanded();
    expect(launcher('automate').className).toContain('is-open');
    expect(launcher('medic').className).not.toContain('is-open');
  });

  it('does not mark any tab open while the panel is shut', () => {
    useUiStore.setState({ fabPanelOpen: false, activeFabTab: 'automate' });
    renderExpanded();
    expect(launcher('automate').className).not.toContain('is-open');
  });
});
