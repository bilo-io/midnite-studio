import { contextBridge, ipcRenderer } from 'electron';

import { createAccountantBridge } from '@midnite/studio-module-accountant/bridge';
import { createStartupBridge } from '@midnite/studio-module-startup/bridge';
import { createMonitorFeatureBridge } from '@midnite/studio-feature-monitor/bridge';
import { createBridgeSlice, unionBridgeSlices } from '@midnite/studio-runtime/app-main/bridge-slice';
import { createSuiteBridge } from '@midnite/studio-runtime/app-main/suite-preload';

try {
  contextBridge.exposeInMainWorld(
    'midniteStudio',
    unionBridgeSlices(
      createStartupBridge(ipcRenderer),
      createAccountantBridge(ipcRenderer),
      createMonitorFeatureBridge(createBridgeSlice(ipcRenderer)),
      createSuiteBridge(ipcRenderer, process.argv, process.platform),
    ),
  );
} catch {
  // Not in a preload context (a test import): there is no bridge to expose.
}
