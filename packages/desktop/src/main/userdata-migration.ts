import { constants } from 'node:fs';
import { copyFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * The name `app.setName` used before the display-name rename to "Midnite Git".
 *
 * On macOS `app.getPath('userData')` is `~/Library/Application Support/<app
 * name>`, so renaming the app silently moves the data directory: the user's
 * open-repository list is still on disk, just under a path nothing reads any
 * more. That reads as "the app forgot my repos" rather than as a rename.
 */
export const LEGACY_APP_NAME = 'midnite-git';

/** The only file worth carrying over; everything else in userData is Chromium cache. */
const FILE_NAME = 'repos.json';

/**
 * Copy the persisted repository list out of the pre-rename userData directory.
 *
 * Copy, not move: leaving the legacy directory intact means a downgrade to an
 * older build still finds its data, and the cost is one small JSON file.
 *
 * Returns whether anything was migrated, so the caller can log it once.
 */
export async function migrateLegacyRepoStore(
  legacyDirectory: string,
  currentDirectory: string,
): Promise<boolean> {
  // Same directory — either the rename has not happened on this platform or the
  // legacy name is the current one. Nothing to do, and copying a file onto
  // itself would truncate it.
  if (legacyDirectory === currentDirectory) return false;

  try {
    await mkdir(currentDirectory, { recursive: true });
    // `COPYFILE_EXCL` makes "already migrated" and "user already has a list"
    // the same cheap check as the copy itself: the call fails rather than
    // overwriting a newer list with the stale pre-rename one.
    await copyFile(
      join(legacyDirectory, FILE_NAME),
      join(currentDirectory, FILE_NAME),
      constants.COPYFILE_EXCL,
    );
    return true;
  } catch {
    // No legacy file (clean install), a destination that already exists, or an
    // unreadable data dir. All three mean "boot normally with what's there".
    return false;
  }
}
