import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppearanceStore } from '../store/appearance-store';
import { useCascadeReveal, useRevealCount } from './use-cascade-reveal';

/**
 * Phase 84 Theme K.1/K.8 — the shared reveal gate every cascading list now
 * uses, and the guard that a data refresh can never re-arm it.
 */
describe('useCascadeReveal', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useAppearanceStore.setState({ motion: 'full' });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    useAppearanceStore.setState({ motion: 'system' });
  });

  it('arms on mount', () => {
    const { result } = renderHook(() => useCascadeReveal({ revealKey: 'repo-1:0' }));
    expect(result.current.active).toBe(true);
    expect(result.current.styleFor(0)).toEqual({ '--i': 0 });
  });

  it('self-clears after (steps + 1) * stepMs + 250ms', () => {
    const { result } = renderHook(() =>
      useCascadeReveal({ revealKey: 'repo-1:0', steps: 2, stepMs: 10 }),
    );
    expect(result.current.active).toBe(true);

    act(() => {
      vi.advanceTimersByTime((2 + 1) * 10 + 250 - 1);
    });
    expect(result.current.active).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.active).toBe(false);
    expect(result.current.styleFor(0)).toEqual({});
  });

  it('re-arms when revealKey changes after settling — a repo switch or a re-reveal', () => {
    const { result, rerender } = renderHook(
      ({ revealKey }: { revealKey: string }) => useCascadeReveal({ revealKey, steps: 1, stepMs: 10 }),
      { initialProps: { revealKey: 'repo-1:0' } },
    );

    act(() => {
      vi.advanceTimersByTime((1 + 1) * 10 + 250);
    });
    expect(result.current.active).toBe(false);

    rerender({ revealKey: 'repo-2:0' });
    expect(result.current.active).toBe(true);
  });

  it('does NOT re-arm when the key is unchanged — a plain data refresh', () => {
    const { result, rerender } = renderHook(
      ({ revealKey }: { revealKey: string }) => useCascadeReveal({ revealKey, steps: 1, stepMs: 10 }),
      { initialProps: { revealKey: 'repo-1:0' } },
    );

    act(() => {
      vi.advanceTimersByTime((1 + 1) * 10 + 250);
    });
    expect(result.current.active).toBe(false);

    // Same revealKey, different unrelated render (the shape of a watcher-driven
    // restream or a query invalidation bumping some OTHER value the caller
    // does not fold into the key) — must stay settled.
    rerender({ revealKey: 'repo-1:0' });
    expect(result.current.active).toBe(false);
  });

  it('is inert under reduced motion — never arms, styleFor always empty', () => {
    useAppearanceStore.setState({ motion: 'reduced' });
    const { result } = renderHook(() => useCascadeReveal({ revealKey: 'repo-1:0' }));
    expect(result.current.active).toBe(false);
    expect(result.current.styleFor(3)).toEqual({});
  });

  it('a reduced-motion toggle mid-cascade clears active immediately', () => {
    const { result } = renderHook(() => useCascadeReveal({ revealKey: 'repo-1:0' }));
    expect(result.current.active).toBe(true);

    act(() => {
      useAppearanceStore.setState({ motion: 'reduced' });
    });
    expect(result.current.active).toBe(false);
  });
});

/**
 * Phase 84 Theme K.8: a watcher-driven restream must not re-arm the graph's
 * cascade. The graph builds its `revealKey` from `repoId` and `useRevealCount`
 * — never from the graph store's `requestId`, which a restream bumps on every
 * save — so this proves the count itself only reacts to a genuine
 * hidden-to-visible transition and ignores everything else a restream could
 * plausibly be mistaken for (re-rendering while already visible, a data
 * change, a request id bump the count never even sees).
 */
describe('useRevealCount', () => {
  afterEach(() => cleanup());

  it('starts at 0 and does not bump on the mount render, however `visible` reads', () => {
    const { result: whileVisible } = renderHook(() => useRevealCount(true));
    expect(whileVisible.current).toBe(0);

    const { result: whileHidden } = renderHook(() => useRevealCount(false));
    expect(whileHidden.current).toBe(0);
  });

  it('bumps only on a false-to-true transition', () => {
    const { result, rerender } = renderHook(({ visible }: { visible: boolean }) => useRevealCount(visible), {
      initialProps: { visible: true },
    });
    expect(result.current).toBe(0);

    rerender({ visible: false }); // hidden — no bump
    expect(result.current).toBe(0);

    rerender({ visible: false }); // re-render while still hidden (e.g. a restream) — no bump
    expect(result.current).toBe(0);

    rerender({ visible: true }); // reveal — bumps exactly once
    expect(result.current).toBe(1);

    rerender({ visible: true }); // a watcher-driven restream while already visible — no bump
    expect(result.current).toBe(1);
  });

  it('a repeated reveal keeps bumping, one per hidden/visible cycle', () => {
    const { result, rerender } = renderHook(({ visible }: { visible: boolean }) => useRevealCount(visible), {
      initialProps: { visible: true },
    });
    rerender({ visible: false });
    rerender({ visible: true });
    rerender({ visible: false });
    rerender({ visible: true });
    expect(result.current).toBe(2);
  });
});
