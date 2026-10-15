import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { access, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import type { InstallProgress, LauncherResult } from '../../common/bridge';
import { checkLockstep } from '../../common/lockstep';
import type { CatalogApp } from '../../common/catalog-feed';
import type { InstalledApp } from '../../common/installed-state';
import { canWrite } from '../install';
import { swapIntoPlace } from '../swap';
import { bundlePathFor, siblings, stubPathFor, type BundleRoots, type StubIdentity } from './layout';
import { findInstalled, recordInstall, recordUninstall } from './state';
import { execFileIo, planStub, readRuntimeFrameworks, runStubPlan, verifyStub, type RuntimeApp, type StubIo } from './stub';

/**
 * Install, update and uninstall one app bundle (Phase 113 Theme E).
 *
 * Install and update are the same operation — Studio's `install.ts` already treats
 * them as one, and so does this:
 *
 *   download the zip → check its size and SHA-256 against the catalog entry
 *   → extract → verify the bundle → stage it beside its destination
 *   → build the Dock stub (`stub.ts`) from the *staged* bundle, beside its destination
 *   → swap the bundle in, then the stub; if the stub's swap fails, swap the bundle back
 *   → record it in `installed.json`.
 *
 * Nothing under either root changes until the download has verified, and a failure at any
 * later step leaves the previous install (or nothing) in place. Uninstall removes exactly that
 * app's bundle and stub — never a sibling, never the runtime, never Studio.
 */

export type BundleOpsDeps = {
  roots: BundleRoots;
  /** The runtime the stub's framework is cloned from — in production, the running launcher. */
  runtime: RuntimeApp;
  /** Whether this app's stub is running; install, update and uninstall all refuse while it is. */
  isRunning: (identity: StubIdentity) => Promise<boolean>;
  onProgress?: (progress: InstallProgress) => void;
  fetchImpl?: typeof fetch;
  /** Unzips `zip` into `dest`. Default: `ditto -xk`, as install.sh and `install.ts` do. */
  extract?: (zip: string, dest: string) => Promise<void>;
  io?: StubIo;
  now?: () => Date;
};

/** The bundle zip's top level: `package.json` (whose `version` must match the catalog) and `icon.icns`. */
export async function verifyAppBundle(dir: string, expectVersion?: string): Promise<string | null> {
  let pkg: { version?: unknown };
  try {
    pkg = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8')) as { version?: unknown };
  } catch {
    return 'missing or unreadable package.json';
  }
  if (expectVersion !== undefined && pkg.version !== expectVersion) {
    return `the bundle is version ${String(pkg.version)}, the catalog says ${expectVersion}`;
  }
  try {
    await access(join(dir, 'icon.icns'));
  } catch {
    return 'missing icon.icns';
  }
  return null;
}

/** Streams `res` to `file`, hashing as it goes. */
async function download(
  res: Response,
  file: string,
  onBytes: (received: number, total: number | null) => void,
): Promise<{ bytes: number; sha256: string }> {
  const total = Number(res.headers.get('content-length')) || null;
  const hash = createHash('sha256');
  let received = 0;
  const tap = new Transform({
    transform(chunk: Buffer, _enc, done) {
      hash.update(chunk);
      received += chunk.length;
      onBytes(received, total);
      done(null, chunk);
    },
  });
  await pipeline(Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]), tap, createWriteStream(file));
  return { bytes: received, sha256: hash.digest('hex') };
}

const inFlight = new Set<string>();

/** One operation per app at a time; a second click on the same app is refused, not queued. */
async function exclusive(id: string, op: () => Promise<LauncherResult>): Promise<LauncherResult> {
  if (inFlight.has(id)) return { ok: false, message: 'An install for this app is already running.' };
  inFlight.add(id);
  try {
    return await op();
  } finally {
    inFlight.delete(id);
  }
}

function friendly(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  if (/clonefile|cross-device|not supported/i.test(text)) {
    return 'Could not clone the runtime into the app — it has to be installed on the same APFS volume as Midnite Apps.';
  }
  return text;
}

