import { defineFeatureMain } from '@midnite/studio-runtime';
import {
  CHANNELS,
  EVENT_CHANNELS,
  schemas,
  type Ecosystem,
  type GpuStats,
  type OptimizerVoidResult,
  type ProcessTableResult,
  type ScanResult,
  type SystemCacheCatalogueEntry,
  type SystemScanResult,
} from '@midnite/studio-shared';

import { optimizerManifest } from '../manifest';
import type { OptimizerLog } from './scanners/log';
import { noopLog } from './scanners/log';
import {
  cleanItems,
  knownRoots,
  NO_REPOS,
  scanWorkspace,
  type RepoSource,
} from './scanners/scan-service';
import { DEFAULT_SYSTEM_CACHE_ENTRIES } from './scanners/system-cache-registry';
import {
  cleanSystemCaches,
  runReclaimCommand,
  scanSystemCaches,
} from './scanners/system-cache-service';

export { optimizerManifest, type OptimizerManifest } from '../manifest';
export {
  dirBytes,
  knownRoots,
  MAX_WALK_ENTRIES,
  newWalkState,
  NO_REPOS,
  readDirSafe,
  scanWorkspace,
  cleanItems,
  type RepoSource,
  type WalkState,
} from './scanners/scan-service';
export {
  cleanSystemCaches,
  runReclaimCommand,
  scanSystemCaches,
} from './scanners/system-cache-service';
export { DEFAULT_SYSTEM_CACHE_ENTRIES } from './scanners/system-cache-registry';
export { noopLog, type OptimizerLog } from './scanners/log';

/**
 * The optimizer feature's main half (Phase 59 Themes C–E; a feature package
 * since Phase 113 Theme C).
 *
 * It owns the IPC surface — the channel list, payload validation through the
 * runtime's `ipc.handle`, the single-flight scan controllers, progress
 * forwarding — and registers it against whatever {@link FeatureMainContext}
 * its composer hands it. The *work* stays behind {@link OptimizerMainServices}:
 * the scanners and the process table reach into the pty broker, the browser
 * and web-app sessions, the repo registry and git-engine, which are runtime
 * services that have not moved yet (Theme D). Studio's desktop passes its own
 * implementations (`packages/desktop/src/main/ipc/optimizer-handlers.ts`);
 * Cleaner will pass the runtime's. Nothing here imports `electron`.
 */

/** What a trash operation does with each path — `ctx.trashItem` in practice. */
type Trash = (path: string) => Promise<void>;

/** The `{freed, skipped}` shape both clean paths answer with. */
export type OptimizerCleanOutcome = {
  freedBytes: number;
  skipped: { path: string; reason: string }[];
};

/** A reclaim command's result: what the fixed, main-side command printed. */
export type OptimizerReclaimOutcome =
  | { ok: true; value: { stdout: string; stderr: string; exitCode: number | null } }
  | { ok: false; message: string };

export type OptimizerMainServices = {
  scanWorkspace: (opts: {
    extraRoot?: string;
    disabledEcosystems?: Ecosystem[];
    signal: AbortSignal;
    onProgress: (done: number, total: number) => void;
  }) => Promise<ScanResult>;
  /** The roots a clean is confined to — a path outside them is refused. */
  knownRoots: () => Promise<string[]>;
  cleanItems: (paths: readonly string[], roots: readonly string[], trash: Trash) => Promise<OptimizerCleanOutcome>;
  getGpuStats: () => Promise<GpuStats>;
  getProcessTableResult: () => Promise<ProcessTableResult>;
  killProcess: (pid: number, expectArgv: string, force?: boolean) => Promise<OptimizerVoidResult>;
  /** The static system-cache catalogue: labels and producers only, no paths. */
  systemCatalogue: () => SystemCacheCatalogueEntry[];
  scanSystemCaches: (opts: {
    signal: AbortSignal;
    onProgress: (done: number, total: number) => void;
  }) => Promise<SystemScanResult>;
  cleanSystemCaches: (entryIds: readonly string[], trash: Trash) => Promise<OptimizerCleanOutcome>;
  runReclaimCommand: (entryId: string) => Promise<OptimizerReclaimOutcome>;
};

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));
const failed = (issue: string) => ({ ok: false as const, message: issue });

