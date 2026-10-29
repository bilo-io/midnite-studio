import { contextBridge, ipcRenderer } from 'electron';

import { createMediaBridge } from '@midnite/studio-module-media/bridge';

// The renderer reads `window.midniteStudio` (the frame's `bridge()`); Media exposes the slice it needs.
try {
  contextBridge.exposeInMainWorld('midniteStudio', createMediaBridge(ipcRenderer));
} catch {
  // contextIsolation disabled, or already exposed — nothing to do.
}
