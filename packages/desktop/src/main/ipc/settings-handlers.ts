import { CHANNELS, schemas } from '@midnite/studio-shared';
import { ipcMain } from 'electron';

import { applySettingsSync } from '../settings-mirror';

/**
 * Phase 84 Theme B.4 — `ui-store` pushes its auto-fetch settings here on
 * every change and once on boot; `fetch-scheduler.ts` reads the mirror
 * through `currentSettings()`.
 *
 * One-way `ipcMain.on`, exactly like `workflowSetDefaults`: there is nothing
 * to answer, and the renderer already applied the change to its own store
 * before sending it.
 */
export function registerSettingsHandlers(): void {
  ipcMain.on(CHANNELS.settingsSync, (_event, raw: unknown) => {
    const parsed = schemas.SettingsSyncRequest.safeParse(raw);
    if (parsed.success) applySettingsSync(parsed.data);
  });
}
