import { useEffect } from 'react';

import { bridge } from '../../services/bridge';
import { useOptimizerStore } from '../../store/optimizer-store';
import { useToastStore } from '../../store/toast-store';
import { useUiStore } from '../../store/ui-store';

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

  // Phase 72 Theme E — read the per-ecosystem opt-out fresh at scan time,
  // not subscribed reactively: this is a one-shot request, not a render.
  const disabledEcosystems = useUiStore.getState().disabledEcosystems;
  const response = await api.optimizer.scan({
    ...(extraRoot === undefined ? {} : { extraRoot }),
    ...(disabledEcosystems.length === 0 ? {} : { disabledEcosystems }),
  });
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
 * Wires `optimizerSystemScanProgress` events into the store — the system
 * scan's own stream, independent of `useOptimizerScanProgress`'s (Decision
 * 14: two independent surfaces, two controllers, main-side and here).
 */
export function useSystemScanProgress(): void {
  useEffect(() => {
    const api = bridge();
    if (!api) return;
    return api.optimizer.onSystemScanProgress(({ done, total }) => {
      useOptimizerStore.getState().systemScanProgress(done, total);
    });
  }, []);
}

export async function runSystemScan(): Promise<void> {
  const store = useOptimizerStore.getState();
  store.startSystemScan();

  const api = bridge();
  if (!api) {
    store.systemScanError('The app bridge is unavailable.');
    return;
  }

  const response = await api.optimizer.systemScan({});
  if (response.ok) {
    store.systemScanDone(response.value);
  } else {
    store.systemScanError(response.message);
  }
}

/**
 * Cleans the given system-cache registry entries (by `entryId`, never a raw
 * path — main re-resolves and re-confines each one fresh at clean time) and
 * reconciles the store's last scan result against what actually happened,
 * mirroring `runOptimizerClean`'s own reconciliation shape.
 */
export async function runSystemClean(entryIds: string[]): Promise<OptimizerCleanOutcome | null> {
  const api = bridge();
  if (!api) {
    useToastStore.getState().addToast({ message: 'The app bridge is unavailable.', status: 'error' });
    return null;
  }

  const response = await api.optimizer.systemClean({ entryIds });
  if (!response.ok) {
    useToastStore.getState().addToast({ message: response.message, status: 'error' });
    return null;
  }

  const store = useOptimizerStore.getState();
  const requested = new Set(entryIds);
  const skippedPaths = new Set(response.value.skipped.map((entry) => entry.path));
  const priorResult = store.systemScan.result;
  if (priorResult) {
    store.systemScanDone({
      ...priorResult,
      // Drop every item whose entry was requested and actually cleaned;
      // keep one back only if it came back in `skipped` (re-validated away
      // at clean time — still there, so it still belongs in the list).
      items: priorResult.items.filter(
        (item) => !requested.has(item.entryId) || skippedPaths.has(item.path),
      ),
    });
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
 * Runs one vendor reclaim command by `entryId` (Phase 73 Theme D) — the
 * argv itself is resolved main-side against a fixed table and never named
 * by this call. Reports the outcome via toast; a successful run's output is
 * shown by the caller (the confirm dialog's own result step), not here.
 */
export async function runSystemReclaim(
  entryId: string,
): Promise<{ ok: true; stdout: string; stderr: string; exitCode: number | null } | { ok: false; message: string }> {
  const api = bridge();
  if (!api) {
    const message = 'The app bridge is unavailable.';
    useToastStore.getState().addToast({ message, status: 'error' });
    return { ok: false, message };
  }

  const response = await api.optimizer.systemReclaim({ entryId });
  if (!response.ok) {
    useToastStore.getState().addToast({ message: response.message, status: 'error' });
    return { ok: false, message: response.message };
  }

  return { ok: true, ...response.value };
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

/**
 * Phase 74 Theme D — "Check Trash". Recomputes the Storage tab's Trash card
 * every time it is called; there is no auto-refresh (Decision 11).
 */
export async function loadTrashSummary(): Promise<void> {
  const store = useOptimizerStore.getState();
  store.trashLoading();

  const api = bridge();
  if (!api) {
    store.trashFailed('The app bridge is unavailable.');
    return;
  }

  const response = await api.optimizer.trashSummary();
  if (response.ok) {
    store.trashReady(response.value);
  } else {
    store.trashFailed(response.message);
  }
}

/**
 * Phase 74 Theme C/D — the one no-undo operation in this arc. On success,
 * re-runs `loadTrashSummary()` immediately so the card shows `0 items`
 * rather than a stale count. A Finder cancel (`-128`) toasts as `'info'`,
 * not `'error'` — the user did that on purpose.
 */
export async function runEmptyTrash(): Promise<{ ok: boolean; message?: string }> {
  const api = bridge();
  if (!api) {
    useToastStore.getState().addToast({ message: 'The app bridge is unavailable.', status: 'error' });
    return { ok: false, message: 'The app bridge is unavailable.' };
  }

  const response = await api.optimizer.emptyTrash();
  if (response.ok) {
    await loadTrashSummary();
    return { ok: true };
  }

  const cancelledInFinder = response.message.startsWith('Cancelled in Finder');
  useToastStore.getState().addToast({
    message: response.message,
    status: cancelledInFinder ? 'info' : 'error',
  });
  return { ok: false, message: response.message };
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

