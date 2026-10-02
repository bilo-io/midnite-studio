import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fabPlacementFor, useFabPlacementFlip, type FabPlacement } from './fab-placement';
import { StatusBar } from './status-bar';

describe('fabPlacementFor', () => {
  it('docks the FAB in the status bar on the Media view', () => {
    expect(fabPlacementFor({ view: 'media', terminalOpen: false })).toBe('statusbar');
    expect(fabPlacementFor({ view: 'graph', terminalOpen: false })).toBe('floating');
    expect(fabPlacementFor({ view: 'settings', terminalOpen: false })).toBe('floating');
  });

  it('docks the FAB in the status bar on every view while the terminal is open', () => {
    for (const view of ['media', 'graph', 'settings'] as const) {
      expect(fabPlacementFor({ view, terminalOpen: true })).toBe('statusbar');
    }
  });
});

function FlipHarness({ placement }: { placement: FabPlacement }) {
  const ref = useRef<HTMLButtonElement | null>(null);
  useFabPlacementFlip(placement, ref);
  return placement === 'floating' ? (
    <div><button ref={ref}>f</button></div>
  ) : (
    <footer><button ref={ref}>f</button></footer>
  );
}

describe('useFabPlacementFlip', () => {
  const rect = (w: number) =>
    ({ left: 0, top: 0, width: w, height: w, right: w, bottom: w, x: 0, y: 0 }) as DOMRect;
  let animate: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    animate = vi.fn(() => ({ cancel: vi.fn() }));
    Element.prototype.animate = animate as unknown as Element['animate'];
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      return rect(this.parentElement?.tagName === 'FOOTER' ? 20 : 40);
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete document.documentElement.dataset['motion'];
  });

  it('animates from the old rect when placement changes, in both directions', () => {
    const { rerender } = render(<FlipHarness placement="floating" />);
    expect(animate).not.toHaveBeenCalled();
    rerender(<FlipHarness placement="statusbar" />);
    expect(animate).toHaveBeenCalledTimes(1);
    const frames = animate.mock.calls[0]![0] as Keyframe[];
    expect(String(frames[0]!['transform'])).toContain('scale(2, 2)');
    rerender(<FlipHarness placement="floating" />);
    expect(animate).toHaveBeenCalledTimes(2);
  });

  it('is skipped under reduced motion', () => {
    document.documentElement.dataset['motion'] = 'reduced';
    const { rerender } = render(<FlipHarness placement="floating" />);
    rerender(<FlipHarness placement="statusbar" />);
    expect(animate).not.toHaveBeenCalled();
  });
});

describe('StatusBar fab slot', () => {
  it('renders the FAB inside the footer when handed one, and nothing otherwise', () => {
    const wrap = (ui: React.ReactElement) => (
      <QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>
    );
    const { rerender } = render(wrap(<StatusBar />));
    expect(screen.queryByTestId('status-bar-fab')).toBeNull();
    rerender(wrap(<StatusBar fab={<button data-testid="fab-button">fab</button>} />));
    const slot = screen.getByTestId('status-bar-fab');
    expect(screen.getByTestId('status-bar').contains(slot)).toBe(true);
    expect(slot.querySelector('[data-testid="fab-button"]')).not.toBeNull();
  });
});
