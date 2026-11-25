import { app, shell, systemPreferences } from 'electron';
import os from 'node:os';

import { CHANNELS, failure, ok, PermissionsPaneRequest, PermissionsResetRequest } from '@midnite/studio-shared';

import { BUNDLE_ID, PANE_URLS, createPermissionProbe } from '../permissions/probe';
import { resetPermission } from '../permissions/reset';
import { handle, handleBare } from './handle';

/**
 * Settings ▸ Permissions. Reads never prompt (`permissions/probe.ts`); `reset` is `tccutil reset` for this
 * bundle id only, which the renderer gates behind the destructive confirm. Every handler answers the
 * envelope and never throws.
 */
export function registerPermissionsHandlers(): void {
  const probe = createPermissionProbe({
    platform: process.platform,
    home: os.homedir(),
    getMediaAccessStatus: (kind) => systemPreferences.getMediaAccessStatus(kind),
    isTrustedAccessibilityClient: (prompt) => systemPreferences.isTrustedAccessibilityClient(prompt),
  });

  handleBare(CHANNELS.permissionsStatus, async () => ({
    supported: process.platform === 'darwin',
    bundleId: BUNDLE_ID,
    rows: await probe.read(),
  }));

  handle(
    CHANNELS.permissionsOpenPane,
    PermissionsPaneRequest,
    async ({ id }) => {
      try {
        await shell.openExternal(PANE_URLS[id]);
        return ok();
      } catch (error) {
        return failure(`Could not open System Settings: ${String(error)}`);
      }
    },
    (issue) => failure(issue),
  );

  handle(
    CHANNELS.permissionsReset,
    PermissionsResetRequest,
    ({ id }) => resetPermission(id, BUNDLE_ID),
    (issue) => failure(issue),
  );

  handleBare(CHANNELS.permissionsRelaunch, () => {
    app.relaunch();
    // quit, not exit: before-quit/will-quit flush sessions, prefs and sockets.
    app.quit();
  });
}
