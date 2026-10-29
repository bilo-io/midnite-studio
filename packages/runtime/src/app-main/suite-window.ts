import { EVENT_CHANNELS, WINDOW_FRAMELESS_ARG } from '@midnite/studio-shared';

/**
 * The suite's window chrome (Phase 123 Theme A): the options that make an app's window frameless, and
 * the events its renderer-drawn title bar needs — shared by Studio and every app, so each opens the same
 * window. The runtime never imports `electron`, so the window is a structural type and each app keeps
 * its own `new BrowserWindow({...})` (sizes and `webPreferences` stay visible in its own main).
 *
 * Nothing here sets `sandbox`, `contextIsolation`, `nodeIntegration` or `devTools`: the helper cannot
 * weaken the per-app security options it is spread beside.
 */

/**
 * Inset for native macOS window controls (traffic lights) hosted inside `@bilo-io/shell`'s 48px
 * `<TitleBar>`. The 14px buttons centre on the 24px midline of the bar's controls at `y: 13`.
 */
export const TRAFFIC_LIGHT_POSITION = { x: 16, y: 13 } as const;

/**
 * macOS-only for now: there the window drops its native title bar and the renderer draws its own.
 * Windows and Linux keep their native frame.
 */
export function windowFrameless(platform: NodeJS.Platform): boolean {
  return platform === 'darwin';
}

export type SuiteWindowOptions = {
  titleBarStyle?: 'hidden';
  trafficLightPosition?: { x: number; y: number };
  additionalArguments: string[];
};

/**
 * Spread into `new BrowserWindow({ ... })`; merge `additionalArguments` with the window's own
 * (`webPreferences.additionalArguments`) rather than replacing them.
 */
export function suiteWindowOptions(platform: NodeJS.Platform): SuiteWindowOptions {
  return windowFrameless(platform)
    ? {
        titleBarStyle: 'hidden',
        trafficLightPosition: { ...TRAFFIC_LIGHT_POSITION },
        additionalArguments: [`${WINDOW_FRAMELESS_ARG}1`],
      }
    : { additionalArguments: [`${WINDOW_FRAMELESS_ARG}0`] };
}

export type WindowState = { maximized: boolean; fullScreen: boolean; focused: boolean };

export type ChromeableWindow = {
  isFullScreen(): boolean;
  isMaximized(): boolean;
  isFocused(): boolean;
  isDestroyed(): boolean;
  maximize(): void;
  unmaximize(): void;
  on(
    event: 'enter-full-screen' | 'leave-full-screen' | 'focus' | 'blur' | 'maximize' | 'unmaximize',
    fn: () => void,
  ): unknown;
  webContents: { send(channel: string, ...args: unknown[]): void };
};

export function windowStateOf(win: ChromeableWindow, override: Partial<WindowState> = {}): WindowState {
  return {
    maximized: win.isMaximized(),
    fullScreen: win.isFullScreen(),
    focused: win.isFocused(),
    ...override,
  };
}

/**
 * Forward the window's fullscreen/focus/maximize transitions to the renderer. The title bar collapses
 * its traffic-light clearance in fullscreen, dims while blurred, and shows the right maximize
 * affordance; `env(titlebar-area-*)` is not populated on macOS, so these events are the only source.
 */
export function attachWindowChrome(win: ChromeableWindow): void {
  const push = (override: Partial<WindowState> = {}): void => {
    if (!win.isDestroyed()) win.webContents.send(EVENT_CHANNELS.windowStateChanged, windowStateOf(win, override));
  };
  // The fullscreen events fire before `isFullScreen()` flips, so they carry their own value.
  win.on('enter-full-screen', () => push({ fullScreen: true }));
  win.on('leave-full-screen', () => push({ fullScreen: false }));
  win.on('focus', () => push());
  win.on('blur', () => push());
  win.on('maximize', () => push());
  win.on('unmaximize', () => push());
}

/**
 * Double-click on the drag region. A frameless window has no native title bar for macOS to apply
 * double-click-to-zoom to, so the renderer reports it and the zoom happens here. A no-op in full screen.
 */
export function toggleMaximize(win: ChromeableWindow): void {
  if (win.isDestroyed() || win.isFullScreen()) return;
  if (win.isMaximized()) win.unmaximize();
  else win.maximize();
}
