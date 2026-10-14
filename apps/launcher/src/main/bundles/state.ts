import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  EMPTY_INSTALLED_STATE,
  InstalledStateSchema,
  type InstalledApp,
  type InstalledState,
} from '../../common/installed-state';

/**
 * `installed.json` — the installed-state record, beside the bundles it describes
 * (`<installRoot>/installed.json`). Written via a temp file + `rename`, so a crash
 * mid-write leaves the previous record rather than half a file.
 *
 * A missing, unreadable or malformed file reads as "nothing installed". That is
 * the safe direction: the worst case is a tile offering Install for an app whose
 * bundle is still on disk, and installing over it is a verify-then-swap.
 */

export const STATE_FILE = 'installed.json';

export async function readInstalledState(installRoot: string): Promise<InstalledState> {
  try {
    const parsed = InstalledStateSchema.safeParse(JSON.parse(await readFile(join(installRoot, STATE_FILE), 'utf8')));
    return parsed.success ? parsed.data : EMPTY_INSTALLED_STATE;
  } catch {
    return EMPTY_INSTALLED_STATE;
  }
}

async function writeInstalledState(installRoot: string, state: InstalledState): Promise<void> {
  await mkdir(installRoot, { recursive: true });
  const file = join(installRoot, STATE_FILE);
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, `${JSON.stringify(state, null, 2)}\n`);
  await rename(tmp, file);
}

/** Insert or replace one app's record. */
export async function recordInstall(installRoot: string, record: InstalledApp): Promise<void> {
  const state = await readInstalledState(installRoot);
  await writeInstalledState(installRoot, {
    schemaVersion: 1,
    apps: [...state.apps.filter((a) => a.id !== record.id), record].sort((a, b) => a.id.localeCompare(b.id)),
  });
}

/** Drop one app's record; every other record is left exactly as it was. */
export async function recordUninstall(installRoot: string, id: string): Promise<void> {
  const state = await readInstalledState(installRoot);
  await writeInstalledState(installRoot, { schemaVersion: 1, apps: state.apps.filter((a) => a.id !== id) });
}

export async function findInstalled(installRoot: string, id: string): Promise<InstalledApp | null> {
  return (await readInstalledState(installRoot)).apps.find((a) => a.id === id) ?? null;
}
