// Layer: vitest/jsdom — a hook over a mocked bridge, no canvas/WebGL involved.
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useKnowledgeGraph } from './use-knowledge-graph';

const mocks = vi.hoisted(() => ({
  getGraph: vi.fn(),
  getNodeDetail: vi.fn(),
  onLayoutProgress: vi.fn(),
}));

const PAYLOAD = {
  nodes: [{ id: 'a', label: 'A', community: 0, communityName: 'core', fileType: 'code' }],
  links: [],
  positions: { a: { x: 0, y: 0 } },
  builtAtCommit: 'deadbeef',
  cached: true,
};

describe('useKnowledgeGraph', () => {
  let progressHandler: ((event: { repoId: string; done: number; total: number }) => void) | null;

  beforeEach(() => {
    mocks.getGraph.mockReset();
    mocks.onLayoutProgress.mockReset();
    progressHandler = null;
    mocks.onLayoutProgress.mockImplementation((handler: typeof progressHandler) => {
      progressHandler = handler;
      return () => {
        progressHandler = null;
      };
    });

    // @ts-expect-error test bridge mock — partial `knowledge` shape is enough for this hook
    window.midniteStudio = {
      knowledge: {
        getGraph: mocks.getGraph,
        getNodeDetail: mocks.getNodeDetail,
        onLayoutProgress: mocks.onLayoutProgress,
      },
    };
  });

  afterEach(() => {
    window.midniteStudio = undefined;
  });

  it('is idle with no repo open', () => {
    const { result } = renderHook(() => useKnowledgeGraph(null));
    expect(result.current).toEqual({ status: 'idle' });
  });

  it('goes loading then ok on a successful fetch', async () => {
    let resolveGetGraph!: (value: unknown) => void;
    mocks.getGraph.mockReturnValue(new Promise((resolve) => (resolveGetGraph = resolve)));

    const { result } = renderHook(() => useKnowledgeGraph('repo:1'));
    expect(result.current).toEqual({ status: 'loading', done: 0, total: 0 });

    act(() => {
      resolveGetGraph({ ok: true, value: PAYLOAD });
    });

    await waitFor(() => expect(result.current).toEqual({ status: 'ok', payload: PAYLOAD }));
  });

  it('surfaces layout progress events for the requesting repo while loading', async () => {
    mocks.getGraph.mockReturnValue(new Promise(() => {})); // never resolves in this test
    const { result } = renderHook(() => useKnowledgeGraph('repo:1'));

    act(() => {
      progressHandler?.({ repoId: 'repo:1', done: 25, total: 100 });
    });

    expect(result.current).toEqual({ status: 'loading', done: 25, total: 100 });
  });

  it('ignores a progress event for a different repo', () => {
    mocks.getGraph.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useKnowledgeGraph('repo:1'));

    act(() => {
      progressHandler?.({ repoId: 'repo:other', done: 25, total: 100 });
    });

    expect(result.current).toEqual({ status: 'loading', done: 0, total: 0 });
  });

  it('maps each failure kind to its own status', async () => {
    mocks.getGraph.mockResolvedValue({ ok: false, kind: 'absent' });
    const { result } = renderHook(() => useKnowledgeGraph('repo:1'));
    await waitFor(() => expect(result.current).toEqual({ status: 'absent' }));
  });

  it('carries the message through for unreadable/malformed/error', async () => {
    mocks.getGraph.mockResolvedValue({ ok: false, kind: 'malformed', message: 'bad shape' });
    const { result } = renderHook(() => useKnowledgeGraph('repo:1'));
    await waitFor(() =>
      expect(result.current).toEqual({ status: 'malformed', message: 'bad shape' }),
    );
  });

  it('a repo switch mid-fetch never lands the previous repo\'s result', async () => {
    let resolveFirst!: (value: unknown) => void;
    mocks.getGraph.mockImplementationOnce(
      () => new Promise((resolve) => (resolveFirst = resolve)),
    );
    const secondPayload = { ...PAYLOAD, builtAtCommit: 'second' };
    mocks.getGraph.mockImplementationOnce(() =>
      Promise.resolve({ ok: true, value: secondPayload }),
    );

    const { result, rerender } = renderHook(({ repoId }) => useKnowledgeGraph(repoId), {
      initialProps: { repoId: 'repo:1' },
    });

    rerender({ repoId: 'repo:2' });
    await waitFor(() => expect(result.current).toEqual({ status: 'ok', payload: secondPayload }));

    act(() => {
      resolveFirst({ ok: true, value: PAYLOAD }); // the stale repo:1 response, arriving late
    });

    // Still the second repo's payload — the stale response was dropped.
    expect(result.current).toEqual({ status: 'ok', payload: secondPayload });
  });
});
