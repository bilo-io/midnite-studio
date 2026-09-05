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
import { BrowserWindow, app, screen, shell, type Display, type WebContents } from 'electron';

import { reparentBrowserTabs } from './browser-service';
import type { Logger } from './log';
import { attachWindowChrome, TRAFFIC_LIGHT_POSITION, windowFrameless } from './window-chrome';
import type { WindowBounds, WindowsStore } from './windows-store';

/** Vite's dev server, matching `window.ts`'s own constant. */
const DEV_SERVER_URL = process.env['MSTUDIO_RENDERER_URL'] ?? 'http://localhost:5173';

/**
 * Default popout size, applied only when `windows-store.ts` has no saved
 * bounds for that role. `main` is never created through this table — the
 * boot sequence's own `createWindow()` (`window.ts`) keeps its existing
 * 1440×900.
 *
 * The five page roles get main-window-ish sizes rather than the panels'
 * deliberately narrow ones: a detached page is a duplicate of a full view, so
 * it wants room to be *used*, not the 420-wide sliver that is the whole point
 * of pulling the Repos rail out.
 */
const DEFAULT_POPOUT_SIZE: Record<Exclude<WindowRole, 'main'>, { width: number; height: number }> = {
  terminal: { width: 1100, height: 640 },
  repos: { width: 420, height: 900 },
  fab: { width: 520, height: 820 },
  browser: { width: 1280, height: 860 },
  graph: { width: 1280, height: 860 },
  actions: { width: 1180, height: 800 },
  changes: { width: 1280, height: 860 },
  files: { width: 1180, height: 820 },
  database: { width: 1280, height: 820 },
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
// Serializes `windows.json` writes: `closeAllPopouts()` (fired on main-window
// close) can close several popouts back-to-back, and unserialized writes of
// different-sized `boundsCache` snapshots can resolve out of order, silently
// dropping whichever geometry was captured first.
let writeChain: Promise<void> = Promise.resolve();

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

/**
 * G.4: a saved rect whose origin falls outside every display's work area is
 * unreachable — the failure mode is a window positioned at `x: 3000` on a
 * single 1440-wide display after the second monitor it lived on was
 * unplugged, invisible with no way to drag it back. Origin-only, not full
 * containment: a window straddling a display edge is still fine.
 */
export function boundsWithinAnyDisplay(bounds: WindowBounds, displays: readonly Display[]): boolean {
  return displays.some(({ workArea }) => {
    return (
      bounds.x >= workArea.x &&
      bounds.y >= workArea.y &&
      bounds.x < workArea.x + workArea.width &&
      bounds.y < workArea.y + workArea.height
    );
  });
}

function loadStoredBounds(role: Exclude<WindowRole, 'main'>): WindowBounds | undefined {
  const bounds = boundsCache[role];
  if (!bounds) return undefined;
  if (!boundsWithinAnyDisplay(bounds, screen.getAllDisplays())) return undefined;
  return bounds;
}

/** Captures geometry on close and persists it — read back by the next `createRoleWindow`. */
function saveBoundsOnClose(win: BrowserWindow, role: Exclude<WindowRole, 'main'>): void {
  win.on('close', () => {
    const [x, y] = win.getPosition();
    const [width, height] = win.getSize();
    boundsCache = { ...boundsCache, [role]: { x, y, width, height } };
    const snapshot = boundsCache;
    const store = windowsStore;
    if (store) writeChain = writeChain.then(() => store.save(snapshot));
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
 * G.5: why a popout's `close` line names the reason it does. Set just before
 * calling `win.close()` from a path that knows something the plain `closed`
 * listener doesn't — a crash, or the explicit re-dock button — and read
 * (then cleared) by that listener. Absent means the ordinary case: the user's
 * own traffic light.
 */
const pendingCloseReason = new Map<number, 'redock' | 'crashed'>();

/** The explicit re-dock path (`windowDock`) — distinguishes its close line from a bare user close. */
export function closePopoutForRedock(win: BrowserWindow): void {
  pendingCloseReason.set(win.id, 'redock');
  win.close();
}

/**
 * A crashed or killed popout renderer closes and re-docks (A.6's rule),
 * pulled forward from Theme G.3 rather than left as a blank frozen window
 * until that theme lands. Mirrors `main/index.ts`'s own `bindRenderProcessGone`
 * for the main window, but a popout heals by closing rather than reloading —
 * a dead popout with no visible content to reload is just a dead window.
 */
export function bindPopoutRenderProcessGone(win: BrowserWindow, log: Logger): void {
  // `log.error`, not the bare call, since Phase 65 Theme D. The message string
  // was already good; what changes is the level, and with it whether the line
  // survives past the stderr a packaged app discards.
  win.webContents.on('render-process-gone', (_event, details) => {
    if (details.reason === 'clean-exit') return;
    log.error(
      `[window] render-process-gone role=${resolveRole(win)} reason=${details.reason} exit=${details.exitCode}`,
    );
    pendingCloseReason.set(win.id, 'crashed');
    if (!win.isDestroyed()) win.close();
  });
  /*
    Not a crash — the popout is alive and has stopped answering. Bound here
    because until Phase 65 `unresponsive` was wired ONLY for embedded browser
    tabs (`browser-service.ts`), so a hung Studio window — the failure a user is
    most likely to actually report — left no record at all. Recorded and not
    acted on: Electron recovers from most of these on its own, and killing a
    window that was merely busy would be a worse bug than the one being logged.
  */
  win.webContents.on('unresponsive', () => {
    log.error(`[window] unresponsive role=${resolveRole(win)}`);
  });
  win.webContents.on('responsive', () => {
    log.info(`[window] responsive again role=${resolveRole(win)}`);
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
      ? { titleBarStyle: 'hidden' as const, trafficLightPosition: TRAFFIC_LIGHT_POSITION }
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
    const reason = pendingCloseReason.get(win.id) ?? 'closed';
    pendingCloseReason.delete(win.id);
    log(`[window] close role=${role} id=${win.id} reason=${reason}`);
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

/**
 * Send `payload` on `channel` to EVERY open window, main included.
 *
 * Theme I's seam. Until it, `watch-service.ts` captured one `BrowserWindow` at
 * watcher-start time — always main — and every other window learned about a
 * file change only because main's renderer rebroadcast it over the Theme E
 * relay. That worked while popouts were panels; it stopped being enough once a
 * PAGE can be detached, because a detached Graph or Changes window is a full
 * data-driven view whose freshness now depends on a renderer in a different
 * window staying mounted and awake to forward for it.
 *
 * Fan-out lives here rather than in `watch-service` because this module is the
 * one that knows what windows exist — and it is fan-out, not a second watcher:
 * `watchers` stays keyed by repoId, so a repo open in three windows is still
 * watched exactly once. N windows cost N `webContents.send` calls, not N
 * recursive fs trees.
 */
export function broadcastToAllWindows(channel: string, payload: unknown): void {
  for (const { win } of windows.values()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload);
  }
}

/**
 * Theme E's cross-window relay: rebroadcast `message` to every window except
 * `originId` (the sender). Fire-and-forget, mirroring `emitWindowsChanged` —
 * the sender already applied its own change locally before asking for this.
 */
export function relayToOtherWindows(originId: number, message: unknown): void {
  for (const { win } of windows.values()) {
    if (win.id === originId || win.isDestroyed()) continue;
    win.webContents.send(EVENT_CHANNELS.windowRelayed, message);
  }
}
