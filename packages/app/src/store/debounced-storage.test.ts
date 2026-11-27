import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { debouncedStorage, flushNow } from './debounced-storage';

const KEY = 'test.debounced';

describe('debouncedStorage', () => {
  let setItem: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    setItem = vi.spyOn(Storage.prototype, 'setItem');
  });
  afterEach(() => {
    flushNow();
    setItem.mockRestore();
    vi.useRealTimers();
  });

  it('coalesces 100 rapid sets into exactly one setItem', () => {
    const s = debouncedStorage<{ n: number }>(KEY);
    for (let n = 0; n < 100; n++) s.setItem(KEY, { state: { n }, version: 1 });
    expect(setItem).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ state: { n: 99 }, version: 1 });
  });

  it('writes the same envelope zustand does by default', () => {
    const s = debouncedStorage<{ a: number }>(KEY);
    s.setItem(KEY, { state: { a: 1 }, version: 3 });
    flushNow();
    expect(localStorage.getItem(KEY)).toBe(JSON.stringify({ state: { a: 1 }, version: 3 }));
  });

  it('a write 10 ms before pagehide still lands', () => {
    const s = debouncedStorage<{ n: number }>(KEY);
    s.setItem(KEY, { state: { n: 7 }, version: 1 });
    vi.advanceTimersByTime(10);
    expect(localStorage.getItem(KEY)).toBeNull();
    window.dispatchEvent(new Event('pagehide'));
    expect(JSON.parse(localStorage.getItem(KEY)!).state.n).toBe(7);
  });

  it('getItem returns the pending value, not the stale stored one', () => {
    localStorage.setItem(KEY, JSON.stringify({ state: { n: 1 }, version: 1 }));
    const s = debouncedStorage<{ n: number }>(KEY);
    s.setItem(KEY, { state: { n: 2 }, version: 1 });
    expect(s.getItem(KEY)).toEqual({ state: { n: 2 }, version: 1 });
  });

  it('removeItem drops a pending write', () => {
    const s = debouncedStorage<{ n: number }>(KEY);
    s.setItem(KEY, { state: { n: 1 }, version: 1 });
    s.removeItem(KEY);
    vi.advanceTimersByTime(500);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('flushes on visibilitychange to hidden', () => {
    const s = debouncedStorage<{ n: number }>(KEY);
    s.setItem(KEY, { state: { n: 5 }, version: 1 });
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(localStorage.getItem(KEY)).not.toBeNull();
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  });
});
