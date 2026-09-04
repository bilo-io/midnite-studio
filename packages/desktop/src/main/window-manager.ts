import { existsSync } from 'node:fs';
import { join } from 'node:path';

import {
  APP_VERSION_ARG,
  EVENT_CHANNELS,
  WINDOW_FRAMELESS_ARG,
  WINDOW_ROLE_ARG,
  type WindowDescriptor,
  type WindowRole,
} from '@midnite/studio-shared';
import { BrowserWindow, app, shell, type WebContents } from 'electron';

import { reparentBrowserTabs } from './browser-service';
import type { Logger } from './log';
import { attachWindowChrome, windowFrameless } from './window-chrome';
import type { WindowBounds, WindowsStore } from './windows-store';

/** Vite's dev server, matching `window.ts`'s own constant. */
const DEV_SERVER_URL = process.env['MSTUDIO_RENDERER_URL'] ?? 'http://localhost:5173';

/**
 * Default popout size, applied only when `windows-store.ts` has no saved
 * bounds for that role. `main` is never created through this table — the
 * boot sequence's own `createWindow()` (`window.ts`) keeps its existing
 * 1440×900.
 */
const DEFAULT_POPOUT_SIZE: Record<Exclude<WindowRole, 'main'>, { width: number; height: number }> = {
  terminal: { width: 1100, height: 640 },
  repos: { width: 420, height: 900 },
  fab: { width: 520, height: 820 },
  browser: { width: 1280, height: 860 },
};

/**
 * Popouts take a much smaller floor than the main window's 900×560 — a
 * 420-wide Repos rail is the point of detaching it.
 */
const POPOUT_MIN_SIZE = { minWidth: 360, minHeight: 320 };

const INITIAL_BACKGROUND = '#09090b';

type Entry = { win: BrowserWindow; role: WindowRole };

const windows = new Map<number, Entry>();

let windowsStore: WindowsStore | null = null;
let boundsCache: Partial<Record<WindowRole, WindowBounds>> = {};

/**
 * Wire the persistence layer in, with whatever it already had on disk.
 * Called once at boot, before the first `createRoleWindow` — see
 * `main/index.ts`.
 */
export function configureWindowsStore(
  store: WindowsStore,
  initial: Partial<Record<WindowRole, WindowBounds>>,
): void {
  windowsStore = store;
  boundsCache = initial;
}

function loadStoredBounds(role: Exclude<WindowRole, 'main'>): WindowBounds | undefined {
  return boundsCache[role];
}

/** Captures geometry on close and persists it — read back by the next `createRoleWindow`. */
function saveBoundsOnClose(win: BrowserWindow, role: Exclude<WindowRole, 'main'>): void {
  win.on('close', () => {
    const [x, y] = win.getPosition();
    const [width, height] = win.getSize();
    boundsCache = { ...boundsCache, [role]: { x, y, width, height } };
    void windowsStore?.save(boundsCache);
  });
}

function emitWindowsChanged(): void {
  const descriptors = listWindows();
  for (const { win } of windows.values()) {
    if (!win.isDestroyed()) {
      win.webContents.send(EVENT_CHANNELS.windowsChanged, { windows: descriptors });
    }
  }
}

/** Every open window, main included, for the renderer's popout-aware chrome. */
export function listWindows(): WindowDescriptor[] {
  return [...windows.values()].map(({ win, role }) => ({ id: win.id, role, repoId: null }));
}

export function windowForRole(role: WindowRole): BrowserWindow | null {
  for (const { win, role: r } of windows.values()) {
    if (r === role && !win.isDestroyed()) return win;
  }
  return null;
}

export function resolveRole(win: BrowserWindow): WindowRole {
  return windows.get(win.id)?.role ?? 'main';
}

/**
 * Resolve the window that sent an IPC call, for the handful of handlers where
 * two windows can legitimately ask for different answers (pty subscription,
 * browser tab ownership, watch reconciliation, the native menu). Every other
 * handler keeps asking for "the main window" by name — see `main/index.ts`'s
 * `getMainWindow`.
 */
export function resolveWindow(sender: WebContents): BrowserWindow | null {
  return BrowserWindow.fromWebContents(sender);
}

