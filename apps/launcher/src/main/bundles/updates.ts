import type { LauncherResult } from '../../common/bridge';
import type { Catalog, CatalogApp } from '../../common/catalog-feed';
import type { InstalledApp, InstalledState } from '../../common/installed-state';
import { installAppBundle, restubAppBundle, type BundleOpsDeps } from './install-bundle';
import type { StubIdentity } from './layout';
import { readInstalledState } from './state';

/**
 * App bundles are updated by the launcher, never by themselves (Phase 113 Theme E, Decision 6).
 * Two things go stale, for two different reasons:
 *
 *  - **a bundle** when `catalog.json` publishes a newer version of it → reinstall it from the
 *    catalog (`installAppBundle` is already an update: verify-then-swap over the old copy);
 *  - **a stub** when the *runtime* updates under it → re-clone it (`restubAppBundle`), because an
 *    APFS clone keeps the framework it was cloned from (Theme B's "clones go stale" risk).
 *
 * Both plans are pure, so which apps an update touches is a unit test; refusing a bundle whose
 * version does not match the runtime is lockstep's job (item 4), not this file's.
 */

/** Installed apps whose catalog entry is a different version — the ones to reinstall. */
export function planBundleUpdates(catalog: Catalog, state: InstalledState): { record: InstalledApp; entry: CatalogApp }[] {
  return state.apps.flatMap((record) => {
    const entry = catalog.apps.find((a) => a.id === record.id);
    return entry !== undefined && entry.version !== record.version ? [{ record, entry }] : [];
  });
}

/** Installed apps whose stub was cloned from another runtime version. */
export function planRestubs(state: InstalledState, runtimeVersion: string): InstalledApp[] {
  return state.apps.filter((a) => a.runtimeVersion !== runtimeVersion);
}

export type UpdateOutcome = { id: string; action: 'update' | 'restub'; result: LauncherResult };

/**
 * One pass: re-clone stale stubs first (cheap, local, and what makes an app launchable on the
 * new runtime), then pull newer bundles. One app's failure never stops the rest; each comes
 * back as its own outcome.
 */
export async function updateInstalledBundles(
  catalog: Catalog | null,
  identityFor: (id: string) => StubIdentity | null,
  deps: BundleOpsDeps,
): Promise<UpdateOutcome[]> {
  const outcomes: UpdateOutcome[] = [];
  const state = await readInstalledState(deps.roots.installRoot);

  for (const record of planRestubs(state, deps.runtime.version)) {
    const identity = identityFor(record.id);
    if (identity === null) continue;
    outcomes.push({ id: record.id, action: 'restub', result: await restubAppBundle(record, identity, deps) });
  }
  if (catalog === null) return outcomes;

  // Re-read: a restub rewrote records, and an update must start from what is on disk now.
  for (const { entry } of planBundleUpdates(catalog, await readInstalledState(deps.roots.installRoot))) {
    const identity = identityFor(entry.id);
    if (identity === null) continue;
    outcomes.push({ id: entry.id, action: 'update', result: await installAppBundle(entry, identity, deps) });
  }
  return outcomes;
}
