import { execFile } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { access, constants, mkdtemp, rename, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import type { InstallProgress, LauncherResult } from '../common/bridge';
import {
  INSTALL_DIR,
  MIN_FRAMEWORK_BYTES,
  STUDIO_BUNDLE,
  STUDIO_EXE,
  STUDIO_FEED_URL,
  studioZipUrl,
} from './constants';
import { fetchLatestRelease } from './feed';

/**
 * Install (or update) Midnite Studio in-process — `install.sh`'s steps, in the
 * same order and with the same guards:
 *
 *   resolve the version from the feed → download the arm64 zip → `ditto -xk`
 *   → verify the bundle → stage it on the destination volume → swap it in
 *   atomically, keeping the old copy until the new one verifies.
 *
 * Two things the script does that this deliberately does not: it `sudo`s when
 * /Applications is not writable, and it quits a running Studio. A GUI launcher
 * has no terminal to prompt for a password in, and quitting someone's app with
 * unsaved work behind a click is not a launcher's call — both come back as a
 * plain refusal that says what to do instead.
 */

export type InstallDeps = {
  onProgress: (progress: InstallProgress) => void;
  isRunning: () => Promise<boolean>;
  installDir?: string;
  feedUrl?: string;
  fetchImpl?: typeof fetch;
};

function run(cmd: string, args: readonly string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, (error) => (error ? reject(error) : resolve()));
  });
}

/** A structurally complete Studio bundle — install.sh's `verify_bundle`, check for check. */
export async function verifyBundle(bundle: string): Promise<string | null> {
  try {
    await access(join(bundle, 'Contents', 'Info.plist'));
  } catch {
    return 'missing Contents/Info.plist';
  }
  try {
    await access(join(bundle, 'Contents', 'MacOS', STUDIO_EXE), constants.X_OK);
  } catch {
    return `missing Contents/MacOS/${STUDIO_EXE}`;
  }
  const framework = join(
    bundle,
    'Contents',
    'Frameworks',
    'Electron Framework.framework',
    'Versions',
    'A',
    'Electron Framework',
  );
  try {
    const { size } = await stat(framework);
    if (size <= MIN_FRAMEWORK_BYTES) return `Electron Framework is only ${size} bytes — incomplete copy`;
  } catch {
    return 'missing Electron Framework';
  }
  return null;
}

async function canWrite(dir: string, bundle: string): Promise<boolean> {
  try {
    await access(dir, constants.W_OK);
  } catch {
    return false;
  }
  try {
    await access(bundle);
  } catch {
    return true; // nothing there yet — the directory being writable is enough
  }
  try {
    await access(bundle, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

let inFlight = false;

export async function installStudio(deps: InstallDeps): Promise<LauncherResult> {
  if (inFlight) return { ok: false, message: 'An install is already running.' };
  inFlight = true;
  const installDir = deps.installDir ?? INSTALL_DIR;
  const dest = join(installDir, STUDIO_BUNDLE);
  const staged = join(installDir, `.midnite-studio.new.${process.pid}`);
  const backup = join(installDir, `.midnite-studio.old.${process.pid}`);
  let tmp: string | null = null;

  const fail = (message: string): LauncherResult => {
    deps.onProgress({ phase: 'error', received: 0, total: null, message });
    return { ok: false, message };
  };

  try {
    if (await deps.isRunning()) return fail('Midnite Studio is running — quit it first, then install.');
    if (!(await canWrite(installDir, dest))) {
      return fail(`${installDir} isn't writable by this account. Install from Terminal instead — the download page has the one-line command.`);
    }

    const feed = await fetchLatestRelease(deps.feedUrl ?? STUDIO_FEED_URL, deps.fetchImpl);
    if (feed.release === null) return fail(feed.error);
    const { version } = feed.release;

    tmp = await mkdtemp(join(tmpdir(), 'midnite-launcher-'));
    const zip = join(tmp, `midnite-studio-${version}-arm64.zip`);

    // ── Download ───────────────────────────────────────────────────────────
    const res = await (deps.fetchImpl ?? fetch)(studioZipUrl(version));
    if (!res.ok || res.body === null) return fail(`Download failed (${res.status}).`);
    const total = Number(res.headers.get('content-length')) || null;
    let received = 0;
    let lastSent = 0;
    const body = Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]);
    body.on('data', (chunk: Buffer) => {
      received += chunk.length;
      const now = Date.now();
      if (now - lastSent > 100) {
        lastSent = now;
        deps.onProgress({ phase: 'download', received, total });
      }
    });
    await pipeline(body, createWriteStream(zip));
    deps.onProgress({ phase: 'download', received, total });

    // ── Extract + verify, before /Applications is touched ──────────────────
    deps.onProgress({ phase: 'verify', received, total });
    const extracted = join(tmp, 'extracted');
    await run('ditto', ['-xk', zip, extracted]);
    const bad = await verifyBundle(join(extracted, STUDIO_BUNDLE));
    if (bad !== null) return fail(`The download is incomplete (${bad}). Nothing was installed — try again.`);

    // ── Stage on the destination volume, then swap ─────────────────────────
    deps.onProgress({ phase: 'install', received, total });
    await rm(staged, { recursive: true, force: true });
    await rm(backup, { recursive: true, force: true });
    await run('ditto', [join(extracted, STUDIO_BUNDLE), staged]);
    if ((await verifyBundle(staged)) !== null) {
      await rm(staged, { recursive: true, force: true });
      return fail(`The staged copy is incomplete — ${installDir} was left untouched.`);
    }

    let hadPrevious = true;
    try {
      await rename(dest, backup);
    } catch {
      hadPrevious = false;
    }
    try {
      await rename(staged, dest);
    } catch {
      if (hadPrevious) await rename(backup, dest);
      return fail('Could not move the new app into place — the previous copy was restored.');
    }
    if ((await verifyBundle(dest)) !== null) {
      await rm(dest, { recursive: true, force: true });
      if (hadPrevious) await rename(backup, dest);
      return fail('The installed app failed verification — the previous copy was restored.');
    }
    await rm(backup, { recursive: true, force: true });
    // The launcher's own download is never quarantined, but clear it defensively, as install.sh does.
    await run('xattr', ['-dr', 'com.apple.quarantine', dest]).catch(() => undefined);

    deps.onProgress({ phase: 'done', received, total });
    return { ok: true };
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  } finally {
    if (tmp !== null) await rm(tmp, { recursive: true, force: true }).catch(() => undefined);
    await rm(staged, { recursive: true, force: true }).catch(() => undefined);
    inFlight = false;
  }
}
