import type {
  GpuStats,
  MemoryBreakdown,
  ProcessInfo,
  ScanResult,
  SystemCacheCatalogueEntry,
  SystemScanResult,
  TrashSummary,
} from '@midnite/studio-shared';
import { create } from 'zustand';

/**
 * The Workspace Optimizer's own store (Phase 59 Theme A) — deliberately
 * **not persisted**. A cached `ScanResult` surviving a restart would show
 * byte counts for files that may no longer exist; every other piece of state
 * here (the running process table, the live GPU reading) is equally a fact
 * about *right now*, not something to remember between launches.
 */

/** The five tabs the Optimizer view splits into — `system` (the long-window
 *  monitor charts) joined the original four. */
export type OptimizerTab = 'smartScan' | 'storage' | 'memory' | 'system' | 'gpu';

/** Generic over the result shape so Phase 73's system-cache scan can mirror
 *  this verbatim (`OptimizerScanState<SystemScanResult>`) without a second,
 *  drifting copy of the same {state, progress, result, message} shape. */
export type OptimizerScanState<R = ScanResult> = {
  state: 'idle' | 'scanning' | 'done' | 'error';
  /** 0–100, driven by `optimizerScanProgress` events, not a timer. */
  progress: number;
  result: R | null;
  message: string | null;
};

const initialScan: OptimizerScanState = { state: 'idle', progress: 0, result: null, message: null };
const initialSystemScan: OptimizerScanState<SystemScanResult> = {
  state: 'idle',
  progress: 0,
  result: null,
  message: null,
};

export type OptimizerState = {
  tab: OptimizerTab;
  setTab: (tab: OptimizerTab) => void;

  scan: OptimizerScanState;
  startScan: () => void;
  scanProgress: (done: number, total: number) => void;
  scanDone: (result: ScanResult) => void;
  scanError: (message: string) => void;
  /** Clean removed this path — drop it from the rendered list without a re-scan. */
  removeScanItem: (path: string) => void;

  processes: ProcessInfo[];
  setProcesses: (processes: ProcessInfo[]) => void;
  removeProcess: (pid: number) => void;

  memory: MemoryBreakdown | null;
  setMemory: (memory: MemoryBreakdown | null) => void;

  gpu: GpuStats | null;
  setGpu: (gpu: GpuStats | null) => void;

  /**
   * Phase 73 Theme B — the system-wide cache scan, mirroring `scan` exactly
   * (same {state, progress, result, message} shape, same action names) over
   * a completely separate result type. Still deliberately unpersisted, for
   * the identical reason `scan` is.
   */
  systemScan: OptimizerScanState<SystemScanResult>;
  startSystemScan: () => void;
  systemScanProgress: (done: number, total: number) => void;
  systemScanDone: (result: SystemScanResult) => void;
  systemScanError: (message: string) => void;

  /** Labels/producers/ecosystem only, fetched once (not per scan) — the
   *  consent dialog's and the settings page's enumerations both render from
   *  this rather than hardcoded prose. `null` until the first fetch resolves. */
  systemCatalogue: SystemCacheCatalogueEntry[] | null;
  setSystemCatalogue: (catalogue: SystemCacheCatalogueEntry[]) => void;

  /**
   * Phase 74 Theme D — the Storage tab's Trash card, held here rather than
   * in component state: the Storage tab unmounts on every tab switch, and
   * local state would silently discard a check the user just paid for. Same
   * reason `scan`, `gpu`, `memory` already live here. Deliberately no
   * auto-refresh: it updates only on "Check Trash" and again after a
   * successful empty (Decision 11).
   */
  trash: { status: 'idle' | 'loading' | 'ready' | 'error'; summary: TrashSummary | null; message: string | null };
  trashLoading: () => void;
  trashReady: (summary: TrashSummary) => void;
  trashFailed: (message: string) => void;
};

export const useOptimizerStore = create<OptimizerState>((set) => ({
  tab: 'smartScan',
  setTab: (tab) => set({ tab }),

  scan: initialScan,
  startScan: () => set({ scan: { state: 'scanning', progress: 0, result: null, message: null } }),
  scanProgress: (done, total) =>
    set((state) => ({
      scan: {
        ...state.scan,
        progress: total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0,
      },
    })),
  scanDone: (result) => set({ scan: { state: 'done', progress: 100, result, message: null } }),
  scanError: (message) =>
    set((state) => ({ scan: { ...state.scan, state: 'error', message } })),
  removeScanItem: (path) =>
    set((state) => {
      if (!state.scan.result) return state;
      return {
        scan: {
          ...state.scan,
          result: {
            ...state.scan.result,
            items: state.scan.result.items.filter((item) => item.path !== path),
          },
        },
      };
    }),

  processes: [],
  setProcesses: (processes) => set({ processes }),
  removeProcess: (pid) =>
    set((state) => ({
      processes: state.processes.filter((p) => p.pid !== pid),
    })),

  memory: null,
  setMemory: (memory) => set({ memory }),

  gpu: null,
  setGpu: (gpu) => set({ gpu }),

  systemScan: initialSystemScan,
  startSystemScan: () =>
    set({ systemScan: { state: 'scanning', progress: 0, result: null, message: null } }),
  systemScanProgress: (done, total) =>
    set((state) => ({
      systemScan: {
        ...state.systemScan,
        progress: total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0,
      },
    })),
  systemScanDone: (result) =>
    set({ systemScan: { state: 'done', progress: 100, result, message: null } }),
  systemScanError: (message) =>
    set((state) => ({ systemScan: { ...state.systemScan, state: 'error', message } })),

  systemCatalogue: null,
  setSystemCatalogue: (systemCatalogue) => set({ systemCatalogue }),

  trash: { status: 'idle', summary: null, message: null },
  trashLoading: () => set({ trash: { status: 'loading', summary: null, message: null } }),
  trashReady: (summary) => set({ trash: { status: 'ready', summary, message: null } }),
  trashFailed: (message) => set({ trash: { status: 'error', summary: null, message } }),
}));
