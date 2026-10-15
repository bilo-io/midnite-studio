import type { Catalog } from './catalog-feed';
import { compareVersions } from './version';

/**
 * Lockstep versions (Phase 113 Theme E): the runtime (launcher + shared Electron) and every
 * app bundle carry ONE version, and the launcher refuses to install, update to or open a
 * bundle whose version is not exactly the runtime's.
 *
 * `minimumRuntimeVersion` stays in `catalog.json` as data for tooling, but it never relaxes
 * this rule: a bundle at 0.4.0 does not run on runtime 0.5.0 just because 0.5.0 >= its
 * minimum. Lockstep wins — equality is the only passing case.
 *
 * Pure, so every refusal is a unit test and the same decision serves install, update and open.
 */

export const LOCKSTEP_REASONS = ['bundle-ahead', 'bundle-behind', 'catalog-mismatch'] as const;
/**
 * - `bundle-ahead`  — the bundle is newer than the running runtime: update the launcher first.
 * - `bundle-behind` — the bundle is older than the runtime (typically left behind by a runtime
 *   update): update the bundle.
 * - `catalog-mismatch` — a catalog entry disagrees with the catalog's own `runtimeVersion`.
 */
export type LockstepReason = (typeof LOCKSTEP_REASONS)[number];

export type LockstepRefusal = { ok: false; reason: LockstepReason; message: string };
export type LockstepVerdict = { ok: true } | LockstepRefusal;

export function checkLockstep(input: { runtimeVersion: string; bundleVersion: string; label?: string }): LockstepVerdict {
  const { runtimeVersion, bundleVersion } = input;
  const who = input.label ?? 'The bundle';
  if (bundleVersion === runtimeVersion) return { ok: true };
  if (compareVersions(bundleVersion, runtimeVersion) > 0) {
    return {
      ok: false,
      reason: 'bundle-ahead',
      message: `${who} is version ${bundleVersion} but Midnite Apps is ${runtimeVersion} — update Midnite Apps first.`,
    };
  }
  return {
    ok: false,
    reason: 'bundle-behind',
    message: `${who} is version ${bundleVersion} but Midnite Apps is ${runtimeVersion} — it needs updating to match.`,
  };
}

/** Every catalog entry whose version differs from the catalog's `runtimeVersion`. Empty means consistent. */
export function catalogLockstepViolations(catalog: Catalog): LockstepRefusal[] {
  return catalog.apps.flatMap((app) =>
    app.version === catalog.runtimeVersion
      ? []
      : [
          {
            ok: false as const,
            reason: 'catalog-mismatch' as const,
            message: `catalog lists ${app.id} ${app.version} but its runtimeVersion is ${catalog.runtimeVersion}`,
          },
        ],
  );
}
