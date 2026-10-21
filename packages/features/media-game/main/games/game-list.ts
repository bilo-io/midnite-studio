import { readdir, readFile, realpath } from 'node:fs/promises';
import { basename, join } from 'node:path';

import { execGit } from '@midnite/studio-git-engine';
import {
  GAME_MANIFEST_FILE,
  parseGameManifest,
  type GameManifest,
  type GameSummary,
} from '@midnite/studio-shared';

import { gameIdForPath } from './game-scaffold';

/** Read a folder's manifest file, or `null` when it has none. */
async function readManifestFile(folder: string): Promise<string | null> {
  try {
    return await readFile(join(folder, GAME_MANIFEST_FILE), 'utf8');
  } catch {
    return null;
  }
}

/** Direct children of `root` that carry a `midnite-game.json`. */
async function childGameFolders(root: string): Promise<string[]> {
  let entries: import('node:fs').Dirent[];
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const found: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const folder = join(root, entry.name);
    if ((await readManifestFile(folder)) !== null) found.push(folder);
  }
  return found;
}

async function isDirty(folder: string): Promise<boolean> {
  const res = await execGit(folder, ['status', '--porcelain']);
  return res.exitCode === 0 && res.stdout.trim() !== '';
}

/** One game folder as the explorer shows it; an invalid manifest still lists. */
async function summarise(folder: string): Promise<GameSummary> {
  const gameId = await gameIdForPath(folder);
  const raw = (await readManifestFile(folder)) ?? '';
  let value: unknown;
  let jsonProblem: string | null = null;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    jsonProblem = `${GAME_MANIFEST_FILE} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`;
  }
  const dirty = await isDirty(folder);
  if (jsonProblem !== null) {
    return { gameId, name: basename(folder), path: folder, engine: null, dimension: null, starter: null, dirty, valid: false, issue: jsonProblem };
  }
  const parsed = parseGameManifest(value);
  if (!parsed.ok) {
    const first = parsed.issues[0];
    return {
      gameId,
      name: basename(folder),
      path: folder,
      engine: null,
      dimension: null,
      starter: null,
      dirty,
      valid: false,
      issue: first ? `${first.path}: ${first.message}` : 'Invalid manifest.',
    };
  }
  const manifest: GameManifest = parsed.manifest;
  return {
    gameId,
    name: manifest.name,
    path: folder,
    engine: manifest.engine,
    dimension: manifest.dimension,
    starter: manifest.starter,
    dirty,
    valid: true,
    issue: null,
  };
}

/**
 * The games the explorer lists: direct children of the games root carrying a
 * manifest, plus any registered repo whose root has one, deduped by realpath.
 */
export async function listGames(gamesRoot: string, registeredRepoPaths: readonly string[]): Promise<GameSummary[]> {
  const candidates = [...(await childGameFolders(gamesRoot))];
  for (const path of registeredRepoPaths) {
    if ((await readManifestFile(path)) !== null) candidates.push(path);
  }
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const folder of candidates) {
    let real = folder;
    try {
      real = await realpath(folder);
    } catch {
      continue;
    }
    if (seen.has(real)) continue;
    seen.add(real);
    unique.push(folder);
  }
  const summaries = await Promise.all(unique.map((folder) => summarise(folder)));
  return summaries.sort((a, b) => a.name.localeCompare(b.name));
}
