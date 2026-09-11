import { ipcMain } from 'electron';
import type { BrowserWindow } from 'electron';

import { CHANNELS, schemas } from '@midnite/studio-shared';

import { activateApp, disableApp, enableApp, setAppBounds } from '../apps-service';
import { handle } from './handle';

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

  ipcMain.on(CHANNELS.appsDisable, (_event, raw: unknown) => {
    const parsed = schemas.AppsDisableRequest.safeParse(raw);
    if (parsed.success) disableApp(parsed.data.id);
  });

  ipcMain.on(CHANNELS.appsSetBounds, (_event, raw: unknown) => {
    const parsed = schemas.AppsSetBoundsRequest.safeParse(raw);
    if (parsed.success) setAppBounds(parsed.data.id, parsed.data.bounds);
  });

  ipcMain.on(CHANNELS.appsActivate, (_event, raw: unknown) => {
    const parsed = schemas.AppsActivateRequest.safeParse(raw);
    if (!parsed.success) return;
    const win = getMainWindow();
    if (win) activateApp(win, parsed.data.id);
  });
}
