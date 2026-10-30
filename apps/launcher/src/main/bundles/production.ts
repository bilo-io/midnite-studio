import { APP_IDS, LEGACY_BUNDLE_NAMES, appById, type AppId, type LegacyBundleAppId } from '../../common/catalog';
import { isAppRunning } from '../running';
import type { BundleOpsDeps } from './install-bundle';
import { stubIdentity, type BundleRoots, type StubIdentity } from './layout';
import { runtimeFromExecPath } from './stub';

/**
 * Production wiring for `bundles/` — the one place a real system path (`/Applications`, the
 * launcher's userData, the running executable) is named. Everything else takes these as
 * parameters, which is how every test runs against temp dirs.
 */

/** The stub identity for a catalog app or a retired-but-still-built one, or `null` for Studio (a full app) and unknown ids. */
export function identityForApp(id: string): StubIdentity | null {
  if (id === 'studio') return null;
  if ((APP_IDS as readonly string[]).includes(id)) return stubIdentity(id, appById(id as AppId).name);
  // Retired and deleted by Phase 124: an already-installed Midnite Cleaner keeps its identity, so it can be removed.
  if (Object.hasOwn(LEGACY_BUNDLE_NAMES, id)) return stubIdentity(id, LEGACY_BUNDLE_NAMES[id as LegacyBundleAppId]);
  return null;
}

/**
 * Whether this app's stub is running as an app, asked of LaunchServices by its bundle id. Not `pgrep` on its
 * executable: a pty broker the stub's runtime started runs from that same path and outlives a quit.
 */
export function stubRunningCheck(): (identity: StubIdentity) => Promise<boolean> {
  return (identity) => isAppRunning(identity.bundleId);
}

/**
 * The deps a packaged launcher installs bundles with, or `null` in dev — where the "runtime"
 * would be the stock Electron.app under node_modules, and cloning it into `/Applications`
 * would install the wrong thing.
 */
export function productionBundleDeps(
  roots: BundleRoots,
  env: { isPackaged: boolean; execPath: string; version: string },
): BundleOpsDeps | null {
  if (!env.isPackaged) return null;
  const runtime = runtimeFromExecPath(env.execPath, env.version);
  if (runtime === null) return null;
  return { roots, runtime, isRunning: stubRunningCheck() };
}
