import { contextBridge, ipcRenderer } from 'electron';

import { createMoneyBridge } from '@midnite/studio-module-money/bridge';

// The renderer reads `window.midniteStudio` (the frame's `bridge()`); Money exposes the slice it needs.
try {
  contextBridge.exposeInMainWorld('midniteStudio', createMoneyBridge(ipcRenderer));
} catch {
  // contextIsolation disabled, or already exposed — nothing to do.
}
