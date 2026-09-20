import { CHANNELS, schemas } from '@midnite/studio-shared';

import { defaultLogger } from '../log';
import { applySettingsSync } from '../settings-mirror';
import { handleSend } from './handle';

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
  handleSend(
    CHANNELS.settingsSync,
    schemas.SettingsSyncRequest,
    (payload) => applySettingsSync(payload),
    (issue) => defaultLogger.warn(issue),
  );
}
