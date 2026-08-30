import { ipcMain, type BrowserWindow } from 'electron';

import { CHANNELS, ok, schemas } from '@midnite/studio-shared';

import {
  activateBrowserTab,
  backBrowserTab,
  clearBrowserData,
  closeBrowserTab,
  createBrowserTab,
  forwardBrowserTab,
  navigateBrowserTab,
  reloadBrowserTab,
  setBrowserBounds,
  setBrowserVisible,
  stopBrowserTab,
} from '../browser-service';
import { handle, handleBare } from './handle';

/**
 * Registers the `mgit:browser:*` channels over `browser-service.ts`.
 *
 * `create` is the one request/response call (the renderer needs to know a
 * view failed to spin up); everything else is a one-way `ipcMain.on`, same
 * as `pty.input`/`pty.resize` — a bounds update fires every animation frame
 * while dragging, and a round-trip would only add latency to typing a URL.
 */
export function registerBrowserHandlers(getWindow: () => BrowserWindow | null): void {
  handle(
    CHANNELS.browserCreate,
    schemas.BrowserCreateRequest,
    async ({ tabId, url }) => {
      const win = getWindow();
      if (!win) return { ok: false as const, message: 'No window' };
      createBrowserTab(win, tabId, url);
      return { ok: true as const };
    },
    (issue) => ({ ok: false as const, message: issue }),
  );

  ipcMain.on(CHANNELS.browserClose, (_event, raw: unknown) => {
    const parsed = schemas.BrowserCloseRequest.safeParse(raw);
    if (parsed.success) closeBrowserTab(parsed.data.tabId);
  });

  ipcMain.on(CHANNELS.browserNavigate, (_event, raw: unknown) => {
    const parsed = schemas.BrowserNavigateRequest.safeParse(raw);
    if (parsed.success) navigateBrowserTab(parsed.data.tabId, parsed.data.url);
  });

  ipcMain.on(CHANNELS.browserBack, (_event, raw: unknown) => {
    const parsed = schemas.BrowserBackRequest.safeParse(raw);
    if (parsed.success) backBrowserTab(parsed.data.tabId);
  });

  ipcMain.on(CHANNELS.browserForward, (_event, raw: unknown) => {
    const parsed = schemas.BrowserForwardRequest.safeParse(raw);
    if (parsed.success) forwardBrowserTab(parsed.data.tabId);
  });

  ipcMain.on(CHANNELS.browserReload, (_event, raw: unknown) => {
    const parsed = schemas.BrowserReloadRequest.safeParse(raw);
    if (parsed.success) reloadBrowserTab(parsed.data.tabId);
  });

  ipcMain.on(CHANNELS.browserStop, (_event, raw: unknown) => {
    const parsed = schemas.BrowserStopRequest.safeParse(raw);
    if (parsed.success) stopBrowserTab(parsed.data.tabId);
  });

  ipcMain.on(CHANNELS.browserSetBounds, (_event, raw: unknown) => {
    const parsed = schemas.BrowserSetBoundsRequest.safeParse(raw);
    if (parsed.success) setBrowserBounds(parsed.data.tabId, parsed.data.bounds);
  });

  ipcMain.on(CHANNELS.browserSetVisible, (_event, raw: unknown) => {
    const parsed = schemas.BrowserSetVisibleRequest.safeParse(raw);
    if (parsed.success) setBrowserVisible(parsed.data.tabId, parsed.data.visible);
  });

  ipcMain.on(CHANNELS.browserActivate, (_event, raw: unknown) => {
    const parsed = schemas.BrowserActivateRequest.safeParse(raw);
    if (parsed.success) activateBrowserTab(parsed.data.tabId);
  });

  handleBare(CHANNELS.browserClearData, async () => {
    await clearBrowserData();
    return ok();
  });
}