/** Registers the *main* window too, so `resolveRole`/`listWindows` see it. */
export function registerMainWindow(win: BrowserWindow): void {
  windows.set(win.id, { win, role: 'main' });
  win.once('closed', () => {
    windows.delete(win.id);
  });
  emitWindowsChanged();
}

/**
 * A crashed or killed popout renderer closes and re-docks (A.6's rule),
 * pulled forward from Theme G.3 rather than left as a blank frozen window
 * until that theme lands. Mirrors `main/index.ts`'s own `bindRenderProcessGone`
 * for the main window, but a popout heals by closing rather than reloading —
 * a dead popout with no visible content to reload is just a dead window.
 */
export function bindPopoutRenderProcessGone(win: BrowserWindow, log: Logger): void {
  win.webContents.on('render-process-gone', (_event, details) => {
    if (details.reason === 'clean-exit') return;
    log(`[window] crash role=${resolveRole(win)} reason=${details.reason} exit=${details.exitCode}`);
    if (!win.isDestroyed()) win.close();
  });
}

function rendererEntry(): string {
  const packaged = join(process.resourcesPath, 'renderer', 'index.html');
  if (app.isPackaged || existsSync(packaged)) return packaged;
  return join(__dirname, '..', '..', '..', 'app', 'dist', 'index.html');
}

async function loadPopoutRenderer(win: BrowserWindow): Promise<void> {
  if (!app.isPackaged && process.env['MSTUDIO_USE_BUILT_RENDERER'] !== '1') {
    await win.loadURL(DEV_SERVER_URL);
    return;
  }
  await win.loadFile(rendererEntry());
}

/**
 * Create (or focus, if one already exists) the popout for `role`.
 *
 * Options mirror the main window's own, verbatim — `show`, `backgroundColor`,
 * the darwin-only frameless spread, and `webPreferences` — so a popout is
 * never a weaker-privileged sibling of the window it detached from. Only
 * size differs per role, and only when no saved bounds exist for it.
 */
export function createRoleWindow(role: Exclude<WindowRole, 'main'>, log: Logger): BrowserWindow {
  const existing = windowForRole(role);
  if (existing) {
    if (existing.isMinimized()) existing.restore();
    existing.focus();
    return existing;
  }

  const frameless = windowFrameless();
  const saved = loadStoredBounds(role);
  const size = saved ?? DEFAULT_POPOUT_SIZE[role];

  const win = new BrowserWindow({
    ...size,
    ...POPOUT_MIN_SIZE,
    show: false,
    backgroundColor: INITIAL_BACKGROUND,
    ...(frameless
      ? { titleBarStyle: 'hidden' as const, trafficLightPosition: { x: 16, y: 16 } }
      : {}),
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      additionalArguments: [
        `${WINDOW_FRAMELESS_ARG}${frameless ? '1' : '0'}`,
        `${APP_VERSION_ARG}${app.getVersion()}`,
        `${WINDOW_ROLE_ARG}${role}`,
      ],
    },
  });

  windows.set(win.id, { win, role });
  attachWindowChrome(win);
  bindPopoutRenderProcessGone(win, log);
  saveBoundsOnClose(win, role);

  win.once('ready-to-show', () => win.show());

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });

  // A.6: a popout closed by its own traffic light re-docks — the same
  // outcome as pressing the re-dock button, not a way to lose the panel. For
  // the browser that means moving its WebContentsViews back to main BEFORE
  // the window (and every child view attached to it) is torn down.
  if (role === 'browser') {
    win.on('close', () => {
      const main = windowForRole('main');
      if (main && !main.isDestroyed()) reparentBrowserTabs(main);
    });
  }

  win.on('closed', () => {
    windows.delete(win.id);
    log(`[window] close role=${role} id=${win.id} reason=closed`);
    emitWindowsChanged();
  });

  void loadPopoutRenderer(win);
  log(`[window] open role=${role} id=${win.id}`);
  emitWindowsChanged();
  return win;
}

/** Every registered popout, main window excluded — for closing on main-window close. */
export function closeAllPopouts(): void {
  for (const { win, role } of [...windows.values()]) {
    if (role !== 'main' && !win.isDestroyed()) win.close();
  }
}
