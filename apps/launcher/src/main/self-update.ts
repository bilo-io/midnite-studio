import { spawn as nodeSpawn } from 'node:child_process';
import { closeSync, mkdirSync, openSync } from 'node:fs';
import { dirname } from 'node:path';

import type { LauncherResult, LauncherSelfStatus } from '../common/bridge';
import { LAUNCHER_FEED_URL, LAUNCHER_INSTALL_URL } from './constants';
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
  const feed = await fetchLatestRelease(LAUNCHER_FEED_URL, deps.fetchImpl);
  return { current: deps.current, latest: feed.release, feedError: feed.error, canUpdate: deps.isPackaged };
}

type SpawnLike = (
  command: string,
  args: readonly string[],
  options: { detached: boolean; stdio: ['ignore', number, number]; env: NodeJS.ProcessEnv },
) => { unref(): void; once(event: 'error', listener: (error: Error) => void): unknown };

export type SelfUpdateDeps = {
  isPackaged: boolean;
  /** The installer's output goes here, so a failed update leaves something to read. */
  logPath: string;
  spawn?: SpawnLike;
  env?: NodeJS.ProcessEnv;
};

/** The URL is an argument (`$1`), never spliced into the script string. */
export const SELF_UPDATE_SCRIPT = 'curl -fsSL "$1" | sh';

export function startSelfUpdate(deps: SelfUpdateDeps): LauncherResult {
  if (!deps.isPackaged) return { ok: false, message: 'A dev run cannot update itself — build and install the launcher instead.' };
  const spawn = deps.spawn ?? (nodeSpawn as unknown as SpawnLike);
  let log: number | null = null;
  try {
    mkdirSync(dirname(deps.logPath), { recursive: true });
    log = openSync(deps.logPath, 'a');
    // `MIDNITE_LAUNCHER_NO_OPEN` would leave the user with no launcher at all after it quits.
    const env = { ...(deps.env ?? process.env) };
    delete env['MIDNITE_LAUNCHER_NO_OPEN'];
    const child = spawn('/bin/sh', ['-c', SELF_UPDATE_SCRIPT, 'sh', LAUNCHER_INSTALL_URL], {
      detached: true,
      stdio: ['ignore', log, log],
      env,
    });
    child.once('error', () => undefined);
    child.unref();
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  } finally {
    if (log !== null) closeSync(log);
  }
}
