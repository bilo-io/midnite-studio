import { createElement } from 'react';

import { cleanup, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MidniteStudioBridge } from '@midnite/studio-shared';

import { usePaletteStore } from '../features/themes/palette-store';
import { useAppearanceStore } from '../store/appearance-store';
import { useBrowserStore } from '../store/browser-store';
import { useUiStore } from '../store/ui-store';
import { relayWatchEvent, useBroadcastSync } from './broadcast-sync';

type RelayMessage = { id: string; origin: string; kind: string; payload: Record<string, unknown> };
type RelayHandler = (message: RelayMessage) => void;

/**
 * `window.midniteStudio.window.relay`/`onRelayed` faked the same way
 * `use-metrics-stream.test.tsx` fakes `metrics.onSample` — a handler list
 * this test can push messages into directly, standing in for main's real
 * `relayToOtherWindows`.
 */
function installBridge(): { relay: ReturnType<typeof vi.fn>; emit: RelayHandler } {
  let handler: RelayHandler | null = null;
  const relay = vi.fn();
  (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = {
    window: {
      relay,
      onRelayed: (h: RelayHandler) => {
        handler = h;
        return () => {
          handler = null;
        };
      },
    } as unknown as MidniteStudioBridge['window'],
  } as Partial<MidniteStudioBridge>;
  return {
    relay,
    emit: (message) => handler?.(message),
  };
}

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderHook(() => useBroadcastSync(), {
    wrapper: ({ children }) => createElement(QueryClientProvider, { client }, children),
  });
}

const UI_DEFAULTS = {
  selectedRepoId: null,
  selectedWorktreePath: null,
  terminalDetached: false,
  reposDetached: false,
  fabDetached: false,
  browserDetached: false,
};

