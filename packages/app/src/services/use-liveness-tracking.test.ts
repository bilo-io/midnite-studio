import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MidniteStudioBridge, SyncStatusEvent, WatchEvent } from '@midnite/studio-shared';

import { useLivenessStore } from '../store/liveness-store';
import { useLivenessTracking } from './use-liveness-tracking';

let watchHandlers: ((event: WatchEvent) => void)[] = [];
let syncStatusHandlers: ((event: SyncStatusEvent) => void)[] = [];

function fireWatchEvent(event: WatchEvent): void {
  for (const handler of [...watchHandlers]) handler(event);
}

function fireSyncStatus(event: SyncStatusEvent): void {
  for (const handler of [...syncStatusHandlers]) handler(event);
}

beforeEach(() => {
  watchHandlers = [];
  syncStatusHandlers = [];
  (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = {
    watch: {
      onEvent: vi.fn((handler: (event: WatchEvent) => void) => {
        watchHandlers.push(handler);
        return () => {
          watchHandlers = watchHandlers.filter((h) => h !== handler);
        };
      }),
    } as unknown as MidniteStudioBridge['watch'],
    sync: {
      onStatus: vi.fn((handler: (event: SyncStatusEvent) => void) => {
        syncStatusHandlers.push(handler);
        return () => {
          syncStatusHandlers = syncStatusHandlers.filter((h) => h !== handler);
        };
      }),
    } as unknown as MidniteStudioBridge['sync'],
  };
  useLivenessStore.setState({
    lastWatchAt: null,
    watcherError: null,
    fetchStatus: { backoffUntil: null, error: null },
    forgeStatus: { backoffUntil: null, error: null },
  });
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

  it('records a syncStatus push for the selected repo, filtered by repo like watch.onEvent', () => {
    renderHook(() => useLivenessTracking('repo-1'));

    fireSyncStatus({ repoId: 'repo-2', source: 'fetch', backoffUntil: 1, error: 'ignored' });
    expect(useLivenessStore.getState().fetchStatus).toEqual({ backoffUntil: null, error: null });

    fireSyncStatus({ repoId: 'repo-1', source: 'fetch', backoffUntil: 5000, error: 'offline' });
    expect(useLivenessStore.getState().fetchStatus).toEqual({ backoffUntil: 5000, error: 'offline' });

    fireSyncStatus({ repoId: 'repo-1', source: 'forge', backoffUntil: null, error: null });
    expect(useLivenessStore.getState().forgeStatus).toEqual({ backoffUntil: null, error: null });
  });
});
