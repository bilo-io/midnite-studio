import { contextBridge, ipcRenderer } from 'electron';

import { createBrowserBridge } from '@midnite/studio-module-browser/bridge';
import { unionBridgeSlices } from '@midnite/studio-runtime/app-main/bridge-slice';
import { createSuiteBridge } from '@midnite/studio-runtime/app-main/suite-preload';

// The renderer reads `window.midniteStudio` (the frame's `bridge()`); Browser exposes the slice it needs.
// This preload is the app window's alone — a browser tab's `WebContentsView` gets no preload at all
// (`browser-service.ts`), so no page it shows can reach these channels.
try {
  contextBridge.exposeInMainWorld(
    'midniteStudio',
    unionBridgeSlices(
      createBrowserBridge(ipcRenderer),
      createSuiteBridge(ipcRenderer, process.argv, process.platform),
    ),
  );
} catch {
  // contextIsolation disabled, or already exposed — nothing to do.
}
