import { useEffect } from 'react';

import { bridge } from '../../services/bridge';
import { useOptimizerStore } from '../../store/optimizer-store';
import { useToastStore } from '../../store/toast-store';

/**
 * Wires `optimizerScanProgress` events into the store — a stream, not a
 * return value, so Smart Scan's ring is driven by the walk itself.
 */
export function useOptimizerScanProgress(): void {
  useEffect(() => {
    const api = bridge();
    if (!api) return;
    return api.optimizer.onScanProgress(({ done, total }) => {
      useOptimizerStore.getState().scanProgress(done, total);
    });
  }, []);
}

export async function runOptimizerScan(extraRoot?: string): Promise<void> {
  const store = useOptimizerStore.getState();
  store.startScan();

  const api = bridge();
  if (!api) {
    store.scanError('The app bridge is unavailable.');
    return;
  }

  const response = await api.optimizer.scan(extraRoot === undefined ? {} : { extraRoot });
  if (response.ok) {
    store.scanDone(response.value);
  } else {
    store.scanError(response.message);
  }
}

export type OptimizerCleanOutcome = {
  freedBytes: number;
  skipped: { path: string; reason: string }[];
};

/**
 * Cleans the given paths and reconciles the store against what actually
 * happened — a skipped item (re-validated away at delete time) is reported
 * via toast rather than silently vanishing from the list it never left.
 */
export async function runOptimizerClean(paths: string[]): Promise<OptimizerCleanOutcome | null> {
  const api = bridge();
  if (!api) {
    useToastStore.getState().addToast({ message: 'The app bridge is unavailable.', status: 'error' });
    return null;
  }

  const response = await api.optimizer.clean({ paths });
  if (!response.ok) {
    useToastStore.getState().addToast({ message: response.message, status: 'error' });
    return null;
  }

  const skippedPaths = new Set(response.value.skipped.map((entry) => entry.path));
  for (const path of paths) {
    if (!skippedPaths.has(path)) useOptimizerStore.getState().removeScanItem(path);
  }

  if (response.value.skipped.length > 0) {
    const count = response.value.skipped.length;
    useToastStore.getState().addToast({
      message: `${count} item${count === 1 ? '' : 's'} skipped — no longer there.`,
      status: 'info',
    });
  }

  return response.value;
}

export async function loadOptimizerGpu(): Promise<void> {
  const api = bridge();
  if (!api) return;
  const response = await api.optimizer.gpu();
  if (response.ok) useOptimizerStore.getState().setGpu(response.value);
}
