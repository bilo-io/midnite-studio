/**
 * The slice of Electron a running game touches (Phase 113 Theme S), declared structurally so the game
 * runner lives in a package that may not import `electron`. Studio's desktop and Gamer's main each hand
 * the runner the real `WebContentsView` and `session` (cast once, at the composer); a test hands it fakes.
 *
 * Methods are declared with method syntax on purpose: it makes their parameters bivariant, which is
 * what lets Electron's own, wider classes stand in for these narrower ports.
 */

/** A listener with arguments the caller narrows itself — `never[]` accepts any handler shape. */
export type GameListener = (...args: never[]) => void;

export type GameWebContents = {
  on(event: string, listener: GameListener): void;
  removeAllListeners(): void;
  close(): void;
  isDestroyed(): boolean;
  debugger: {
    attach(protocolVersion: string): void;
    detach(): void;
    on(event: 'message', listener: (event: unknown, method: string, params: unknown) => void): void;
    sendCommand(method: string): Promise<unknown>;
  };
  setWindowOpenHandler(handler: () => { action: 'deny' }): void;
  reloadIgnoringCache(): void;
  loadURL(url: string): Promise<void>;
  executeJavaScript(code: string): Promise<unknown>;
  setBackgroundThrottling(allowed: boolean): void;
  setAudioMuted(muted: boolean): void;
  isDevToolsOpened(): boolean;
  closeDevTools(): void;
  openDevTools(options: { mode: 'detach' }): void;
};

export type GameView = {
  webContents: GameWebContents;
  setVisible(visible: boolean): void;
  setBounds(bounds: { x: number; y: number; width: number; height: number }): void;
};

export type GameWindow = {
  isDestroyed(): boolean;
  contentView: { addChildView(view: GameView): void; removeChildView(view: GameView): void };
  webContents: { getZoomFactor(): number };
};

/** The popout window: the runner's window plus the one event the popout listens for. */
export type GamePopoutWindow = GameWindow & { on(event: 'close', listener: () => void): void };

/** A download the game's session was asked to start — `browser-security.cancelDownload`'s input. */
export type GameDownloadItem = { getFilename(): string; cancel(): void };

export type GameSession = {
  protocol: { handle(scheme: string, handler: (request: Request) => Promise<Response>): void };
  setPermissionRequestHandler(handler: (wc: unknown, permission: string, callback: (allowed: boolean) => void, details: unknown) => void): void;
  setPermissionCheckHandler(handler: (wc: unknown, permission: string, origin: string, details: unknown) => boolean): void;
  setDevicePermissionHandler?(handler: () => boolean): void;
  webRequest: {
    onBeforeRequest(handler: (details: { url: string }, callback: (response: { cancel: boolean }) => void) => void): void;
  };
  on(event: 'will-download', listener: (event: unknown, item: GameDownloadItem) => void): void;
};

/** The webPreferences a game's view is created with — the runner owns the table, the composer only forwards it. */
export type GameViewOptions = { webPreferences: Record<string, unknown> };

/** What the composer supplies: Electron's `session` and `WebContentsView`, narrowed. */
export type GameElectron<V extends GameView = GameView> = {
  /** `session.fromPartition`. */
  sessionFromPartition(partition: string): GameSession;
  /** `new WebContentsView(options)`. */
  createView(options: GameViewOptions): V;
  /** `browser-security.cancelDownload`: refuses a download and reports the file name it refused. */
  cancelDownload(item: GameDownloadItem, report: (filename: string) => void): void;
  /** `net.fetch`, for the `mstudio-game:` protocol handler. */
  fetchFile: import('./game-protocol').GameFileFetch;
};
