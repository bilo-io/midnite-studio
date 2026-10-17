import type { BrowserEvent, CommandId } from '@midnite/studio-shared';

import type { DownloadItemLike, PermissionSession } from './browser-security';

/**
 * The slice of Electron the browser and web-apps services touch (Phase 113 Theme L), declared
 * structurally so they live in a package that may not import `electron` — the media-game runner's
 * `GameElectron` precedent. Studio's desktop and the Browser app's main each install the real
 * `WebContentsView`, `session`, `screen` and `shell` once, at the composer, with a single cast
 * (`installBrowserMain`); a test installs fakes.
 *
 * Every member is one the services called on Electron's own objects before they moved — nothing is
 * narrowed in behaviour, only in type. Methods use method syntax on purpose: their parameters are then
 * bivariant, which is what lets Electron's wider, overloaded classes stand in for these ports.
 */

/** A `before-input-event` keystroke — the fields `isModChord` reads. */
export type BrowserInput = {
  type: string;
  key: string;
  meta: boolean;
  control: boolean;
  shift: boolean;
  alt: boolean;
};

/** A navigation the view is about to make — `will-navigate`/`will-redirect`'s details. */
export type BrowserNavigationDetails = { url: string; preventDefault(): void };

/** An event whose default can be refused (`certificate-error`, `before-input-event`). */
export type BrowserPreventable = { preventDefault(): void };

export type BrowserWebContents = {
  on(event: 'did-navigate' | 'did-navigate-in-page', listener: (event: unknown, url: string) => void): void;
  on(event: 'page-title-updated', listener: (event: unknown, title: string) => void): void;
  on(event: 'page-favicon-updated', listener: (event: unknown, favicons: string[]) => void): void;
  on(event: 'did-start-loading' | 'did-stop-loading' | 'unresponsive', listener: () => void): void;
  on(
    event: 'did-fail-load',
    listener: (event: unknown, errorCode: number, errorDescription: string, validatedUrl: string, isMainFrame: boolean) => void,
  ): void;
  on(event: 'render-process-gone', listener: (event: unknown, details: { reason: string; exitCode: number }) => void): void;
  on(event: 'found-in-page', listener: (event: unknown, result: { matches: number; activeMatchOrdinal: number }) => void): void;
  on(event: 'before-input-event', listener: (event: BrowserPreventable, input: BrowserInput) => void): void;
  on(event: 'will-navigate' | 'will-redirect', listener: (details: BrowserNavigationDetails) => void): void;
  on(event: 'certificate-error', listener: (event: BrowserPreventable, url: string) => void): void;
  removeAllListeners(): void;
  close(): void;
  isDestroyed(): boolean;
  getOSProcessId(): number;
  getTitle(): string;
  getURL(): string;
  isCurrentlyAudible(): boolean;
  navigationHistory: { canGoBack(): boolean; canGoForward(): boolean; goBack(): void; goForward(): void };
  loadURL(url: string): Promise<void>;
  reload(): void;
  stop(): void;
  isDevToolsOpened(): boolean;
  closeDevTools(): void;
  openDevTools(options: { mode: 'detach' | 'bottom' }): void;
  findInPage(text: string, options: { forward: boolean; findNext: boolean }): unknown;
  stopFindInPage(action: 'clearSelection'): void;
  setZoomFactor(factor: number): void;
  setWindowOpenHandler(handler: (details: { url: string; disposition: string }) => { action: 'deny' }): void;
};

/** A `WebContentsView`. */
export type BrowserView = {
  webContents: BrowserWebContents;
  setVisible(visible: boolean): void;
  setBounds(bounds: { x: number; y: number; width: number; height: number }): void;
};

/** A host `BrowserWindow` — the window a view is attached to. */
export type BrowserHostWindow = {
  isDestroyed(): boolean;
  isVisible(): boolean;
  isMinimized(): boolean;
  contentView: { addChildView(view: BrowserView): void; removeChildView(view: BrowserView): void };
  webContents: {
    getZoomFactor(): number;
    send(channel: string, payload: BrowserEvent | CommandId): void;
  };
  on(event: 'enter-full-screen' | 'leave-full-screen', listener: () => void): void;
};

/**
 * A partition's `Session` — what `denyAllPermissions` (`browser-security.ts`'s own structural
 * `PermissionSession`), the download refusal and "clear data" use.
 */
export type BrowserSession = PermissionSession & {
  on(event: 'will-download', listener: (event: unknown, item: DownloadItemLike, webContents: unknown) => void): void;
  clearStorageData(): Promise<void>;
  clearCache(): Promise<void>;
};

/** The webPreferences a view is created with — the services own the table, the composer only forwards it. */
export type BrowserViewOptions = { webPreferences: Record<string, unknown> };

/** What the composer supplies: Electron's `WebContentsView`, `session`, `screen` and `shell`, narrowed. */
export type BrowserElectron = {
  /** `new WebContentsView(options)`. */
  createView(options: BrowserViewOptions): BrowserView;
  /** `session.fromPartition`. */
  sessionFromPartition(partition: string): BrowserSession;
  /** `screen.on('display-metrics-changed', listener)`. */
  onDisplayMetricsChanged(listener: () => void): void;
  /** `shell.openExternal`. */
  openExternal(url: string): Promise<void>;
};
