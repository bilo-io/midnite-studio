import { execSync } from 'node:child_process';
import { app, BrowserWindow } from 'electron';
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
import { defaultLogger } from './log';
import { handleSend } from './ipc/handle';

function isAdHocSigned(): boolean {
  if (!app.isPackaged) return true;
  try {
    const out = execSync(`codesign -dv --verbose=2 "${app.getPath('exe')}" 2>&1`, { encoding: 'utf8' });
    return out.includes('Signature=adhoc') || out.includes('Authority=-');
  } catch {
    return true;
  }
}

const warnInvalid = (issue: string): void => {
  defaultLogger.warn(issue);
};

export function registerUpdater(getWindow: () => BrowserWindow | null): void {
  const manualInstall = isAdHocSigned();
  let currentState: UpdateState = { ...IDLE_STATE, manualInstall };

  const pushState = (state: UpdateState) => {
    currentState = { ...state, manualInstall };
    const win = getWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send(EVENT_CHANNELS.updateState, currentState);
    }
  };

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

  handleSend(
    CHANNELS.updateCheck,
    schemas.SendVoidSchema,
    () => {
      autoUpdater.checkForUpdates().catch((err) => {
        pushState(errorState(err.message ?? 'Failed to check for updates'));
      });
    },
    warnInvalid,
  );

  handleSend(
    CHANNELS.updateDownload,
    schemas.SendVoidSchema,
    () => {
      if (manualInstall) return;
      autoUpdater.downloadUpdate().catch((err) => {
        pushState(errorState(err.message ?? 'Failed to download update'));
      });
    },
    warnInvalid,
  );

  handleSend(
    CHANNELS.updateRestart,
    schemas.SendVoidSchema,
    () => {
      if (manualInstall) return;
      autoUpdater.quitAndInstall();
    },
    warnInvalid,
  );

  handleSend(
    CHANNELS.updateSetChannel,
    schemas.UpdateSetChannelRequest,
    ({ channel }) => {
      const channelConfig = feedChannelFor(channel as UpdateChannel);
      autoUpdater.channel = channelConfig.channel;
      autoUpdater.allowPrerelease = channelConfig.allowPrerelease;
      autoUpdater.allowDowngrade = channelConfig.allowDowngrade;
    },
    warnInvalid,
  );
}
