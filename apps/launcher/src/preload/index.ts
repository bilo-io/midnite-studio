import { contextBridge, ipcRenderer } from 'electron';

import type { AppId } from '../common/catalog';
import { LAUNCHER_CHANNELS, type AppInstallProgress, type InstallProgress, type LauncherBridge } from '../common/bridge';

/** Main passes its version as `--launcher-version=…` (`additionalArguments`) — no sync IPC for one string. */
const versionArg = process.argv.find((arg) => arg.startsWith('--launcher-version='));

const bridge: LauncherBridge = {
  launcherVersion: versionArg?.slice('--launcher-version='.length) ?? '0.0.0',
  platform: { os: process.platform, arch: process.arch },
  studio: {
    status: () => ipcRenderer.invoke(LAUNCHER_CHANNELS.studioStatus),
    install: () => ipcRenderer.invoke(LAUNCHER_CHANNELS.studioInstall),
    uninstall: () => ipcRenderer.invoke(LAUNCHER_CHANNELS.studioUninstall),
    reveal: () => ipcRenderer.invoke(LAUNCHER_CHANNELS.studioReveal),
    onProgress: (listener) => {
      const handler = (_event: unknown, progress: InstallProgress) => listener(progress);
      ipcRenderer.on(LAUNCHER_CHANNELS.studioProgress, handler);
      return () => ipcRenderer.removeListener(LAUNCHER_CHANNELS.studioProgress, handler);
    },
  },
  apps: {
    open: (id, featureId) => ipcRenderer.invoke(LAUNCHER_CHANNELS.appOpen, { id, featureId }),
    status: () => ipcRenderer.invoke(LAUNCHER_CHANNELS.appsStatus),
    install: (id) => ipcRenderer.invoke(LAUNCHER_CHANNELS.appInstall, { id }),
    uninstall: (id) => ipcRenderer.invoke(LAUNCHER_CHANNELS.appUninstall, { id }),
    onProgress: (listener) => {
      const handler = (_event: unknown, event: AppInstallProgress) => listener(event);
      ipcRenderer.on(LAUNCHER_CHANNELS.appProgress, handler);
      return () => ipcRenderer.removeListener(LAUNCHER_CHANNELS.appProgress, handler);
    },
    onShow: (listener) => {
      const handler = (_event: unknown, id: AppId) => listener(id);
      ipcRenderer.on(LAUNCHER_CHANNELS.appShow, handler);
      return () => ipcRenderer.removeListener(LAUNCHER_CHANNELS.appShow, handler);
    },
    takePending: () => ipcRenderer.invoke(LAUNCHER_CHANNELS.appPending),
  },
  self: {
    status: () => ipcRenderer.invoke(LAUNCHER_CHANNELS.selfStatus),
    update: () => ipcRenderer.invoke(LAUNCHER_CHANNELS.selfUpdate),
  },
  links: {
    open: (link) => ipcRenderer.invoke(LAUNCHER_CHANNELS.linkOpen, link),
  },
  theme: {
    set: (source) => ipcRenderer.send(LAUNCHER_CHANNELS.themeSet, source),
  },
};

contextBridge.exposeInMainWorld('midniteLauncher', bridge);
