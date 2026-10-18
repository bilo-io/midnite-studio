import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { StudioInstall, StudioStatus } from '../common/bridge';
import { STUDIO_BUNDLE_ID, studioSearchPaths } from './constants';
import { fetchStudioRelease } from './feed';
import { bundleVersionFromPlist } from './plist';
import { isAppRunning } from './running';

/** The first installed copy of Studio on the search path, or `null`. */
export async function findStudio(paths: readonly string[] = studioSearchPaths()): Promise<StudioInstall | null> {
  for (const path of paths) {
    try {
      await access(path);
    } catch {
      continue;
    }
    let version: string | null = null;
    try {
      version = bundleVersionFromPlist(await readFile(join(path, 'Contents', 'Info.plist'), 'utf8'));
    } catch {
      // A bundle with no readable plist is still installed — just unversioned.
    }
    return { path, version };
  }
  return null;
}

/** Whether Studio is running as an app — not merely its detached pty broker, which shares its process name. */
export function isStudioRunning(): Promise<boolean> {
  return isAppRunning(STUDIO_BUNDLE_ID);
}

export async function studioStatus(): Promise<StudioStatus> {
  const [installed, feed, running] = await Promise.all([
    findStudio(),
    fetchStudioRelease(),
    isStudioRunning(),
  ]);
  return { installed, latest: feed.release, feedError: feed.error, running, checkedAt: Date.now() };
}
