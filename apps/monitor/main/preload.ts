import { contextBridge, ipcRenderer } from 'electron';

import { createMonitorBridge } from './bridge';

// The renderer reads `window.midniteStudio` (the frame's `bridge()`); Monitor exposes the slice it needs.
try {
  contextBridge.exposeInMainWorld('midniteStudio', createMonitorBridge(ipcRenderer));
} catch {
  // contextIsolation disabled, or already exposed — nothing to do.
}
