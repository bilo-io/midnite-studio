import { useEffect } from 'react';

import type { WindowDescriptor, WindowRole } from '@midnite/studio-shared';

import { bridge } from './bridge';
import { useUiStore } from '../store/ui-store';

const ROLES: readonly Exclude<WindowRole, 'main'>[] = ['terminal', 'repos', 'fab', 'browser'];

/**
 * Reconciles `ui-store`'s four `*Detached` flags against main's own window
 * registry (Phase 55) — the single source of truth for which popouts exist.
 *
 * Covers both directions of closing a popout: the re-dock button (which asks
 * main to close it) and the window's own traffic light (A.6's rule that a
 * popout closed on its own re-docks too) both end the same way here, since
 * both simply drop that role from the next `windowsChanged` payload.
 *
 * Main-window-only — mounted once from `Shell()`, never from `DetachedRoot`,
 * whose own `ui-store` instance has no docked layout to reconcile.
 */
export function useWindowSync(): void {
  useEffect(() => {
    const api = bridge();
    if (!api) return undefined;

    const apply = (windows: WindowDescriptor[]): void => {
      const present = new Set(windows.map((w) => w.role));
      const store = useUiStore.getState();
      for (const role of ROLES) {
        const detached = present.has(role);
        const current =
          role === 'terminal'
            ? store.terminalDetached
            : role === 'repos'
              ? store.reposDetached
              : role === 'fab'
                ? store.fabDetached
                : store.browserDetached;
        if (current !== detached) store.setDetached(role, detached);
      }
    };

    api.window.list().then(apply);
    return api.window.onWindowsChanged((e) => apply(e.windows));
  }, []);
}
