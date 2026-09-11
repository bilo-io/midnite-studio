import { useEffect } from 'react';

import {
  APP_IDS,
  APP_ROLE,
  PAGE_WINDOW_ROLES,
  type CompanionIntent,
  type PanelWindowRole,
  type WindowDescriptor,
} from '@midnite/studio-shared';

import { bridge } from './bridge';
import { handleCompanionRelayAction } from '../features/companion/navigate';
import { useBrowserStore } from '../store/browser-store';
import { useUiStore } from '../store/ui-store';

const ROLES: readonly PanelWindowRole[] = ['terminal', 'repos', 'fab', 'companion', 'browser'];

/**
 * Reconciles `ui-store`'s four `*Detached` flags — and the `detachedPages`
 * list beside them — against main's own window registry (Phase 55), the
 * single source of truth for which popouts exist.
 *
 * The two halves reconcile the same way and mean different things. A panel
 * flag GATES the docked slot: flipping it to `true` is what collapses the
 * panel out of the main window. A page entry gates nothing — the main window
 * renders the view whether or not a duplicate of it is open elsewhere — and
 * only decides whether that page's mark offers "detach" or "focus the window
 * you already have".
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
                : role === 'companion'
                  ? store.companionDetached
                  : store.browserDetached;
        if (current === detached) continue;
        store.setDetached(role, detached);
        // Re-docking the browser: the popout's own `browser-store` was the
        // live copy of the tab list while detached (main's own instance sat
        // idle behind its collapsed slot, and `reparentBrowserTabs`
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
      for (const role of PAGE_WINDOW_ROLES) {
        store.setPageDetached(role, present.has(role));
      }
      // Phase 83 Theme D: the three apps-rail roles, tracked as an array
      // like `detachedPages` rather than a fixed boolean per role — see
      // `detachedApps`'s own doc for why. `present` already carries every
      // open window's role regardless of kind, so no separate resolution
      // step is needed here.
      for (const id of APP_IDS) {
        store.setAppDetached(id, present.has(APP_ROLE[id]));
      }
    };

    api.window.list().then((windows) => {
      if (!liveUpdateSeen) apply(windows);
    });
    const unsubscribeWindows = api.window.onWindowsChanged((e) => {
      liveUpdateSeen = true;
      apply(e.windows);
    });

    // Phase 81 Theme B: the popout↔main companion relay. Main-window-only,
    // same as the rest of this hook — a popout's own `useWindowSync()` never
    // mounts (`Shell()` is main-only), so there is no risk of one window
    // answering a request it sent itself. `broadcast-sync.ts` owns every
    // other relay kind; this one is the exception (see the schema's own
    // comment) because it shares `navigate.ts`'s pending-reply map with the
    // popout side of the same request/reply pair.
    const unsubscribeCompanionRelay = api.window.onRelayed((message) => {
      if (message.kind !== 'companion') return;
      const payload = message.payload as { action?: CompanionIntent; replyTo?: string };
      if (payload.action === undefined || payload.replyTo === undefined) return;
      // Belt to this hook's own "main-window-only" brace: `useWindowSync` is
      // only ever mounted from `Shell()`, but a defensive check here is what
      // makes that a provable fact rather than a call-site convention — a
      // popout that somehow received an `action` (rather than the `result`
      // it is waiting on) ignores it outright instead of trying to execute
      // and relay again.
      if (api.windowRole !== 'main') return;
      handleCompanionRelayAction(payload.action, payload.replyTo);
    });

    return () => {
      unsubscribeWindows();
      unsubscribeCompanionRelay();
    };
  }, []);
}
