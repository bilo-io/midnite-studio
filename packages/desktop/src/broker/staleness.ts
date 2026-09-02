import { existsSync, statSync } from 'node:fs';
import { basename } from 'node:path';

/**
 * Why a long-lived broker has to watch its own files.
 *
 * The broker is *designed* to outlive the app: it is spawned detached so that
 * terminals survive a renderer reload, a window close, even a quit-and-relaunch.
 * The flip side is that it also outlives the **build it was started from**. A
 * `moon run desktop:dist` + reinstall replaces the bundle under a running broker,
 * and nothing tells it. Its JS is already loaded, its `pty.node` is already
 * mapped — but node-pty spawns every shell through a tiny `spawn-helper`
 * executable that it resolves to a path at load time and `posix_spawnp`s on
 * every `create`. Move that file (as the switch from `build/Release/` to
 * `prebuilds/` did) and the broker reports "posix_spawnp failed." with no errno,
 * for every new terminal, forever — and restarting the app does not help,
 * because the new app reconnects to the same old broker.
 *
 * So the broker snapshots the files it depends on at startup and, before every
 * spawn, checks they are still the files it started with. A mismatch is
 * reported as `stale-broker` rather than `spawn-failed`, which is what lets the
 * client (`main/broker-client.ts`) respawn a fresh broker instead of showing an
 * opaque error.
 */

export const STALE_BROKER_MESSAGE =
  'The terminal backend belongs to a previous build of Midnite Studio and can no longer start a shell';

export function staleBrokerMessage(reason: string): string {
  return `${STALE_BROKER_MESSAGE}: ${reason}.`;
}

type Snapshot = { path: string; size: number; mtimeMs: number } | { path: string; missing: true };

function snapshot(path: string): Snapshot {
  try {
    const st = statSync(path);
    return { path, size: st.size, mtimeMs: Math.floor(st.mtimeMs) };
  } catch {
    return { path, missing: true };
  }
}

/**
 * Snapshot `files` now; the returned probe answers "why is this process stale",
 * or `null` while every file is still the one that was there at startup.
 *
 * A file that did not exist at startup is skipped rather than reported — the
 * probe cannot know whether it ever mattered, and a broker that never had a
 * spawn-helper (Windows, or a test) must not be declared stale for still not
 * having one.
 */
export function createStalenessProbe(files: string[]): () => string | null {
  const snapshots = files.map(snapshot);
  return () => {
    for (const s of snapshots) {
      if ('missing' in s) continue;
      if (!existsSync(s.path)) return `${basename(s.path)} is gone from disk`;
      const now = snapshot(s.path);
      if ('missing' in now) return `${basename(s.path)} is gone from disk`;
      if (now.size !== s.size || now.mtimeMs !== s.mtimeMs) {
        return `${basename(s.path)} on disk has been replaced`;
      }
    }
    return null;
  };
}
