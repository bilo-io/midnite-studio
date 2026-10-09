import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useModelsPullQueueStore } from './models-pull-queue-store';
import { useRefetchModelsOnPullDone } from './use-models';

/**
 * Phase 98 Theme I — the pull feed is mounted at app level, so a pull the
 * setup wizard starts reaches the store with the Models view never mounted.
 */
function Feed() {
  useRefetchModelsOnPullDone();
  return null;
}

afterEach(() => {
  cleanup();
  delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
  useModelsPullQueueStore.setState({ pulls: {} });
});

describe('useRefetchModelsOnPullDone', () => {
  it('delivers progress to the store without the Models view, and invalidates on done', () => {
    let emit: (event: Record<string, unknown>) => void = () => undefined;
    (window as unknown as { midniteStudio: unknown }).midniteStudio = {
      ollama: {
        onPullProgress: vi.fn((handler: typeof emit) => {
          emit = handler;
          return () => undefined;
        }),
      },
    };
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    render(
      <QueryClientProvider client={client}>
        <Feed />
      </QueryClientProvider>,
    );

    emit({ pullId: 'p1', model: 'llama3.2:3b', status: 'downloading', total: 100, completed: 40 });
    expect(useModelsPullQueueStore.getState().pulls['p1']).toMatchObject({ model: 'llama3.2:3b', completed: 40, done: false });
    expect(invalidate).not.toHaveBeenCalled();

    emit({ pullId: 'p1', model: 'llama3.2:3b', status: 'success', done: true });
    expect(useModelsPullQueueStore.getState().pulls['p1']?.done).toBe(true);
    expect(invalidate).toHaveBeenCalled();
  });

  it('does nothing, rather than throwing, on a bridge without an ollama group', () => {
    (window as unknown as { midniteStudio: unknown }).midniteStudio = {};
    expect(() =>
      render(
        <QueryClientProvider client={new QueryClient()}>
          <Feed />
        </QueryClientProvider>,
      ),
    ).not.toThrow();
  });
});
