import { useEffect, useRef } from 'react';

import { bridge } from '../../services/bridge';
import { useBrowserStore } from '../../store/browser-store';
import { useToastStore } from '../../store/toast-store';

/**
 * Wires the browser store to the main-process engine.
 *
 * Two jobs: the single `browser.onEvent` subscription that turns chrome
 * pushes into store updates, and the activation effect that creates a
 * tab's `WebContentsView` on first use (a restored tab has none — see
 * `browser-store.ts`'s module doc) and swaps which one is visible.
 *
 * `open` is the pane's own `shown` flag, not `mounted` — closing the pane
 * must hide the active view the instant the fade starts, or a native layer
 * with nothing left in the DOM to dismiss it would sit on screen with no
 * way to close it.
 *
 * `settled` gates only the ACTIVATE half, not `create`: a `create` call
 * fires as soon as `open` does (pre-warming the view while the side-by-side
 * column's own open tween is still animating, since it does nothing
 * visible on its own), but `activate` — which is what a real
 * `WebContentsView` actually starts painting from — waits until the pane
 * has finished resizing. Doing it the other way around, or not at all,
 * shows the real page at its full target bounds while the column is still
 * narrower than that, escaping the still-animating container. `true` for
 * the full-screen overlay (`BrowserPane`'s default), which is always at
 * its final size the instant it mounts.
 *
 * `onTabReady` — pass `useBrowserBounds`'s `sync` — is called once
 * `browser.create` resolves for the newly-active tab AND `settled` is true.
 * A tab's view is created lazily on first activation, so at the moment
 * this effect fires the view usually doesn't exist yet; `browser.activate`
 * alone would still force it visible with no bounds ever pushed.
 * Re-running `sync` here is what actually sizes and (occluder-aware) shows
 * it once it exists.
 */
export function useBrowserTabsEffects(open: boolean, settled: boolean, onTabReady?: () => void): void {
  const activeTabId = useBrowserStore((s) => s.activeTabId);
  const previousActive = useRef<string | null>(null);

  // Mirrored into a ref so the `create().then()` below can tell, once it
  // actually resolves, whether it is still talking about the current pane
  // state rather than the one that was true when the effect fired.
  const latest = useRef({ open, settled, activeTabId });
  latest.current = { open, settled, activeTabId };

  useEffect(() => {
    const off = bridge()?.browser.onEvent((event) => {
      const update = useBrowserStore.getState().updateTabState;
      switch (event.kind) {
        case 'navigated':
          update(event.tabId, {
            url: event.url,
            canGoBack: event.canGoBack,
            canGoForward: event.canGoForward,
            // A navigation is the proof a crashed view came back.
            crashed: false,
          });
          break;
        case 'title':
          update(event.tabId, { title: event.title });
          break;
        case 'favicon':
          update(event.tabId, { faviconUrl: event.faviconUrl });
          break;
        case 'loading':
          update(event.tabId, { loading: event.loading });
          break;
        case 'failed':
          // Theme G renders this as a styled in-DOM error page; this batch
          // only stops the spinner rather than getting stuck mid-load.
          update(event.tabId, { loading: false });
          break;
        case 'destroyed':
          // Surfaced as tab state, never swallowed — the pane turns this
          // into a reload affordance (Theme A).
          update(event.tabId, { loading: false, crashed: true });
          break;
        case 'open-tab':
          useBrowserStore.getState().openTabFrom(event.tabId, event.url);
          break;
        case 'download-blocked':
          useToastStore.getState().addToast({
            status: 'warning',
            message: `Download blocked: ${event.filename} — the embedded browser cannot save files.`,
          });
          break;
      }
    });
    return off;
  }, []);

  useEffect(() => {
    const api = bridge();

    if (!open) {
      if (previousActive.current) {
        api?.browser.setVisible({ tabId: previousActive.current, visible: false });
      }
      return;
    }

    if (previousActive.current && previousActive.current !== activeTabId) {
      api?.browser.setVisible({ tabId: previousActive.current, visible: false });
    }
    previousActive.current = activeTabId;
    if (!activeTabId) return;

    const tab = useBrowserStore.getState().tabs.find((t) => t.id === activeTabId);
    // A blank new tab mounts no view at all (Theme F's home, minimally: no
    // hero this batch, just an empty pane) until it is given a URL.
    if (!tab || tab.kind === 'newtab') return;

    // `create` is a no-op in main when the tab already has a live view —
    // safe to call on every activation, including a reopen after close or
    // a re-run of this effect once `settled` catches up (below).
    void api
      ?.browser.create({ tabId: tab.id, url: tab.url })
      .then(() => {
        /*
          `create` is an IPC round trip, so the pane can close — or a
          different tab can become active — before it resolves. `activate`
          takes no `open` flag of its own: it unconditionally makes this
          tab's view visible in main, so an unguarded call here would pop a
          just-dismissed browser (Mod+B, say) back onto the screen, or show
          this tab in place of whichever one the user actually switched to,
          or — the reason `settled` is checked too — show it at its final
          bounds before the side-by-side column has actually reached them.
          Checking the freshest state right before firing is what a stale
          promise from an earlier render otherwise has no way to know.
        */
        if (!latest.current.open || latest.current.activeTabId !== tab.id || !latest.current.settled) {
          return;
        }
        api?.browser.activate({ tabId: tab.id });
        onTabReady?.();
      });
    // `settled` flipping true with `open`/`activeTabId` unchanged is exactly
    // the "the view was pre-warmed while the tween ran, now show it" case —
    // it has to re-run this effect for that `.then()` (this one already
    // resolved and skipped activating) to have another chance to fire.
  }, [open, settled, activeTabId, onTabReady]);
}
