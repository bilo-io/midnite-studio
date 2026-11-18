// vitest/jsdom: E1 the hook subscribes on toggle-on and unsubscribes on toggle-off and unmount.
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useLiveEntities } from './use-live-entities';

function install() {
  const stopWatch = vi.fn();
  const stopEvents = vi.fn();
  let handler: ((e: { gameId: string; result: unknown }) => void) | null = null;
  const watch = vi.fn(() => stopWatch);
  const get = vi.fn().mockResolvedValue({ ok: true, value: { scene: 's', frame: 1, entities: [], truncated: false } });
  const onEntityState = vi.fn((h: typeof handler) => {
    handler = h;
    return stopEvents;
  });
  (window as unknown as { midniteStudio: unknown }).midniteStudio = { games: { entities: { get, watch }, onEntityState } };
  return { watch, get, onEntityState, stopWatch, stopEvents, push: (e: { gameId: string; result: unknown }) => handler?.(e) };
}

afterEach(() => {
  delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
});

describe('useLiveEntities', () => {
  it('E1 subscribes on, unsubscribes off and on unmount', async () => {
    const b = install();
    const { result, rerender, unmount } = renderHook(({ on }) => useLiveEntities('g', on), { initialProps: { on: false } });
    expect(b.watch).not.toHaveBeenCalled();
    await act(async () => rerender({ on: true }));
    expect(b.watch).toHaveBeenCalledWith({ gameId: 'g' });
    act(() => b.push({ gameId: 'g', result: { scene: 's', frame: 2, entities: [{ id: 1, type: 'e', x: 0, y: 0, alive: true }], truncated: false } }));
    expect(result.current.result?.entities).toHaveLength(1);
    act(() => b.push({ gameId: 'other', result: { scene: 'x', frame: 9, entities: [], truncated: false } }));
    expect(result.current.result?.frame).toBe(2);
    await act(async () => rerender({ on: false }));
    expect(b.stopWatch).toHaveBeenCalledTimes(1);
    expect(b.stopEvents).toHaveBeenCalledTimes(1);
    expect(result.current.result).toBeNull();
    await act(async () => rerender({ on: true }));
    unmount();
    expect(b.stopWatch).toHaveBeenCalledTimes(2);
  });

  it('is inert without a bridge', () => {
    const { result } = renderHook(() => useLiveEntities('g', true));
    expect(result.current.result).toBeNull();
  });
});
