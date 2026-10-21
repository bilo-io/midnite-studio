import type { LauncherResult } from '../../common/bridge';
import type { Catalog, CatalogApp } from '../../common/catalog-feed';
import { catalogLockstepViolations, checkLockstep } from '../../common/lockstep';
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
 * version does not match the runtime is `common/lockstep.ts`'s job; this file only routes its
 * refusals: an update to a version the runtime would refuse comes back as that refusal, and a
 * bundle the runtime left behind that no catalog entry can fix comes back as a `blocked` outcome
 * rather than being left to open silently.
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

export type UpdateOutcome = { id: string; action: 'update' | 'restub' | 'blocked'; result: LauncherResult };

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
  // Re-read: a restub rewrote records, and an update must start from what is on disk now.
  const fresh = await readInstalledState(deps.roots.installRoot);
  // An internally inconsistent catalog is not installed from at all (`parseCatalog` already
  // rejects one; this is the same check for a catalog that arrived another way).
  const usable = catalog !== null && catalogLockstepViolations(catalog).length === 0 ? catalog : null;
  const attempted = new Set<string>();
  if (usable !== null) {
    for (const { entry } of planBundleUpdates(usable, fresh)) {
      const identity = identityFor(entry.id);
      if (identity === null) continue;
      attempted.add(entry.id);
      outcomes.push({ id: entry.id, action: 'update', result: await installAppBundle(entry, identity, deps) });
    }
  }

  // Whatever is still out of lockstep after that (no newer catalog entry, offline, or the update
  // failed) is reported, never silently launched against a different runtime.
  for (const record of (await readInstalledState(deps.roots.installRoot)).apps) {
    if (attempted.has(record.id)) continue;
    const verdict = checkLockstep({ runtimeVersion: deps.runtime.version, bundleVersion: record.version, label: `${record.id} ${record.version}` });
    if (!verdict.ok) outcomes.push({ id: record.id, action: 'blocked', result: { ok: false, message: verdict.message, reason: verdict.reason } });
  }
  return outcomes;
}
