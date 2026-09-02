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

  /**
   * The collapsed button expands the strip and does nothing else, which is what
   * makes its `aria-expanded` honest. It used to call `openFabTab` — unreachable
   * by mouse (`pointerenter` unmounts it before the click lands), unreachable by
   * keyboard (focus is handed forward to the first launcher), and unable to
   * un-press with the FAB already open on `activeFabTab`.
   */
  it('expands, and only expands, when the collapsed glyph is activated', () => {
    render(<FabLaunchers />);
    const collapsed = screen.getByTestId('fab-launchers-collapsed');
    expect(collapsed.getAttribute('aria-expanded')).toBe('false');
    expect(collapsed.getAttribute('aria-controls')).toBe('fab-launcher-strip');

    fireEvent.click(collapsed);
    expect(strip().dataset.expanded).toBe('true');
    expect(useUiStore.getState().fabPanelOpen).toBe(false);
  });

  /** A keyboard arrival must not be dropped when the button it landed on unmounts. */
  it('hands focus to the first launcher when it expands from the keyboard', () => {
    render(<FabLaunchers />);
    fireEvent.click(screen.getByTestId('fab-launchers-collapsed'));
    expect(document.activeElement).toBe(launcher('innovate'));
  });

  /**
   * Theme F needs open-and-idle, running-and-unopened and both-at-once to be
   * three distinguishable states. Without `fabPanelOpen` here the first of the
   * three collapsed the strip, so `is-open` existed in CSS and could never be
   * seen.
   */
  it('expands while the FAB panel is open, even with nothing running', () => {
    useUiStore.setState({ fabPanelOpen: true, activeFabTab: 'medic' });
    render(<FabLaunchers />);
    expect(strip().dataset.expanded).toBe('true');
    expect(launcher('medic').className).toContain('is-open');
    expect(launcher('medic').dataset.loopState).toBe('idle');
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

  /**
   * The focus gate, asserted from the side jsdom can actually see:
   * `document.hasFocus()` is false in jsdom, so `is-pulsing` must be ABSENT on a
   * running launcher — the glow and the full opacity stay, only the motion goes.
   * That is the whole contract of `useWindowFocused()`.
   */
  it('withholds the pulse while the window is blurred, keeping the running state', () => {
    statuses = DEFAULT_LOOPS.map((loop) =>
      loop.id === 'automate' ? { ...IDLE, running: true } : IDLE,
    );
    expect(document.hasFocus()).toBe(false);
    render(<FabLaunchers />);
    const el = launcher('automate');
    expect(el.className).toContain('is-running');
    expect(el.className).not.toContain('is-pulsing');
  });

  it('pulses a running launcher while the window has focus', () => {
    const spy = vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    statuses = DEFAULT_LOOPS.map((loop) =>
      loop.id === 'automate' ? { ...IDLE, running: true } : IDLE,
    );
    render(<FabLaunchers />);
    expect(launcher('automate').className).toContain('is-pulsing');
    spy.mockRestore();
  });

  /** Waiting is steady by design — amber, no motion, focused or not. */
  it('never pulses a waiting launcher', () => {
    const spy = vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    statuses = DEFAULT_LOOPS.map((loop) =>
      loop.id === 'medic' ? { ...IDLE, running: true, waiting: true } : IDLE,
    );
    render(<FabLaunchers />);
    expect(launcher('medic').className).not.toContain('is-pulsing');
    spy.mockRestore();
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

  it('names each launcher without colliding with the waiting notice’s action', () => {
    renderExpanded();
    // `Open <Label>` belongs to the notification bell's action button, and
    // Playwright matches accessible names on substring.
    for (const loop of DEFAULT_LOOPS) {
      expect(launcher(loop.id).getAttribute('aria-label')).toBe(`${loop.label} loop`);
    }
  });
});
