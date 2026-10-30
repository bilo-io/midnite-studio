import type { AppsStatus } from './bridge';
import { LEGACY_APP_HOSTS, LEGACY_BUNDLE_APP_IDS, LEGACY_BUNDLE_NAMES, type AppId, type LegacyBundleAppId } from './catalog';

/**
 * The swap from a retired app to its host (Phase 124 Theme G.3). Coder, Creator, Cleaner, Vault,
 * Monitor and Capture are modules of Agents, Vanguard and Mind now, but their apps were
 * deleted in Theme H and no release builds them, but a Mac can still have one installed. The host's tile says so, offers the
 * host while it is missing, and offers to remove the old bundle once the host is there.
 */
export type ReplacedBundle = {
  id: LegacyBundleAppId;
  /** `Coder`, for "Replaces Coder". */
  name: string;
  version: string;
};

/** The retired bundles recorded as installed whose host is `host`. */
export function replacedBundles(host: AppId, apps: AppsStatus | null): ReplacedBundle[] {
  if (apps === null) return [];
  return LEGACY_BUNDLE_APP_IDS.flatMap((id) => {
    if (LEGACY_APP_HOSTS[id].app !== host) return [];
    const record = apps.installed.find((a) => a.id === id);
    return record === undefined ? [] : [{ id, name: LEGACY_BUNDLE_NAMES[id], version: record.version }];
  });
}

/** `Coder`, `Coder and Creator`, `Coder, Creator and Vault`. */
export function joinNames(replaced: readonly ReplacedBundle[]): string {
  const names = replaced.map((r) => r.name);
  const last = names.pop();
  return names.length === 0 ? (last ?? '') : `${names.join(', ')} and ${last}`;
}

/** `Replaces Coder`, `Replaces Cleaner and Vault`, `Replaces Coder, Creator and Vault`. */
export function replacesLine(replaced: readonly ReplacedBundle[]): string | null {
  if (replaced.length === 0) return null;
  return `Replaces ${joinNames(replaced)}`;
}

/**
 * What the sheet offers: install the host while it is not installed, remove the old bundles once it
 * is. Nothing when no retired bundle is installed.
 */
export function swapOffer(replaced: readonly ReplacedBundle[], hostInstalled: boolean): 'install-host' | 'remove-old' | null {
  if (replaced.length === 0) return null;
  return hostInstalled ? 'remove-old' : 'install-host';
}
