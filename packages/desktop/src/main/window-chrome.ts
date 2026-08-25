import { BrowserWindow, ipcMain } from 'electron';

import { CHANNELS, EVENT_CHANNELS } from '@midnite-git/shared';

/**
 * Window chrome for the app-drawn title bar.
 *
 * macOS-only for now: there the window drops its native title bar
 * (`titleBarStyle: 'hidden'` with inset traffic lights) and the renderer draws
 * its own via `@bilo-io/shell`'s <TitleBar>. Windows and Linux keep their
 * native frame, and <TitleBar> renders nothing when `frameless` is false — so
 * nothing here needs a per-platform branch in the renderer.
 */
export function windowFrameless(): boolean {
  return process.platform === 'darwin';
}

/** `#rrggbb` only — anything else is dropped rather than handed to Electron. */
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/**
 * Forward the window's fullscreen/focus/maximize transitions to the renderer.
 *
 * The title bar needs all three: it collapses its traffic-light clearance in
 * fullscreen (macOS hides the lights there), dims while the window is blurred
 * like a native bar, and shows the right maximize affordance. `env(titlebar-area-*)`
 * is not populated on macOS, so these events are the only source of truth.
 */
export function attachWindowChrome(win: BrowserWindow): void {
  const sendFullscreen = (value: boolean): void => {
    if (!win.isDestroyed()) win.webContents.send(EVENT_CHANNELS.windowStateChanged, stateOf(win, { fullScreen: value }));
  };

  win.on('enter-full-screen', () => sendFullscreen(true));
  win.on('leave-full-screen', () => sendFullscreen(false));
  win.on('focus', () => pushState(win));
  win.on('blur', () => pushState(win));
  win.on('maximize', () => pushState(win));
  win.on('unmaximize', () => pushState(win));
}

export type WindowState = { maximized: boolean; fullScreen: boolean; focused: boolean };

const stateOf = (win: BrowserWindow, override: Partial<WindowState> = {}): WindowState => ({
  maximized: win.isMaximized(),
  fullScreen: win.isFullScreen(),
  focused: win.isFocused(),
  ...override,
});

const pushState = (win: BrowserWindow): void => {
  if (!win.isDestroyed()) win.webContents.send(EVENT_CHANNELS.windowStateChanged, stateOf(win));
};

/**
 * Register the renderer → main half of the chrome bridge.
 *
 * `getWindow` is read lazily rather than captured: on macOS the app survives
 * its last window closing, and a captured reference would be to a destroyed
 * window after a dock-icon reactivate.
 */
export function registerWindowChrome(getWindow: () => BrowserWindow | null): void {
  const withWindow = (fn: (win: BrowserWindow) => void) => () => {
    const win = getWindow();
    if (win && !win.isDestroyed()) fn(win);
  };

  ipcMain.on(CHANNELS.windowMinimize, withWindow((win) => win.minimize()));
  ipcMain.on(
    CHANNELS.windowMaximizeToggle,
    withWindow((win) => {
      // A frameless window has no native title bar for macOS to apply the
      // double-click-to-zoom gesture to, so the renderer reports the
      // double-click and the zoom happens here. Fullscreen is left alone —
      // zoom is meaningless there and macOS ignores it.
      if (win.isFullScreen()) return;
      if (win.isMaximized()) win.unmaximize();
      else win.maximize();
    }),
  );
  ipcMain.on(CHANNELS.windowClose, withWindow((win) => win.close()));

  ipcMain.handle(CHANNELS.windowState, () => {
    const win = getWindow();
    return win && !win.isDestroyed()
      ? stateOf(win)
      : { maximized: false, fullScreen: false, focused: false };
  });

  // Retint the native window backing when the app theme changes, so resize
  // flashes and the rounded-corner backing stay seamless with the UI. Never
  // trust the payload — anything that isn't `#rrggbb` is dropped.
  ipcMain.on(CHANNELS.windowSetBackground, (_event, color: unknown) => {
    if (typeof color !== 'string' || !HEX_RE.test(color)) return;
    const win = getWindow();
    if (win && !win.isDestroyed()) win.setBackgroundColor(color);
  });
}
