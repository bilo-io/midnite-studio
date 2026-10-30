import { contextBridge, ipcRenderer } from 'electron';

import { createMindBridge } from '@midnite/studio-module-mind/bridge';

// The renderer reads `window.midniteStudio` (the frame's `bridge()`); Mind exposes the slice it needs.
try {
  contextBridge.exposeInMainWorld('midniteStudio', createMindBridge(ipcRenderer));
} catch {
  // contextIsolation disabled, or already exposed — nothing to do.
}
