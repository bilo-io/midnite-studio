import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CompanionIntent } from '@midnite/studio-shared';

import { useWindowSync } from './use-window-sync';
import { useUiStore } from '../store/ui-store';

type Descriptor = { id: number; role: string; repoId: string | null };
type RelayMessage = { kind: string; payload: Record<string, unknown> };

const mocks = vi.hoisted(() => ({
  windows: [] as Descriptor[],
  handler: null as ((e: { windows: Descriptor[] }) => void) | null,
  windowRole: 'main' as string,
  relayed: [] as RelayMessage[],
  relayHandler: null as ((message: RelayMessage) => void) | null,
  focusRole: vi.fn(),
}));

vi.mock('./bridge', () => ({
  bridge: () => ({
    windowRole: mocks.windowRole,
    window: {
      list: () => Promise.resolve(mocks.windows),
      onWindowsChanged: (handler: (e: { windows: Descriptor[] }) => void) => {
        mocks.handler = handler;
        return () => {
          mocks.handler = null;
        };
      },
      onRelayed: (handler: (message: RelayMessage) => void) => {
        mocks.relayHandler = handler;
        return () => {
          mocks.relayHandler = null;
        };
      },
      relay: (message: RelayMessage) => {
        mocks.relayed.push(message);
      },
      focusRole: mocks.focusRole,
    },
  }),
}));

const descriptor = (role: string, id: number): Descriptor => ({ id, role, repoId: null });

describe('useWindowSync — page roles', () => {
  beforeEach(() => {
    mocks.windows = [];
    mocks.handler = null;
    useUiStore.setState({ detachedPages: [], terminalDetached: false });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('records a page popout without collapsing anything in the main window', () => {
    renderHook(() => useWindowSync());
    mocks.handler?.({ windows: [descriptor('main', 1), descriptor('graph', 2)] });

    expect(useUiStore.getState().detachedPages).toEqual(['graph']);
    /*
      The whole difference from a panel, asserted rather than described: a page
      has no `*Detached` flag, so nothing in `app.tsx` stops rendering it. If a
      future change gave pages the panel treatment, this is where it would show.
    */
    expect(useUiStore.getState().terminalDetached).toBe(false);
  });

  it('collapses a panel while leaving pages alone, and vice versa', () => {
    renderHook(() => useWindowSync());
    mocks.handler?.({ windows: [descriptor('main', 1), descriptor('terminal', 2)] });

    expect(useUiStore.getState().terminalDetached).toBe(true);
    expect(useUiStore.getState().detachedPages).toEqual([]);
  });

  it('drops a page again when its window closes', () => {
    renderHook(() => useWindowSync());
    mocks.handler?.({ windows: [descriptor('main', 1), descriptor('changes', 2), descriptor('files', 3)] });
    expect(useUiStore.getState().detachedPages).toEqual(['changes', 'files']);

    mocks.handler?.({ windows: [descriptor('main', 1), descriptor('files', 3)] });
    expect(useUiStore.getState().detachedPages).toEqual(['files']);
  });
});

describe('useWindowSync — the Companion round trip (Phase 79)', () => {
  beforeEach(() => {
    mocks.windows = [];
    mocks.handler = null;
    useUiStore.setState({ companionDetached: false, companionPanelOpen: true, companionEnabled: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Detach and re-dock, exactly as `companion-header.tsx`'s detach button and
   * `DetachedWindowFrame`'s dock control drive it through the real IPC round
   * trip — main's `windowsChanged` push is this hook's only source of truth
   * for `companionDetached`, mirroring the other four panel roles beside it.
   */
  it('sets companionDetached on detach, and clears it again on dock — leaving companionPanelOpen untouched', () => {
    renderHook(() => useWindowSync());

    mocks.handler?.({ windows: [descriptor('main', 1), descriptor('companion', 2)] });
    expect(useUiStore.getState().companionDetached).toBe(true);
    // Detaching collapses the docked slot but never closes the panel's own
    // intent — `app.tsx`'s comment on `companionDocked` and `AssistantMenu`'s
    // both depend on this staying true so re-docking expands it straight
    // back.
    expect(useUiStore.getState().companionPanelOpen).toBe(true);

    mocks.handler?.({ windows: [descriptor('main', 1)] });
    expect(useUiStore.getState().companionDetached).toBe(false);
    expect(useUiStore.getState().companionPanelOpen).toBe(true);
  });
});

describe('useWindowSync — the companion relay (Phase 81 Theme B)', () => {
  beforeEach(() => {
    mocks.windows = [];
    mocks.handler = null;
    mocks.relayed = [];
    mocks.relayHandler = null;
    mocks.windowRole = 'main';
    mocks.focusRole.mockClear();
    useUiStore.setState({
      activeView: 'dashboard',
      detachedPages: [],
      screensaverLocked: false,
      selectedRepoId: 'r1',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('executes a relayed navigate action against this store and relays the result back', async () => {
    renderHook(() => useWindowSync());
    const action: CompanionIntent = { kind: 'navigate', view: 'graph' };
    mocks.relayHandler?.({ kind: 'companion', payload: { action, replyTo: 'req-1' } });

    await vi.waitFor(() => {
      expect(mocks.relayed.some((message) => message.kind === 'companion')).toBe(true);
    });

    // Executed for real, against THIS (main) window's own store.
    expect(useUiStore.getState().activeView).toBe('graph');
    const reply = mocks.relayed.find((message) => message.kind === 'companion');
    expect(reply?.payload).toMatchObject({ replyTo: 'req-1', result: { ok: true } });
  });

  it('ignores an action when this window is not main — belt to the mount-site rule', async () => {
    mocks.windowRole = 'graph';
    renderHook(() => useWindowSync());
    const action: CompanionIntent = { kind: 'navigate', view: 'graph' };
    mocks.relayHandler?.({ kind: 'companion', payload: { action, replyTo: 'req-2' } });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(useUiStore.getState().activeView).toBe('dashboard');
    expect(mocks.relayed).toHaveLength(0);
  });

  it('ignores a reply-shaped message (no action) — that half is the popout side of the pair', async () => {
    renderHook(() => useWindowSync());
    mocks.relayHandler?.({
      kind: 'companion',
      payload: { result: { ok: true, say: 'Here.' }, replyTo: 'req-3' },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mocks.relayed).toHaveLength(0);
    expect(useUiStore.getState().activeView).toBe('dashboard');
  });
});
