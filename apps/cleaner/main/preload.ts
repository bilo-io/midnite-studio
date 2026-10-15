import { contextBridge, ipcRenderer } from 'electron';

import { createCleanerBridge } from './bridge';

// The renderer reads `window.midniteStudio` (the frame's `bridge()`); Cleaner exposes the slice it needs.
try {
  contextBridge.exposeInMainWorld('midniteStudio', createCleanerBridge(ipcRenderer));
} catch {
  // contextIsolation disabled, or already exposed — nothing to do.
}
