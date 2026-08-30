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
 */
export function useBrowserTabsEffects(open: boolean): void {
  const activeTabId = useBrowserStore((s) => s.activeTabId);
  const previousActive = useRef<string | null>(null);

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
    if (!open) {
      if (previousActive.current) {
        bridge()?.browser.setVisible({ tabId: previousActive.current, visible: false });
      }
      return;
    }

    if (previousActive.current && previousActive.current !== activeTabId) {
      bridge()?.browser.setVisible({ tabId: previousActive.current, visible: false });
    }
    previousActive.current = activeTabId;
    if (!activeTabId) return;

    const tab = useBrowserStore.getState().tabs.find((t) => t.id === activeTabId);
    // A blank new tab mounts no view at all (Theme F's home, minimally: no
    // hero this batch, just an empty pane) until it is given a URL.
    if (!tab || tab.kind === 'newtab') return;

    // `create` is a no-op in main when the tab already has a live view —
    // safe to call on every activation, including a reopen after close.
    void bridge()
      ?.browser.create({ tabId: tab.id, url: tab.url })
      .then(() => bridge()?.browser.activate({ tabId: tab.id }));
  }, [open, activeTabId]);
}
