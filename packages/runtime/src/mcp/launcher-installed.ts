import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { installedSet, LAUNCHER_DATA_DIR_NAME, PlacementAppIdSchema, type PlacementAppId } from '@midnite/studio-shared';
import { z } from 'zod';

import type { InstalledAppsSource } from './installed-apps';

/**
 * The launcher's `installed.json`, read from the runtime (Phase 113 Theme D item 3).
 *
 * The runtime may not import the launcher (layer rule), so this is the minimal
 * mirror of `apps/launcher/src/common/installed-state.ts`: only what the tool
 * list needs — the schema version and each record's `id`. It is deliberately
 * looser than the launcher's own schema (no semver/sha checks): the launcher
 * validates what it writes, and a record we cannot use costs one tool group.
 */
const LauncherStateSchema = z.object({
  schemaVersion: z.literal(1),
  apps: z.array(z.object({ id: z.string() }).passthrough()),
});

/**
 * Pure: the launcher's `installed.json` under an injected appData dir (`~/Library/Application Support`) —
 * the launcher's pinned userData (`shared/launcher-data-dir.ts`) + `productionBundleRoots` + `STATE_FILE`.
 */
export function launcherInstalledFile(appDataDir: string): string {
  return join(appDataDir, LAUNCHER_DATA_DIR_NAME, 'bundles', 'installed.json');
}

/**
 * The installed bundle ids recorded in `file`, narrowed to ids this suite
 * knows. A missing, unreadable or malformed file is "nothing recorded" —
 * never a throw, so a launcher that was never run costs nothing.
 */
export function readInstalledApps(file: string): PlacementAppId[] {
  let raw: string;
  try {
    raw = readFileSync(file, 'utf8');
  } catch {
    return [];
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return [];
  }
  const parsed = LauncherStateSchema.safeParse(json);
  if (!parsed.success) return [];
  const ids: PlacementAppId[] = [];
  for (const { id } of parsed.data.apps) {
    const known = PlacementAppIdSchema.safeParse(id);
    if (known.success) ids.push(known.data);
  }
  return ids;
}

/**
 * An {@link InstalledAppsSource} over the launcher's file: the apps the host
 * itself provides (`provided` — Studio passes every app it composes) unioned
 * with the bundles recorded in `installed.json`.
 *
 * Re-read on a changed `mtimeMs`/`size` — one `stat` per `tools/list`, so an
 * install or uninstall shows up without a restart and an idle server does no
 * parsing.
 */
export function installedAppsFromLauncherFile(opts: {
  file: string;
  provided: Iterable<PlacementAppId>;
}): InstalledAppsSource {
  const provided = [...opts.provided];
  let stamp = '';
  let predicate = installedSet(provided);
  return () => {
    let next = 'missing';
    try {
      const s = statSync(opts.file);
      next = `${s.mtimeMs}:${s.size}`;
    } catch {
      /* missing — falls through to the provided-only set */
    }
    if (next !== stamp) {
      stamp = next;
      predicate = installedSet([...provided, ...readInstalledApps(opts.file)]);
    }
    return predicate;
  };
}
