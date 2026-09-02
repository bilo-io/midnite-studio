import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { usePanelHistory } from './use-panel-history';

describe('usePanelHistory', () => {
  it('starts with one entry, at index 0, unable to go either direction', () => {
    const { result } = renderHook(() => usePanelHistory('a'));

    expect(result.current.current).toBe('a');
    expect(result.current.entries).toEqual(['a']);
    expect(result.current.canGoBack).toBe(false);
    expect(result.current.canGoForward).toBe(false);
  });

  it('push appends and moves current forward', () => {
    const { result } = renderHook(() => usePanelHistory('a'));

    act(() => result.current.push('b'));

    expect(result.current.entries).toEqual(['a', 'b']);
    expect(result.current.current).toBe('b');
    expect(result.current.canGoBack).toBe(true);
    expect(result.current.canGoForward).toBe(false);
  });

  it('back and forward move the index without touching entries', () => {
    const { result } = renderHook(() => usePanelHistory('a'));
    act(() => result.current.push('b'));
    act(() => result.current.push('c'));

    act(() => result.current.back());
    expect(result.current.current).toBe('b');

    act(() => result.current.forward());
    expect(result.current.current).toBe('c');
  });

  it('going back twice then pushing drops the old forward branch', () => {
    const { result } = renderHook(() => usePanelHistory('a'));
    act(() => result.current.push('b'));
    act(() => result.current.push('c'));

    act(() => result.current.back());
    act(() => result.current.back());
    expect(result.current.current).toBe('a');

    act(() => result.current.push('z'));

    expect(result.current.entries).toEqual(['a', 'z']);
    expect(result.current.canGoForward).toBe(false);
  });

  it('back at the root and forward at the tail are both no-ops that do not throw', () => {
    const { result } = renderHook(() => usePanelHistory('a'));

    expect(() => act(() => result.current.back())).not.toThrow();
    expect(result.current.current).toBe('a');

    act(() => result.current.push('b'));
    expect(() => act(() => result.current.forward())).not.toThrow();
    expect(result.current.current).toBe('b');
  });

  it('caps depth at maxDepth, and dropping from the head keeps index and current correct', () => {
    const { result } = renderHook(() => usePanelHistory(0, { maxDepth: 20 }));

    for (let i = 1; i <= 24; i += 1) {
      act(() => result.current.push(i));
    }

    // 25 pushes total (0..24) capped to 20; current is still the 25th (24).
    expect(result.current.entries).toHaveLength(20);
    expect(result.current.current).toBe(24);
    expect(result.current.canGoForward).toBe(false);
    // The oldest surviving entry is the one that kept `current` at the tail.
    expect(result.current.entries[0]).toBe(5);
  });

  it('pushing the same entry twice is a no-op — the default Object.is comparison', () => {
    const { result } = renderHook(() => usePanelHistory('a'));

    act(() => result.current.push('a'));

    expect(result.current.entries).toEqual(['a']);
  });

  it('pushing an equal-but-different object is NOT deduped without a custom isSame', () => {
    const { result } = renderHook(() => usePanelHistory({ id: '1' }));

    act(() => result.current.push({ id: '1' }));

    // Object.is on two distinct object literals is false — length grows.
    expect(result.current.entries).toHaveLength(2);
  });

  it('a custom isSame dedupes by identity fields, not object reference', () => {
    const { result } = renderHook(() =>
      usePanelHistory({ kind: 'list' as const }, { isSame: (a, b) => a.kind === b.kind }),
    );

    act(() => result.current.push({ kind: 'list' }));

    expect(result.current.entries).toHaveLength(1);
  });

  it('replace swaps the current entry without adding a history step', () => {
    const { result } = renderHook(() => usePanelHistory('a'));
    act(() => result.current.push('b'));

    act(() => result.current.replace('b2'));

    expect(result.current.entries).toEqual(['a', 'b2']);
    expect(result.current.current).toBe('b2');
  });

  it('reset collapses the stack back to one entry', () => {
    const { result } = renderHook(() => usePanelHistory('a'));
    act(() => result.current.push('b'));
    act(() => result.current.push('c'));

    act(() => result.current.reset());

    expect(result.current.entries).toEqual(['a']);
    expect(result.current.index).toBe(0);
  });

  it('reset accepts an explicit entry to reset to', () => {
    const { result } = renderHook(() => usePanelHistory('a'));
    act(() => result.current.push('b'));

    act(() => result.current.reset('fresh'));

    expect(result.current.entries).toEqual(['fresh']);
  });
});
