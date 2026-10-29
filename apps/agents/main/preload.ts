import { contextBridge, ipcRenderer } from 'electron';

import { createAgentsBridge } from '@midnite/studio-module-agents/bridge';

// The renderer reads `window.midniteStudio` (the frame's `bridge()`); Agents exposes the slice it needs.
try {
  contextBridge.exposeInMainWorld('midniteStudio', createAgentsBridge(ipcRenderer));
} catch {
  // contextIsolation disabled, or already exposed — nothing to do.
}
