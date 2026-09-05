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

/**
 * Fetches the system-cache catalogue once (Phase 73 Theme B/C) — labels,
 * producers and ecosystem only, no paths. `packages/app` may not import
 * `packages/desktop`, so this channel is the only way the renderer ever
 * learns what the registry covers; the consent dialog's and the settings
 * page's enumerations both render from `useOptimizerStore`'s
 * `systemCatalogue` rather than hardcoded prose.
 *
 * Wrapped in try/catch, unlike this file's other bridge calls: this is the
 * one optimizer call a settings page mounts unconditionally whenever
 * `optimizerEnabled` is on, so a bridge that has not yet wired the method
 * (an older preload, or a test double) must leave the catalogue `null`
 * rather than take the whole settings page down with an uncaught TypeError.
 */
export async function loadSystemCatalogue(): Promise<void> {
  const api = bridge();
  if (!api) return;
  try {
    const response = await api.optimizer.systemCatalogue();
    if (response.ok) useOptimizerStore.getState().setSystemCatalogue(response.value);
  } catch {
    // Bridge method not present yet — leave `systemCatalogue` at its default
    // `null`; callers already render an empty enumeration for that case.
  }
}

export async function loadOptimizerGpu(): Promise<void> {
  const api = bridge();
  if (!api) return;
  const response = await api.optimizer.gpu();
  if (response.ok) useOptimizerStore.getState().setGpu(response.value);
}

export async function loadOptimizerProcesses(): Promise<void> {
  const api = bridge();
  if (!api) return;
  const response = await api.optimizer.processes();
  if (response.ok) {
    useOptimizerStore.getState().setProcesses(response.value.processes);
    useOptimizerStore.getState().setMemory(response.value.memory);
  }
}

export async function killOptimizerProcess(
  pid: number,
  expectArgv: string,
  force?: boolean,
): Promise<{ ok: boolean; message?: string }> {
  const api = bridge();
  if (!api) {
    useToastStore.getState().addToast({
      message: 'The app bridge is unavailable.',
      status: 'error',
    });
    return { ok: false, message: 'The app bridge is unavailable.' };
  }

  const response = await api.optimizer.kill({ pid, expectArgv, force });
  if (response.ok) {
    useOptimizerStore.getState().removeProcess(pid);
    useToastStore.getState().addToast({
      message: `Process ${pid} terminated.`,
      status: 'info',
    });
    return { ok: true };
  } else {
    useToastStore.getState().addToast({
      message: response.message,
      status: 'error',
    });
    return { ok: false, message: response.message };
  }
}

