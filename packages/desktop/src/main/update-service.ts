import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { autoUpdater } from 'electron-updater';
import { CHANNELS, EVENT_CHANNELS, schemas } from '@midnite/studio-shared';
import {
  checkingState,
  availableState,
  notAvailableState,
  downloadingState,
  downloadedState,
  errorState,
  IDLE_STATE,
  type UpdateState,
} from '../updates/update-state.js';
import { feedChannelFor, type UpdateChannel } from '../updates/feed-channel.js';
import { decideUpdateOwner, launcherSearchPaths } from '../updates/update-handover.js';
import { defaultLogger } from './log';
import { handleSend, handleSendFromSender } from './ipc/handle';

/**
 * Phase 91 Theme H: no shell. This used to interpolate `app.getPath('exe')` into
 * an `execSync` string, so a bundle at a path containing `$(...)` or backticks
 * ran the substitution at every launch. `codesign -dv` prints on stderr and
 * exits 0, which `execFileSync` would swallow, so `spawnSync` (same no-shell
 * argv form) is used to read stderr.
 */
function isAdHocSigned(): boolean {
  if (!app.isPackaged) return true;
  try {
    const res = spawnSync('codesign', ['-dv', '--verbose=2', app.getPath('exe')], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (res.error || res.status !== 0) return true;
    const out = `${res.stdout}${res.stderr}`;
    return out.includes('Signature=adhoc') || out.includes('Authority=-');
  } catch {
    return true;
  }
}

const warnInvalid = (issue: string): void => {
  defaultLogger.warn(issue);
};

/** The four channels every registration branch below owns. */
export const UPDATER_CHANNELS = [
  CHANNELS.updateCheck,
  CHANNELS.updateDownload,
  CHANNELS.updateRestart,
  CHANNELS.updateSetChannel,
] as const;

export function registerUpdater(getWindow: () => BrowserWindow | null): void {
  // Phase 91 Theme F: the managed, unpackaged and packaged branches below are mutually exclusive
  // (each returns before the next) and `index.ts` calls this once — but a second call, or a branch
  // added later, would stack a second listener on the same channel and both would fire. Clearing
  // first makes "one listener per channel" hold structurally rather than by call-site discipline.
  for (const channel of UPDATER_CHANNELS) ipcMain.removeAllListeners(channel);
  const manualInstall = isAdHocSigned();
  // Phase 113 G3: the launcher owns updates once it is installed (Decision 6).
  const handover = decideUpdateOwner({ exists: existsSync, searchPaths: launcherSearchPaths(), offerDismissed: false });
  const managed = handover.owner === 'managed';
  const ownership: Partial<UpdateState> = managed ? { managedBy: 'midnite-apps' } : handover.offerLauncher ? { offerLauncher: true } : {};
  let currentState: UpdateState = { ...IDLE_STATE, manualInstall, ...ownership };

  const pushState = (state: UpdateState) => {
    currentState = { ...state, manualInstall, ...ownership };
    const win = getWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send(EVENT_CHANNELS.updateState, currentState);
    }
  };

  if (managed) {
    // Studio's own updater stays off: a check just opens Midnite Apps, which updates Studio and the runtime.
    handleSendFromSender(
      CHANNELS.updateCheck,
      schemas.SendVoidSchema,
      () => {
        pushState(currentState);
        if (handover.launcherPath) void shell.openPath(handover.launcherPath);
      },
      warnInvalid,
    );
    for (const ch of [CHANNELS.updateDownload, CHANNELS.updateRestart]) handleSend(ch, schemas.SendVoidSchema, () => {}, warnInvalid);
    handleSend(CHANNELS.updateSetChannel, schemas.SendVoidSchema, () => {}, warnInvalid);
    return;
  }

  if (!app.isPackaged) {
    handleSend(CHANNELS.updateCheck, schemas.SendVoidSchema, () => pushState(currentState), warnInvalid);
    handleSend(CHANNELS.updateDownload, schemas.SendVoidSchema, () => {}, warnInvalid);
    handleSend(CHANNELS.updateRestart, schemas.SendVoidSchema, () => {}, warnInvalid);
    handleSend(CHANNELS.updateSetChannel, schemas.SendVoidSchema, () => {}, warnInvalid);
    return;
  }

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

  const config = feedChannelFor('stable');
  autoUpdater.channel = config.channel;
  autoUpdater.allowPrerelease = config.allowPrerelease;
  autoUpdater.allowDowngrade = config.allowDowngrade;

  autoUpdater.on('checking-for-update', () => {
    pushState(checkingState());
  });

  autoUpdater.on('update-available', (info) => {
    pushState(availableState(info.version));
  });

  autoUpdater.on('update-not-available', () => {
    pushState(notAvailableState());
  });

  autoUpdater.on('download-progress', (progress) => {
    pushState(downloadingState(progress, currentState.version ?? ''));
  });

  autoUpdater.on('update-downloaded', (info) => {
    pushState(downloadedState(info.version));
  });

  autoUpdater.on('error', (err) => {
    pushState(errorState(err.message ?? 'Update check failed', currentState.version));
  });

  handleSendFromSender(
    CHANNELS.updateCheck,
    schemas.SendVoidSchema,
    (_payload, win) => {
      if (!win) return;
      autoUpdater.checkForUpdates().catch((err) => {
        pushState(errorState(err.message ?? 'Failed to check for updates'));
      });
    },
    warnInvalid,
  );

  handleSendFromSender(
    CHANNELS.updateDownload,
    schemas.SendVoidSchema,
    (_payload, win) => {
      if (!win || manualInstall) return;
      autoUpdater.downloadUpdate().catch((err) => {
        pushState(errorState(err.message ?? 'Failed to download update'));
      });
    },
    warnInvalid,
  );

  handleSendFromSender(
    CHANNELS.updateRestart,
    schemas.SendVoidSchema,
    (_payload, win) => {
      if (!win || manualInstall) return;
      autoUpdater.quitAndInstall();
    },
    warnInvalid,
  );

  handleSendFromSender(
    CHANNELS.updateSetChannel,
    schemas.UpdateSetChannelRequest,
    ({ channel }, win) => {
      if (!win) return; // Phase 91 Theme H: only an app window may switch the feed channel.
      const channelConfig = feedChannelFor(channel as UpdateChannel);
      autoUpdater.channel = channelConfig.channel;
      autoUpdater.allowPrerelease = channelConfig.allowPrerelease;
      autoUpdater.allowDowngrade = channelConfig.allowDowngrade;
    },
    warnInvalid,
  );
}
