import type { OptimizerMainServices } from '@midnite/studio-feature-optimizer/main';

/**
 * The optimizer's services as a standalone Cleaner process can honestly provide them (Phase 113 H2).
 *
 * Studio's implementations (`packages/desktop/src/main/optimizer/`) reach the repo registry, the
 * browser, web-app and pty owners and Electron's metrics — Studio-only state a Cleaner process does
 * not have, and which cannot be imported across the layer rule. Porting the scanners (the system
 * cache registry, detectors, the process table) into the feature package behind runtime ports is
 * Theme H3's; until then each operation that needs them answers with a plain message the optimizer
 * UI already renders as an error, rather than a handler that does not exist. What is real here is
 * the wiring: window, bridge, validated IPC, progress events, single-flight, trash.
 */
export const NOT_PORTED = 'This part of the optimizer is not available in Midnite Cleaner yet.';

const notPorted = (): never => {
  throw new Error(NOT_PORTED);
};

export const CLEANER_OPTIMIZER_SERVICES: OptimizerMainServices = {
  scanWorkspace: async () => notPorted(),
  knownRoots: async () => [],
  cleanItems: async () => notPorted(),
  getGpuStats: async () => ({ model: null, vramBytes: null, loadPercent: null }),
  getProcessTableResult: async () => notPorted(),
  killProcess: async () => ({ ok: false, message: NOT_PORTED }),
  systemCatalogue: () => [],
  scanSystemCaches: async () => notPorted(),
  cleanSystemCaches: async () => notPorted(),
  runReclaimCommand: async () => ({ ok: false, message: NOT_PORTED }),
};
