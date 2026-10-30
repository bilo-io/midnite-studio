import { contextBridge, ipcRenderer } from 'electron';

import { createCleanerBridge } from '@midnite/studio-module-cleaner/bridge';
import { createMonitorBridge } from '@midnite/studio-module-monitor/bridge';
import { createVanguardBridge } from '@midnite/studio-module-vanguard/bridge';
import { createVaultBridge } from '@midnite/studio-module-vault/bridge';
import { unionBridgeSlices } from '@midnite/studio-runtime/app-main/bridge-slice';
import { createSuiteBridge } from '@midnite/studio-runtime/app-main/suite-preload';

// The renderer reads `window.midniteStudio` (the frame's `bridge()`); Vanguard exposes the union of the slices of
// the modules it mounts (Phase 124 Theme E.3), its own first. Every other bridge namespace stays absent.
try {
  contextBridge.exposeInMainWorld(
    'midniteStudio',
    unionBridgeSlices(
      createVanguardBridge(ipcRenderer),
      createVaultBridge(ipcRenderer),
      createCleanerBridge(ipcRenderer),
      createMonitorBridge(ipcRenderer),
      createSuiteBridge(ipcRenderer, process.argv, process.platform),
    ),
  );
} catch {
  // contextIsolation disabled, or already exposed — nothing to do.
}
