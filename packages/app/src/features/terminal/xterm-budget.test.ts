import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MAX_WEBGL_CONTEXTS, grantedWebglKeys, useXtermBudget, useXtermWebglSlot } from './xterm-budget';

afterEach(() => {
  useXtermBudget.setState({ mounts: {}, renderers: {} });
});

describe('grantedWebglKeys', () => {
  it('grants every mount when under budget', () => {
    const mounts = {
      a: { visible: true, lastVisibleAt: 1 },
      b: { visible: false, lastVisibleAt: 2 },
    };

    expect(grantedWebglKeys(mounts, 5)).toEqual(new Set(['a', 'b']));
  });

  it('ranks every visible mount above every hidden one', () => {
    const mounts = {
      hidden: { visible: false, lastVisibleAt: 1000 },
      visible: { visible: true, lastVisibleAt: 1 },
    };

    expect(grantedWebglKeys(mounts, 1)).toEqual(new Set(['visible']));
  });

  it('demotes the least-recently-visible mount once over budget', () => {
    const mounts = {
      oldest: { visible: false, lastVisibleAt: 100 },
      newer: { visible: false, lastVisibleAt: 200 },
      newest: { visible: false, lastVisibleAt: 300 },
    };

    expect(grantedWebglKeys(mounts, 2)).toEqual(new Set(['newest', 'newer']));
  });

  it('sorts a never-visible mount (lastVisibleAt 0) behind every previously-visible one', () => {
    const mounts = {
      neverVisible: { visible: false, lastVisibleAt: 0 },
      previouslyVisible: { visible: false, lastVisibleAt: 5 },
    };

    expect(grantedWebglKeys(mounts, 1)).toEqual(new Set(['previouslyVisible']));
  });
});

describe('useXtermWebglSlot', () => {
  it('grants a solo mount once its registration effect has run', () => {
    const { result } = renderHook(() => useXtermWebglSlot('solo', true));

    expect(result.current).toBe(true);
  });

  it('mounts from three different surfaces count against one ceiling', () => {
    const { result: panel } = renderHook(() => useXtermWebglSlot('panel-session', true));
    const { result: card } = renderHook(() => useXtermWebglSlot('card-session', true));
    const { result: fab } = renderHook(() => useXtermWebglSlot('fab-session', true));

    expect(useXtermBudget.getState().mounts).toEqual({
      'panel-session': expect.objectContaining({ visible: true }),
      'card-session': expect.objectContaining({ visible: true }),
      'fab-session': expect.objectContaining({ visible: true }),
    });
    expect(panel.current).toBe(true);
    expect(card.current).toBe(true);
    expect(fab.current).toBe(true);
  });

  it('the least-recently-visible pane is the one demoted once over budget', () => {
    useXtermBudget.setState({
      mounts: {
        s1: { visible: false, lastVisibleAt: 100 },
        s2: { visible: false, lastVisibleAt: 200 },
      },
      renderers: {},
    });

    const { result } = renderHook(() => useXtermWebglSlot('s3', true));

    expect(result.current).toBe(true);
    // Over a budget of 2, s1 (oldest) is the one bumped, not s2.
    expect(grantedWebglKeys(useXtermBudget.getState().mounts, 2)).toEqual(new Set(['s3', 's2']));
  });

  it('a demoted pane that becomes visible again reclaims a context', () => {
    useXtermBudget.setState({
      mounts: { rival: { visible: false, lastVisibleAt: 2 } },
      renderers: {},
    });

    const { rerender } = renderHook(
      ({ visible }: { visible: boolean }) => useXtermWebglSlot('subject', visible),
      { initialProps: { visible: false } },
    );

    // Both hidden: the more-recently-visible rival wins a budget of one.
    expect(grantedWebglKeys(useXtermBudget.getState().mounts, 1)).toEqual(new Set(['rival']));

    rerender({ visible: true });

    // `subject` is visible now, outranking the still-hidden rival outright —
    // the reclaim on becoming visible again.
    expect(grantedWebglKeys(useXtermBudget.getState().mounts, 1)).toEqual(new Set(['subject']));
  });

  it('holds the real budget: a 13th visible mount evicts the least-recently-visible of 12', () => {
    vi.useFakeTimers();
    try {
      const fillers = Array.from({ length: MAX_WEBGL_CONTEXTS }, (_, i) => {
        const hook = renderHook(() => useXtermWebglSlot(`filler-${i}`, true));
        vi.advanceTimersByTime(1);
        return hook;
      });
      expect(fillers.every((f) => f.result.current)).toBe(true);

      const newcomer = renderHook(() => useXtermWebglSlot('newcomer', true));

      expect(newcomer.result.current).toBe(true);
      expect(fillers[0]?.result.current).toBe(false);
      expect(fillers.slice(1).every((f) => f.result.current)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('unmounting frees the slot exactly once', () => {
    const { unmount } = renderHook(() => useXtermWebglSlot('temp', true));
    expect(useXtermBudget.getState().mounts['temp']).toBeDefined();

    unmount();
    expect(useXtermBudget.getState().mounts['temp']).toBeUndefined();

    // A second unmount (StrictMode's own double-cleanup shape) is a no-op,
    // not a crash or a re-deletion of some other mount that reused the key.
    unmount();
    expect(useXtermBudget.getState().mounts['temp']).toBeUndefined();
  });
});
