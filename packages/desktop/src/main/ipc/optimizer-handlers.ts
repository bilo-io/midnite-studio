import { shell, type BrowserWindow } from 'electron';

import { CHANNELS, EVENT_CHANNELS, schemas } from '@midnite/studio-shared';

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
 * The Workspace Optimizer's IPC surface (Phase 59 Themes C, D, E).
 * Supports Smart Scan + Storage, Process table & Kill with PID-reuse guards,
 * and live GPU telemetry.
 */
export function registerOptimizerHandlers(getWindow: () => BrowserWindow | null): void {
  // One scan at a time: a second `optimizerScan` call aborts whichever is
  // still running rather than let two walks race each other's progress events.
  let currentScan: AbortController | null = null;
  // A second, independent single-flight controller for the system-cache scan
  // (Phase 73 Theme B, Decision 14) — sharing `currentScan` would mean
  // starting a system scan silently aborts an in-flight Smart Scan and vice
  // versa; these are independent surfaces over independent data.
  let currentSystemScan: AbortController | null = null;

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
          ...(req.disabledEcosystems === undefined
            ? {}
            : { disabledEcosystems: req.disabledEcosystems }),
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

  handleBare(CHANNELS.optimizerSystemCatalogue, async () => {
    // Static — labels/producers/ecosystem only, no paths, and no resolution
    // against this machine's actual filesystem. See the channel's own
    // docblock: consent is asked BEFORE any scan, so a scan-carried list
    // would be circular.
    return {
      ok: true as const,
      value: DEFAULT_SYSTEM_CACHE_ENTRIES.map((entry) => ({
        entryId: entry.id,
        label: entry.label,
        producer: entry.producer,
        ecosystem: entry.ecosystem,
        reclaim: entry.reclaim,
      })),
    };
  });

  handle(
    CHANNELS.optimizerSystemScan,
    schemas.OptimizerSystemScanRequest,
    async () => {
      currentSystemScan?.abort();
      const controller = new AbortController();
      currentSystemScan = controller;

      try {
        const result = await scanSystemCaches({
          signal: controller.signal,
          onProgress: (done, total) => {
            const win = getWindow();
            if (win && !win.isDestroyed()) {
              win.webContents.send(EVENT_CHANNELS.optimizerSystemScanProgress, { done, total });
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
        if (currentSystemScan === controller) currentSystemScan = null;
      }
    },
    (issue) => ({ ok: false as const, message: issue }),
  );

  handle(
    CHANNELS.optimizerSystemClean,
    schemas.OptimizerSystemCleanRequest,
    async (req) => {
      try {
        const outcome = await cleanSystemCaches(req.entryIds, (path) => shell.trashItem(path));
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

  handle(
    CHANNELS.optimizerSystemReclaim,
    schemas.OptimizerSystemReclaimRequest,
    async (req) => {
      try {
        return await runReclaimCommand(req.entryId);
      } catch (error) {
        return {
          ok: false as const,
          message: error instanceof Error ? error.message : String(error),
        };
      }
    },
    (issue) => ({ ok: false as const, message: issue }),
  );

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

