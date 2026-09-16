// Layer: vitest/jsdom — a hook over a mocked bridge, no canvas/WebGL involved.
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useKnowledgeLayoutProgress } from './use-knowledge-layout-progress';

const mocks = vi.hoisted(() => ({ onLayoutProgress: vi.fn() }));

describe('useKnowledgeLayoutProgress', () => {
  let handler: ((event: { repoId: string; done: number; total: number }) => void) | null;

  beforeEach(() => {
    mocks.onLayoutProgress.mockReset();
    handler = null;
    mocks.onLayoutProgress.mockImplementation((h: typeof handler) => {
      handler = h;
      return () => {
        handler = null;
      };
    });
    // @ts-expect-error test bridge mock — only `onLayoutProgress` is exercised
    window.midniteStudio = { knowledge: { onLayoutProgress: mocks.onLayoutProgress } };
  });

  afterEach(() => {
    window.midniteStudio = undefined;
  });

  it('is null with no repo open', () => {
    const { result } = renderHook(() => useKnowledgeLayoutProgress(null, true));
    expect(result.current).toBeNull();
  });

  it('reports a progress event for the requesting repo while loading', () => {
    const { result } = renderHook(() => useKnowledgeLayoutProgress('repo:1', true));
    act(() => handler?.({ repoId: 'repo:1', done: 25, total: 100 }));
    expect(result.current).toEqual({ done: 25, total: 100 });
  });

  it('ignores a progress event for a different repo', () => {
    const { result } = renderHook(() => useKnowledgeLayoutProgress('repo:1', true));
    act(() => handler?.({ repoId: 'repo:other', done: 25, total: 100 }));
    expect(result.current).toBeNull();
  });

  it('clears once loading flips back to false — a cache hit that never fired the event', async () => {
    const { result, rerender } = renderHook(
      ({ loading }: { loading: boolean }) => useKnowledgeLayoutProgress('repo:1', loading),
      { initialProps: { loading: true } },
    );
    act(() => handler?.({ repoId: 'repo:1', done: 50, total: 100 }));
    expect(result.current).toEqual({ done: 50, total: 100 });

    rerender({ loading: false });
    await waitFor(() => expect(result.current).toBeNull());
  });

  it('clears and resubscribes on a repo switch', () => {
    const { result, rerender } = renderHook(
      ({ repoId }: { repoId: string }) => useKnowledgeLayoutProgress(repoId, true),
      { initialProps: { repoId: 'repo:1' } },
    );
    act(() => handler?.({ repoId: 'repo:1', done: 10, total: 100 }));
    expect(result.current).toEqual({ done: 10, total: 100 });

    rerender({ repoId: 'repo:2' });
    expect(result.current).toBeNull();

    act(() => handler?.({ repoId: 'repo:1', done: 99, total: 100 })); // stale repo:1 event, must not land
    expect(result.current).toBeNull();

    act(() => handler?.({ repoId: 'repo:2', done: 5, total: 50 }));
    expect(result.current).toEqual({ done: 5, total: 50 });
  });
});
