import { contextBridge, ipcRenderer } from 'electron';

import { createAgentsBridge } from '@midnite/studio-module-agents/bridge';
import { createCoderBridge } from '@midnite/studio-module-coder/bridge';
import { createCreatorBridge } from '@midnite/studio-module-creator/bridge';
import { createMonitorFeatureBridge } from '@midnite/studio-feature-monitor/bridge';
import { createBridgeSlice, unionBridgeSlices } from '@midnite/studio-runtime/app-main/bridge-slice';
import { createSuiteBridge } from '@midnite/studio-runtime/app-main/suite-preload';

// The renderer reads `window.midniteStudio` (the frame's `bridge()`); Agents exposes the union of the slices of the
// modules it mounts (Phase 124 Theme E.3), its own first. Every other bridge namespace stays absent.
try {
  contextBridge.exposeInMainWorld(
    'midniteStudio',
    unionBridgeSlices(
      createAgentsBridge(ipcRenderer),
      createCoderBridge(ipcRenderer),
      createCreatorBridge(ipcRenderer),
      createMonitorFeatureBridge(createBridgeSlice(ipcRenderer)),
      createSuiteBridge(ipcRenderer, process.argv, process.platform),
    ),
  );
} catch {
  // contextIsolation disabled, or already exposed — nothing to do.
}
