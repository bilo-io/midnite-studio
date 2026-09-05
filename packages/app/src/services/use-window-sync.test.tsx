import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useWindowSync } from './use-window-sync';
import { useUiStore } from '../store/ui-store';

type Descriptor = { id: number; role: string; repoId: string | null };

const mocks = vi.hoisted(() => ({
  windows: [] as Descriptor[],
  handler: null as ((e: { windows: Descriptor[] }) => void) | null,
}));

vi.mock('./bridge', () => ({
  bridge: () => ({
    window: {
      list: () => Promise.resolve(mocks.windows),
      onWindowsChanged: (handler: (e: { windows: Descriptor[] }) => void) => {
        mocks.handler = handler;
        return () => {
          mocks.handler = null;
        };
      },
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
