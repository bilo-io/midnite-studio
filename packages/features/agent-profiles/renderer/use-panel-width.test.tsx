import { act, cleanup, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { usePanelWidth } from './use-panel-width';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function Probe() {
  const ref = useRef<HTMLDivElement>(null);
  const width = usePanelWidth(ref);
  return (
    <div ref={ref} data-testid="probe">
      {String(width)}
    </div>
  );
}

describe('usePanelWidth', () => {
  it('is Infinity when there is no ResizeObserver', () => {
    vi.stubGlobal('ResizeObserver', undefined);
    render(<Probe />);
    expect(screen.getByTestId('probe').textContent).toBe('Infinity');
  });

  it('follows the observed width and disconnects on unmount', () => {
    let callback: ResizeObserverCallback = () => undefined;
    const disconnect = vi.fn();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: ResizeObserverCallback) {
          callback = cb;
        }
        observe = vi.fn();
        disconnect = disconnect;
      },
    );
    const { unmount } = render(<Probe />);
    act(() => callback([{ contentRect: { width: 500 } } as ResizeObserverEntry], {} as ResizeObserver));
    expect(screen.getByTestId('probe').textContent).toBe('500');
    unmount();
    expect(disconnect).toHaveBeenCalled();
  });
});
