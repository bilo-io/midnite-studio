import { useEffect } from 'react';

import type { WindowDescriptor, WindowRole } from '@midnite/studio-shared';

import { bridge } from './bridge';
import { useBrowserStore } from '../store/browser-store';
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

    // A live push must never lose to the initial `window.list()` resolving
    // late — without this, a detach/dock that happens while that first
    // request is still in flight can have its own (fresher) `apply` call
    // overwritten by the stale snapshot arriving after it.
    let liveUpdateSeen = false;

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
        if (current === detached) continue;
        store.setDetached(role, detached);
        // Re-docking the browser: the popout's own `browser-store` was the
        // live copy of the tab list while detached (main's own instance sat
        // idle behind a `DetachedPlaceholder`, and `reparentBrowserTabs`
        // only moves native `WebContentsView`s, not this renderer-side
        // bookkeeping). Both windows are same-origin and share
        // `localStorage`, and the popout's `persist` middleware writes to it
        // synchronously on every change — so re-reading it here is what
        // stops main's tab strip from showing a since-closed tab, or
        // omitting one opened while detached.
        if (role === 'browser' && current === true && detached === false) {
          void useBrowserStore.persist.rehydrate();
        }
      }
    };

    api.window.list().then((windows) => {
      if (!liveUpdateSeen) apply(windows);
    });
    return api.window.onWindowsChanged((e) => {
      liveUpdateSeen = true;
      apply(e.windows);
    });
  }, []);
}
