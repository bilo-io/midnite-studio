import { BrowserWindow } from 'electron';

import { CHANNELS, EVENT_CHANNELS, schemas } from '@midnite/studio-shared';

import { defaultLogger } from './log';
import { handleBareFromSender, handleSendFromSender } from './ipc/handle';

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

/**
 * Inset for native macOS window controls (traffic lights) hosted inside
 * `@bilo-io/shell`'s 48px `<TitleBar>` (`TITLE_BAR_HEIGHT`).
 *
 * macOS window buttons have a 14px diameter in a 16px frame. An inset of
 * `{ x: 16, y: 13 }` aligns their center with the 24px vertical center of the
 * 48px bar's interactive controls (back/forward, search pill, repo badge),
 * resolving the vertical offset where `y: 16` placed them noticeably low.
 */
export const TRAFFIC_LIGHT_POSITION = { x: 16, y: 13 } as const;

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

const warnInvalid = (issue: string): void => {
  defaultLogger.warn(issue);
};

/**
 * Register the renderer → main half of the chrome bridge.
 *
 * Sender-resolved (Phase 55), not bound to one captured window: every window
 * now draws its own `<TitleBar>` (main and every popout), and this is one
 * global `ipcMain` registration shared by all of them. Resolving
 * `BrowserWindow.fromWebContents(event.sender)` per call is what makes a
 * popout's own minimize/maximize/close/reload act on ITSELF — the earlier
 * single-`getWindow`-closure version routed every window's title-bar button
 * to the main window regardless of which one was actually clicked.
 */
export function registerWindowChrome(): void {
  handleSendFromSender(
    CHANNELS.windowMinimize,
    schemas.SendVoidSchema,
    (_payload, win) => {
      if (win && !win.isDestroyed()) win.minimize();
    },
    warnInvalid,
  );
  handleSendFromSender(
    CHANNELS.windowMaximizeToggle,
    schemas.SendVoidSchema,
    (_payload, win) => {
      if (!win || win.isDestroyed()) return;
      // A frameless window has no native title bar for macOS to apply the
      // double-click-to-zoom gesture to, so the renderer reports the
      // double-click and the zoom happens here. Fullscreen is left alone —
      // zoom is meaningless there and macOS ignores it.
      if (win.isFullScreen()) return;
      if (win.isMaximized()) win.unmaximize();
      else win.maximize();
    },
    warnInvalid,
  );
  handleSendFromSender(
    CHANNELS.windowClose,
    schemas.SendVoidSchema,
    (_payload, win) => {
      if (win && !win.isDestroyed()) win.close();
    },
    warnInvalid,
  );
  handleSendFromSender(
    CHANNELS.windowReload,
    schemas.WindowReloadRequest,
    (hard, win) => {
      if (!win || win.isDestroyed()) return;
      if (hard === true) win.webContents.reloadIgnoringCache();
      else win.webContents.reload();
    },
    warnInvalid,
  );

  /**
   * The host window's own zoom (Phase 32 Theme G) — `Mod+=`/`Mod+-`/`Mod+0`
   * routed here (not to a role's native accelerator, which `menu.ts` strips
   * for exactly this reason) while the browser pane is not what owns the
   * chord. `0.5` per step matches Electron's own role-based zoom increment,
   * so the behaviour is identical to the accelerator this replaces.
   */
  handleSendFromSender(
    CHANNELS.windowZoom,
    schemas.WindowZoomRequest,
    ({ action }, win) => {
      if (!win || win.isDestroyed()) return;
      switch (action) {
        case 'in':
          win.webContents.setZoomLevel(win.webContents.getZoomLevel() + 0.5);
          break;
        case 'out':
          win.webContents.setZoomLevel(win.webContents.getZoomLevel() - 0.5);
          break;
        case 'reset':
          win.webContents.setZoomLevel(0);
          break;
      }
    },
    warnInvalid,
  );

  handleBareFromSender(CHANNELS.windowState, (win) =>
    win && !win.isDestroyed()
      ? stateOf(win)
      : { maximized: false, fullScreen: false, focused: false },
  );

  // Retint the native window backing when the app theme changes, so resize
  // flashes and the rounded-corner backing stay seamless with the UI.
  handleSendFromSender(
    CHANNELS.windowSetBackground,
    schemas.WindowSetBackgroundRequest,
    (color, win) => {
      if (win && !win.isDestroyed()) win.setBackgroundColor(color);
    },
    warnInvalid,
  );
}
