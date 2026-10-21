import { contextBridge, ipcRenderer } from 'electron';

import { createVaultBridge } from './bridge';

// The renderer reads `window.midniteStudio` (the frame's `bridge()`); Vault exposes the slice it needs.
try {
  contextBridge.exposeInMainWorld('midniteStudio', createVaultBridge(ipcRenderer));
} catch {
  // contextIsolation disabled, or already exposed — nothing to do.
}
