import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ForgeChangedEvent, MidniteStudioBridge } from '@midnite/studio-shared';

import { useForgeSubscription } from './use-forge-subscription';

let changedHandlers: ((event: ForgeChangedEvent) => void)[] = [];
let subscribeCalls: Array<{ repoId: string; kind: string }> = [];
let unsubscribeCalls: Array<{ repoId: string; kind: string }> = [];

function fireChanged(event: ForgeChangedEvent): void {
  for (const handler of [...changedHandlers]) handler(event);
}

beforeEach(() => {
  changedHandlers = [];
  subscribeCalls = [];
  unsubscribeCalls = [];
  (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = {
    forge: {
      subscribe: vi.fn((req: { repoId: string; kind: string }) => subscribeCalls.push(req)),
      unsubscribe: vi.fn((req: { repoId: string; kind: string }) => unsubscribeCalls.push(req)),
      onChanged: vi.fn((handler: (event: ForgeChangedEvent) => void) => {
        changedHandlers.push(handler);
        return () => {
          changedHandlers = changedHandlers.filter((h) => h !== handler);
        };
      }),
    } as unknown as MidniteStudioBridge['forge'],
  };
});

afterEach(() => {
  delete (window as unknown as { midniteStudio?: MidniteStudioBridge }).midniteStudio;
});

function renderWithClient(repoId: string | null, kind: 'runs' | 'pulls' | 'issues' | 'projects', enabled = true) {
  const client = new QueryClient();
  const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
  const result = renderHook(() => useForgeSubscription(repoId, kind, enabled), {
    wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  });
  return { ...result, invalidateSpy };
}

describe('useForgeSubscription', () => {
  it('subscribes on mount and unsubscribes on unmount', () => {
    const { unmount } = renderWithClient('repo-1', 'runs');

    expect(subscribeCalls).toEqual([{ repoId: 'repo-1', kind: 'runs' }]);

    unmount();
    expect(unsubscribeCalls).toEqual([{ repoId: 'repo-1', kind: 'runs' }]);
  });

  it('invalidates queries for a matching forgeChanged event and ignores a different kind or repo', () => {
    const { invalidateSpy } = renderWithClient('repo-1', 'runs');

    fireChanged({ repoId: 'repo-1', kind: 'pulls', at: 1 });
    fireChanged({ repoId: 'repo-2', kind: 'runs', at: 1 });
    expect(invalidateSpy).not.toHaveBeenCalled();

    fireChanged({ repoId: 'repo-1', kind: 'runs', at: 1 });
    expect(invalidateSpy).toHaveBeenCalled();
  });

  it('does not subscribe when disabled or repoId is null', () => {
    renderWithClient(null, 'issues');
    renderWithClient('repo-1', 'issues', false);

    expect(subscribeCalls).toEqual([]);
  });

  it('does nothing without a bridge', () => {
    delete (window as unknown as { midniteStudio?: MidniteStudioBridge }).midniteStudio;

    expect(() => renderWithClient('repo-1', 'projects')).not.toThrow();
  });
});
