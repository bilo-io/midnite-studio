import { bridge, formatBytes, useToastStore, type FrameDialogs } from '@midnite/studio-frame';

import type { OptimizerSettingsState } from './host';
import { useOptimizerStore } from './optimizer-store';
import { requestSystemCacheConsent } from './system-cache-consent';
import { loadSystemCatalogue, runSystemClean, runSystemScan } from './use-optimizer';

/**
 * Clean system (Phase 148 Theme E), the monitor flyout's action: the optimizer's consent-gated
 * system-cache scan plus the broker directory's leftovers, behind ONE confirm.
 *
 * Caches go to the Trash (the optimizer's own clean). Broker leftovers — dead brokers' pid and token
 * files and logs of versions with no live broker — are unlinked, which the confirm says in as many
 * words. Nothing here ends a process, and main re-checks every name it is asked to sweep.
 */
export type CleanSystemDeps = {
  dialogs: Pick<FrameDialogs, 'confirm' | 'notify'>;
  getSettings: () => OptimizerSettingsState;
  /** The fallback while the Optimizer itself is switched off — its page is where it is turned on. */
  openOptimizer: () => void;
};

export type BrokerLeftovers = { names: string[]; bytes: number };

/** The broker plan as the confirm's line, or `null` when there is nothing to sweep. */
export function brokerLeftoversLine(leftovers: BrokerLeftovers): string | null {
  if (leftovers.names.length === 0) return null;
  const count = leftovers.names.length;
  return `Broker leftovers (${count} ${count === 1 ? 'file' : 'files'} · ${formatBytes(leftovers.bytes)}) will be deleted for good, not moved to the Trash.`;
}

/** The confirm's lines: one per cache entry, the broker line, then the total. */
export function confirmWarnings(
  items: readonly { label: string; bytes: number; approximate: boolean }[],
  leftovers: BrokerLeftovers,
): string[] {
  const lines = items.map((item) => `${item.label} — ${item.approximate ? 'at least ' : ''}${formatBytes(item.bytes)}`);
  const broker = brokerLeftoversLine(leftovers);
  if (broker) lines.push(broker);
  const total = items.reduce((sum, item) => sum + item.bytes, 0) + leftovers.bytes;
  lines.push(`Total: ${formatBytes(total)}`);
  return lines;
}

async function readBrokerPlan(): Promise<BrokerLeftovers> {
  try {
    const response = await bridge()?.optimizer.brokerSweepPlan();
    if (response?.ok) return { names: response.value.entries.map((e) => e.name), bytes: response.value.totalBytes };
  } catch {
    // An older bridge: no broker sweep, the caches still clean.
  }
  return { names: [], bytes: 0 };
}

let inFlight = false;

export async function runCleanSystem(deps: CleanSystemDeps): Promise<void> {
  if (inFlight) return;
  inFlight = true;
  try {
    await runOnce(deps);
  } finally {
    inFlight = false;
  }
}

async function runOnce(deps: CleanSystemDeps): Promise<void> {
  const { dialogs, getSettings, openOptimizer } = deps;
  const settings = getSettings();
  if (!settings.optimizerEnabled) {
    openOptimizer();
    return;
  }
  if (!(settings.allowSystemCacheClean && settings.systemCacheConsentGiven)) {
    // Consent first; once given, the same action carries on to the scan.
    await loadSystemCatalogue();
    const labels = (useOptimizerStore.getState().systemCatalogue ?? []).map((entry) => entry.label);
    requestSystemCacheConsent(dialogs, settings, labels, () => void runCleanSystem(deps));
    return;
  }

  const [, leftovers] = await Promise.all([runSystemScan(), readBrokerPlan()]);
  const scan = useOptimizerStore.getState().systemScan;
  if (scan.state === 'error') {
    dialogs.notify({ title: 'Could not scan system caches', body: scan.message ?? undefined });
    return;
  }
  const items = scan.result?.items ?? [];
  if (items.length === 0 && leftovers.names.length === 0) {
    dialogs.notify({ title: 'Nothing to clean', body: 'No tool caches or broker leftovers were found.' });
    return;
  }

  dialogs.confirm({
    title: 'Clean system?',
    confirmLabel: 'Clean',
    danger: true,
    blastRadius: items.length > 0 ? { count: items.length, sample: [] } : null,
    blastRadiusKind: 'systemCache',
    warnings: confirmWarnings(items, leftovers),
    onConfirm: () => void clean(items.map((i) => i.entryId), leftovers),
  });
}

async function clean(entryIds: string[], leftovers: BrokerLeftovers): Promise<void> {
  let freed = 0;
  let cacheBytes = 0;
  if (entryIds.length > 0) {
    const outcome = await runSystemClean(entryIds);
    if (outcome) cacheBytes = outcome.freedBytes;
  }
  freed += cacheBytes;

  let brokerBytes = 0;
  let brokerFiles = 0;
  if (leftovers.names.length > 0) {
    try {
      const response = await bridge()?.optimizer.brokerSweep({ names: leftovers.names });
      if (response?.ok) {
        brokerBytes = response.value.freedBytes;
        brokerFiles = response.value.removed;
      } else if (response) {
        useToastStore.getState().addToast({ message: response.message, status: 'error' });
      }
    } catch (error) {
      useToastStore.getState().addToast({ message: error instanceof Error ? error.message : String(error), status: 'error' });
    }
  }
  freed += brokerBytes;

  const parts = [
    cacheBytes > 0 ? `${formatBytes(cacheBytes)} of caches moved to the Trash` : null,
    brokerFiles > 0 ? `${brokerFiles} broker ${brokerFiles === 1 ? 'file' : 'files'} removed (${formatBytes(brokerBytes)})` : null,
  ].filter((p): p is string => p !== null);
  useToastStore.getState().addToast({
    message: parts.length > 0 ? `Cleaned ${formatBytes(freed)}: ${parts.join(', ')}.` : 'Nothing was cleaned.',
    status: 'info',
  });
}
