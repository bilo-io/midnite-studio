import type { CaptureOverlayOpener } from './overlay';
import type {
  CaptureClipboard,
  CaptureDesktopSource,
  CaptureDisplay,
  CaptureElectron,
  CaptureGlobalShortcut,
  CaptureImage,
} from './port';

/**
 * Builds {@link CaptureElectron} from Electron's own modules (Phase 113 Theme K), so Studio's desktop
 * and `apps/capture` share one adapter instead of each writing it.
 *
 * Every parameter is structural — the narrowest shape the real module satisfies — so this file still
 * imports no `electron` (the layer rule) and a composer passes `electron`'s modules with one cast. No
 * test calls this with the real modules: it is a straight mapping, and the behaviour it feeds is
 * tested over `test-fixtures.ts`' fakes.
 */
export type CaptureElectronModules = {
  platform: string;
  desktopCapturer: {
    getSources(options: {
      types: Array<'screen' | 'window'>;
      thumbnailSize: { width: number; height: number };
    }): Promise<CaptureDesktopSource[]>;
  };
  systemPreferences: { getMediaAccessStatus(mediaType: 'screen'): string };
  screen: {
    getAllDisplays(): CaptureDisplay[];
    getCursorScreenPoint(): { x: number; y: number };
    getDisplayNearestPoint(point: { x: number; y: number }): CaptureDisplay;
  };
  globalShortcut: CaptureGlobalShortcut;
  clipboard: ElectronClipboard;
  /** Electron's `ClipboardItem` class — what an image is written to the clipboard as. */
  ClipboardItem: new (items: Record<string, Blob>) => unknown;
  nativeImage: { createFromBuffer(buffer: Uint8Array): CaptureImage };
  shell: { showItemInFolder(path: string): void; openExternal(url: string): Promise<void> };
};

/**
 * Electron 44+'s main-process `clipboard`: promise-based and modelled on the W3C Async Clipboard API.
 * `readImage`/`writeImage`/`availableFormats` are gone; an image travels as a `ClipboardItem` blob.
 */
export type ElectronClipboard = {
  read(): Promise<Array<{ readonly types: string[]; getType(type: string): Promise<unknown> }>>;
  has(mimetype: string): Promise<boolean>;
  readText(): Promise<string>;
  writeText(text: string): Promise<void>;
  write(items: unknown[]): Promise<void>;
};

/** How Electron 44+ names a raw pasteboard type (a UTI such as `org.nspasteboard.ConcealedType`). */
const RAW_FORMAT = /^electron application\/osclipboard;format="(.*)"$/;
const rawFormat = (type: string) => `electron application/osclipboard;format="${type}"`;
/** Always listed by Electron 44+ on macOS, even on an empty clipboard; it is not content. */
const FIND_TEXT = 'electron application/findtext';

/**
 * {@link CaptureClipboard} over Electron 44+'s `clipboard`. Raw pasteboard types come back by their
 * bare name, so a password manager's `org.nspasteboard.ConcealedType` marker still matches
 * `CLIPBOARD_SKIP_MARKERS` (checked against Electron 45 on macOS: `has()` on the bare name is false,
 * on the `osclipboard` form true).
 */
export function electronCaptureClipboard(
  clipboard: ElectronClipboard,
  ClipboardItem: CaptureElectronModules['ClipboardItem'],
  nativeImage: CaptureElectronModules['nativeImage'],
): CaptureClipboard {
  const types = async () => (await clipboard.read())[0]?.types ?? [];
  return {
    availableFormats: async () =>
      (await types()).flatMap((t) => (t === FIND_TEXT ? [] : [RAW_FORMAT.exec(t)?.[1] ?? t])),
    has: (format) => clipboard.has(format.includes('/') ? format : rawFormat(format)),
    readText: () => clipboard.readText(),
    readImage: async () => {
      const [item] = await clipboard.read();
      const type = item?.types.includes('image/png') ? 'image/png' : item?.types.find((t) => t.startsWith('image/'));
      if (!item || !type) return nativeImage.createFromBuffer(new Uint8Array(0));
      const blob = (await item.getType(type)) as Blob;
      return nativeImage.createFromBuffer(new Uint8Array(await blob.arrayBuffer()));
    },
    writeText: (text) => clipboard.writeText(text),
    writeImage: (image) =>
      clipboard.write([new ClipboardItem({ 'image/png': new Blob([new Uint8Array(image.toPNG())], { type: 'image/png' }) })]),
  };
}

/** A window as far as hiding it for a screen grab goes. */
export type CaptureOwnWindow = {
  isDestroyed(): boolean;
  isVisible(): boolean;
  hide(): void;
  showInactive(): void;
};

/** System Settings ▸ Privacy & Security ▸ Screen Recording — a local URL scheme, not a network call. */
export const SCREEN_RECORDING_SETTINGS_URL =
  'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture';

