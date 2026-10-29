import { BrowserWindow } from 'electron';

import {
  attachWindowChrome as attachSuiteWindowChrome,
  TRAFFIC_LIGHT_POSITION as SUITE_TRAFFIC_LIGHT_POSITION,
  toggleMaximize,
  windowFrameless as suiteWindowFrameless,
  windowStateOf,
  type WindowState,
} from '@midnite/studio-runtime';
import { CHANNELS, schemas } from '@midnite/studio-shared';

import { defaultLogger } from './log';
import { isScreenLocked } from './lock-state';
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
  return suiteWindowFrameless(process.platform);
}

/** Inset for the native traffic lights — owned by the runtime's `suite-window.ts` since Phase 123 Theme A. */
export const TRAFFIC_LIGHT_POSITION = SUITE_TRAFFIC_LIGHT_POSITION;

/** Forward the window's fullscreen/focus/maximize transitions to the renderer (the runtime's shared implementation). */
export function attachWindowChrome(win: BrowserWindow): void {
  attachSuiteWindowChrome(win);
}

export type { WindowState };

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
      if (!win) return;
      // The zoom gesture a frameless window lacks natively — the runtime's shared logic (no-op in fullscreen).
      toggleMaximize(win);
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
      // Phase 91 Theme D: a reload rehydrates the renderer's lock overlay to "unlocked", so a
      // locked screen refuses it. (Mod+R reaches here through the renderer's own dispatcher.)
      if (isScreenLocked()) return;
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
      ? windowStateOf(win)
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
