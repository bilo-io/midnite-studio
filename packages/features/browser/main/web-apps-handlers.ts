import type { RuntimeIpc } from '@midnite/studio-runtime';
import { CHANNELS, schemas } from '@midnite/studio-shared';

import type { BrowserHostWindow as BrowserWindow } from './browser-electron';
import { defaultLogger } from './browser-main-deps';
import { listWebAppSignIns, signOutWebApp } from './web-app-sign-ins';
import { activateWebApp, disableWebApp, enableWebApp, setWebAppBounds } from './web-apps-service';

const warnInvalid = (issue: string): void => {
  defaultLogger.warn(issue);
};

/**
 * Registers the `mstudio:web-apps:*` channels over `web-apps-service.ts`.
 *
 * `enable` and `activate` both target `getMainWindow()` explicitly rather
 * than the sender — unlike the browser's `create` (Phase 55's
 * sender-resolution), an app is only ever enabled or activated from the
 * flyout, which is a main-window-only surface (Theme C). `window.detach`
 * (Theme D) is the one thing that moves an already-enabled app's view
 * somewhere else, and it goes through `window-handlers.ts`'s own
 * `reparentWebAppView` call, not through this file. `disable`/`setBounds` are
 * one-way, matching `browser.close`/`browser.setBounds`: a bounds push fires
 * every resize frame, and a round trip would only add latency.
 */
export function registerWebAppsHandlers(ipc: RuntimeIpc, getMainWindow: () => BrowserWindow | null): void {
  ipc.handle(
    CHANNELS.webAppsEnable,
    schemas.WebAppsEnableRequest,
    ({ id }) => {
      const win = getMainWindow();
      if (!win) return { ok: false as const, message: 'No window' };
      enableWebApp(win, id);
      return { ok: true as const };
    },
    (issue) => ({ ok: false as const, message: issue }),
  );

  ipc.send(CHANNELS.webAppsDisable, schemas.WebAppsDisableRequest, ({ id }) => disableWebApp(id), warnInvalid);

  ipc.send(
    CHANNELS.webAppsSetBounds,
    schemas.WebAppsSetBoundsRequest,
    ({ id, bounds }) => setWebAppBounds(id, bounds),
    warnInvalid,
  );

  // The Vault's sign-in pair (Phase 113 Theme J slice 3): metadata out, one partition cleared on request.
  ipc.handle(
    CHANNELS.webAppsSignIns,
    schemas.WebAppsSignInsRequest,
    () => listWebAppSignIns(),
    (issue) => ({ available: false, reason: issue, apps: [] }),
  );
  ipc.handle(
    CHANNELS.webAppsSignOut,
    schemas.WebAppsSignOutRequest,
    ({ id }) => signOutWebApp(id),
    (issue) => ({ ok: false as const, message: issue }),
  );

  ipc.send(
    CHANNELS.webAppsActivate,
    schemas.WebAppsActivateRequest,
    ({ id }) => {
      const win = getMainWindow();
      if (win) activateWebApp(win, id);
    },
    warnInvalid,
  );
}