export async function installAppBundle(
  entry: CatalogApp,
  identity: StubIdentity,
  deps: BundleOpsDeps,
): Promise<LauncherResult> {
  if (entry.id !== identity.id) return { ok: false, message: `Catalog entry ${entry.id} is not ${identity.id}.` };
  // Studio is a full Electron app with its own install path (`install.ts`), not a bundle.
  if (entry.id === 'studio') return { ok: false, message: 'Studio installs as a full app, not a bundle.' };

  // Lockstep: a bundle that is not the runtime's version is refused before anything is downloaded.
  const lockstep = checkLockstep({ runtimeVersion: deps.runtime.version, bundleVersion: entry.version, label: `${identity.displayName} ${entry.version}` });
  if (!lockstep.ok) {
    deps.onProgress?.({ phase: 'error', received: 0, total: entry.size, message: lockstep.message });
    return { ok: false, message: lockstep.message, reason: lockstep.reason };
  }

  return exclusive(entry.id, async () => {
    const progress = deps.onProgress ?? (() => undefined);
    const io = deps.io ?? execFileIo();
    const bundleDest = bundlePathFor(deps.roots, entry.id);
    const stubDest = stubPathFor(deps.roots, identity);
    const bundleSwap = siblings(bundleDest);
    const stubSwap = siblings(stubDest);
    let tmp: string | null = null;
    let received = 0;
    const fail = (message: string): LauncherResult => {
      progress({ phase: 'error', received, total: entry.size, message });
      return { ok: false, message };
    };

    try {
      if (await deps.isRunning(identity)) return fail(`${identity.displayName} is running — quit it first.`);
      await mkdir(deps.roots.installRoot, { recursive: true });
      if (!(await canWrite(deps.roots.stubRoot, stubDest))) {
        return fail(`${deps.roots.stubRoot} isn't writable by this account, so the app's Dock icon can't be created there.`);
      }

      // ── Download + checksum, before either root is touched ──────────────────
      tmp = await mkdtemp(join(tmpdir(), `midnite-bundle-${entry.id}-`));
      const zip = join(tmp, `${entry.id}-${entry.version}.zip`);
      const res = await (deps.fetchImpl ?? fetch)(entry.bundleUrl);
      if (!res.ok || res.body === null) return fail(`Download failed (${res.status}).`);
      let lastSent = 0;
      const got = await download(res, zip, (bytes, total) => {
        received = bytes;
        const now = Date.now();
        if (now - lastSent > 100) {
          lastSent = now;
          progress({ phase: 'download', received, total: total ?? entry.size });
        }
      });
      progress({ phase: 'verify', received, total: entry.size });
      if (got.bytes !== entry.size || got.sha256 !== entry.sha256) {
        return fail('The download does not match the catalog checksum. Nothing was installed — try again.');
      }

      // ── Extract + verify ─────────────────────────────────────────────────
      const extracted = join(tmp, 'extracted');
      await (deps.extract ?? ((z, d) => io.exec('ditto', ['-xk', z, d])))(zip, extracted);
      const bad = await verifyAppBundle(extracted, entry.version);
      if (bad !== null) return fail(`The bundle is not usable (${bad}). Nothing was installed.`);

      // ── Stage the bundle, build its stub from the staged copy ─────────────
      progress({ phase: 'install', received, total: entry.size });
      await rm(bundleSwap.staged, { recursive: true, force: true });
      await io.exec('ditto', [extracted, bundleSwap.staged]);
      await rm(stubSwap.staged, { recursive: true, force: true });
      await runStubPlan(
        planStub({
          runtime: deps.runtime,
          frameworks: await readRuntimeFrameworks(deps.runtime),
          identity,
          bundlePath: bundleSwap.staged,
          version: entry.version,
          stubPath: stubSwap.staged,
        }),
        io,
      );
      const stubBad = await verifyStub(stubSwap.staged, identity);
      if (stubBad !== null) return fail(`The app's Dock stub is incomplete (${stubBad}). Nothing was installed.`);

      // ── Swap both, or neither ─────────────────────────────────────────────
      const bundle = await swapIntoPlace({ ...bundleSwap, dest: bundleDest }, (p) => verifyAppBundle(p, entry.version));
      if (!bundle.ok) return fail(bundle.message);
      const stub = await swapIntoPlace({ ...stubSwap, dest: stubDest }, (p) => verifyStub(p, identity));
      if (!stub.ok) {
        await bundle.revert();
        return fail(stub.message);
      }
      await Promise.all([bundle.commit(), stub.commit()]);

      const record: InstalledApp = {
        id: entry.id,
        version: entry.version,
        sha256: entry.sha256,
        bundlePath: bundleDest,
        stubPath: stubDest,
        runtimeVersion: deps.runtime.version,
        installedAt: (deps.now ?? (() => new Date()))().toISOString(),
      };
      await recordInstall(deps.roots.installRoot, record);
      progress({ phase: 'done', received, total: entry.size });
      return { ok: true };
    } catch (error) {
      return fail(friendly(error));
    } finally {
      if (tmp !== null) await rm(tmp, { recursive: true, force: true }).catch(() => undefined);
      await rm(bundleSwap.staged, { recursive: true, force: true }).catch(() => undefined);
      await rm(stubSwap.staged, { recursive: true, force: true }).catch(() => undefined);
    }
  });
}

