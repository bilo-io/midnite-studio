import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useDeckNav } from './use-deck-nav';

describe('useDeckNav', () => {
  it('starts at slide 0, no steps revealed, instant', () => {
    const { result } = renderHook(() => useDeckNav([2, 1, 0]));
    expect(result.current).toMatchObject({ index: 0, reveal: 0, instant: true });
  });

  it('next() reveals steps one at a time before advancing the slide', () => {
    const { result } = renderHook(() => useDeckNav([2, 1]));
    // Revealing a step leaves `instant` alone — the title hasn't changed, so
    // there is nothing for the presenter's typewriter to restart over.
    act(() => result.current.next());
    expect(result.current).toMatchObject({ index: 0, reveal: 1, instant: true });
    act(() => result.current.next());
    expect(result.current).toMatchObject({ index: 0, reveal: 2, instant: true });
    // Advancing to a new slide is the one transition that sets it.
    act(() => result.current.next());
    expect(result.current).toMatchObject({ index: 1, reveal: 0, instant: false });
  });

  it('regression: revealing a step never flips `instant` in either direction', () => {
    // The bug: `instant` started `true` at mount, and revealing the FIRST
    // step of slide 0 used to force it to `false` — a real change, on an
    // action that never touches the title — which retriggered the
    // presenter's typewriter effect (keyed on `[title, instant]`) and
    // restarted an already-finished title mid-reveal.
    const { result } = renderHook(() => useDeckNav([2, 1]));
    expect(result.current.instant).toBe(true);
    act(() => result.current.next()); // reveal 0 -> 1, same slide
    expect(result.current).toMatchObject({ index: 0, reveal: 1, instant: true });

    act(() => result.current.next()); // reveal 1 -> 2, same slide
    act(() => result.current.next()); // advances to slide 1 -> instant becomes false
    act(() => result.current.jump(0)); // back to slide 0, instant: true again
    act(() => result.current.next()); // reveal a step on slide 0 again
    expect(result.current).toMatchObject({ index: 0, reveal: 1, instant: true });
  });

  it('next() at the last slide with everything revealed is a no-op', () => {
    const { result } = renderHook(() => useDeckNav([0]));
    act(() => result.current.next());
    expect(result.current).toMatchObject({ index: 0, reveal: 0 });
  });

  it('prev() un-reveals steps before moving to the previous slide, instantly', () => {
    const { result } = renderHook(() => useDeckNav([2, 1]));
    act(() => result.current.next());
    act(() => result.current.next());
    act(() => result.current.next()); // now at slide 1, reveal 0
    act(() => result.current.prev());
    expect(result.current).toMatchObject({ index: 0, reveal: 2, instant: true });
    act(() => result.current.prev());
    expect(result.current).toMatchObject({ index: 0, reveal: 1, instant: true });
  });

  it('prev() at slide 0 with nothing revealed is a no-op', () => {
    const { result } = renderHook(() => useDeckNav([2]));
    act(() => result.current.prev());
    expect(result.current).toMatchObject({ index: 0, reveal: 0 });
  });

  it('home() jumps to slide 0 with nothing revealed, instantly', () => {
    const { result } = renderHook(() => useDeckNav([2, 1]));
    act(() => result.current.jump(1));
    act(() => result.current.home());
    expect(result.current).toMatchObject({ index: 0, reveal: 0, instant: true });
  });

  it('end() jumps to the last slide fully revealed, instantly', () => {
    const { result } = renderHook(() => useDeckNav([2, 3]));
    act(() => result.current.end());
    expect(result.current).toMatchObject({ index: 1, reveal: 3, instant: true });
  });

  it('jump() moves to a slide with nothing revealed, and ignores out-of-range indices', () => {
    const { result } = renderHook(() => useDeckNav([2, 1, 3]));
    act(() => result.current.jump(2));
    expect(result.current).toMatchObject({ index: 2, reveal: 0, instant: true });
    act(() => result.current.jump(99));
    expect(result.current).toMatchObject({ index: 2, reveal: 0 });
    act(() => result.current.jump(-1));
    expect(result.current).toMatchObject({ index: 2, reveal: 0 });
  });
});
