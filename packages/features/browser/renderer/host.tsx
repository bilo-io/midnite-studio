import { createContext, useContext, type ComponentType, type CSSProperties, type ReactNode, type RefObject } from 'react';

import type { GitTooltipProps, IconComponent } from '@midnite/studio-frame';
import type { Remote, RepoDescriptor, WebAppId } from '@midnite/studio-shared';

import type { BrowserLayout } from './browser/browser-layouts';

/**
 * The browser feature's host port — what the browser pane and the web-apps rail need from the app that
 * composes them, beyond the frame (Phase 113 Theme L).
 *
 * The pane, its tabs and the rail are the feature's; *where* the browser sits, which repository is
 * selected, which web apps are enabled and how many surfaces currently sit over a native view are the
 * app's. **Studio** answers all of it from `ui-store` (no persisted key moved), and lends the chrome it
 * still implements in `packages/app` — its modal, tooltip, context menu, Escape stack and brand marks.
 * **Browser** (`apps/browser`) answers from its own small store and plain chrome.
 *
 * `ui` is a zustand-shaped store: callable as a selector hook, with `getState`/`setState` for event
 * handlers. Studio passes `useUiStore` itself, which satisfies it structurally.
 */

/** The app state the feature reads and the transitions it asks for. Names match Studio's `ui-store`. */
/** Which open reputation feeds main may pull (Phase 117 Theme C) — one switch each, all default off. */
export type BrowserReputationFeeds = { urlhaus: boolean; openphish: boolean };

export const DEFAULT_BROWSER_REPUTATION_FEEDS: BrowserReputationFeeds = { urlhaus: false, openphish: false };

export type BrowserUiState = {
  /** Where the pane sits: the whole content area, or beside the work on one side. */
  browserLayout: BrowserLayout;
  browserLauncherOpen: boolean;
  browserSwitcherOpen: boolean;
  browserSwitcherSelected: BrowserLayout;
  /** Idle-discard threshold for a hidden tab; `0` disables discard. */
  browserDiscardMs: number;
  /**
   * Phase 117 Theme C — Settings ▸ Browser's "proceed past a certificate or known-bad warning for this
   * session". Default off: the interstitial has no way past it.
   */
  browserAllowSiteProceed: boolean;
  /** Phase 117 Theme C — Settings ▸ Privacy's reputation-feed switches, each default off. */
  browserReputationFeeds: BrowserReputationFeeds;
  /**
   * How many surfaces are painted over a native view right now — a native `WebContentsView` draws
   * above the DOM, so the browser hides while this is above zero.
   */
  occluders: number;
  /** The selected repository (dev-server tile, repo shortcuts) — null where the app has none. */
  selectedRepoId: string | null;
  selectedWorktreePath: string | null;
  enabledWebApps: WebAppId[];
  detachedWebApps: readonly WebAppId[];
  webAppsFlyoutAppId: WebAppId | null;
  lastOpenedWebAppId: WebAppId | null;

  openBrowser: (layout: BrowserLayout) => void;
  setBrowserOpen: (open: boolean) => void;
  setBrowserLayout: (layout: BrowserLayout) => void;
  closeBrowserLauncher: () => void;
  cycleBrowserSwitcher: (step?: number) => void;
  commitBrowserSwitcher: () => void;
  closeBrowserSwitcher: () => void;
  openWebAppsFlyout: (id: WebAppId) => void;
  closeWebAppsFlyout: () => void;
};

/** Plain fields the feature may write directly (Studio: `useUiStore.setState`). */
export type BrowserUiPatch = Partial<Pick<BrowserUiState, 'browserSwitcherSelected' | 'lastOpenedWebAppId'>>;

export type BrowserUiStore = {
  <T>(selector: (state: BrowserUiState) => T): T;
  getState: () => BrowserUiState;
  setState: (patch: BrowserUiPatch) => void;
};

