import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FabPanel } from '../../components/fab-panel';
import { useUiStore } from '../../store/ui-store';
import type { LoopStatus } from './loop-status';
import { spectrumStops } from './loop-spectrum';

const IDLE: LoopStatus = {
  sessionId: undefined,
  phase: undefined,
  activity: undefined,
  running: false,
  waiting: false,
  thinking: false,
};

vi.mock('./loop-status', () => ({
  useAllLoopStatuses: (ids: readonly string[]) => ids.map(() => IDLE),
  useLoopStatus: () => IDLE,
}));

vi.mock('./use-loop-runs', () => ({
  useLoopRuns: () => ({ data: [] }),
}));

vi.mock('./loop-tab', () => ({
  LoopTab: ({ loop }: { loop: { id: string } }) => <div data-testid={`mock-loop-tab-${loop.id}`} />,
}));

vi.mock('../../lib/use-window-focus-gate', () => ({
  useWindowFocusGate: () => undefined,
}));

vi.mock('@midnite/studio-frame', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@midnite/studio-frame')>()),
  bridge: () => ({
    windowRole: 'main',
    window: { detach: vi.fn() },
    terminal: { list: vi.fn().mockResolvedValue({ sessions: [] }) },
  }),
}));

beforeEach(() => {
  // jsdom has no layout, so `scrollIntoView` (the strip keeps the active tab in view) is absent.
  Element.prototype.scrollIntoView = vi.fn();
  useUiStore.setState({
    fabPanelOpen: true,
    activeFabTab: 'guard',
    loopEnabled: {},
    customLoops: [],
    customLoopEditing: null,
    customLoopFresh: null,
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const panel = () => <FabPanel isOpen={true} width={400} fitSignal={0} />;

describe('the "+" tab', () => {
  it('sits left of Guard, outside the scrolling strip, labelled "New loop"', () => {
    render(panel());
    const plus = screen.getByTestId('fab-new-loop');
    expect(plus.getAttribute('aria-label')).toBe('New loop');
    const guard = screen.getByRole('button', { name: 'Guard' });
    expect(plus.compareDocumentPosition(guard) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const strip = screen.getByTestId('fab-panel-tabstrip');
    expect(strip.contains(guard)).toBe(true);
    expect(strip.contains(plus)).toBe(false);
    expect(strip.className).toContain('overflow-x-auto');
  });

  it('creates a custom loop, selects its tab and opens it in Edit mode', () => {
    render(panel());
    fireEvent.click(screen.getByTestId('fab-new-loop'));
    const [loop] = useUiStore.getState().customLoops;
    expect(loop).toBeDefined();
    // Two buttons answer to "New loop" now: the + and the tab it made.
    const tabs = screen.getAllByRole('button', { name: 'New loop' }).filter((b) => b.dataset['fabTab'] === loop!.id);
    expect(tabs).toHaveLength(1);
    expect(tabs[0]!.getAttribute('data-selected')).toBe('true');
    expect(useUiStore.getState().customLoopEditing).toBe(loop!.id);
    expect(screen.getByTestId(`mock-loop-tab-${loop!.id}`)).toBeTruthy();
  });

  it('paints the custom tab from its hue and follows a recolour and a rename', () => {
    const id = useUiStore.getState().createCustomLoop();
    render(panel());
    act(() => useUiStore.getState().updateCustomLoop(id, (l) => ({ ...l, hue: 45, label: 'Docs' })));
    const tab = screen.getByRole('button', { name: 'Docs' });
    expect(tab.getAttribute('data-fab-custom')).toBe('true');
    expect(tab.style.getPropertyValue('--fab-spec-3')).toBe(spectrumStops(45)[2]);
    // The panel host carries the active custom loop's spectrum for the Loop row and ring.
    const painted = [...document.querySelectorAll<HTMLElement>('[data-fab-custom]')].filter((el) => el !== tab);
    expect(painted.length).toBeGreaterThan(0);
    for (const el of painted) expect(el.style.getPropertyValue('--fab-spec-3')).toBe(spectrumStops(45)[2]);
  });

  it('leaves built-in tabs unpainted inline', () => {
    useUiStore.getState().createCustomLoop();
    render(panel());
    const guard = screen.getByRole('button', { name: 'Guard' });
    expect(guard.hasAttribute('data-fab-custom')).toBe(false);
    expect(guard.style.getPropertyValue('--fab-spec-3')).toBe('');
  });
});
