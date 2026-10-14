import { execFile } from 'node:child_process';
import { join } from 'node:path';

import { APP_IDS, appById, type AppId } from '../../common/catalog';
import type { BundleOpsDeps } from './install-bundle';
import { stubIdentity, stubPathFor, type BundleRoots, type StubIdentity } from './layout';
import { runtimeFromExecPath } from './stub';

/**
 * Production wiring for `bundles/` — the one place a real system path (`/Applications`, the
 * launcher's userData, the running executable) is named. Everything else takes these as
 * parameters, which is how every test runs against temp dirs.
 */

/** The stub identity for a catalog app, or `null` for Studio (a full app) and unknown ids. */
export function identityForApp(id: string): StubIdentity | null {
  if (id === 'studio' || !(APP_IDS as readonly string[]).includes(id)) return null;
  return stubIdentity(id, appById(id as AppId).name);
}

/** Whether this app's stub has a live process — matched on its full executable path, not its name. */
export function stubRunningCheck(roots: BundleRoots): (identity: StubIdentity) => Promise<boolean> {
  return (identity) =>
    new Promise((resolve) => {
      const exe = join(stubPathFor(roots, identity), 'Contents', 'MacOS', identity.executable);
      // `-f` matches the whole command line; escape the path so `.app` is not a regex wildcard.
      execFile('pgrep', ['-f', exe.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')], (error) => resolve(error === null));
    });
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
  return { roots, runtime, isRunning: stubRunningCheck(roots) };
}
