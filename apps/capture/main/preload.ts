import { contextBridge, ipcRenderer } from 'electron';

import { createCaptureBridge } from '@midnite/studio-module-capture/bridge';

// The renderer reads `window.midniteStudio` (the frame's `bridge()`); Capture exposes the slice it needs.
try {
  contextBridge.exposeInMainWorld('midniteStudio', createCaptureBridge(ipcRenderer));
} catch {
  // contextIsolation disabled, or already exposed — nothing to do.
}
