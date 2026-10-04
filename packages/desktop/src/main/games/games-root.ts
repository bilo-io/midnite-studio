import { access, constants } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join } from 'node:path';

import { workTreeTop } from '@midnite/studio-git-engine';

/** `~/Midnite Games` — where games live until the user picks somewhere else. */
export function defaultGamesRoot(): string {
  return join(homedir(), 'Midnite Games');
}

/** The folder games are created in: the stored root, or the default. */
export function effectiveGamesRoot(stored: string | null): string {
  return stored !== null && stored.trim() !== '' ? stored : defaultGamesRoot();
}

/** The nearest ancestor of `path` (or `path` itself) that exists. */
async function nearestExisting(path: string): Promise<string> {
  let current = path;
  for (;;) {
    try {
      await access(current, constants.F_OK);
      return current;
    } catch {
      const parent = dirname(current);
      if (parent === current) return current;
      current = parent;
    }
  }
}

/**
 * Validate a games location, in order, with the messages the Settings page
 * shows. `null` means usable. The folder itself is only created when the first
 * game is — so "does not exist yet" is fine, and the checks run against its
 * nearest existing parent.
 */
export async function validateGamesRoot(path: string): Promise<string | null> {
  if (!isAbsolute(path)) return 'Choose a full folder path.';

  const existing = await nearestExisting(path);

  const top = await workTreeTop(existing);
  if (top !== null) {
    return `This folder is inside the git repository ${top}. Games are their own repositories — pick a folder outside it.`;
  }

  try {
    await access(existing, constants.W_OK);
  } catch {
    return "Midnite Studio can't write to this folder.";
  }
  return null;
}
