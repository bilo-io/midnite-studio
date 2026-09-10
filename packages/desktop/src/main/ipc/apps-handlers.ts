import { ipcMain } from 'electron';
import type { BrowserWindow } from 'electron';

import { CHANNELS, schemas } from '@midnite/studio-shared';

import { disableApp, enableApp, setAppBounds } from '../apps-service';
import { handle } from './handle';

/**
 * Registers the `mstudio:apps:*` channels over `apps-service.ts`.
 *
 * `enable` targets `getMainWindow()` explicitly rather than the sender —
 * unlike the browser's `create` (Phase 55's sender-resolution), these apps
 * have no per-window detach entry point yet (Theme D), so there is exactly
 * one place an app view can live today. `disable`/`setBounds` are one-way,
 * matching `browser.close`/`browser.setBounds`: a bounds push fires every
 * resize frame, and a round trip would only add latency.
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
}
