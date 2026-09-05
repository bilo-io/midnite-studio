import { shell, type BrowserWindow } from 'electron';

import { CHANNELS, EVENT_CHANNELS, schemas } from '@midnite/studio-shared';

import { getGpuStats } from '../optimizer/gpu-service';
import { cleanItems, knownRoots, scanWorkspace } from '../optimizer/scan-service';
import { handle, handleBare } from './handle';

/**
 * The Workspace Optimizer's IPC surface (Phase 59). Only Themes C (Smart
 * Scan + Storage) and E (GPU) are wired here — `optimizerProcesses` and
 * `optimizerKill` are declared in the wire contract (Theme A's foundation)
 * but have no handler yet; Theme D registers them when it lands.
 */
export function registerOptimizerHandlers(getWindow: () => BrowserWindow | null): void {
  // One scan at a time: a second `optimizerScan` call aborts whichever is
  // still running rather than let two walks race each other's progress events.
  let currentScan: AbortController | null = null;

  handle(
    CHANNELS.optimizerScan,
    schemas.OptimizerScanRequest,
    async (req) => {
      currentScan?.abort();
      const controller = new AbortController();
      currentScan = controller;

      try {
        const result = await scanWorkspace({
          ...(req.extraRoot === undefined ? {} : { extraRoot: req.extraRoot }),
          signal: controller.signal,
          onProgress: (done, total) => {
            const win = getWindow();
            if (win && !win.isDestroyed()) {
              win.webContents.send(EVENT_CHANNELS.optimizerScanProgress, { done, total });
            }
          },
        });
        return { ok: true as const, value: result };
      } catch (error) {
        return {
          ok: false as const,
          message: error instanceof Error ? error.message : String(error),
        };
      } finally {
        if (currentScan === controller) currentScan = null;
      }
    },
    (issue) => ({ ok: false as const, message: issue }),
  );

  handle(
    CHANNELS.optimizerClean,
    schemas.OptimizerCleanRequest,
    async (req) => {
      try {
        const roots = await knownRoots();
        const outcome = await cleanItems(req.paths, roots, (path) => shell.trashItem(path));
        return { ok: true as const, value: outcome };
      } catch (error) {
        return {
          ok: false as const,
          message: error instanceof Error ? error.message : String(error),
        };
      }
    },
    (issue) => ({ ok: false as const, message: issue }),
  );

  handleBare(CHANNELS.optimizerGpu, async () => {
    try {
      return { ok: true as const, value: await getGpuStats() };
    } catch (error) {
      return {
        ok: false as const,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  });
}
