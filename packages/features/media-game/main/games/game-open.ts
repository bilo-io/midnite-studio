import { readFile, stat } from 'node:fs/promises';
import { basename, isAbsolute, join, resolve } from 'node:path';

import { workTreeTop } from '@midnite/studio-git-engine';
import { failure, GAME_MANIFEST_FILE, ok, type GitOpResult } from '@midnite/studio-shared';

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

async function hasManifest(folder: string): Promise<boolean> {
  try {
    await readFile(join(folder, GAME_MANIFEST_FILE));
    return true;
  } catch {
    return false;
  }
}

/**
 * Open Game (Phase 132 Theme A): resolve a picked folder to the root of the game it belongs to, or refuse
 * with a plain reason. A game is its own repository, so the root is the git work-tree top; picking `src/`
 * inside a game opens the game. An invalid manifest still resolves: the explorer lists it with its first
 * issue, which is how a user gets to fix one. A repository with no manifest at all answers `needsManifest`
 * (Phase 149 Theme F): Open Game proposes an inferred one instead of refusing.
 */
export async function resolveGameFolder(path: string): Promise<GitOpResult<{ root: string; needsManifest?: true }>> {
  if (!isAbsolute(path)) return failure('Choose a full folder path.');
  const name = basename(resolve(path));
  if (!(await isDirectory(path))) return failure(`"${name}" is not a folder.`);
  const top = await workTreeTop(path);
  if (top === null) {
    return failure(`"${name}" is not a git repository. A game is its own repository — run git init in it, or start a new game with New game.`);
  }
  if (await hasManifest(top)) return ok({ root: top });
  if (await hasManifest(path)) {
    return failure(`"${name}" is inside the repository ${top}. Games are their own repositories — move it out, or open ${top} if that is the game.`);
  }
  // Phase 149 Theme F: a repository with no manifest is adopted, not refused: the caller proposes one.
  return ok({ root: top, needsManifest: true });
}