/** How long the window server is given to take a hidden window off screen before the grab. */
export const HIDE_SETTLE_MS = 180;

export function electronCapturePort(
  modules: CaptureElectronModules,
  options: {
    /** This app's windows — hidden for a screen grab when the user's setting says so. */
    windows?: () => CaptureOwnWindow[];
    focusApp?: () => void;
    settleMs?: number;
  } = {},
): CaptureElectron {
  const {
    desktopCapturer,
    systemPreferences,
    screen,
    globalShortcut,
    clipboard,
    ClipboardItem,
    nativeImage,
    shell,
  } = modules;
  const settle = options.settleMs ?? HIDE_SETTLE_MS;
  const windows = options.windows;
  return {
    platform: modules.platform,
    getSources: (request) => desktopCapturer.getSources(request),
    screenAccessStatus: () => systemPreferences.getMediaAccessStatus('screen'),
    openScreenRecordingSettings: () => shell.openExternal(SCREEN_RECORDING_SETTINGS_URL),
    displays: () => screen.getAllDisplays(),
    displayUnderPointer: () => screen.getDisplayNearestPoint(screen.getCursorScreenPoint()),
    globalShortcut,
    clipboard: electronCaptureClipboard(clipboard, ClipboardItem, nativeImage),
    imageFromPng: (bytes) => nativeImage.createFromBuffer(bytes),
    showItemInFolder: (path) => shell.showItemInFolder(path),
    ...(windows
      ? {
          hideOwnWindows: async () => {
            const hidden = windows().filter((w) => !w.isDestroyed() && w.isVisible());
            for (const w of hidden) w.hide();
            if (hidden.length > 0) await new Promise((resolve) => setTimeout(resolve, settle));
            return () => {
              for (const w of hidden) if (!w.isDestroyed()) w.showInactive();
            };
          },
        }
      : {}),
    ...(options.focusApp ? { focusApp: options.focusApp } : {}),
  };
}

// --- the region overlay window ---------------------------------------------------------

/** A `BrowserWindow`, as far as the overlay opener drives it. */
export type CaptureOverlayBrowserWindow = {
  isDestroyed(): boolean;
  close(): void;
  show(): void;
  focus(): void;
  setAlwaysOnTop(flag: boolean, level?: string): void;
  on(event: 'blur' | 'closed', listener: () => void): unknown;
  once(event: 'ready-to-show', listener: () => void): unknown;
  loadFile(path: string): Promise<void>;
};

/**
 * The overlay window's options (Phase 113 Theme K slice 2): exactly the display's bounds, no frame,
 * transparent, above everything (the menu bar and the Dock included), off the Dock and the window list,
 * not resizable or movable — and a sandboxed, isolated renderer with no Node, whose only preload is the
 * overlay's own and whose only argument is this overlay's token.
 */
export function overlayWindowOptions(request: {
  bounds: { x: number; y: number; width: number; height: number };
  token: string;
  preloadPath: string;
  tokenArg: string;
}): Record<string, unknown> {
  const { bounds } = request;
  return {
    x: Math.round(bounds.x),
    y: Math.round(bounds.y),
    width: Math.round(bounds.width),
    height: Math.round(bounds.height),
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    enableLargerThanScreen: true,
    roundedCorners: false,
    title: 'Capture region',
    webPreferences: {
      preload: request.preloadPath,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false,
      additionalArguments: [`${request.tokenArg}${request.token}`],
    },
  };
}

/**
 * Builds the {@link CaptureOverlayOpener} from the composer's window factory. `createWindow` is the
 * composer's `new BrowserWindow(options)` **with its navigation guard already installed** (Studio's and
 * Midnite Capture's mains call `guardAppWindow` on it), so this file still imports no `electron`. The page
 * is the app's own `capture-overlay.html` off disk; the window closes on blur, and its `closed` is what
 * tells the controller it went.
 */
export function electronOverlayOpener(options: {
  createWindow: (windowOptions: Record<string, unknown>) => CaptureOverlayBrowserWindow;
  htmlPath: string;
  preloadPath: string;
  tokenArg: string;
}): CaptureOverlayOpener {
  return ({ token, bounds, onClosed }) => {
    const win = options.createWindow(
      overlayWindowOptions({
        bounds,
        token,
        preloadPath: options.preloadPath,
        tokenArg: options.tokenArg,
      }),
    );
    const close = () => {
      if (!win.isDestroyed()) win.close();
    };
    win.setAlwaysOnTop(true, 'screen-saver');
    win.on('blur', close);
    win.on('closed', onClosed);
    win.once('ready-to-show', () => {
      if (win.isDestroyed()) return;
      win.show();
      win.focus();
    });
    win.loadFile(options.htmlPath).catch(close);
    return { close };
  };
}