/**
 * Re-clone one installed app's stub from the current runtime, keeping its bundle. A clone does
 * not follow its source, so after the runtime updates every stub still carries the old
 * framework until this runs (`updates.ts`'s `restubStale`).
 */
export async function restubAppBundle(record: InstalledApp, identity: StubIdentity, deps: BundleOpsDeps): Promise<LauncherResult> {
  return exclusive(record.id, async () => {
    const io = deps.io ?? execFileIo();
    const stubDest = stubPathFor(deps.roots, identity);
    const stubSwap = siblings(stubDest);
    try {
      if (await deps.isRunning(identity)) return { ok: false, message: `${identity.displayName} is running — quit it first.` };
      await rm(stubSwap.staged, { recursive: true, force: true });
      await runStubPlan(
        planStub({
          runtime: deps.runtime,
          frameworks: await readRuntimeFrameworks(deps.runtime),
          identity,
          bundlePath: record.bundlePath,
          version: record.version,
          stubPath: stubSwap.staged,
        }),
        io,
      );
      const swapped = await swapIntoPlace({ ...stubSwap, dest: stubDest }, (p) => verifyStub(p, identity));
      if (!swapped.ok) return { ok: false, message: swapped.message };
      await swapped.commit();
      await recordInstall(deps.roots.installRoot, { ...record, stubPath: stubDest, runtimeVersion: deps.runtime.version });
      return { ok: true };
    } catch (error) {
      return { ok: false, message: friendly(error) };
    } finally {
      await rm(stubSwap.staged, { recursive: true, force: true }).catch(() => undefined);
    }
  });
}

/**
 * Remove one app: its stub, its bundle, its record — and nothing else. The paths come from
 * the layout, not from `installed.json`, so a hand-edited record cannot point the delete at
 * anything outside the two roots.
 */
export async function uninstallAppBundle(
  identity: StubIdentity,
  deps: Pick<BundleOpsDeps, 'roots' | 'isRunning'>,
): Promise<LauncherResult> {
  return exclusive(identity.id, async () => {
    try {
      if ((await findInstalled(deps.roots.installRoot, identity.id)) === null) {
        return { ok: false, message: `${identity.displayName} is not installed.` };
      }
      if (await deps.isRunning(identity)) return { ok: false, message: `${identity.displayName} is running — quit it first.` };
      // The stub first: once it is gone the app cannot be launched mid-removal from the Dock.
      await rm(stubPathFor(deps.roots, identity), { recursive: true, force: true });
      await rm(bundlePathFor(deps.roots, identity.id), { recursive: true, force: true });
      await recordUninstall(deps.roots.installRoot, identity.id);
      return { ok: true };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
  });
}
