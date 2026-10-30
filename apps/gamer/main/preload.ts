import { contextBridge, ipcRenderer } from 'electron';

import { createCreatorBridge } from '@midnite/studio-module-creator/bridge';
import { createGamerBridge } from '@midnite/studio-module-gamer/bridge';
import { unionBridgeSlices } from '@midnite/studio-runtime/app-main/bridge-slice';
import { createSuiteBridge } from '@midnite/studio-runtime/app-main/suite-preload';

// The renderer reads `window.midniteStudio` (the frame's `bridge()`); Gamer exposes the union of the slices of the
// modules it mounts (Phase 124 Theme E.3), its own first. Every other bridge namespace stays absent.
try {
  contextBridge.exposeInMainWorld(
    'midniteStudio',
    unionBridgeSlices(
      createGamerBridge(ipcRenderer),
      createCreatorBridge(ipcRenderer),
      createSuiteBridge(ipcRenderer, process.argv, process.platform),
    ),
  );
} catch {
  // contextIsolation disabled, or already exposed — nothing to do.
}
