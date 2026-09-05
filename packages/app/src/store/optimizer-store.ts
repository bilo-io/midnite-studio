import type { GpuStats, ProcessInfo, ScanResult } from '@midnite/studio-shared';
import { create } from 'zustand';

/**
 * The Workspace Optimizer's own store (Phase 59 Theme A) — deliberately
 * **not persisted**. A cached `ScanResult` surviving a restart would show
 * byte counts for files that may no longer exist; every other piece of state
 * here (the running process table, the live GPU reading) is equally a fact
 * about *right now*, not something to remember between launches.
 */

/** The four tabs the Optimizer view splits into. */
export type OptimizerTab = 'smartScan' | 'storage' | 'memory' | 'gpu';

export type OptimizerScanState = {
  state: 'idle' | 'scanning' | 'done' | 'error';
  /** 0–100, driven by `optimizerScanProgress` events, not a timer. */
  progress: number;
  result: ScanResult | null;
  message: string | null;
};

const initialScan: OptimizerScanState = { state: 'idle', progress: 0, result: null, message: null };

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

  gpu: GpuStats | null;
  setGpu: (gpu: GpuStats | null) => void;
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

  gpu: null,
  setGpu: (gpu) => set({ gpu }),
}));
