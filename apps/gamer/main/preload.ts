import { contextBridge, ipcRenderer } from 'electron';

import { createGamerBridge } from '@midnite/studio-module-gamer/bridge';

// The renderer reads `window.midniteStudio` (the frame's `bridge()`); Gamer exposes the slice it needs.
try {
  contextBridge.exposeInMainWorld('midniteStudio', createGamerBridge(ipcRenderer));
} catch {
  // contextIsolation disabled, or already exposed — nothing to do.
}
