import { QueryClient } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CommandId, MidniteStudioBridge, WatchEvent } from '@midnite/studio-shared';

import { useGraphStore } from './features/graph/graph-store';
import { keys } from './services/queries';
import { useLivenessStore } from './store/liveness-store';
import { useUiStore } from './store/ui-store';
import { DetachedRoot } from './detached-root';

/**
 * Phase 84 Theme A.4: the real bug was that `detached-root.tsx` never
 * subscribed to `watch.onEvent` at all, so main's
 * `broadcastToAllWindows(watchEvent)` landed on a popout's `webContents` with
 * nothing listening. The real feature (a heavy page component) is replaced
 * here with a trivial stand-in — this test is about the plumbing above it
 * (`DetachedShell`'s `useWatchInvalidation` mount and its own `QueryClient`),
 * not about re-testing `FilesView` itself.
 */
vi.mock('./features/files/files-view', () => ({
  FilesView: () => <div data-testid="files-stub" />,
}));

/** jsdom has no `ResizeObserver`; a couple of ambient hooks in the tree only need one to exist. */
class StubResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
vi.stubGlobal('ResizeObserver', StubResizeObserver);

// `watch.onEvent` has more than one subscriber in a mounted `DetachedShell`
// (Theme A's `useWatchInvalidation` AND Theme I's `useLivenessTracking`), so
// the fake fans a fired event out to every registered handler — same pattern
// `browser-pane.test.tsx` uses for `browser.onEvent`.
let watchHandlers: ((event: WatchEvent) => void)[] = [];
let menuCommandHandler: ((command: CommandId) => void) | null = null;

function fireWatchEvent(event: WatchEvent): void {
  for (const handler of [...watchHandlers]) handler(event);
}

function installBridge(): void {
  watchHandlers = [];
  menuCommandHandler = null;
  const bridge: Partial<MidniteStudioBridge> = {
    repos: { list: vi.fn().mockResolvedValue([]) } as unknown as MidniteStudioBridge['repos'],
    watch: {
      onEvent: vi.fn((handler: (event: WatchEvent) => void) => {
        watchHandlers.push(handler);
        return () => {
          watchHandlers = watchHandlers.filter((h) => h !== handler);
        };
      }),
    } as unknown as MidniteStudioBridge['watch'],
    // Theme B/C's `use-liveness-tracking.ts` also subscribes here; nothing in
    // this file fires one, but the hook must find a callable stub rather
    // than throwing on `bridge().sync.onStatus`.
    sync: {
      onStatus: vi.fn(() => () => {}),
    } as unknown as MidniteStudioBridge['sync'],
    menu: {
      onCommand: vi.fn((handler: (command: CommandId) => void) => {
        menuCommandHandler = handler;
        return () => {
          menuCommandHandler = null;
        };
      }),
    } as unknown as MidniteStudioBridge['menu'],
    window: {
      relay: vi.fn(),
      onRelayed: vi.fn(() => () => {}),
      dock: vi.fn(),
      reportRepo: vi.fn(),
      list: vi.fn().mockResolvedValue([]),
      onWindowsChanged: vi.fn(() => () => {}),
    } as unknown as MidniteStudioBridge['window'],
    windowRole: 'files',
  };
  (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = bridge;
}

beforeEach(() => {
  installBridge();
  useUiStore.setState({ selectedRepoId: 'repo-1', selectedWorktreePath: null });
  useGraphStore.setState({ restreamNonce: 0, repoId: null, requestId: null });
  useLivenessStore.setState({ lastWatchAt: null, watcherError: null });
});

afterEach(() => {
  cleanup();
  delete (window as unknown as { midniteStudio?: MidniteStudioBridge }).midniteStudio;
});

describe('DetachedRoot — Theme A: the broadcast lands in a popout', () => {
  it('invalidates its own QueryClient and requests a graph restream on a refs event for its repo', async () => {
    const invalidateSpy = vi.spyOn(QueryClient.prototype, 'invalidateQueries');

    render(<DetachedRoot role="files" />);

    await screen.findByTestId('files-stub');
    await waitFor(() => expect(watchHandlers.length).toBeGreaterThan(0));

    invalidateSpy.mockClear();
    const restreamNonceBefore = useGraphStore.getState().restreamNonce;

    fireWatchEvent({ repoId: 'repo-1', kind: 'refs', at: Date.now() });

    const invalidatedKeys = invalidateSpy.mock.calls.map(
      (call) => (call[0] as { queryKey?: unknown[] })?.queryKey,
    );
    expect(invalidatedKeys).toContainEqual(keys.refs('repo-1'));
    expect(invalidatedKeys.some((k) => k?.[0] === 'repos' && k?.[1] === 'repo-1' && k?.[2] === 'status')).toBe(
      true,
    );
    // `refs` restreams the graph — but only for the repo actually on screen.
    expect(useGraphStore.getState().restreamNonce).toBe(restreamNonceBefore + 1);
    // Theme I's liveness dot is fed off the SAME broadcast in this window.
    expect(useLivenessStore.getState().lastWatchAt).not.toBeNull();
  });

  it('does not restream the graph for another window/repo', async () => {
    render(<DetachedRoot role="files" />);

    await screen.findByTestId('files-stub');
    await waitFor(() => expect(watchHandlers.length).toBeGreaterThan(0));

    const restreamNonceBefore = useGraphStore.getState().restreamNonce;

    fireWatchEvent({ repoId: 'some-other-repo', kind: 'refs', at: Date.now() });

    expect(useGraphStore.getState().restreamNonce).toBe(restreamNonceBefore);
  });
});

describe('DetachedRoot — Theme A.3: view.refresh reaches a popout', () => {
  it('runs against the popout\'s own QueryClient and restreams its graph', async () => {
    const invalidateSpy = vi.spyOn(QueryClient.prototype, 'invalidateQueries');

    render(<DetachedRoot role="files" />);

    await screen.findByTestId('files-stub');
    await waitFor(() => expect(menuCommandHandler).not.toBeNull());

    invalidateSpy.mockClear();
    const restreamNonceBefore = useGraphStore.getState().restreamNonce;

    // Same runtime the palette dispatches through (`useCommandHandlers`),
    // reached here the way a native-menu click or `Mod+K` row would.
    menuCommandHandler?.('view.refresh');

    const invalidatedKeys = invalidateSpy.mock.calls.map(
      (call) => (call[0] as { queryKey?: unknown[] })?.queryKey,
    );
    expect(invalidatedKeys).toContainEqual(keys.repo('repo-1'));
    expect(invalidatedKeys).toContainEqual(keys.repos);
    expect(useGraphStore.getState().restreamNonce).toBe(restreamNonceBefore + 1);
  });
});
