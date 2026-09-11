import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MidniteStudioBridge, WatchEvent } from '@midnite/studio-shared';

import { useLivenessStore } from '../store/liveness-store';
import { useLivenessTracking } from './use-liveness-tracking';

let watchHandlers: ((event: WatchEvent) => void)[] = [];

function fireWatchEvent(event: WatchEvent): void {
  for (const handler of [...watchHandlers]) handler(event);
}

beforeEach(() => {
  watchHandlers = [];
  (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = {
    watch: {
      onEvent: vi.fn((handler: (event: WatchEvent) => void) => {
        watchHandlers.push(handler);
        return () => {
          watchHandlers = watchHandlers.filter((h) => h !== handler);
        };
      }),
    } as unknown as MidniteStudioBridge['watch'],
  };
  useLivenessStore.setState({ lastWatchAt: null, watcherError: null });
});

afterEach(() => {
  delete (window as unknown as { midniteStudio?: MidniteStudioBridge }).midniteStudio;
});

describe('useLivenessTracking', () => {
  it('records lastWatchAt for an event matching the selected repo', () => {
    renderHook(() => useLivenessTracking('repo-1'));

    fireWatchEvent({ repoId: 'repo-1', kind: 'refs', at: 12345 });

    expect(useLivenessStore.getState().lastWatchAt).toBe(12345);
  });

  it('ignores an event for a different repo', () => {
    renderHook(() => useLivenessTracking('repo-1'));

    fireWatchEvent({ repoId: 'repo-2', kind: 'refs', at: 12345 });

    expect(useLivenessStore.getState().lastWatchAt).toBeNull();
  });

  it('resets on unmount+remount with no selected repo', () => {
    useLivenessStore.getState().recordWatchEvent(999);

    const { rerender } = renderHook(({ repoId }) => useLivenessTracking(repoId), {
      initialProps: { repoId: 'repo-1' as string | null },
    });
    rerender({ repoId: null });

    expect(useLivenessStore.getState().lastWatchAt).toBeNull();
  });

  it('does nothing without a bridge', () => {
    delete (window as unknown as { midniteStudio?: MidniteStudioBridge }).midniteStudio;

    expect(() => renderHook(() => useLivenessTracking('repo-1'))).not.toThrow();
  });
});