export const optimizerMain = defineFeatureMain<OptimizerMainServices>({
  feature: optimizerManifest.feature,
  channels: optimizerManifest.ipc,
  register(ctx, services) {
    const { ipc } = ctx;
    // One scan at a time: a second `optimizerScan` call aborts whichever is
    // still running rather than let two walks race each other's progress events.
    let currentScan: AbortController | null = null;
    // A second, independent single-flight controller for the system-cache scan
    // (Phase 73 Theme B, Decision 14) — sharing `currentScan` would mean
    // starting a system scan silently aborts an in-flight Smart Scan and vice
    // versa; these are independent surfaces over independent data.
    let currentSystemScan: AbortController | null = null;

    ipc.handle(
      CHANNELS.optimizerScan,
      schemas.OptimizerScanRequest,
      async (req) => {
        currentScan?.abort();
        const controller = new AbortController();
        currentScan = controller;
        try {
          const result = await services.scanWorkspace({
            ...(req.extraRoot === undefined ? {} : { extraRoot: req.extraRoot }),
            ...(req.disabledEcosystems === undefined ? {} : { disabledEcosystems: req.disabledEcosystems }),
            signal: controller.signal,
            onProgress: (done, total) => ctx.emit(EVENT_CHANNELS.optimizerScanProgress, { done, total }),
          });
          return { ok: true as const, value: result };
        } catch (error) {
          return failed(message(error));
        } finally {
          if (currentScan === controller) currentScan = null;
        }
      },
      failed,
    );

    ipc.handle(
      CHANNELS.optimizerClean,
      schemas.OptimizerCleanRequest,
      async (req) => {
        try {
          const roots = await services.knownRoots();
          const outcome = await services.cleanItems(req.paths, roots, (path) => ctx.trashItem(path));
          return { ok: true as const, value: outcome };
        } catch (error) {
          return failed(message(error));
        }
      },
      failed,
    );

    ipc.handleBare(CHANNELS.optimizerGpu, async () => {
      try {
        return { ok: true as const, value: await services.getGpuStats() };
      } catch (error) {
        return failed(message(error));
      }
    });

    ipc.handleBare(CHANNELS.optimizerProcesses, async () => {
      try {
        return { ok: true as const, value: await services.getProcessTableResult() };
      } catch (error) {
        return failed(message(error));
      }
    });

    // Static — labels/producers/ecosystem only, no paths, and no resolution
    // against this machine's actual filesystem. See the channel's own
    // docblock: consent is asked BEFORE any scan, so a scan-carried list
    // would be circular.
    ipc.handleBare(CHANNELS.optimizerSystemCatalogue, async () => ({
      ok: true as const,
      value: services.systemCatalogue(),
    }));

    ipc.handle(
      CHANNELS.optimizerSystemScan,
      schemas.OptimizerSystemScanRequest,
      async () => {
        currentSystemScan?.abort();
        const controller = new AbortController();
        currentSystemScan = controller;
        try {
          const result = await services.scanSystemCaches({
            signal: controller.signal,
            onProgress: (done, total) => ctx.emit(EVENT_CHANNELS.optimizerSystemScanProgress, { done, total }),
          });
          return { ok: true as const, value: result };
        } catch (error) {
          return failed(message(error));
        } finally {
          if (currentSystemScan === controller) currentSystemScan = null;
        }
      },
      failed,
    );

    ipc.handle(
      CHANNELS.optimizerSystemClean,
      schemas.OptimizerSystemCleanRequest,
      async (req) => {
        try {
          const outcome = await services.cleanSystemCaches(req.entryIds, (path) => ctx.trashItem(path));
          return { ok: true as const, value: outcome };
        } catch (error) {
          return failed(message(error));
        }
      },
      failed,
    );

    ipc.handle(
      CHANNELS.optimizerSystemReclaim,
      schemas.OptimizerSystemReclaimRequest,
      async (req) => {
        try {
          return await services.runReclaimCommand(req.entryId);
        } catch (error) {
          return failed(message(error));
        }
      },
      failed,
    );

    ipc.handle(
      CHANNELS.optimizerKill,
      schemas.OptimizerKillRequest,
      async (req) => {
        try {
          return await services.killProcess(req.pid, req.expectArgv, req.force);
        } catch (error) {
          return failed(message(error));
        }
      },
      failed,
    );
  },
});

/** The services the feature can provide on its own — everything that needs only the filesystem. */
export type ScannerServices = Pick<
  OptimizerMainServices,
  | 'scanWorkspace'
  | 'knownRoots'
  | 'cleanItems'
  | 'systemCatalogue'
  | 'scanSystemCaches'
  | 'cleanSystemCaches'
  | 'runReclaimCommand'
>;

/**
 * The scanner-backed half of {@link OptimizerMainServices} (Phase 113 Theme H): the workspace
 * scan, the system-cache scan, the clean paths and the reclaim commands. What stays host-owned is
 * what reaches into Electron, the pty broker or the browser — the GPU probe and the process table.
 * `repos` is the host's repo registry (Studio); a host with none (Cleaner) omits it and a workspace
 * scan covers only the extra root the user picks, with no root a clean may confine to.
 */
export function createScannerServices(
  opts: { repos?: RepoSource; log?: OptimizerLog } = {},
): ScannerServices {
  const repos = opts.repos ?? NO_REPOS;
  const log = opts.log ?? noopLog;
  return {
    scanWorkspace: (scan) => scanWorkspace({ repos, log, ...scan }),
    knownRoots: () => knownRoots(repos),
    cleanItems: (paths, roots, trash) => cleanItems(paths, roots, trash, log),
    // Static — labels/producers/ecosystem only, no paths (see the channel's docblock).
    systemCatalogue: () =>
      DEFAULT_SYSTEM_CACHE_ENTRIES.map((entry) => ({
        entryId: entry.id,
        label: entry.label,
        producer: entry.producer,
        ecosystem: entry.ecosystem,
        reclaim: entry.reclaim,
      })),
    scanSystemCaches: (scan) => scanSystemCaches({ log, ...scan }),
    cleanSystemCaches: (entryIds, trash) => cleanSystemCaches(entryIds, trash, log),
    runReclaimCommand: (entryId) => runReclaimCommand(entryId),
  };
}
