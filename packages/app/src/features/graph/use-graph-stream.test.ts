import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MidniteStudioBridge } from '@midnite/studio-shared';

import { useGraphStore } from './graph-store';
import { useGraphStream } from './use-graph-stream';

/**
 * Phase 84 Theme G.2: a kept-alive hidden graph must not spend a `git log`
 * subprocess on a watcher-driven restream, and must run exactly one deferred
 * restream on reveal — never a bare, unearned one just because `visible`
 * flipped back to true.
 */
function installBridge() {
  const start = vi.fn().mockResolvedValue(undefined);
  const cancel = vi.fn().mockResolvedValue(undefined);
  (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = {
    log: {
      start,
      cancel,
      onBatch: () => () => {},
      onDone: () => () => {},
    },
  } as unknown as Partial<MidniteStudioBridge>;
  return { start, cancel };
}

describe('useGraphStream visibility gating', () => {
  beforeEach(() => {
    useGraphStore.getState().reset();
    // `reset()` deliberately leaves `restreamNonce` alone (it is not part of
    // its own `EMPTY` shape) — a leftover hook instance from an earlier test
    // would otherwise still be subscribed to it, per `cleanup()` below.
    useGraphStore.setState({ restreamNonce: 0 });
  });

  afterEach(() => {
    // Without this, a renderHook from an earlier test in this file stays
    // mounted and subscribed to the shared graph store — a later test's
    // `requestRestream()` would then also fire ITS effect, against the spy
    // this test just installed.
    cleanup();
    delete (window as { midniteStudio?: unknown }).midniteStudio;
    vi.restoreAllMocks();
  });

  it('streams normally while visible', () => {
    const { start } = installBridge();
    renderHook(() => useGraphStream('repo-1', [], 100, true));
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('does not stream on a watcher restream while hidden', () => {
    const { start } = installBridge();
    const { rerender } = renderHook(
      ({ visible }: { visible: boolean }) => useGraphStream('repo-1', [], 100, visible),
      { initialProps: { visible: false } },
    );
    expect(start).not.toHaveBeenCalled();

    act(() => {
      useGraphStore.getState().requestRestream();
    });
    rerender({ visible: false });
    expect(start).not.toHaveBeenCalled();
  });

  it('runs exactly one deferred restream on reveal', () => {
    const { start } = installBridge();
    const { rerender } = renderHook(
      ({ visible }: { visible: boolean }) => useGraphStream('repo-1', [], 100, visible),
      { initialProps: { visible: true } },
    );
    expect(start).toHaveBeenCalledTimes(1);

    // Hide, then a watcher event arrives while nobody can see it.
    rerender({ visible: false });
    act(() => {
      useGraphStore.getState().requestRestream();
    });
    expect(start).toHaveBeenCalledTimes(1);

    // Reveal: the deferred restream runs, and only once.
    rerender({ visible: true });
    expect(start).toHaveBeenCalledTimes(2);
    rerender({ visible: true });
    expect(start).toHaveBeenCalledTimes(2);
  });

  it('does not re-stream on a bare reveal with nothing deferred', () => {
    const { start } = installBridge();
    const { rerender } = renderHook(
      ({ visible }: { visible: boolean }) => useGraphStream('repo-1', [], 100, visible),
      { initialProps: { visible: true } },
    );
    expect(start).toHaveBeenCalledTimes(1);

    rerender({ visible: false });
    rerender({ visible: true });
    // Nothing happened while hidden, so revealing it again costs nothing —
    // the whole point of "leave and come back within the TTL is free".
    expect(start).toHaveBeenCalledTimes(1);
  });
});
