import { BUNDLE_APP_IDS, type AppId, type BundleAppId } from '../../common/catalog';
import type { AppInstallProgress, AppsStatus, LauncherResult } from '../../common/bridge';
import type { Catalog } from '../../common/catalog-feed';
import type { InstalledState } from '../../common/installed-state';
import type { BundleOpsDeps } from './install-bundle';
import type { StubIdentity } from './layout';

/**
 * What the renderer's tiles ask of the launcher, in one injectable place (Phase 113 Theme E):
 * the installed-bundle record against the catalog, and install / update / uninstall of exactly
 * one app. `ipc.ts` only validates and forwards; every dependency here is a parameter, so the
 * handlers are tested with fake bundle ops and never touch a real root.
 *
 * Nothing here throws across the boundary: a failure is `{ ok: false, message }`.
 */

export type AppsOpsDeps = {
  runtimeVersion: string;
  fetchCatalog(): Promise<Catalog | null>;
  readState(): Promise<InstalledState>;
  /** `null` for Studio and unknown ids. */
  identityFor(id: string): StubIdentity | null;
  /** `null` when this launcher cannot build stubs (unpackaged). */
  bundleDeps(): BundleOpsDeps | null;
  install(entry: Catalog['apps'][number], identity: StubIdentity, deps: BundleOpsDeps): Promise<LauncherResult>;
  uninstall(identity: StubIdentity, deps: BundleOpsDeps): Promise<LauncherResult>;
  onProgress?(event: AppInstallProgress): void;
};

const fail = (message: string): LauncherResult => ({ ok: false, message });
const asMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

export function createAppsOps(deps: AppsOpsDeps) {
  return {
    async status(): Promise<AppsStatus> {
      const [catalog, state] = await Promise.all([deps.fetchCatalog().catch(() => null), deps.readState()]);
      return {
        runtimeVersion: deps.runtimeVersion,
        canManageBundles: deps.bundleDeps() !== null,
        installed: state.apps.map(({ id, version, runtimeVersion }) => ({ id, version, runtimeVersion })),
        catalog:
          catalog === null
            ? null
            : { runtimeVersion: catalog.runtimeVersion, apps: catalog.apps.map(({ id, version }) => ({ id, version })) },
      };
    },

    /** Install and update are one operation: verify-then-swap over whatever is there. */
    async install(raw: BundleAppId): Promise<LauncherResult> {
      try {
        const identity = (BUNDLE_APP_IDS as readonly string[]).includes(raw) ? deps.identityFor(raw) : null;
        if (identity === null) return fail('Midnite Studio installs as a full app, not a bundle.');
        const bundleDeps = deps.bundleDeps();
        if (bundleDeps === null) return fail('Installing apps needs the packaged Midnite Apps launcher.');
        const catalog = await deps.fetchCatalog().catch(() => null);
        const entry = catalog?.apps.find((a) => a.id === raw);
        if (entry === undefined) {
          return fail(`${identity.displayName} has no published build yet — it runs in Midnite Studio for now.`);
        }
        return await deps.install(entry, identity, {
          ...bundleDeps,
          onProgress: (progress) => deps.onProgress?.({ id: raw as AppId, progress }),
        });
      } catch (error) {
        return fail(asMessage(error));
      }
    },

    /** Removes exactly this app's bundle + stub + record. Studio has its own uninstall. */
    async uninstall(raw: BundleAppId): Promise<LauncherResult> {
      try {
        const identity = (BUNDLE_APP_IDS as readonly string[]).includes(raw) ? deps.identityFor(raw) : null;
        if (identity === null) return fail('Use Midnite Studio’s own Move to Trash for Studio.');
        const bundleDeps = deps.bundleDeps();
        if (bundleDeps === null) return fail('Removing apps needs the packaged Midnite Apps launcher.');
        return await deps.uninstall(identity, bundleDeps);
      } catch (error) {
        return fail(asMessage(error));
      }
    },
  };
}
