import { shell, type BrowserWindow } from 'electron';

import { optimizerMain, type OptimizerMainServices } from '@midnite/studio-feature-optimizer/main';
import { sendToLiveWindow, type FeatureMainContext } from '@midnite/studio-runtime';

import { getGpuStats } from '../optimizer/gpu-service';
import { getProcessTableResult, killProcess } from '../optimizer/kill-service';
import { cleanItems, knownRoots, scanWorkspace } from '../optimizer/scan-service';
import { DEFAULT_SYSTEM_CACHE_ENTRIES } from '../optimizer/system-cache-registry';
import {
  cleanSystemCaches,
  runReclaimCommand,
  scanSystemCaches,
} from '../optimizer/system-cache-service';
import { handle, handleBare } from './handle';

/**
 * The Workspace Optimizer's IPC surface (Phase 59 Themes C, D, E) — since
 * Phase 113 Theme C, Studio's composition of the optimizer *feature package*
 * rather than the handlers themselves.
 *
 * The handlers (channels, validation, single-flight scans, progress events)
 * live in `@midnite/studio-feature-optimizer/main`. This file is the
 * composer's two jobs: build the feature a {@link FeatureMainContext} out of
 * desktop's own `handle`/`handleBare` (so payloads are parsed exactly as for
 * every other channel), the main window and `shell.trashItem`; and hand it
 * the services that still live here, because they reach into the pty broker,
 * the browser, the repo registry and git-engine (Theme D moves those into the
 * runtime).
 */
export const DESKTOP_OPTIMIZER_SERVICES: OptimizerMainServices = {
  scanWorkspace,
  knownRoots,
  cleanItems,
  getGpuStats: () => getGpuStats(),
  getProcessTableResult: () => getProcessTableResult(),
  killProcess: (pid, expectArgv, force) => killProcess(pid, expectArgv, force),
  // Static — labels/producers/ecosystem only, no paths (see the channel's docblock).
  systemCatalogue: () =>
    DEFAULT_SYSTEM_CACHE_ENTRIES.map((entry) => ({
      entryId: entry.id,
      label: entry.label,
      producer: entry.producer,
      ecosystem: entry.ecosystem,
      reclaim: entry.reclaim,
    })),
  scanSystemCaches,
  cleanSystemCaches: (entryIds, trash) => cleanSystemCaches(entryIds, trash),
  runReclaimCommand,
};

export function registerOptimizerHandlers(getWindow: () => BrowserWindow | null): void {
  const ctx: FeatureMainContext = {
    ipc: { handle, handleBare },
    emit: (channel, payload) => sendToLiveWindow(getWindow, channel, payload),
    trashItem: (path) => shell.trashItem(path),
  };
  optimizerMain.register(ctx, DESKTOP_OPTIMIZER_SERVICES);
}
