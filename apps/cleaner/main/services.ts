import { createScannerServices, type OptimizerMainServices } from '@midnite/studio-feature-optimizer/main';

/**
 * The optimizer's services as a standalone Cleaner process provides them (Phase 113 Theme H).
 *
 * The scanner half is real: the system-cache scan, clean and reclaim commands, and the workspace
 * scan over the one extra root a user picks, all from the feature package (`createScannerServices`).
 * Cleaner has no repo registry, so a scan sees no registered worktrees and `knownRoots` is empty —
 * a workspace item a scan finds is refused at clean time ("no longer resolves under a known root")
 * until a root-confirmation flow exists; the system-cache clean is allowlist-based and is not
 * affected. What stays "not available yet" is what reaches into Electron or another app's
 * state: the process table, the kill action and the GPU probe (Studio's `kill-service` / `gpu-service`).
 */
export const NOT_PORTED = 'This part of the optimizer is not available in Midnite Cleaner yet.';

const notPorted = (): never => {
  throw new Error(NOT_PORTED);
};

export const CLEANER_OPTIMIZER_SERVICES: OptimizerMainServices = {
  ...createScannerServices(),
  getGpuStats: async () => ({ model: null, vramBytes: null, loadPercent: null }),
  getProcessTableResult: async () => notPorted(),
  killProcess: async () => ({ ok: false, message: NOT_PORTED }),
};
