import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { execGit, writeQueue } from '@midnite/studio-git-engine';
import {
  EVENT_CHANNELS,
  failure,
  GAME_LEVEL_EXT,
  GAME_LEVELS_DIR,
  GAME_MANIFEST_FILE,
  GameGenreSchema,
  GameManifestSchema,
  GameSceneNameSchema,
  ok,
  parseGameManifest,
  type GameDiagnosis,
  type GameFixId,
  type GameFixRequest,
  type GameManifest,
  type GitOpResult,
} from '@midnite/studio-shared';

import { diagnoseGame } from './game-doctor';
import { inferBuild, inferManifest, inferVendored } from './infer-manifest';
import { upgradeKit } from './kit-upgrade';

/**
 * The six safe doctor fixes (Phase 149 Theme D). Each is one commit that names only `midnite-game.json`, through
 * the per-repo write queue, keeps every key it does not own (the schema is `passthrough`), and refuses while the
 * manifest has uncommitted changes. `upgrade-kit` keeps its own branch flow and its own dirty-tree rule. After a
 * fix the game's `gamesChanged { reason: 'manifest' }` is emitted and the fresh diagnosis is answered.
 */

export type GameFixDeps = {
  templateDir: string;
  enginesDir: string;
  send: (channel: string, payload: unknown) => void;
};

/** A fix request as `applyGameFix` takes it: the wire fields minus the game selector, plus Open Game's edited manifest. */
export type GameFixInput = Pick<GameFixRequest, 'fixId' | 'genre' | 'build'> & {
  /** `write-manifest` only: the (possibly user-edited) manifest to write instead of the inferred one. */
  manifest?: GameManifest;
};

export type GameFixResultValue = { commit: string | null; branch?: string; diagnosis: GameDiagnosis };

const DIRTY = `Commit or discard your changes to ${GAME_MANIFEST_FILE} first.`;

const message = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** The commit subject for a fix. */
function title(fixId: GameFixId, genre: unknown): string {
  switch (fixId) {
    case 'write-manifest':
      return `add ${GAME_MANIFEST_FILE}`;
    case 'normalise-vendored':
      return 'normalise vendored engine versions';
    case 'set-genre':
      return genre === null ? 'set genre to custom' : `set genre to ${String(genre)}`;
    case 'add-build':
      return 'add build block';
    case 'declare-levels':
      return 'declare levels';
    case 'upgrade-kit':
      return 'upgrade kit';
  }
}

async function readRawManifest(path: string): Promise<GitOpResult<Record<string, unknown>>> {
  let text: string;
  try {
    text = await readFile(join(path, GAME_MANIFEST_FILE), 'utf8');
  } catch (error) {
    return failure(`Could not read ${GAME_MANIFEST_FILE}: ${message(error)}`);
  }
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return failure(`${GAME_MANIFEST_FILE} is not a JSON object.`);
    return ok(parsed as Record<string, unknown>);
  } catch {
    return failure(`${GAME_MANIFEST_FILE} is not valid JSON.`);
  }
}

/** The first scene to start at: `level` when it exists, else the first `levels/*.tmj` alphabetically. */
async function pickStartScene(path: string): Promise<string | null> {
  let names: string[];
  try {
    names = await readdir(join(path, GAME_LEVELS_DIR));
  } catch {
    return null;
  }
  const scenes = names
    .filter((name) => name.endsWith(GAME_LEVEL_EXT))
    .map((name) => name.slice(0, -GAME_LEVEL_EXT.length))
    .filter((scene) => GameSceneNameSchema.safeParse(scene).success)
    .sort();
  if (scenes.includes('level')) return 'level';
  return scenes[0] ?? null;
}

/** Compute the manifest a fix wants: `null` for "already fine, write nothing", or a refusal. */
async function nextManifest(
  path: string,
  input: GameFixInput,
  current: Record<string, unknown>,
): Promise<GitOpResult<Record<string, unknown> | null>> {
  switch (input.fixId) {
    case 'normalise-vendored': {
      if (current.vendored !== true) return ok(null);
      const engine = current.engine;
      const vendored = engine === 'phaser' || engine === 'three' ? await inferVendored(path, engine) : {};
      return ok({ ...current, vendored });
    }
    case 'set-genre': {
      if (input.genre === undefined) return failure('Choose a genre first.');
      const genre = GameGenreSchema.nullable().safeParse(input.genre);
      if (!genre.success) return failure('That genre is not one Midnite knows.');
      if (current.genre === genre.data) return ok(null);
      return ok({ ...current, genre: genre.data });
    }
    case 'add-build': {
      const build = input.build ?? (await inferBuild(path));
      const parsed = GameManifestSchema.shape.build.safeParse(build);
      if (!parsed.success) return failure(`build: ${parsed.error.issues[0]?.message ?? 'invalid'}`);
      return ok({ ...current, build: parsed.data });
    }
    case 'declare-levels': {
      const start = await pickStartScene(path);
      if (start === null) return failure(`There is no ${GAME_LEVELS_DIR}/*${GAME_LEVEL_EXT} to declare.`);
      const existing = current.levels;
      if (existing !== null && typeof existing === 'object' && (existing as { start?: unknown }).start === start) return ok(null);
      return ok({ ...current, levels: { dir: GAME_LEVELS_DIR, start } });
    }
    default:
      return failure('That fix is not available.');
  }
}

