import type { BrowserWindow } from 'electron';

import { CHANNELS, schemas } from '@midnite/studio-shared';

import { activateApp, disableApp, enableApp, setAppBounds } from '../apps-service';
import { defaultLogger } from '../log';
import { handle, handleSend } from './handle';

const warnInvalid = (issue: string): void => {
  defaultLogger.warn(issue);
};

/**
 * Registers the `mstudio:apps:*` channels over `apps-service.ts`.
 *
 * `enable` and `activate` both target `getMainWindow()` explicitly rather
 * than the sender — unlike the browser's `create` (Phase 55's
 * sender-resolution), an app is only ever enabled or activated from the
 * flyout, which is a main-window-only surface (Theme C). `window.detach`
 * (Theme D) is the one thing that moves an already-enabled app's view
 * somewhere else, and it goes through `window-handlers.ts`'s own
 * `reparentAppView` call, not through this file. `disable`/`setBounds` are
 * one-way, matching `browser.close`/`browser.setBounds`: a bounds push fires
 * every resize frame, and a round trip would only add latency.
 */
export function registerAppsHandlers(getMainWindow: () => BrowserWindow | null): void {
  handle(
    CHANNELS.appsEnable,
    schemas.AppsEnableRequest,
    ({ id }) => {
      const win = getMainWindow();
      if (!win) return { ok: false as const, message: 'No window' };
      enableApp(win, id);
      return { ok: true as const };
    },
    (issue) => ({ ok: false as const, message: issue }),
  );

  handleSend(CHANNELS.appsDisable, schemas.AppsDisableRequest, ({ id }) => disableApp(id), warnInvalid);

  handleSend(
    CHANNELS.appsSetBounds,
    schemas.AppsSetBoundsRequest,
    ({ id, bounds }) => setAppBounds(id, bounds),
    warnInvalid,
  );

  handleSend(
    CHANNELS.appsActivate,
    schemas.AppsActivateRequest,
    ({ id }) => {
      const win = getMainWindow();
      if (win) activateApp(win, id);
    },
    warnInvalid,
  );
}
