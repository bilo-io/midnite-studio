// Layer: vitest — react-query hook behaviour under jsdom (no real browser
// capability needed: this is store/cache-transition logic, not layout or
// pointer interaction).
import { createElement } from 'react';

import type { KnowledgeGraphPayload, MidniteStudioBridge } from '@midnite/studio-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchKnowledgeGraph, useKnowledgeGraph, useKnowledgeGraphExists } from './use-knowledge-graph';

function graphFor(repoId: string): KnowledgeGraphPayload {
  return {
    nodes: [],
    links: [],
    positions: {},
    builtAtCommit: `${repoId}-commit`,
    cached: false,
    commitsBehind: 0,
  };
}

function installBridge(overrides: Partial<MidniteStudioBridge['knowledge']> = {}) {
  (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = {
    knowledge: {
      getGraph: vi.fn(),
      getNodeDetail: vi.fn(),
      checkGraph: vi.fn(),
      onLayoutProgress: vi.fn(() => () => {}),
      ...overrides,
    } as unknown as MidniteStudioBridge['knowledge'],
  } as Partial<MidniteStudioBridge>;
}

function newClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

describe('useKnowledgeGraph (Phase 87 Theme F)', () => {
  afterEach(() => {
    cleanup();
    delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
  });

  it('a repo switch mid-load cannot land the previous repo’s graph', async () => {
    let resolveRepo1: (value: unknown) => void = () => {};
    const repo1Promise = new Promise((resolve) => {
      resolveRepo1 = resolve;
    });
    const getGraph = vi.fn((req: { repoId: string }) => {
      if (req.repoId === 'repo:1') return repo1Promise;
      return Promise.resolve({ ok: true, value: graphFor('repo:2') });
    });
    installBridge({ getGraph: getGraph as MidniteStudioBridge['knowledge']['getGraph'] });

    const client = newClient();
    const { result, rerender } = renderHook(({ repoId }: { repoId: string }) => useKnowledgeGraph(repoId), {
      initialProps: { repoId: 'repo:1' },
      wrapper: ({ children }) => createElement(QueryClientProvider, { client }, children),
    });

    // repo:1's request is in flight and deliberately never resolved yet.
    expect(result.current.state.kind).toBe('loading');

    // Switch to repo:2 before repo:1 ever answers.
    rerender({ repoId: 'repo:2' });

    await waitFor(() => expect(result.current.state.kind).toBe('ready'));
    expect(result.current.state.kind === 'ready' ? result.current.state.graph.builtAtCommit : null).toBe(
      'repo:2-commit',
    );

    // NOW let repo:1's stale promise resolve — its answer must never land.
    resolveRepo1({ ok: true, value: graphFor('repo:1') });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(result.current.state.kind === 'ready' ? result.current.state.graph.builtAtCommit : null).toBe(
      'repo:2-commit',
    );
  });

  it('resolves absent for an un-graphified repo', async () => {
    installBridge({
      getGraph: vi.fn().mockResolvedValue({ ok: false, kind: 'absent' }),
    });
    const client = newClient();
    const { result } = renderHook(() => useKnowledgeGraph('repo:1'), {
      wrapper: ({ children }) => createElement(QueryClientProvider, { client }, children),
    });

    await waitFor(() => expect(result.current.state.kind).toBe('absent'));
  });

  it('degrades to an error state, never a thrown render, with no bridge at all', async () => {
    const client = newClient();
    const { result } = renderHook(() => useKnowledgeGraph('repo:1'), {
      wrapper: ({ children }) => createElement(QueryClientProvider, { client }, children),
    });

    await waitFor(() => expect(result.current.state.kind).toBe('error'));
  });

  it('handles bridge exception cleanly as an error state', async () => {
    installBridge({
      getGraph: vi.fn().mockRejectedValue(new Error('IPC channel crashed')),
    });
    const client = newClient();
    const { result } = renderHook(() => useKnowledgeGraph('repo:1'), {
      wrapper: ({ children }) => createElement(QueryClientProvider, { client }, children),
    });

    await waitFor(() => expect(result.current.state.kind).toBe('error'));
    if (result.current.state.kind === 'error') {
      expect(result.current.state.message).toBe('IPC channel crashed');
    }
  });

  it('never fires a request with no repo selected', () => {
    const getGraph = vi.fn();
    installBridge({ getGraph });
    const client = newClient();
    renderHook(() => useKnowledgeGraph(null), {
      wrapper: ({ children }) => createElement(QueryClientProvider, { client }, children),
    });

    expect(getGraph).not.toHaveBeenCalled();
  });
});

describe('useKnowledgeGraphExists (Phase 87 Theme F rail greying)', () => {
  afterEach(() => {
    cleanup();
    delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
  });

  it('never calls getGraph — only the cheap checkGraph stat', async () => {
    const getGraph = vi.fn();
    const checkGraph = vi.fn().mockResolvedValue({ exists: true });
    installBridge({ getGraph, checkGraph });
    const client = newClient();
    const { result } = renderHook(() => useKnowledgeGraphExists('repo:1'), {
      wrapper: ({ children }) => createElement(QueryClientProvider, { client }, children),
    });

    await waitFor(() => expect(result.current).toBe(true));
    expect(getGraph).not.toHaveBeenCalled();
  });

  it('is false for a repo with no graph', async () => {
    installBridge({ checkGraph: vi.fn().mockResolvedValue({ exists: false }) });
    const client = newClient();
    const { result } = renderHook(() => useKnowledgeGraphExists('repo:1'), {
      wrapper: ({ children }) => createElement(QueryClientProvider, { client }, children),
    });

    await waitFor(() => expect(result.current).toBe(false));
  });

  it('is undefined (never greyed) with no repo selected', () => {
    installBridge({ checkGraph: vi.fn().mockResolvedValue({ exists: false }) });
    const client = newClient();
    const { result } = renderHook(() => useKnowledgeGraphExists(null), {
      wrapper: ({ children }) => createElement(QueryClientProvider, { client }, children),
    });

    expect(result.current).toBeUndefined();
  });
});

describe('fetchKnowledgeGraph — the stall guard', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function apiWith(getGraph: () => Promise<unknown>) {
    type Progress = (event: { repoId: string; done: number; total: number }) => void;
    const sink: { emit: Progress | null } = { emit: null };
    const unsubscribe = vi.fn();
    const api = {
      getGraph: vi.fn(getGraph),
      getNodeDetail: vi.fn(),
      checkGraph: vi.fn(),
      onLayoutProgress: vi.fn((handler: Progress) => {
        sink.emit = handler;
        return unsubscribe;
      }),
    } as unknown as MidniteStudioBridge['knowledge'];
    return {
      api,
      progress: (done: number) => sink.emit?.({ repoId: 'repo:1', done, total: 100 }),
      unsubscribe,
    };
  }

  it('settles as an error once main has been silent for the stall budget', async () => {
    vi.useFakeTimers();
    const { api, unsubscribe } = apiWith(() => new Promise(() => {}));
    const pending = fetchKnowledgeGraph(api, 'repo:1', 1_000);
    await vi.advanceTimersByTimeAsync(999);
    let settled = false;
    void pending.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const result = await pending;
    expect(result.ok).toBe(false);
    expect(result.ok).toBe(false);
    if (!result.ok && result.kind === 'error') {
      expect(result.message).toMatch(/No answer from the app for 1s/);
    } else {
      throw new Error('expected an error envelope');
    }
    expect(unsubscribe).toHaveBeenCalled();
  });

  it('resets the budget on every progress event for this repo, so a slow layout is not cut off', async () => {
    vi.useFakeTimers();
    let resolveCall: (value: unknown) => void = () => {};
    const { api, progress } = apiWith(() => new Promise((resolve) => (resolveCall = resolve)));
    const pending = fetchKnowledgeGraph(api, 'repo:1', 1_000);
    for (let i = 1; i <= 5; i += 1) {
      await vi.advanceTimersByTimeAsync(800);
      progress(i * 20);
    }
    // 4 s of wall clock against a 1 s budget — alive because it kept talking.
    resolveCall({ ok: true, value: graphFor('repo:1') });
    const result = await pending;
    expect(result.ok).toBe(true);
  });

  it('ignores progress for another repo when deciding whether this call is alive', async () => {
    vi.useFakeTimers();
    type Progress = (event: { repoId: string; done: number; total: number }) => void;
    const sink: { emit: Progress | null } = { emit: null };
    const api = {
      getGraph: vi.fn(() => new Promise(() => {})),
      getNodeDetail: vi.fn(),
      checkGraph: vi.fn(),
      onLayoutProgress: vi.fn((handler: Progress) => {
        sink.emit = handler;
        return () => {};
      }),
    } as unknown as MidniteStudioBridge['knowledge'];
    const pending = fetchKnowledgeGraph(api, 'repo:1', 1_000);
    await vi.advanceTimersByTimeAsync(900);
    sink.emit?.({ repoId: 'repo:other', done: 50, total: 100 });
    await vi.advanceTimersByTimeAsync(100);
    const result = await pending;
    expect(result.ok).toBe(false);
  });

  it('passes a prompt answer straight through and stops the clock', async () => {
    vi.useFakeTimers();
    const { api, unsubscribe } = apiWith(async () => ({ ok: true, value: graphFor('repo:1') }));
    const result = await fetchKnowledgeGraph(api, 'repo:1', 1_000);
    expect(result.ok).toBe(true);
    expect(unsubscribe).toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(5_000);
  });

  it('turns a rejected invoke into an error envelope, never a thrown rejection', async () => {
    const { api } = apiWith(() => Promise.reject(new Error('No handler registered')));
    const result = await fetchKnowledgeGraph(api, 'repo:1', 1_000);
    expect(result).toEqual({ ok: false, kind: 'error', message: 'No handler registered' });
  });
});