describe('useBroadcastSync (Theme E)', () => {
  beforeEach(() => {
    useUiStore.setState(UI_DEFAULTS);
    document.documentElement.classList.remove('dark');
    usePaletteStore.setState({
      activePaletteId: 'github-dark',
      terminalPaletteOverride: null,
      editorPaletteOverride: null,
      userPalettes: [],
    });
  });

  afterEach(() => {
    // Every test mounts `useBroadcastSync` fresh — without unmounting the
    // previous one, its store subscriptions stay live and fire (against
    // whatever `window.midniteStudio` the NEXT test installs) on every
    // subsequent `setState`, inflating later tests' relay-call counts.
    cleanup();
    delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
    vi.restoreAllMocks();
  });

  it('applies an incoming ui message from another window', () => {
    const { emit } = installBridge();
    mount();

    emit({
      id: 'msg-1',
      origin: 'other-window',
      kind: 'ui',
      payload: { selectedRepoId: 'repo-9', selectedWorktreePath: null },
    });

    expect(useUiStore.getState().selectedRepoId).toBe('repo-9');
  });

  it('a duplicate message id applies once', () => {
    const { emit } = installBridge();
    mount();
    const setStateSpy = vi.spyOn(useUiStore, 'setState');

    const message: RelayMessage = {
      id: 'dup-1',
      origin: 'other-window',
      kind: 'ui',
      payload: { selectedRepoId: 'repo-dup' },
    };
    emit(message);
    emit({ ...message });

    expect(setStateSpy).toHaveBeenCalledTimes(1);
  });

  it('a self-originated message is ignored', () => {
    const { relay, emit } = installBridge();
    mount();

    // A real local change, which the hook relays outward.
    useUiStore.setState({ selectedRepoId: 'repo-local' });
    expect(relay).toHaveBeenCalledTimes(1);
    const sent = relay.mock.calls[0]?.[0] as RelayMessage;

    const setStateSpy = vi.spyOn(useUiStore, 'setState');
    // Echoing that exact message back (its real `origin` is this window's
    // own) must not re-apply it.
    emit(sent);

    expect(setStateSpy).not.toHaveBeenCalled();
  });

  it('applying suppresses rebroadcast — no ping-pong', () => {
    const { relay, emit } = installBridge();
    mount();
    relay.mockClear();

    emit({
      id: 'incoming-1',
      origin: 'other-window',
      kind: 'ui',
      payload: { selectedRepoId: 'repo-incoming' },
    });

    expect(useUiStore.getState().selectedRepoId).toBe('repo-incoming');
    // The subscriber that would otherwise re-send this exact change stayed
    // quiet while `applying` was set.
    expect(relay).not.toHaveBeenCalled();
  });

  it('a local ui-store change outside the allowlist is not sent', () => {
    const { relay } = installBridge();
    mount();
    relay.mockClear();

    useUiStore.setState({ terminalOpen: !useUiStore.getState().terminalOpen });

    expect(relay).not.toHaveBeenCalled();
  });

  it('syncs the whole appearance-store slice', () => {
    const { emit } = installBridge();
    mount();

    emit({
      id: 'appearance-1',
      origin: 'other-window',
      kind: 'appearance',
      payload: { accent: 'violet', density: 'compact' },
    });

    expect(useAppearanceStore.getState().accent).toBe('violet');
    expect(useAppearanceStore.getState().density).toBe('compact');
  });

  it('syncs browser-store tabs/groups/activeTabId', () => {
    const { emit } = installBridge();
    mount();

    emit({
      id: 'browser-1',
      origin: 'other-window',
      kind: 'browser',
      payload: {
        tabs: [{ id: 't1', kind: 'newtab', url: '', title: '', loading: false, canGoBack: false, canGoForward: false }],
        groups: [],
        activeTabId: 't1',
      },
    });

    expect(useBrowserStore.getState().activeTabId).toBe('t1');
    expect(useBrowserStore.getState().tabs).toHaveLength(1);
  });

  it('applies an incoming theme message as the same two DOM mutations', () => {
    const { emit } = installBridge();
    mount();

    emit({ id: 'theme-1', origin: 'other-window', kind: 'theme', payload: { dark: true } });

    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe('dark');
  });

  it('a local dark-class flip is relayed as a theme message', () => {
    const { relay } = installBridge();
    mount();
    relay.mockClear();

    document.documentElement.classList.add('dark');
    // MutationObserver callbacks run in a microtask; flush it.
    return Promise.resolve().then(() => {
      expect(relay).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'theme',
          // Phase 64 Theme B: the active palette id travels on this same
          // message now — `payload` itself needs `objectContaining` too,
          // since it is nested inside the outer matcher.
          payload: expect.objectContaining({ dark: true }),
        }),
      );
    });
  });

  it('applies an incoming palette change alongside the dark-class flip', () => {
    const { emit } = installBridge();
    mount();

    emit({
      id: 'theme-2',
      origin: 'other-window',
      kind: 'theme',
      payload: { dark: true, paletteId: 'monokai' },
    });

    expect(usePaletteStore.getState().activePaletteId).toBe('monokai');
  });

  it('a local palette change is relayed as a theme message, reaching popouts', () => {
    const { relay } = installBridge();
    mount();
    relay.mockClear();

    usePaletteStore.getState().setActivePalette('jetbrains-darcula');

    expect(relay).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'theme',
        payload: expect.objectContaining({ paletteId: 'jetbrains-darcula' }),
      }),
    );
  });

  it('relayWatchEvent sends a watch message through the relay', () => {
    const { relay } = installBridge();
    mount();
    relay.mockClear();

    relayWatchEvent('repo-1', 'refs');

    expect(relay).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'watch', payload: { repoId: 'repo-1', kind: 'refs' } }),
    );
  });

  it('an incoming watch message invalidates through the query client', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    const { emit } = installBridge();

    renderHook(() => useBroadcastSync(), {
      wrapper: ({ children }) => createElement(QueryClientProvider, { client }, children),
    });

    emit({ id: 'watch-1', origin: 'other-window', kind: 'watch', payload: { repoId: 'repo-1', kind: 'index' } });

    expect(invalidateSpy).toHaveBeenCalled();
  });
});
