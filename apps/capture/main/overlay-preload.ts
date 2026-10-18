import { contextBridge, ipcRenderer } from 'electron';

import { CAPTURE_OVERLAY_GLOBAL } from '@midnite/studio-shared/ipc/channels';

import { createOverlayBridge } from './overlay-bridge';

// The region overlay window's only preload: the three overlay calls, under their own global — never the
// app window's `midniteStudio` bridge.
try {
  contextBridge.exposeInMainWorld(
    CAPTURE_OVERLAY_GLOBAL,
    createOverlayBridge(ipcRenderer, process.argv),
  );
} catch {
  // contextIsolation disabled — the overlay window always has it on, so this is never reached.
}
