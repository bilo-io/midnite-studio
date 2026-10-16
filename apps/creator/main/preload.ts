import { contextBridge, ipcRenderer } from 'electron';

import { createCreatorBridge } from './bridge';

// The renderer reads `window.midniteStudio` (the frame's `bridge()`); Creator exposes the slice it needs.
try {
  contextBridge.exposeInMainWorld('midniteStudio', createCreatorBridge(ipcRenderer));
} catch {
  // contextIsolation disabled, or already exposed — nothing to do.
}
