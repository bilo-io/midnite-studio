import { contextBridge, ipcRenderer } from 'electron';

import { createCoderBridge } from '@midnite/studio-module-coder/bridge';

// The renderer reads `window.midniteStudio` (the frame's `bridge()`); Coder exposes the slice it needs.
try {
  contextBridge.exposeInMainWorld('midniteStudio', createCoderBridge(ipcRenderer));
} catch {
  // contextIsolation disabled, or already exposed — nothing to do.
}
