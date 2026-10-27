import { spawn as nodeSpawn } from 'node:child_process';
import { accessSync, closeSync, constants, existsSync, mkdirSync, openSync } from 'node:fs';
import { dirname } from 'node:path';

import type { LauncherResult, LauncherSelfStatus } from '../common/bridge';
import { INSTALL_DIR, LAUNCHER_BUNDLE_PATH, LAUNCHER_INSTALL_URL, LAUNCHER_VERSION_URL } from './constants';
import { fetchLatestRelease } from './feed';

/**
 * The launcher updating itself.
 *
 * electron-updater cannot do it: the launcher is ad-hoc signed, and Squirrel.Mac refuses a new build
 * whose signature does not match the running one, so `updater.ts` only ever checks. The installer
 * can — `install.sh` quits a running copy (`osascript … to quit`), swaps the bundle in
 * `/Applications`, verifies it and reopens it. So Update runs exactly the command the website
 * prints, detached, so it outlives the quit it causes. Studio's own "Update Midnite Studio" works
 * the same way, from `install-studio.sh`.
 */

export async function launcherSelfStatus(
  deps: { current: string; isPackaged: boolean; fetchImpl?: typeof fetch },
): Promise<LauncherSelfStatus> {
  const feed = await fetchLatestRelease(LAUNCHER_VERSION_URL, deps.fetchImpl);
  return { current: deps.current, latest: feed.release, feedError: feed.error, canUpdate: deps.isPackaged };
}

type SpawnLike = (
  command: string,
  args: readonly string[],
  options: { detached: boolean; stdio: ['ignore', number, number]; env: NodeJS.ProcessEnv },
) => {
  unref(): void;
  once(event: 'error', listener: (error: Error) => void): unknown;
  once(event: 'exit', listener: (code: number | null) => void): unknown;
};

export type SelfUpdateDeps = {
  isPackaged: boolean;
  /** The installer's output goes here, so a failed update leaves something to read. */
  logPath: string;
  spawn?: SpawnLike;
  env?: NodeJS.ProcessEnv;
  /** Whether this user can write `path` — `install.sh`'s own `[ -w ]` test, which decides whether it needs sudo. */
  isWritable?: (path: string) => boolean;
  /** The installer exited non-zero; on success it quits this app, so nobody is left to hear about it. */
  onFailed?: (message: string) => void;
};

function writable(path: string): boolean {
  try {
    accessSync(path, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

/** The variables `install.sh` reads; inherited from a shell they would pin a version or skip the reopen. */
const INSTALLER_ENV = ['MIDNITE_LAUNCHER_NO_OPEN', 'MIDNITE_LAUNCHER_VERSION'];

/**
 * The website's `curl -fsSL <url> | sh`, but downloaded first: a pipe's status is `sh`'s, and `sh` on
 * the empty input of a failed `curl` exits 0, so an offline or 404 update would never be reported.
 * The URL is an argument (`$1`), never spliced into the script string.
 */
export const SELF_UPDATE_SCRIPT = 'f=$(mktemp) && curl -fsSL "$1" -o "$f" && sh "$f"; rc=$?; rm -f "$f"; exit $rc';

export function startSelfUpdate(deps: SelfUpdateDeps): LauncherResult {
  if (!deps.isPackaged) return { ok: false, message: 'A dev run cannot update itself — build and install the launcher instead.' };
  const isWritable = deps.isWritable ?? writable;
  // Detached, with no terminal, `sudo` cannot prompt — and install.sh would only find that out after
  // it had already quit this app. So the case that needs a password is refused up front.
  if (!isWritable(INSTALL_DIR) || (existsSync(LAUNCHER_BUNDLE_PATH) && !isWritable(LAUNCHER_BUNDLE_PATH))) {
    return {
      ok: false,
      message: `Updating needs an administrator password here — run \`curl -fsSL ${LAUNCHER_INSTALL_URL} | sh\` in Terminal.`,
    };
  }
  const spawn = deps.spawn ?? (nodeSpawn as unknown as SpawnLike);
  let log: number | null = null;
  try {
    mkdirSync(dirname(deps.logPath), { recursive: true });
    log = openSync(deps.logPath, 'a');
    const env = { ...(deps.env ?? process.env) };
    for (const name of INSTALLER_ENV) delete env[name];
    const child = spawn('/bin/sh', ['-c', SELF_UPDATE_SCRIPT, 'sh', LAUNCHER_INSTALL_URL], {
      detached: true,
      stdio: ['ignore', log, log],
      env,
    });
    child.once('error', (error) => deps.onFailed?.(`The update could not start: ${error.message}`));
    child.once('exit', (code) => {
      if (code !== 0) deps.onFailed?.(`The update failed (exit ${code ?? 'signal'}) — see ${deps.logPath}.`);
    });
    child.unref();
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  } finally {
    if (log !== null) closeSync(log);
  }
}
