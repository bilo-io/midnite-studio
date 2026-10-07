import { createHash, randomBytes } from 'node:crypto';
import { cp, mkdir, readdir, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

import { initRepo } from '@midnite/studio-git-engine';
import {
  failure,
  GAME_KIT_VERSION,
  GAME_MANIFEST_FILE,
  gameSlug,
  GameCreateRequestSchema,
  isStarterAvailable,
  parseStarterId,
  dimensionOf,
  ok,
  type GameCreateRequest,
  type GameCreateResult,
  type GameManifest,
  type GitOpResult,
} from '@midnite/studio-shared';

import { composeStarter } from './compose';
import { validateGamesRoot } from './games-root';
import { seedGameSkills } from './skills';
import { vendorEngines } from './vendor';

/** The only starter available until Phase 107's kits and genre starters land. */
export const BLANK_STARTER = 'blank';
/** The kit version stamped into a new manifest. */
export const INITIAL_KIT_VERSION = GAME_KIT_VERSION;

/** `g` + the first 12 hex of sha1(realpath) — stable across runs; the runner's host name. */
export async function gameIdForPath(path: string): Promise<string> {
  let real = path;
  try {
    real = await realpath(path);
  } catch {
    // A path that does not exist yet still gets a deterministic id.
  }
  return `g${createHash('sha1').update(real).digest('hex').slice(0, 12)}`;
}

export type CreateGameDeps = {
  /** `templates/media-game/` — see `template-path.ts`. */
  templateDir: string;
  /** The effective games location (stored root, or the default). */
  gamesRoot: string;
  /** Register the new repo with the app's repo list and reconcile its watchers. */
  registerRepo: (path: string) => Promise<GitOpResult>;
  /** Defaults applied when the request leaves them out. */
  defaultNetwork: 'off' | 'on';
  /** Path to resources/game-engines. Defaults to gameEnginesDir(). */
  enginesDir?: string;
};

const escapeHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The manifest a fresh game starts with. */
export function initialManifest(
  req: ReturnType<typeof GameCreateRequestSchema.parse>,
  network: 'off' | 'on',
  vendored: Record<string, string> = {},
): GameManifest {
  return {
    version: 1,
    name: req.name,
    engine: req.engine,
    dimension: req.engine === 'phaser' ? '2d' : '3d',
    perspective: req.perspective,
    genre: req.genre,
    starter: req.starter,
    cameraPresets: req.cameras ?? [],
    entry: 'index.html',
    kitVersion: GAME_KIT_VERSION,
    vendored,
    assets: [],
    network,
    deterministic: false,
    keepSaveData: false,
  };
}

/**
 * Create a game repo: compose the scaffold into a temp dir beside the target,
 * write the manifest, rename it into place, `git init` + first commit, then
 * register it with the repo list.
 *
 * Any failure before the rename removes the temp dir and returns the step's
 * message. A failure after the rename leaves the folder — it is visible to the
 * user, and a destructive cleanup of it is not ours to do — and says so.
 */
export async function createGame(
  rawRequest: GameCreateRequest,
  deps: CreateGameDeps,
): Promise<GitOpResult<GameCreateResult>> {
  const parsed = GameCreateRequestSchema.safeParse(rawRequest);
  if (!parsed.success) return failure(parsed.error.issues[0]?.message ?? 'Invalid game request.');
  const req = parsed.data;

  if (req.starter !== BLANK_STARTER) {
    const available = isStarterAvailable(req.starter);
    if (!available.ok) return failure(available.reason);
    const parsedStarter = parseStarterId(req.starter)!;
    if (parsedStarter.perspective !== req.perspective || parsedStarter.genre !== req.genre) {
      return failure(`The "${req.starter}" starter does not match the chosen perspective and genre.`);
    }
    if ((dimensionOf(req.perspective) === '2d') !== (req.engine === 'phaser')) {
      return failure(`The "${req.starter}" starter does not run on ${req.engine}.`);
    }
  }

  const parent = req.folder ?? deps.gamesRoot;
  const rootProblem = await validateGamesRoot(parent);
  if (rootProblem !== null) return failure(rootProblem);

  const target = join(parent, gameSlug(req.name));
  if (await isNonEmptyOrFile(target)) return failure(`${target} already exists — choose another name.`);

  try {
    await mkdir(parent, { recursive: true });
  } catch (error) {
    return failure(`Could not create ${parent}: ${errorText(error)}`);
  }

  const temp = join(parent, `.${basename(target)}.creating-${randomBytes(4).toString('hex')}`);
  try {
    if (req.starter === BLANK_STARTER) await composeBlank(deps.templateDir, temp, req.name);
    else {
      const composed = await composeStarter(req.starter, temp, {
        templateDir: deps.templateDir,
        name: req.name,
        ...(req.cameras ? { cameras: req.cameras } : {}),
      });
      if (!composed.ok) throw new Error(composed.kind === 'error' ? composed.message : 'Could not compose the starter.');
    }
    await seedGameSkills(deps.templateDir, temp);
    const vendored = await vendorEngines(req.engine, temp, deps.enginesDir);
    const manifest = initialManifest(req, req.network ?? deps.defaultNetwork, vendored);
    await writeFile(join(temp, GAME_MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    await rm(target, { recursive: true, force: true }); // an empty folder is fine to replace
    await rename(temp, target);
  } catch (error) {
    await rm(temp, { recursive: true, force: true }).catch(() => undefined);
    return failure(errorText(error));
  }

  const init = await initRepo(target, { message: `Create ${req.name} from ${req.starter}` });
  if (!init.ok) {
    return init.kind === 'error'
      ? failure(`${init.message} The folder ${target} was left in place.`, init.stderr)
      : failure(`Could not initialise ${target}. The folder was left in place.`);
  }

  const registered = await deps.registerRepo(target);
  if (!registered.ok) {
    return registered.kind === 'error'
      ? failure(`${registered.message} The game was created at ${target}.`, registered.stderr)
      : failure(`The game was created at ${target} but could not be opened.`);
  }

  return ok({ path: target, gameId: await gameIdForPath(target) });
}

async function composeBlank(templateDir: string, dest: string, name: string): Promise<void> {
  const common = join(templateDir, 'common');
  try {
    await stat(join(common, 'index.html'));
  } catch {
    throw new Error(`The game template is missing from this build (${templateDir}).`);
  }
  await cp(common, dest, { recursive: true, force: false });
  const kit = join(templateDir, 'kit');
  try {
    await stat(kit);
    await cp(kit, join(dest, 'kit'), { recursive: true, force: false });
  } catch {
    // kit directory may not exist in some minimal test fixtures
  }
  for (const file of await textFilesToFill(dest)) {
    const path = join(dest, file);
    const raw = await readFile(path, 'utf8');
    const filled = raw.replaceAll('{{GAME_NAME}}', file.endsWith('.html') ? escapeHtml(name) : name);
    if (filled !== raw) await writeFile(path, filled, 'utf8');
  }
}

async function textFilesToFill(dir: string): Promise<string[]> {
  const out: string[] = [];
  const walk = async (current: string, rel: string): Promise<void> => {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const next = rel === '' ? entry.name : `${rel}/${entry.name}`;
      if (entry.isDirectory()) await walk(join(current, entry.name), next);
      else if (/\.(html|md|js|json)$/.test(entry.name)) out.push(next);
    }
  };
  await walk(dir, '');
  return out;
}

/** True when `path` exists and is a file, or a directory holding anything. */
async function isNonEmptyOrFile(path: string): Promise<boolean> {
  try {
    const info = await stat(path);
    if (!info.isDirectory()) return true;
    return (await readdir(path)).length > 0;
  } catch {
    return false;
  }
}

const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error));