/** A row of the tab strip's context menu (Studio's `MenuItem`, the subset the strip uses). */
export type BrowserMenuItem =
  | { type: 'separator' }
  | {
      type?: 'item';
      label: string;
      icon?: IconComponent;
      iconStyle?: CSSProperties;
      danger?: boolean;
      disabled?: boolean;
      onSelect: () => void;
      submenu?: never;
    }
  | {
      type?: 'item';
      label: string;
      icon?: IconComponent;
      iconStyle?: CSSProperties;
      danger?: boolean;
      disabled?: boolean;
      submenu: BrowserMenuItem[];
      onSelect?: never;
    };

export type BrowserContextMenuProps = {
  position: { x: number; y: number };
  items: BrowserMenuItem[];
  onClose: () => void;
};

/** Studio's `Modal`, the props the launcher passes. */
export type BrowserModalProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'full';
  variant?: 'plain' | 'gradient';
  align?: 'center' | 'top';
  initialFocusRef?: RefObject<HTMLElement | null>;
  testId?: string;
  scope?: 'content' | 'window';
};

/** Studio's Escape stack (`use-dismiss`): which layer a surface sits in, and whether it hides native views. */
export type BrowserDismissOptions = {
  layer?: 'tooltip' | 'toast' | 'inline' | 'menu' | 'popover' | 'dialog';
  blocking?: boolean;
  occludes?: boolean;
};

export type BrowserHost = {
  ui: BrowserUiStore;

  /**
   * True in an app that *is* the browser (`apps/browser`): the pane is the whole window rather than a
   * panel over another app, so it offers no layout picker, no "Close browser" button and no
   * Escape-to-close, and neither the tab strip nor a web app offers "Detach into its own window" —
   * there is nothing to detach from. Studio passes false and keeps every one of them.
   */
  standalone: boolean;

  /** The repository list, for a derived tab group's name and the new-tab page's repo row. A hook. */
  useRepos: () => { data?: readonly RepoDescriptor[] | undefined };
  /** A repository's remotes, for its forge links. A hook. */
  useRemotes: (repoId: string | null) => { data?: readonly Remote[] | undefined };

  Modal: ComponentType<BrowserModalProps>;
  Tooltip: ComponentType<GitTooltipProps>;
  ContextMenu: ComponentType<BrowserContextMenuProps>;
  /** Escape closes `onDismiss` while `active`, in the app's layer order. A hook. */
  useDismiss: (active: boolean, onDismiss: () => void, options?: BrowserDismissOptions) => void;
  /** Counts this surface as one over the native views while `active`. A hook. */
  useOccluder: (active?: boolean) => void;
  /**
   * The detached window's title-bar slots the tab strip portals into — null in the main window, and in
   * an app whose window has no merged title bar. Hooks.
   */
  usePopoutHeaderLeading: () => HTMLElement | null;
  usePopoutHeaderActions: () => HTMLElement | null;

  /** The app's marks: the strip's new-tab glyph, the new-tab page's hero and its Claude shortcut. */
  MidniteIcon: ComponentType<{ className?: string }>;
  BrandMark: ComponentType<{ className?: string }>;
  Wordmark: ComponentType<{ className?: string }>;
  ClaudeIcon: IconComponent;
  /** Each web app's glyph on the rail and in the flyout. */
  appIcon: Readonly<Record<WebAppId, IconComponent>>;
};

const BrowserHostContext = createContext<BrowserHost | null>(null);

export function BrowserHostProvider({ host, children }: { host: BrowserHost; children: ReactNode }) {
  return <BrowserHostContext.Provider value={host}>{children}</BrowserHostContext.Provider>;
}

/** The installed host. Throws without a provider — unwired, the browser would not know where it sits. */
export function useBrowserHost(): BrowserHost {
  const host = useContext(BrowserHostContext);
  if (!host) throw new Error('The browser feature must be rendered inside <BrowserHostProvider>');
  return host;
}