async function headSha(path: string): Promise<string | null> {
  const head = await execGit(path, ['rev-parse', 'HEAD']);
  return head.exitCode === 0 ? head.stdout.trim() : null;
}

/** Write `contents` as the manifest and commit it alone; `null` when nothing differs. */
async function commitManifest(path: string, contents: string, subject: string): Promise<GitOpResult<string | null>> {
  try {
    await writeFile(join(path, GAME_MANIFEST_FILE), contents, 'utf8');
  } catch (error) {
    return failure(`Could not write ${GAME_MANIFEST_FILE}: ${message(error)}`);
  }
  const added = await execGit(path, ['add', '--', GAME_MANIFEST_FILE], { write: true });
  if (added.exitCode !== 0) return failure(added.stderr.trim() || `Could not stage ${GAME_MANIFEST_FILE}.`);
  // The pathspec keeps whatever else the user has staged out of this commit.
  const committed = await execGit(path, ['commit', '--no-verify', '-m', `chore(midnite): ${subject}`, '--', GAME_MANIFEST_FILE], { write: true });
  if (committed.exitCode !== 0) {
    return failure(committed.stderr.trim() || committed.stdout.trim() || `Could not commit ${GAME_MANIFEST_FILE}.`);
  }
  return ok(await headSha(path));
}

/**
 * Apply one fix to the game at `path` (an existing game folder, the work-tree top). Never throws; refusals and
 * errors are `GitOpResult` failures. `commit` is `null` when nothing needed writing (the gap was already fixed) and
 * for `upgrade-kit`, which answers its `branch` instead.
 */
export async function applyGameFix(path: string, input: GameFixInput, deps: GameFixDeps): Promise<GitOpResult<GameFixResultValue>> {
  const finish = async (commit: string | null, branch?: string): Promise<GitOpResult<GameFixResultValue>> => {
    deps.send(EVENT_CHANNELS.gamesChanged, { reason: 'manifest' });
    const diagnosis = await diagnoseGame(path);
    return ok(branch === undefined ? { commit, diagnosis } : { commit, branch, diagnosis });
  };

  if (input.fixId === 'upgrade-kit') {
    const upgraded = await upgradeKit(path, { templateDir: deps.templateDir, enginesDir: deps.enginesDir });
    if (!upgraded.ok) return upgraded;
    return finish(null, upgraded.value.branch);
  }

  return writeQueue.run(path, async (): Promise<GitOpResult<GameFixResultValue>> => {
    if (input.fixId === 'write-manifest') {
      const exists = await readRawManifest(path);
      // A missing file is the case; anything else (even an invalid one) means a manifest is already there.
      if (exists.ok || (exists.kind === 'error' && !/Could not read/.test(exists.message))) return failure(`${GAME_MANIFEST_FILE} already exists.`);
      let manifest = input.manifest;
      if (manifest === undefined) {
        const inferred = await inferManifest(path);
        if (!inferred.ok) return inferred;
        manifest = inferred.value;
      }
      const parsed = parseGameManifest(manifest);
      if (!parsed.ok) return failure(`${parsed.issues[0]?.path ?? '(root)'}: ${parsed.issues[0]?.message ?? 'invalid'}`);
      const committed = await commitManifest(path, `${JSON.stringify(manifest, null, 2)}\n`, title('write-manifest', null));
      if (!committed.ok) return committed;
      return finish(committed.value);
    }

    const status = await execGit(path, ['status', '--porcelain', '--', GAME_MANIFEST_FILE]);
    if (status.exitCode !== 0) return failure('Could not check repository status.', status.stderr);
    if (status.stdout.trim().length > 0) return failure(DIRTY);

    const raw = await readRawManifest(path);
    if (!raw.ok) return raw;
    const next = await nextManifest(path, input, raw.value);
    if (!next.ok) return next;
    if (next.value === null) return finish(null);
    const committed = await commitManifest(path, `${JSON.stringify(next.value, null, 2)}\n`, title(input.fixId, input.genre));
    if (!committed.ok) return committed;
    return finish(committed.value);
  });
}
