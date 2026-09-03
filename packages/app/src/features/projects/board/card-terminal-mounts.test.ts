import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  isCardTerminalGranted,
  MAX_CARD_TERMINALS,
  useCardTerminalMounts,
  useCardTerminalSlot,
} from './card-terminal-mounts';

afterEach(cleanup);
beforeEach(() => {
  useCardTerminalMounts.setState({ wanters: [] });
});

describe('isCardTerminalGranted', () => {
  it('grants the first four wanters, in order', () => {
    const wanters = ['a', 'b', 'c', 'd', 'e'];
    expect(isCardTerminalGranted(wanters, 'a')).toBe(true);
    expect(isCardTerminalGranted(wanters, 'd')).toBe(true);
    expect(isCardTerminalGranted(wanters, 'e')).toBe(false);
  });

  it('MAX_CARD_TERMINALS matches the FAB tab cap (4)', () => {
    expect(MAX_CARD_TERMINALS).toBe(4);
  });
});

describe('useCardTerminalSlot', () => {
  it('grants a slot to a solo wanter', () => {
    const { result } = renderHook(() => useCardTerminalSlot('s1', true));
    expect(result.current).toBe(true);
  });

  it('does not register when it does not want a slot', () => {
    renderHook(() => useCardTerminalSlot('s1', false));
    expect(useCardTerminalMounts.getState().wanters).toEqual([]);
  });

  it('the fifth concurrent wanter is denied', () => {
    renderHook(() => useCardTerminalSlot('s1', true));
    renderHook(() => useCardTerminalSlot('s2', true));
    renderHook(() => useCardTerminalSlot('s3', true));
    renderHook(() => useCardTerminalSlot('s4', true));
    const { result } = renderHook(() => useCardTerminalSlot('s5', true));

    expect(result.current).toBe(false);
  });

  it('releases its slot on unmount, freeing it for the next wanter in line', () => {
    const first = renderHook(() => useCardTerminalSlot('s1', true));
    renderHook(() => useCardTerminalSlot('s2', true));
    renderHook(() => useCardTerminalSlot('s3', true));
    renderHook(() => useCardTerminalSlot('s4', true));
    const fifth = renderHook(() => useCardTerminalSlot('s5', true));
    expect(fifth.result.current).toBe(false);

    act(() => first.unmount());

    expect(useCardTerminalMounts.getState().wanters).not.toContain('s1');
    fifth.rerender();
    expect(fifth.result.current).toBe(true);
  });

  it('releases its slot when it stops wanting one, without unmounting', () => {
    const { result, rerender } = renderHook(({ wants }) => useCardTerminalSlot('s1', wants), {
      initialProps: { wants: true },
    });
    expect(result.current).toBe(true);

    rerender({ wants: false });

    expect(result.current).toBe(false);
    expect(useCardTerminalMounts.getState().wanters).toEqual([]);
  });
});
