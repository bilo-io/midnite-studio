import { createElement } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useForgeProjectItems, useForgeProjects } from './queries';

/**
 * `useForgeProjectItems` is the one hook in Theme C with real logic worth
 * testing on its own: it walks `mstudio:forge-project:items`'s one-page-at-a-
 * time IPC contract sequentially, and caps the walk at
 * `PROJECT_ITEMS_PAGE_CEILING` pages — the phase doc's 1 000-item ceiling,
 * rendered as `truncated: true` rather than silently dropped.
 */

type Bridge = { forgeProject: { list: ReturnType<typeof vi.fn>; items: ReturnType<typeof vi.fn> } };

function withClient() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    client,
    wrapper: ({ children }: { children: React.ReactNode }) =>
      createElement(QueryClientProvider, { client }, children),
  };
}

const CLI_READY = { reason: 'ready' as const, binPath: '/usr/bin/gh', hint: '' };

beforeEach(() => {
  (window as unknown as { midniteStudio?: Bridge }).midniteStudio = {
    forgeProject: { list: vi.fn(), items: vi.fn() },
  };
});

afterEach(() => {
  delete (window as unknown as { midniteStudio?: Bridge }).midniteStudio;
});

describe('useForgeProjects', () => {
  it('does not fetch until enabled', () => {
    const bridge = (window as unknown as { midniteStudio: Bridge }).midniteStudio;
    const { wrapper } = withClient();
    renderHook(() => useForgeProjects('r1', false), { wrapper });
    expect(bridge.forgeProject.list).not.toHaveBeenCalled();
  });
});

describe('useForgeProjectItems', () => {
  const page = (items: unknown[], nextCursor: string | null) => ({
    cli: CLI_READY,
    items,
    nextCursor,
    error: null,
    kind: 'ok' as const,
  });

  it('walks a single page and stops when nextCursor is null', async () => {
    const bridge = (window as unknown as { midniteStudio: Bridge }).midniteStudio;
    bridge.forgeProject.items.mockResolvedValue(page([{ id: 'i1' }], null));

    const { wrapper } = withClient();
    const { result } = renderHook(() => useForgeProjectItems('PVT_1', true), { wrapper });

    await waitFor(() => expect(result.current.data?.items).toHaveLength(1));
    expect(bridge.forgeProject.items).toHaveBeenCalledTimes(1);
    expect(bridge.forgeProject.items).toHaveBeenCalledWith({ projectId: 'PVT_1' });
    expect(result.current.data?.truncated).toBe(false);
  });

  it('follows the cursor across pages, sequentially', async () => {
    const bridge = (window as unknown as { midniteStudio: Bridge }).midniteStudio;
    bridge.forgeProject.items
      .mockResolvedValueOnce(page([{ id: 'i1' }], 'cursor-2'))
      .mockResolvedValueOnce(page([{ id: 'i2' }], null));

    const { wrapper } = withClient();
    const { result } = renderHook(() => useForgeProjectItems('PVT_1', true), { wrapper });

    await waitFor(() => expect(result.current.data?.items).toHaveLength(2));
    expect(bridge.forgeProject.items).toHaveBeenNthCalledWith(1, { projectId: 'PVT_1' });
    expect(bridge.forgeProject.items).toHaveBeenNthCalledWith(2, {
      projectId: 'PVT_1',
      cursor: 'cursor-2',
    });
    expect(result.current.data?.truncated).toBe(false);
  });

  it('stops at the ten-page ceiling and reports truncated, not a silently short list', async () => {
    const bridge = (window as unknown as { midniteStudio: Bridge }).midniteStudio;
    // Every page hands back one item and always claims there is a next one —
    // an 11+ page board, which the walk must refuse to fetch past page 10.
    bridge.forgeProject.items.mockImplementation(
      async (req: { cursor?: string }) =>
        page([{ id: `i-${req.cursor ?? 'first'}` }], `cursor-${(req.cursor ?? '0')}-next`),
    );

    const { wrapper } = withClient();
    const { result } = renderHook(() => useForgeProjectItems('PVT_1', true), { wrapper });

    await waitFor(() => expect(result.current.data?.truncated).toBe(true));
    expect(bridge.forgeProject.items).toHaveBeenCalledTimes(10);
    expect(result.current.data?.items).toHaveLength(10);
  });

  it('does not fetch until a project id is picked', () => {
    const bridge = (window as unknown as { midniteStudio: Bridge }).midniteStudio;
    const { wrapper } = withClient();
    renderHook(() => useForgeProjectItems(null, true), { wrapper });
    expect(bridge.forgeProject.items).not.toHaveBeenCalled();
  });

  it('stops the walk and surfaces the error on a failed page', async () => {
    const bridge = (window as unknown as { midniteStudio: Bridge }).midniteStudio;
    bridge.forgeProject.items.mockResolvedValueOnce({
      cli: CLI_READY,
      items: [],
      nextCursor: null,
      error: 'boom',
      kind: 'error' as const,
    });

    const { wrapper } = withClient();
    const { result } = renderHook(() => useForgeProjectItems('PVT_1', true), { wrapper });

    await waitFor(() => expect(result.current.data?.error).toBe('boom'));
    expect(bridge.forgeProject.items).toHaveBeenCalledTimes(1);
    expect(result.current.data?.items).toHaveLength(0);
  });
});
