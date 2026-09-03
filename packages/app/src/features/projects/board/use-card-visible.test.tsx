import { cleanup, render } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useCardVisible } from './use-card-visible';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/**
 * jsdom has no `IntersectionObserver` — a minimal stub is enough, mirroring
 * `use-browser-bounds.test.tsx`'s own `StubResizeObserver`. Records calls so
 * the teardown assertion below has something to check.
 */
let observeCalls: Element[] = [];
let disconnectCalls = 0;

class StubIntersectionObserver {
  constructor(private callback: (entries: { isIntersecting: boolean }[]) => void) {}
  observe(node: Element): void {
    observeCalls.push(node);
  }
  disconnect(): void {
    disconnectCalls += 1;
  }
  unobserve(): void {}
  takeRecords(): [] {
    return [];
  }
  fire(isIntersecting: boolean): void {
    this.callback([{ isIntersecting }]);
  }
}

function Probe() {
  const ref = useRef<HTMLDivElement>(null);
  const visible = useCardVisible(ref);
  return <div ref={ref} data-testid="probe" data-visible={visible} />;
}

beforeEach(() => {
  observeCalls = [];
  disconnectCalls = 0;
  vi.stubGlobal('IntersectionObserver', StubIntersectionObserver);
});

describe('useCardVisible', () => {
  it('observes its own node, and disconnects on unmount', () => {
    const { unmount } = render(<Probe />);

    expect(observeCalls).toHaveLength(1);
    expect(disconnectCalls).toBe(0);

    unmount();

    expect(disconnectCalls).toBe(1);
  });

  it('returns false with no IntersectionObserver at all — treated as off-screen, not on', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const { getByTestId } = render(<Probe />);

    expect(getByTestId('probe').dataset['visible']).toBe('false');
  });
});
