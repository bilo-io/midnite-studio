import { useStore } from 'zustand';

import {
  DEFAULT_BROWSER_REPUTATION_FEEDS,
  type BrowserUiState,
  type BrowserUiStore,
} from '@midnite/studio-feature-browser/renderer';
import { createPersistedStore } from '@midnite/studio-frame';
import { DEFAULT_BROWSER_DISCARD_MS, WEB_APP_IDS, type WebAppId } from '@midnite/studio-shared';

/**
 * Browser's answer to the browser feature's app state (`BrowserUiState`) — what Studio keeps in its
 * `ui-store`, here in a small store of Browser's own. The pane is the whole window, so the layout is
 * always `full` and the launcher, the switcher and "close the browser" do not exist; there is no
 * repository to select, and a web app is never detached (there is no other window to detach it to).
 *
 * What Browser remembers across launches, in this window's localStorage: which web apps are on, the one
 * opened last, and how long a hidden tab may idle before it is discarded. The tabs themselves persist in
 * the feature's own `useBrowserStore`, as in Studio.
 */
type Persisted = {
  enabledWebApps: WebAppId[];
  lastOpenedWebAppId: WebAppId | null;
  browserDiscardMs: number;
};

export type BrowserAppUiState = BrowserUiState & {
  setWebAppEnabled: (id: WebAppId, enabled: boolean) => void;
  setBrowserDiscardMs: (ms: number) => void;
  /** Counts a surface painted over the native views (`useOccluder`); the release undoes it. */
  addOccluder: () => () => void;
};

const isWebAppId = (id: unknown): id is WebAppId => (WEB_APP_IDS as readonly unknown[]).includes(id);

export function createBrowserUiStore(storage?: Storage) {
  return createPersistedStore<BrowserAppUiState, Persisted>({
    key: 'midnite-browser.ui',
    defaults: { enabledWebApps: [], lastOpenedWebAppId: null, browserDiscardMs: DEFAULT_BROWSER_DISCARD_MS },
    pick: ({ enabledWebApps, lastOpenedWebAppId, browserDiscardMs }) => ({ enabledWebApps, lastOpenedWebAppId, browserDiscardMs }),
    ...(storage ? { storage } : {}),
    state: (set, initial) => ({
      // A blob from another build, or a hand-edited one, can name an app that does not exist.
      enabledWebApps: Array.isArray(initial.enabledWebApps) ? initial.enabledWebApps.filter(isWebAppId) : [],
      lastOpenedWebAppId: isWebAppId(initial.lastOpenedWebAppId) ? initial.lastOpenedWebAppId : null,
      browserDiscardMs: typeof initial.browserDiscardMs === 'number' ? initial.browserDiscardMs : DEFAULT_BROWSER_DISCARD_MS,

      // Browser has no Settings window yet, so its site-safety switches hold their defaults: no
      // proceed past an interstitial, no reputation feed pulled (Phase 117 Theme C).
      browserAllowSiteProceed: false,
      browserReputationFeeds: DEFAULT_BROWSER_REPUTATION_FEEDS,

      browserLayout: 'full',
      browserLauncherOpen: false,
      browserSwitcherOpen: false,
      browserSwitcherSelected: 'full',
      occluders: 0,
      selectedRepoId: null,
      selectedWorktreePath: null,
      detachedWebApps: [],
      webAppsFlyoutAppId: null,

      // The browser is the window: it is always open, always full, and has nothing to switch to.
      openBrowser: () => undefined,
      setBrowserOpen: () => undefined,
      setBrowserLayout: () => undefined,
      closeBrowserLauncher: () => undefined,
      cycleBrowserSwitcher: () => undefined,
      commitBrowserSwitcher: () => undefined,
      closeBrowserSwitcher: () => undefined,

      // The "flyout" app is the web app shown in place of the tabs — the rail toggles it.
      openWebAppsFlyout: (id) => set({ webAppsFlyoutAppId: id, lastOpenedWebAppId: id }),
      closeWebAppsFlyout: () => set({ webAppsFlyoutAppId: null }),

      setWebAppEnabled: (id, enabled) =>
        set((state) => ({
          enabledWebApps: enabled
            ? state.enabledWebApps.includes(id)
              ? state.enabledWebApps
              : [...state.enabledWebApps, id]
            : state.enabledWebApps.filter((entry) => entry !== id),
          // Turning off the app on screen puts the tabs back.
          ...(enabled || state.webAppsFlyoutAppId !== id ? {} : { webAppsFlyoutAppId: null }),
        })),
      setBrowserDiscardMs: (browserDiscardMs) => set({ browserDiscardMs }),
      addOccluder: () => {
        set((state) => ({ occluders: state.occluders + 1 }));
        let released = false;
        return () => {
          if (released) return;
          released = true;
          set((state) => ({ occluders: Math.max(0, state.occluders - 1) }));
        };
      },
    }),
  });
}

export const browserUiStore = createBrowserUiStore();

/** The store as the feature's host port reads it: a selector hook with `getState`/`setState`. */
export const useBrowserAppUi: BrowserUiStore & {
  <T>(selector: (state: BrowserAppUiState) => T): T;
  getState: () => BrowserAppUiState;
} = Object.assign(<T,>(selector: (state: BrowserAppUiState) => T): T => useStore(browserUiStore, selector), {
  getState: browserUiStore.getState,
  setState: (patch: Partial<BrowserAppUiState>) => browserUiStore.setState(patch),
});
