import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useDevicePixelRatio } from './use-device-pixel-ratio';

type FakeQuery = {
  query: string;
  handlers: Set<() => void>;
  removeEventListener: ReturnType<typeof vi.fn>;
};

/**
 * A `matchMedia` stub that actually models the single-use-query behaviour
 * the hook depends on: each call returns a distinct object scoped to the
 * query string it was created with, and `queries` records every one made so
 * a test can both fire a specific query's listeners and assert exactly which
 * queries were (and weren't) touched.
 */
function mockMatchMedia(): FakeQuery[] {
  const queries: FakeQuery[] = [];
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => {
      const handlers = new Set<() => void>();
      const removeEventListener = vi.fn((_event: string, handler: () => void) => {
        handlers.delete(handler);
      });
      queries.push({ query, handlers, removeEventListener });
      return {
        matches: false,
        media: query,
        addEventListener: (_event: string, handler: () => void) => handlers.add(handler),
        removeEventListener,
      };
    }),
  );
  return queries;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useDevicePixelRatio', () => {
  it('reports the initial ratio synchronously', () => {
    vi.stubGlobal('devicePixelRatio', 2);
    const queries = mockMatchMedia();

    const { result } = renderHook(() => useDevicePixelRatio());

    expect(result.current).toBe(2);
    expect(queries).toHaveLength(1);
    expect(queries[0]!.query).toBe('(resolution: 2dppx)');
  });

  it('re-arms with a fresh query at the new ratio on each change, tearing down the old one exactly once', () => {
    vi.stubGlobal('devicePixelRatio', 1);
    const queries = mockMatchMedia();
    const { result } = renderHook(() => useDevicePixelRatio());
    expect(queries).toHaveLength(1);

    act(() => {
      vi.stubGlobal('devicePixelRatio', 2);
      queries[0]!.handlers.forEach((handler) => handler());
    });

    expect(result.current).toBe(2);
    expect(queries[0]!.removeEventListener).toHaveBeenCalledTimes(1);
    expect(queries).toHaveLength(2);
    expect(queries[1]!.query).toBe('(resolution: 2dppx)');

    act(() => {
      vi.stubGlobal('devicePixelRatio', 3);
      queries[1]!.handlers.forEach((handler) => handler());
    });

    expect(result.current).toBe(3);
    // The first query's listener was already torn down on the prior change —
    // this second change must not touch it again.
    expect(queries[0]!.removeEventListener).toHaveBeenCalledTimes(1);
    expect(queries[1]!.removeEventListener).toHaveBeenCalledTimes(1);
    expect(queries).toHaveLength(3);
    expect(queries[2]!.query).toBe('(resolution: 3dppx)');
  });

  it('tears down the listener on unmount', () => {
    vi.stubGlobal('devicePixelRatio', 1);
    const queries = mockMatchMedia();
    const { unmount } = renderHook(() => useDevicePixelRatio());

    unmount();

    expect(queries[0]!.removeEventListener).toHaveBeenCalledTimes(1);
  });
});
