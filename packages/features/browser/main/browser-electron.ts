import type { BrowserEvent, CommandId } from '@midnite/studio-shared';

import type { DeviceSession, DownloadItemLike, PermissionSession } from './browser-security';

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
export type BrowserNavigationDetails = {
  url: string;
  /** Electron sets it on `will-redirect` (which fires for subframes too); `will-navigate` is main-frame only. */
  isMainFrame?: boolean;
  preventDefault(): void;
};

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
  on(
    event: 'certificate-error',
    listener: (
      event: BrowserPreventable,
      url: string,
      error: string,
      certificate: unknown,
      callback: (isTrusted: boolean) => void,
      isMainFrame: boolean,
    ) => void,
  ): void;
  /** Phase 117 Theme A: refused by `refuseWebviewAttach`, whatever `webviewTag` says. */
  on(event: 'will-attach-webview', listener: (event: BrowserPreventable) => void): void;
  /** Phase 117 Theme C: ties `webRequest` details (`webContentsId`) back to a tab. */
  readonly id: number;
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
 * The one field of an Electron `Cookie` anything here reads (Phase 113 Theme J slice 3): which site it
 * belongs to. Electron hands back the whole cookie — name, value, path, flags — but the port names only
 * `domain`, so code written against it cannot reach a value without a cast.
 */
export type BrowserCookieDomain = { domain?: string };

/**
 * A partition's `Session` — what `denyAllPermissions` (`browser-security.ts`'s own structural
 * `PermissionSession`), the download refusal, "clear data" and the Vault's sign-in listing use.
 */
export type BrowserSession = PermissionSession & DeviceSession & {
  on(event: 'will-download', listener: (event: unknown, item: DownloadItemLike, webContents: unknown) => void): void;
  /** Phase 117 Theme A: Chromium's spellchecker sends typed text to the OS service — off by policy. */
  setSpellCheckerEnabled(enabled: boolean): void;
  /** Phase 117 Theme C: records every verification result (it always answers `-3`, "use Chromium's"). */
  setCertificateVerifyProc(proc: (request: CertificateVerifyRequest, callback: (verificationResult: number) => void) => void): void;
  /**
   * Phase 117 Theme C/E. Electron keeps ONE listener per event per session, so each event has one
   * owner (swarm board, 2026-10-22): Theme C owns `onCompleted` (observe-only); Theme E owns
   * `onBeforeRequest`/`onBeforeSendHeaders`/`onHeadersReceived`.
   */
  webRequest: { onCompleted(listener: (details: CompletedRequestDetails) => void): void };
  clearStorageData(): Promise<void>;
  clearCache(): Promise<void>;
  /** `session.cookies` — `get({})` is every cookie in the partition. */
  cookies: { get(filter: Record<string, never>): Promise<readonly BrowserCookieDomain[]> };
};

/** What `setCertificateVerifyProc` hands its proc — the fields Theme C reads. */
export type CertificateVerifyRequest = {
  hostname: string;
  /** `'net::OK'` or Chromium's error name, e.g. `'net::ERR_CERT_DATE_INVALID'`. */
  verificationResult: string;
  errorCode: number;
};

/** `webRequest.onCompleted`'s details — the fields Theme C reads. */
export type CompletedRequestDetails = {
  url: string;
  method: string;
  resourceType: string;
  webContentsId?: number;
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
