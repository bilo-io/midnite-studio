import { contextBridge, ipcRenderer } from 'electron';

import { createMonitorFeatureBridge } from '@midnite/studio-feature-monitor/bridge';
import { createScienceBridge } from '@midnite/studio-module-science/bridge';
import { createBridgeSlice, unionBridgeSlices } from '@midnite/studio-runtime/app-main/bridge-slice';
import { createSuiteBridge } from '@midnite/studio-runtime/app-main/suite-preload';

// The renderer reads `window.midniteStudio` (the frame's `bridge()`); Science exposes the union of the slices of
// the modules it mounts (Phase 126 Theme A.4), its own first. Every other bridge namespace stays absent.
try {
  contextBridge.exposeInMainWorld(
    'midniteStudio',
    unionBridgeSlices(
      createScienceBridge(ipcRenderer),
      createMonitorFeatureBridge(createBridgeSlice(ipcRenderer)),
      createSuiteBridge(ipcRenderer, process.argv, process.platform),
    ),
  );
} catch {
  // contextIsolation disabled, or already exposed — nothing to do.
}
