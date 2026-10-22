import { contextBridge, ipcRenderer } from 'electron';

import { createVanguardBridge } from './bridge';

// The renderer reads `window.midniteStudio` (the frame's `bridge()`); Vanguard exposes the slice it needs.
try {
  contextBridge.exposeInMainWorld('midniteStudio', createVanguardBridge(ipcRenderer));
} catch {
  // contextIsolation disabled, or already exposed — nothing to do.
}
