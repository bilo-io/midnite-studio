import { appIdForRole, CHANNELS, schemas, type WindowRole } from '@midnite/studio-shared';
import type { BrowserWindow } from 'electron';

import type { Logger } from '../log';
import { reparentAppView } from '../apps-service';
import { reparentBrowserTabs } from '../browser-service';
import {
  closePopoutForRedock,
  createRoleWindow,
  listWindows,
  relayToOtherWindows,
  setWindowRepo,
  windowForRole,
} from '../window-manager';
import { handleBare, handleSend, handleSendFromSender } from './handle';

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
  const warnInvalid = (issue: string): void => {
    log.warn(issue);
  };

  handleSend(
    CHANNELS.windowDetach,
    schemas.WindowDetachRequest,
    ({ role }) => {
      if (!isPopoutRole(role)) return;
      const win = createRoleWindow(role, log);
      // The Embedded Browser moves its WebContentsViews with it — detaching is
      // reparenting, not spinning up a second copy of every tab.
      if (role === 'browser') reparentBrowserTabs(win);
      // Each third-party app (Theme D) moves independently, unlike the
      // browser's tabs which all move together — Spotify detaching must never
      // touch Calendar's window. Shown immediately: a popout hosts exactly one
      // app, so there is no "which one is active" question to answer here.
      const detachingAppId = appIdForRole(role);
      if (detachingAppId) reparentAppView(detachingAppId, win, { visible: true });
    },
    warnInvalid,
  );

  handleSend(
    CHANNELS.windowDock,
    schemas.WindowDockRequest,
    ({ role }) => {
      const win = windowForRole(role);
      if (!win || win.isDestroyed()) return;
      if (role === 'browser') {
        const main = getMainWindow();
        if (main && !main.isDestroyed()) reparentBrowserTabs(main);
      }
      const dockingAppId = appIdForRole(role);
      if (dockingAppId) {
        const main = getMainWindow();
        // Hidden, not shown: the main window's flyout may already have a
        // different app active, and re-docking must never steal its spot. The
        // next `apps.activate` (a rail click, or `use-window-sync.ts`'s own
        // reconciliation) decides what shows.
        if (main && !main.isDestroyed()) reparentAppView(dockingAppId, main, { visible: false });
      }
      closePopoutForRedock(win);
    },
    warnInvalid,
  );

  handleSend(
    CHANNELS.windowFocusRole,
    schemas.WindowFocusRoleRequest,
    ({ role }) => {
      const win = windowForRole(role);
      if (!win || win.isDestroyed()) return;
      if (win.isMinimized()) win.restore();
      win.focus();
    },
    warnInvalid,
  );

  handleBare(CHANNELS.windowList, () => listWindows());

  // Theme E: rebroadcast to every window except whichever sent it. Resolved
  // from `event.sender` rather than a field in the payload — a renderer
  // cannot claim to be a window it isn't, the same reason `handleFromSender`
  // exists for the invoke handlers.
  handleSendFromSender(
    CHANNELS.windowRelay,
    schemas.WindowRelayMessage,
    (message, win) => {
      if (!win) return;
      relayToOtherWindows(win.id, message);
    },
    warnInvalid,
  );

  // Theme D.1: a window telling main which repo it is showing right now.
  // Resolved from `event.sender`, same distrust as `windowRelay` above — a
  // renderer reports for itself only, never for another window's id.
  handleSendFromSender(
    CHANNELS.windowReportRepo,
    schemas.WindowReportRepoRequest,
    ({ repoId }, win) => {
      if (!win) return;
      setWindowRepo(win.id, repoId);
    },
    warnInvalid,
  );
}
