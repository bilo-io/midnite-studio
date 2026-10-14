import { basename, dirname, extname, join } from 'node:path';

/**
 * Where a per-app bundle and its Dock stub live, and what the stub is called.
 *
 * Two roots, both parameters so nothing but production wiring ever names a real
 * system directory (every test passes temp dirs):
 *
 *  - `installRoot` — the extracted bundles plus `installed.json`. Production:
 *    the launcher's userData (`…/Application Support/Midnite Apps/bundles`).
 *    A bundle is the app's own code, never an Electron build (Phase 113's
 *    "no new Chromium per app").
 *  - `stubRoot` — the `.app` the Dock, ⌘-Tab and Spotlight see. Production:
 *    `/Applications`. Theme B's mechanism: the runtime's Electron framework is
 *    APFS-cloned into it (`stub.ts`), so it must sit on the runtime's volume.
 */

export type BundleRoots = { installRoot: string; stubRoot: string };

/** The production roots. Only `index.ts` calls this; tests never do. */
export function productionBundleRoots(userData: string): BundleRoots {
  return { installRoot: join(userData, 'bundles'), stubRoot: '/Applications' };
}

/** What a stub is called and how LaunchServices tells it apart from every other app. */
export type StubIdentity = {
  id: string;
  /** `Midnite Cleaner` — the Dock label, the `.app` name, the menu-bar name. */
  displayName: string;
  /** `io.bilo.midnite-cleaner`, beside `io.bilo.midnite-studio` and `io.bilo.midnite-launcher`. */
  bundleId: string;
  /** `Contents/MacOS/<executable>` — also what `pgrep -x` looks for to tell whether it is running. */
  executable: string;
};

/** `name` is the catalog's short name (`Cleaner`); the stub wears the suite prefix like Studio does. */
export function stubIdentity(id: string, name: string): StubIdentity {
  const displayName = `Midnite ${name}`;
  return { id, displayName, bundleId: `io.bilo.midnite-${id}`, executable: displayName };
}

export function bundlePathFor(roots: BundleRoots, id: string): string {
  return join(roots.installRoot, id);
}

export function stubPathFor(roots: BundleRoots, identity: StubIdentity): string {
  return join(roots.stubRoot, `${identity.displayName}.app`);
}

/**
 * Staging and backup siblings. Dot-prefixed (Finder hides them) and on the
 * destination's own volume, because the final step is a `rename`. The pid keeps
 * two launcher processes — which the single-instance lock should already
 * prevent — from sharing one. A `.app` keeps its extension (`.Midnite Cleaner.new.42.app`) so
 * `codesign` still treats the staged stub as a bundle.
 */
export function siblings(dest: string, pid: number = process.pid): { staged: string; backup: string } {
  const dir = dirname(dest);
  const ext = extname(dest) === '.app' ? '.app' : '';
  const stem = basename(dest, ext);
  return { staged: join(dir, `.${stem}.new.${pid}${ext}`), backup: join(dir, `.${stem}.old.${pid}${ext}`) };
}
