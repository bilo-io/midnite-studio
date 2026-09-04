import { CHANNELS, schemas, type WindowRole } from '@midnite/studio-shared';
import { ipcMain, type BrowserWindow } from 'electron';

import type { Logger } from '../log';
import { reparentBrowserTabs } from '../browser-service';
import { createRoleWindow, listWindows, windowForRole } from '../window-manager';
import { handleBare } from './handle';

const isPopoutRole = (role: WindowRole): role is Exclude<WindowRole, 'main'> => role !== 'main';

/**
 * Multi-window IPC (Phase 55) — detach, dock and focus a panel role, and list
 * every open window.
 *
 * `detach`/`dock`/`focusRole` are one-way `ipcMain.on`, same as `pty.input`:
 * the renderer learns the outcome from `onWindowsChanged`, not from a return
 * value. `role` alone is enough to resolve the target in every case — there
 * is at most one window per role, so nothing here needs the sender.
 */
export function registerWindowHandlers(getMainWindow: () => BrowserWindow | null, log: Logger): void {
  ipcMain.on(CHANNELS.windowDetach, (_event, raw: unknown) => {
    const parsed = schemas.WindowDetachRequest.safeParse(raw);
    if (!parsed.success || !isPopoutRole(parsed.data.role)) return;
    const win = createRoleWindow(parsed.data.role, log);
    // The Embedded Browser moves its WebContentsViews with it — detaching is
    // reparenting, not spinning up a second copy of every tab.
    if (parsed.data.role === 'browser') reparentBrowserTabs(win);
  });

  ipcMain.on(CHANNELS.windowDock, (_event, raw: unknown) => {
    const parsed = schemas.WindowDockRequest.safeParse(raw);
    if (!parsed.success) return;
    const win = windowForRole(parsed.data.role);
    if (!win || win.isDestroyed()) return;
    if (parsed.data.role === 'browser') {
      const main = getMainWindow();
      if (main && !main.isDestroyed()) reparentBrowserTabs(main);
    }
    win.close();
  });

  ipcMain.on(CHANNELS.windowFocusRole, (_event, raw: unknown) => {
    const parsed = schemas.WindowFocusRoleRequest.safeParse(raw);
    if (!parsed.success) return;
    const win = windowForRole(parsed.data.role);
    if (!win || win.isDestroyed()) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  handleBare(CHANNELS.windowList, () => listWindows());
}
