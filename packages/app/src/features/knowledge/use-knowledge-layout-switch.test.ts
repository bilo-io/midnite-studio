// Layer: vitest — react-query cache-write behaviour under jsdom (no real
// browser capability needed: this is a cache-transition hook, not layout or
// pointer interaction).
import { createElement } from 'react';

import type { KnowledgeGraphPayload, KnowledgeResult, MidniteStudioBridge } from '@midnite/studio-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { keys } from '../../services/queries';
import { useKnowledgeLayoutSwitch } from './use-knowledge-layout-switch';

type Envelope = KnowledgeResult<KnowledgeGraphPayload>;

/** What `useKnowledgeGraph`'s own `queryFn` stores — the envelope, never the bare payload. */
function okFor(layoutId: string): Envelope {
  return { ok: true, value: graphFor(layoutId) };
}

function cachedPayload(client: QueryClient, repoId: string): KnowledgeGraphPayload | undefined {
  const cached = client.getQueryData<Envelope>(keys.knowledgeGraph(repoId));
  return cached?.ok ? cached.value : undefined;
}

function graphFor(layoutId: string): KnowledgeGraphPayload {
  return {
    nodes: [{ id: 'a', label: 'A', community: 0, communityName: 'core', fileType: 'code' }],
    links: [],
    positions: { a: { x: layoutId.length, y: 0 } },
    builtAtCommit: 'deadbeef',
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

describe('useKnowledgeLayoutSwitch (Phase 89 Theme E)', () => {
  afterEach(() => {
    cleanup();
    delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
  });

  it('writes the new payload straight into the existing query cache entry, never toggling isLoading', async () => {
    const getGraph = vi.fn(async (req: { repoId: string; layoutId?: string }) =>
      Promise.resolve({ ok: true, value: graphFor(req.layoutId ?? 'force-atlas2') }),
    );
    installBridge({ getGraph: getGraph as unknown as MidniteStudioBridge['knowledge']['getGraph'] });

    const client = newClient();
    client.setQueryData(keys.knowledgeGraph('repo:1'), okFor('force-atlas2'));

    const { result } = renderHook(() => useKnowledgeLayoutSwitch('repo:1'), {
      wrapper: ({ children }) => createElement(QueryClientProvider, { client }, children),
    });

    expect(result.current.switching).toBe(false);
    act(() => result.current.switchLayout('circlepack'));
    expect(result.current.switching).toBe(true);

    await waitFor(() => expect(result.current.switching).toBe(false));

    expect(getGraph).toHaveBeenCalledWith({ repoId: 'repo:1', layoutId: 'circlepack' });
    // The cache holds the ENVELOPE `resolveKnowledgeViewState` expects — a bare
    // payload here is exactly the shape that once crashed the view.
    const envelope = client.getQueryData<Envelope>(keys.knowledgeGraph('repo:1'));
    expect(envelope?.ok).toBe(true);
    const cached = cachedPayload(client, 'repo:1');
    expect(cached?.positions).toEqual({ a: { x: 'circlepack'.length, y: 0 } });
    // builtAtCommit unchanged — same graph, different coordinates.
    expect(cached?.builtAtCommit).toBe('deadbeef');
  });

  it('a later switch supersedes an earlier one still in flight', async () => {
    let resolveFirst: (value: unknown) => void = () => {};
    const first = new Promise((resolve) => {
      resolveFirst = resolve;
    });
    const getGraph = vi.fn((req: { repoId: string; layoutId?: string }) => {
      if (req.layoutId === 'circlepack') return first;
      return Promise.resolve({ ok: true, value: graphFor(req.layoutId ?? 'force-atlas2') });
    });
    installBridge({ getGraph: getGraph as unknown as MidniteStudioBridge['knowledge']['getGraph'] });

    const client = newClient();
    client.setQueryData(keys.knowledgeGraph('repo:1'), okFor('force-atlas2'));

    const { result } = renderHook(() => useKnowledgeLayoutSwitch('repo:1'), {
      wrapper: ({ children }) => createElement(QueryClientProvider, { client }, children),
    });

    act(() => result.current.switchLayout('circlepack'));
    act(() => result.current.switchLayout('hierarchical'));
    await waitFor(() => expect(result.current.switching).toBe(false));

    // The superseded 'circlepack' request finally resolves — must NOT clobber 'hierarchical''s result.
    act(() => resolveFirst({ ok: true, value: graphFor('circlepack') }));
    await Promise.resolve();

    const cached = cachedPayload(client, 'repo:1');
    expect(cached?.positions).toEqual({ a: { x: 'hierarchical'.length, y: 0 } });
  });

  it('a repo switch cancels any in-flight layout switch for the old repo', async () => {
    let resolveSwitch: (value: unknown) => void = () => {};
    const pending = new Promise((resolve) => {
      resolveSwitch = resolve;
    });
    const getGraph = vi.fn(() => pending);
    installBridge({ getGraph: getGraph as unknown as MidniteStudioBridge['knowledge']['getGraph'] });

    const client = newClient();
    client.setQueryData(keys.knowledgeGraph('repo:1'), okFor('force-atlas2'));
    client.setQueryData(keys.knowledgeGraph('repo:2'), okFor('force-atlas2'));

    const { result, rerender } = renderHook(({ repoId }: { repoId: string }) => useKnowledgeLayoutSwitch(repoId), {
      initialProps: { repoId: 'repo:1' },
      wrapper: ({ children }) => createElement(QueryClientProvider, { client }, children),
    });

    act(() => result.current.switchLayout('circlepack'));
    expect(result.current.switching).toBe(true);

    rerender({ repoId: 'repo:2' });
    expect(result.current.switching).toBe(false);

    act(() => resolveSwitch({ ok: true, value: graphFor('circlepack') }));
    await Promise.resolve();

    // repo:1's cache entry must be untouched by the superseded reply.
    const repo1 = cachedPayload(client, 'repo:1');
    expect(repo1?.positions).toEqual({ a: { x: 'force-atlas2'.length, y: 0 } });
  });

  it('is a no-op with no repo selected', () => {
    const getGraph = vi.fn();
    installBridge({ getGraph });
    const client = newClient();
    const { result } = renderHook(() => useKnowledgeLayoutSwitch(null), {
      wrapper: ({ children }) => createElement(QueryClientProvider, { client }, children),
    });
    act(() => result.current.switchLayout('circlepack'));
    expect(getGraph).not.toHaveBeenCalled();
    expect(result.current.switching).toBe(false);
  });
});
