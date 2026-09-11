import { useEffect, useRef } from 'react';

import { bridge } from '../../services/bridge';
import { originOf, useBrowserStore } from '../../store/browser-store';
import { useToastStore } from '../../store/toast-store';
import { useUiStore } from '../../store/ui-store';

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
  const tabs = useBrowserStore((s) => s.tabs);
  const activeTabId = useBrowserStore((s) => s.activeTabId);
  const browserDiscardMs = useUiStore((s) => s.browserDiscardMs);
  const previousActive = useRef<string | null>(null);
  // The create-set implied by the activation effect below (":120" in the
  // phase doc) — hoisted rather than duplicated, since the close-diff effect
  // needs to read the same "have we ever called browser.create for this id"
  // answer (Theme E).
  const created = useRef<Set<string>>(new Set());

  // Closing a tab must destroy its view (Theme E) — `browser-store`'s
  // `closeTab`/`closeOthers`/`closeToRight`/`closeTabsInGroup` are pure
  // reducers with no bridge access by design, so nothing else calls
  // `browser.close` for a row that disappears. Diffing the store's current
  // ids against the create-set here, in one effect, covers every one of
  // those call sites at once rather than needing a bridge call bolted onto
  // each.
  useEffect(() => {
    const liveIds = new Set(tabs.map((tab) => tab.id));
    for (const id of created.current) {
      if (!liveIds.has(id)) {
        created.current.delete(id);
        bridge()?.browser.close({ tabId: id });
      }
    }
  }, [tabs]);

  // Mirrored into a ref so the `create().then()` below can tell, once it
  // actually resolves, whether it is still talking about the current pane
  // state rather than the one that was true when the effect fired.
  const latest = useRef({ open, settled, activeTabId });
  latest.current = { open, settled, activeTabId };

  useEffect(() => {
    const off = bridge()?.browser.onEvent((event) => {
      const update = useBrowserStore.getState().updateTabState;
      switch (event.kind) {
        case 'navigated': {
          update(event.tabId, {
            url: event.url,
            canGoBack: event.canGoBack,
            canGoForward: event.canGoForward,
            // A navigation is the proof a crashed view came back.
            crashed: false,
          });
          // Restores the origin's own zoom factor (Theme G) — a factor set
          // on a previous visit must survive navigating away and back,
          // since `zoomByOrigin` is keyed by origin rather than by tab.
          const origin = originOf(event.url);
          if (origin) {
            const factor = useBrowserStore.getState().zoomByOrigin[origin];
            if (factor !== undefined) bridge()?.browser.zoom({ tabId: event.tabId, factor });
          }
          break;
        }
        case 'title':
          update(event.tabId, { title: event.title });
          break;
        case 'favicon':
          update(event.tabId, { faviconUrl: event.faviconUrl });
          break;
        case 'loading':
          update(event.tabId, {
            loading: event.loading,
            // `did-start-loading` is the proof a previous failure's error
            // page is no longer current (Theme G) — cleared here rather
            // than only on `navigated`, since a blocked-scheme failure
            // fires `failed` with no `navigated` ever following it. A real
            // load starting is the same proof a discarded tab's view has
            // come back (Phase 84 Theme F) — `createBrowserTab`'s own
            // `loadURL` always fires `did-start-loading` first.
            ...(event.loading ? { navError: null, state: undefined } : {}),
          });
          break;
        case 'failed':
          update(event.tabId, { loading: false, navError: event.error });
          break;
        case 'found':
          // Only the active tab's find bar can be open, so this is never
          // keyed per tab (Theme G) — see `browser-store.ts`'s own comment.
          if (useBrowserStore.getState().activeTabId === event.tabId) {
            useBrowserStore
              .getState()
              .setFindResult({ matches: event.matches, activeMatchOrdinal: event.activeMatchOrdinal });
          }
          break;
        case 'destroyed':
          // Surfaced as tab state, never swallowed — the pane turns this
          // into a reload affordance (Theme A).
          update(event.tabId, { loading: false, crashed: true });
          break;
        case 'open-tab':
          useBrowserStore.getState().openTabFrom(event.tabId, event.url, event.foreground);
          break;
        case 'download-blocked':
          useToastStore.getState().addToast({
            status: 'warning',
            message: `Download blocked: ${event.filename} — the embedded browser cannot save files.`,
          });
          break;
        case 'discarded':
          // Main decided this on its own — unlike `browser.close`, the
          // renderer never asked (Phase 84 Theme F). Just a display fact:
          // the tab record, its title and favicon are all untouched.
          update(event.tabId, { state: 'sleeping' });
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
    created.current.add(tab.id);
    void api
      ?.browser.create({ tabId: tab.id, url: tab.url })
      .then(() => {
        // The view now exists in main and is trackable by the discard
        // sweep (Phase 84 Theme F) — sync its "Keep awake" flag the moment
        // that becomes true, since a restored `keepAwake: true` tab is
        // otherwise unknown to main until this fires. Unconditional on
        // `latest.current`, unlike the activate call below: this tab's
        // discard eligibility matters regardless of whether it is still the
        // one the user is looking at right now.
        if (tab.keepAwake) api?.browser.setKeepAwake({ tabId: tab.id, keepAwake: true });
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

  // Phase 84 Theme F: main owns the idle-discard threshold's actual timer,
  // but `Settings ▸ Browser` is renderer state — pushed on mount and on
  // every change, the same "renderer owns it, main just needs to know"
  // shape `browser.zoom` already uses.
  useEffect(() => {
    bridge()?.browser.setDiscardMs({ ms: browserDiscardMs });
  }, [browserDiscardMs]);

  // A tab discarded while it was nominally still the active one — its
  // owner window minimized long enough to age past the threshold — needs
  // no `activeTabId` change to come back, so the effect above never re-runs
  // on its own. Nothing else observes "this window is visible again" here,
  // so this re-issues the identical create+activate call on every
  // foreground transition rather than gating on the tab's `state` field
  // (which would otherwise race the `discarded` event's own delivery).
  // Idempotent either way: `browser.create` no-ops against a still-live view.
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      if (!latest.current.open || !latest.current.settled) return;
      const id = latest.current.activeTabId;
      if (!id) return;
      const tab = useBrowserStore.getState().tabs.find((t) => t.id === id);
      if (!tab || tab.kind === 'newtab') return;

      void bridge()
        ?.browser.create({ tabId: tab.id, url: tab.url })
        .then(() => {
          if (!latest.current.open || latest.current.activeTabId !== tab.id || !latest.current.settled) {
            return;
          }
          bridge()?.browser.activate({ tabId: tab.id });
        });
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);
}
