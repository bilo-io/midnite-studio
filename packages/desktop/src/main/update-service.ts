import { execSync } from 'node:child_process';
import { app, ipcMain, BrowserWindow } from 'electron';
import { autoUpdater } from 'electron-updater';
import { CHANNELS, EVENT_CHANNELS, UpdateSetChannelRequest } from '@midnite/studio-shared';
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

function isAdHocSigned(): boolean {
  if (!app.isPackaged) return true;
  try {
    const out = execSync(`codesign -dv --verbose=2 "${app.getPath('exe')}" 2>&1`, { encoding: 'utf8' });
    return out.includes('Signature=adhoc') || out.includes('Authority=-');
  } catch {
    return true;
  }
}

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
    ipcMain.on(CHANNELS.updateCheck, () => pushState(currentState));
    ipcMain.on(CHANNELS.updateDownload, () => {});
    ipcMain.on(CHANNELS.updateRestart, () => {});
    ipcMain.on(CHANNELS.updateSetChannel, () => {});
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

  ipcMain.on(CHANNELS.updateCheck, () => {
    autoUpdater.checkForUpdates().catch((err) => {
      pushState(errorState(err.message ?? 'Failed to check for updates'));
    });
  });

  ipcMain.on(CHANNELS.updateDownload, () => {
    if (manualInstall) return;
    autoUpdater.downloadUpdate().catch((err) => {
      pushState(errorState(err.message ?? 'Failed to download update'));
    });
  });

  ipcMain.on(CHANNELS.updateRestart, () => {
    if (manualInstall) return;
    autoUpdater.quitAndInstall();
  });

  ipcMain.on(CHANNELS.updateSetChannel, (_, req) => {
    const parse = UpdateSetChannelRequest.safeParse(req);
    if (!parse.success) return;
    const channelConfig = feedChannelFor(parse.data.channel as UpdateChannel);
    autoUpdater.channel = channelConfig.channel;
    autoUpdater.allowPrerelease = channelConfig.allowPrerelease;
    autoUpdater.allowDowngrade = channelConfig.allowDowngrade;
  });
}
