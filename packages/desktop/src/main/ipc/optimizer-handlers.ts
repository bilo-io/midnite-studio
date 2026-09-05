import { shell, type BrowserWindow } from 'electron';

import { CHANNELS, EVENT_CHANNELS, schemas } from '@midnite/studio-shared';

import { getGpuStats } from '../optimizer/gpu-service';
import { getProcessTableResult, killProcess } from '../optimizer/kill-service';
import { cleanItems, knownRoots, scanWorkspace } from '../optimizer/scan-service';
import { handle, handleBare } from './handle';

/**
 * The Workspace Optimizer's IPC surface (Phase 59 Themes C, D, E).
 * Supports Smart Scan + Storage, Process table & Kill with PID-reuse guards,
 * and live GPU telemetry.
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

  handleBare(CHANNELS.optimizerProcesses, async () => {
    try {
      return { ok: true as const, value: await getProcessTableResult() };
    } catch (error) {
      return {
        ok: false as const,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  });

  handle(
    CHANNELS.optimizerKill,
    schemas.OptimizerKillRequest,
    async (req) => {
      try {
        return await killProcess(req.pid, req.expectArgv, req.force);
      } catch (error) {
        return {
          ok: false as const,
          message: error instanceof Error ? error.message : String(error),
        };
      }
    },
    (issue) => ({ ok: false as const, message: issue }),
  );
}

