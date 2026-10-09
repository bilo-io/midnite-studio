import { createHash } from 'node:crypto';
import { copyFile, lstat, mkdir, mkdtemp, readdir, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, join, sep } from 'node:path';

import { commit, getStatus, stagePaths } from '@midnite/studio-git-engine';
import {
  failure,
  GAME_ASSET_INDEX_FILE,
  GAME_MANIFEST_FILE,
  GameAssetIndexSchema,
  MEDIA_ROOT_DIR,
  ok,
  parseGameManifest,
  parseTerrainSpec,
  SPRITE_GROUPS,
  SPRITE_SPEC_FILE,
  TERRAIN_MANIFEST_FILE,
  TERRAIN_SPEC_FILE,
  type GameAssetIndexEntry,
  type GameAssetProvenance,
  type GameAssetSource,
  type GameAssetSourceItem,
  type GameAssetSourceTab,
  type GameAssetSourcesResult,
  type GameImportAssetRequest,
  type GameImportAssetResult,
  type GameResyncRequest,
  type GameResyncResult,
  type GameSummary,
  type GitOpResult,
  type SpriteGroupId,
} from '@midnite/studio-shared';

import { confineToRoot } from '../fs-scope';
import type { Logger } from '../log';
import { exportTerrain } from '../media/terrain/terrain-export';

/**
 * The asset bridge (Phase 107 Theme N). Media a game uses is **copied** into the
 * game repo — `assets/<kind>/<name>/` for a folder, `assets/<kind>/<name>.<ext>`
 * for one file — never linked, so the repo stays self-contained and exportable.
 * Every import records its provenance in `midnite-game.json` and registers the
 * asset in `assets/index.json`, the one lookup the kits read; each is its own
 * commit (`assets: import <name>`, `assets: re-import <names>`), never folded
 * into an agent's commit-per-pass history.
 *
 * Sources are confined: a media-store item must sit under a registered repo's
 * `.midnite/media/<tab>/`, and a pack folder under a registered repo or the games
 * location. Symlinks are never followed or copied.
 */

export const GAME_ASSET_MAX_BYTES = 512 * 1024 * 1024;
export const GAME_ASSET_MAX_FILES = 5000;
const MAX_LISTED = 500;

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const AUDIO_EXT = new Set(['.mp3', '.wav', '.flac', '.ogg', '.m4a']);
const MODEL_EXT = new Set(['.glb']);

const SPRITE_GROUP_KIND: Record<SpriteGroupId, GameAssetProvenance['kind']> = {
  characters: 'sprite',
  objects: 'sprite',
  tilesets: 'tileset',
  backgrounds: 'background',
  maps: 'map',
};

/** What a folder asset's `entry` is, in the order tried. */
const ENTRY_FILES = ['terrain.manifest.json', 'atlas.json', 'map.tmj', 'map.json', 'tileset.tsj', 'tileset.json', 'anims.json', 'background.json'];

export type AssetGit = {
  /** Paths with changes (staged or not), repo-relative. */
  changed(path: string): Promise<{ path: string; staged: boolean }[]>;
  /** Stage exactly `paths` and commit them; answers the new HEAD. */
  commitPaths(path: string, paths: string[], message: string): Promise<GitOpResult<{ sha: string }>>;
};

export const gitEngineAssetGit: AssetGit = {
  async changed(path) {
    const status = await getStatus(path);
    return status.entries.map((entry) => ({ path: entry.path, staged: entry.staged !== 'unmodified' }));
  },
  async commitPaths(path, paths, message) {
    const staged = await stagePaths(path, paths);
    if (!staged.ok) return staged;
    const made = await commit(path, { message });
    if (!made.ok) return made;
    const sha = (await getStatus(path)).branch.oid;
    return sha ? ok({ sha }) : failure('The commit did not move HEAD.');
  },
};

export type AssetBridgeDeps = {
  /** A game by `gameId` (the game service's `resolve`). */
  resolve: (gameId: string) => Promise<GameSummary | null>;
  /** Paths of every repo the app has registered. */
  listRepoPaths: () => Promise<string[]>;
  /** The games location, which a pack folder may also sit under. */
  gamesRoot: () => Promise<string>;
  /** Maps a registered repo path to its id for provenance; `null` when unknown. */
  repoIdOf?: (repoPath: string) => Promise<string | null>;
  /** A built terrain's pack exported into `dest`; answers the pack folder. Real export by default. */
  exportTerrainPack?: (terrainDir: string, dest: string) => Promise<GitOpResult<{ path: string }>>;
  git?: AssetGit;
  now?: () => Date;
  send: (channel: string, payload: unknown) => void;
  log: Logger;
};

type FileRef = { rel: string; abs: string };
type Located = {
  kind: GameAssetProvenance['kind'];
  tab: GameAssetSourceTab;
  /** A single file, or a folder. */
  isDir: boolean;
  /** What is hashed and copied. */
  abs: string;
  /** A terrain from the media store is exported on the way in; its folder is the source that is hashed. */
  terrain: boolean;
  /** Provenance. */
  repoPath?: string;
  path: string;
  /** The suggested asset name. */
  stem: string;
};

const sha256 = (data: Buffer | string): string => createHash('sha256').update(data).digest('hex');

/** The asset name a source suggests: its basename without extension or `.terrain`-style suffix, made legal. */
export function suggestAssetName(raw: string): string {
  const base = raw.replace(/\.(terrain|sprite|tileset|background|map)$/, '').replace(/\.[A-Za-z0-9]{1,5}$/, (m) => (/^\.(png|jpe?g|webp|glb|mp3|wav|flac|ogg|m4a)$/i.test(m) ? '' : m));
  const cleaned = base
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^[^A-Za-z0-9]+/, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 70);
  return cleaned || 'asset';
}

const within = (parent: string, child: string): boolean => child === parent || child.startsWith(parent + sep);

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await lstat(path)).isDirectory();
  } catch {
    return false;
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch {
    return false;
  }
}

/** Regular files under `dir`, `/`-relative and sorted; symlinks skipped. `skip` prunes a relative path. */
async function walk(dir: string, skip: (rel: string) => boolean = () => false): Promise<GitOpResult<FileRef[]>> {
  const out: FileRef[] = [];
  let tooMany = false;
  async function visit(abs: string, rel: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(abs, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of entries) {
      if (tooMany) return;
      if (entry.isSymbolicLink()) continue;
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (skip(childRel)) continue;
      const childAbs = join(abs, entry.name);
      if (entry.isDirectory()) await visit(childAbs, childRel);
      else if (entry.isFile()) {
        if (out.length >= GAME_ASSET_MAX_FILES) {
          tooMany = true;
          return;
        }
        out.push({ rel: childRel, abs: childAbs });
      }
    }
  }
  await visit(dir, '');
  if (tooMany) return failure(`That folder holds more than ${GAME_ASSET_MAX_FILES} files.`);
  return ok(out);
}

/** The sha256 of a file, or of the sorted `path\0sha256\n` list of a folder. */
export async function hashAsset(abs: string, isDir: boolean, skip?: (rel: string) => boolean): Promise<GitOpResult<{ sha256: string; bytes: number; files: number }>> {
  try {
    if (!isDir) {
      const data = await readFile(abs);
      return ok({ sha256: sha256(data), bytes: data.length, files: 1 });
    }
    const files = await walk(abs, skip);
    if (!files.ok) return files;
    const list = createHash('sha256');
    let bytes = 0;
    for (const file of files.value) {
      const data = await readFile(file.abs);
      bytes += data.length;
      list.update(`${file.rel}\0${sha256(data)}\n`);
    }
    return ok({ sha256: list.digest('hex'), bytes, files: files.value.length });
  } catch (error) {
    return failure(`Could not read the source: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const skipTerrainNoise = (rel: string): boolean => /^(export|\.build-tmp-[^/]*)(\/|$)/.test(rel);

async function defaultExportTerrainPack(terrainDir: string, dest: string): Promise<GitOpResult<{ path: string }>> {
  let spec;
  try {
    spec = parseTerrainSpec(JSON.parse(await readFile(join(terrainDir, TERRAIN_SPEC_FILE), 'utf8')));
  } catch (error) {
    return failure(`${TERRAIN_SPEC_FILE} is not valid: ${error instanceof Error ? error.message : String(error)}`);
  }
  const exported = await exportTerrain({
    dir: terrainDir,
    spec,
    options: { format: 'terrain-pack', dest, lod: 1, texture: 'drape', foliage: true, roads: true, buildings: true },
  });
  return exported.ok ? ok({ path: exported.value.path }) : exported;
}

/** The file that opens a folder asset: a known name first, then any map/tileset/json. */
export async function detectEntry(dir: string): Promise<string | undefined> {
  let names: string[];
  try {
    names = (await readdir(dir, { withFileTypes: true })).filter((e) => e.isFile()).map((e) => e.name).sort();
  } catch {
    return undefined;
  }
  for (const wanted of ENTRY_FILES) if (names.includes(wanted)) return wanted;
  return names.find((n) => n.endsWith('.tmj')) ?? names.find((n) => n.endsWith('.tsj')) ?? names.find((n) => n.endsWith('.json'));
}

const kindOfPack = (names: string[], folder: string): GameAssetProvenance['kind'] | null => {
  if (names.includes(TERRAIN_MANIFEST_FILE)) return 'terrain';
  const suffix = /\.(sprite|tileset|background|map)$/.exec(folder);
  if (suffix) return suffix[1] as 'sprite' | 'tileset' | 'background' | 'map';
  if (names.includes('atlas.json') || names.includes('anims.json')) return 'sprite';
  if (names.some((n) => n.endsWith('.tmj') || n.endsWith('.tmx'))) return 'map';
  if (names.some((n) => n.endsWith('.tsj'))) return 'tileset';
  return null;
};

export function createAssetBridge(deps: AssetBridgeDeps) {
  const git = deps.git ?? gitEngineAssetGit;
  const now = deps.now ?? (() => new Date());
  const exportPack = deps.exportTerrainPack ?? defaultExportTerrainPack;
  /** One import or re-sync at a time per game: the index and the manifest are read-modify-written. */
  const chains = new Map<string, Promise<unknown>>();
  const serial = <T>(gameId: string, job: () => Promise<T>): Promise<T> => {
    const next = (chains.get(gameId) ?? Promise.resolve()).then(job, job);
    chains.set(gameId, next.catch(() => undefined));
    return next;
  };

  async function registeredRepos(): Promise<string[]> {
    const out: string[] = [];
    for (const path of await deps.listRepoPaths()) {
      try {
        out.push(await realpath(path));
      } catch {
        /* a repo that moved is simply not a source */
      }
    }
    return out;
  }

  // --- sources ---------------------------------------------------------------------

  async function locate(source: GameAssetSource): Promise<GitOpResult<Located>> {
    const repos = await registeredRepos();
    if ('packPath' in source) {
      let real: string;
      try {
        real = await realpath(source.packPath);
      } catch {
        return failure('That folder was not found.');
      }
      if (!(await isDirectory(real))) return failure('A pack is a folder.');
      let root: string | null = null;
      try {
        root = await realpath(await deps.gamesRoot());
      } catch {
        root = null;
      }
      if (![...repos, ...(root ? [root] : [])].some((allowed) => within(allowed, real))) {
        return failure('Packs can only be imported from a registered repo or the games location.');
      }
      const names = (await readdir(real, { withFileTypes: true })).filter((e) => e.isFile()).map((e) => e.name);
      const kind = kindOfPack(names, basename(real));
      if (!kind) return failure('That folder is not a terrain or sprite pack (no terrain.manifest.json, atlas.json or map).');
      return ok({
        kind,
        tab: kind === 'terrain' ? 'terrain' : 'sprite',
        isDir: true,
        abs: real,
        terrain: false,
        path: real,
        stem: suggestAssetName(basename(real)),
      });
    }

    let repoReal: string;
    try {
      repoReal = await realpath(source.repoPath);
    } catch {
      return failure('That repository was not found.');
    }
    if (!repos.includes(repoReal)) return failure('That repository is not registered with the app.');
    const tabRoot = join(repoReal, ...MEDIA_ROOT_DIR.split('/'), source.tab);
    const abs = await confineToRoot(tabRoot, source.path);
    if (!abs) return failure('That item is not in the repo’s media.');
    const info = await stat(abs).catch(() => null);
    if (!info) return failure('That item was not found.');
    const common = { tab: source.tab, repoPath: repoReal, path: source.path, stem: suggestAssetName(basename(source.path)) };

    if (source.tab === 'terrain') {
      if (!info.isDirectory() || !(await exists(join(abs, TERRAIN_SPEC_FILE)))) return failure('Pick a terrain folder.');
      return ok({ ...common, kind: 'terrain', isDir: true, abs, terrain: true });
    }
    if (source.tab === 'sprite') {
      if (!info.isDirectory()) return failure('Pick a sprite asset folder.');
      const group = source.path.split('/')[0] as SpriteGroupId;
      const kind = SPRITE_GROUP_KIND[group];
      if (!kind || !(group in SPRITE_GROUPS)) return failure('That is not a sprite asset (expected <group>/<asset>).');
      if (!(await exists(join(abs, SPRITE_SPEC_FILE)))) return failure('That folder is not a sprite asset.');
      // An export, once Phase 106 writes one, is what a game wants; until then the asset folder itself.
      const exported = join(abs, 'export');
      const useExport = (await isDirectory(exported)) && (await readdir(exported)).length > 0;
      return ok({ ...common, kind, isDir: true, abs: useExport ? exported : abs, terrain: false });
    }
    if (!info.isFile()) return failure('Pick a file.');
    const ext = extname(abs).toLowerCase();
    const allowed = source.tab === 'model' ? MODEL_EXT : source.tab === 'image' ? IMAGE_EXT : AUDIO_EXT;
    if (!allowed.has(ext)) return failure(`A ${source.tab} import takes ${[...allowed].join(', ')}.`);
    return ok({ ...common, kind: source.tab, isDir: false, abs, terrain: false });
  }

  async function sources(tab: GameAssetSourceTab): Promise<GameAssetSourcesResult> {
    const repos: GameAssetSourcesResult['repos'] = [];
    for (const repoPath of await registeredRepos()) {
      const root = join(repoPath, ...MEDIA_ROOT_DIR.split('/'), tab);
      const items: GameAssetSourceItem[] = [];
      const dirs = async (dir: string): Promise<string[]> => {
        try {
          return (await readdir(dir, { withFileTypes: true })).filter((e) => e.isDirectory() && !e.name.startsWith('.')).map((e) => e.name).sort();
        } catch {
          return [];
        }
      };
      if (tab === 'terrain') {
        for (const project of await dirs(root)) {
          for (const terrain of await dirs(join(root, project))) {
            const dir = join(root, project, terrain);
            if ((await exists(join(dir, TERRAIN_SPEC_FILE))) && (await isDirectory(join(dir, 'build')))) {
              items.push({ path: `${project}/${terrain}`, label: terrain, kind: 'terrain', bytes: 0 });
            }
          }
        }
      } else if (tab === 'sprite') {
        for (const group of await dirs(root)) {
          const kind = SPRITE_GROUP_KIND[group as SpriteGroupId];
          if (!kind) continue;
          for (const asset of await dirs(join(root, group))) {
            if (await exists(join(root, group, asset, SPRITE_SPEC_FILE))) items.push({ path: `${group}/${asset}`, label: asset, kind, bytes: 0 });
          }
        }
      } else {
        const allowed = tab === 'model' ? MODEL_EXT : tab === 'image' ? IMAGE_EXT : AUDIO_EXT;
        const files = (await isDirectory(root)) ? await walk(root) : ok([] as FileRef[]);
        if (files.ok) {
          for (const file of files.value) {
            if (!allowed.has(extname(file.rel).toLowerCase())) continue;
            const size = (await stat(file.abs).catch(() => null))?.size ?? 0;
            items.push({ path: file.rel, label: file.rel, kind: tab, bytes: size });
          }
        }
      }
      if (items.length > 0) repos.push({ repoPath, name: basename(repoPath), items: items.slice(0, MAX_LISTED) });
    }
    return { repos };
  }

  // --- game files -------------------------------------------------------------------

  async function readIndex(gamePath: string): Promise<{ assets: GameAssetIndexEntry[] }> {
    try {
      const parsed = GameAssetIndexSchema.safeParse(JSON.parse(await readFile(join(gamePath, GAME_ASSET_INDEX_FILE), 'utf8')));
      if (parsed.success) return { assets: parsed.data.assets };
    } catch {
      /* missing or unreadable: start a fresh index */
    }
    return { assets: [] };
  }

  async function readManifestRaw(gamePath: string): Promise<GitOpResult<Record<string, unknown>>> {
    let value: unknown;
    try {
      value = JSON.parse(await readFile(join(gamePath, GAME_MANIFEST_FILE), 'utf8'));
    } catch (error) {
      return failure(`Could not read ${GAME_MANIFEST_FILE}: ${error instanceof Error ? error.message : String(error)}`);
    }
    const parsed = parseGameManifest(value);
    if (!parsed.ok) return failure(`${GAME_MANIFEST_FILE} is invalid (${parsed.issues[0]?.message ?? 'unknown'}). Fix it before importing.`);
    return ok(value as Record<string, unknown>);
  }

  async function writeJson(path: string, value: unknown): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  }

  /** Copies `from` to `to` (a file or a folder), refusing a symlink and anything past the size cap. */
  async function copyInto(from: string, to: string, isDir: boolean, skip?: (rel: string) => boolean): Promise<GitOpResult> {
    try {
      if (!isDir) {
        await mkdir(dirname(to), { recursive: true });
        await copyFile(from, to);
        return ok();
      }
      const files = await walk(from, skip);
      if (!files.ok) return files;
      let bytes = 0;
      for (const file of files.value) bytes += (await stat(file.abs)).size;
      if (bytes > GAME_ASSET_MAX_BYTES) return failure(`That is ${(bytes / 1048576).toFixed(0)} MB; an import is capped at ${GAME_ASSET_MAX_BYTES / 1048576} MB.`);
      await mkdir(to, { recursive: true });
      for (const file of files.value) {
        const dest = join(to, ...file.rel.split('/'));
        await mkdir(dirname(dest), { recursive: true });
        await copyFile(file.abs, dest);
      }
      return ok();
    } catch (error) {
      return failure(`Could not copy the asset: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Brings one located source into the game at `dest` (repo-relative), replacing what is there.
   * A terrain from the media store is exported first. Answers the copy's hash and entry.
   */
  async function bring(
    gamePath: string,
    located: Located,
    destRel: string,
  ): Promise<GitOpResult<{ sha256: string; sourceSha256: string; entry?: string }>> {
    const source = located.terrain
      ? await hashAsset(located.abs, true, skipTerrainNoise)
      : await hashAsset(located.abs, located.isDir);
    if (!source.ok) return source;

    let from = located.abs;
    let skip: ((rel: string) => boolean) | undefined;
    let scratch: string | null = null;
    try {
      if (located.terrain) {
        scratch = await mkdtemp(join(tmpdir(), 'mstudio-game-terrain-'));
        const packed = await exportPack(located.abs, scratch);
        if (!packed.ok) return packed;
        from = packed.value.path;
      } else if (located.isDir) {
        skip = (rel) => /^\.build-tmp-/.test(rel);
      }

      const destAbs = join(gamePath, ...destRel.split('/'));
      const staging = join(dirname(destAbs), `.${basename(destAbs)}.import-${process.pid}-${Date.now()}`);
      const copied = await copyInto(from, staging, located.isDir, skip);
      if (!copied.ok) {
        await rm(staging, { recursive: true, force: true });
        return copied;
      }
      const copy = await hashAsset(staging, located.isDir);
      if (!copy.ok) {
        await rm(staging, { recursive: true, force: true });
        return copy;
      }
      const entry = located.isDir ? await detectEntry(staging) : undefined;
      await rm(destAbs, { recursive: true, force: true });
      await rename(staging, destAbs);
      return ok({ sha256: copy.value.sha256, sourceSha256: source.value.sha256, ...(entry ? { entry } : {}) });
    } catch (error) {
      return failure(`Could not import: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      if (scratch) await rm(scratch, { recursive: true, force: true });
    }
  }

  const pathsFor = (provenance: { path: string }): string[] => [provenance.path, GAME_ASSET_INDEX_FILE, GAME_MANIFEST_FILE];

  /** Refuse when the files this commit rewrites hold edits of someone else's. */
  async function guardTree(gamePath: string, touching: string[]): Promise<GitOpResult> {
    const changed = await git.changed(gamePath);
    const mine = (path: string): boolean => touching.some((t) => path === t || path.startsWith(`${t}/`));
    const staged = changed.find((c) => c.staged && !mine(c.path));
    if (staged) return failure(`${staged.path} is staged. Commit or unstage it first, so the asset commit holds only the import.`);
    const owned = changed.find((c) => c.path === GAME_MANIFEST_FILE || c.path === GAME_ASSET_INDEX_FILE);
    if (owned) return failure(`${owned.path} has uncommitted changes. Commit them first, so the asset commit holds only the import.`);
    return ok();
  }

  async function usableName(index: GameAssetIndexEntry[], gamePath: string, kind: string, wanted: string, isDir: boolean, ext: string): Promise<string> {
    const taken = new Set(index.map((entry) => entry.name));
    for (let n = 1; n < 1000; n += 1) {
      const name = n === 1 ? wanted : `${wanted}-${n}`;
      if (taken.has(name)) continue;
      const rel = isDir ? `assets/${kind}/${name}` : `assets/${kind}/${name}${ext}`;
      if (await exists(join(gamePath, ...rel.split('/')))) continue;
      return name;
    }
    return `${wanted}-${Date.now()}`;
  }

  async function importAsset(req: GameImportAssetRequest): Promise<GitOpResult<GameImportAssetResult>> {
    const game = await deps.resolve(req.gameId);
    if (!game) return failure('That game was not found.');
    return serial(game.gameId, async () => {
      const manifest = await readManifestRaw(game.path);
      if (!manifest.ok) return manifest;
      const located = await locate(req.source);
      if (!located.ok) return located;
      const l = located.value;
      const index = await readIndex(game.path);
      const ext = l.isDir ? '' : extname(l.abs).toLowerCase();
      const name = await usableName(index.assets, game.path, l.kind, req.name ?? l.stem, l.isDir, ext);
      const destRel = l.isDir ? `assets/${l.kind}/${name}` : `assets/${l.kind}/${name}${ext}`;

      const guard = await guardTree(game.path, pathsFor({ path: destRel }));
      if (!guard.ok) return guard;
      const brought = await bring(game.path, l, destRel);
      if (!brought.ok) return brought;

      const provenance: GameAssetProvenance = {
        name,
        kind: l.kind,
        path: destRel,
        source: { tab: l.tab, repoId: l.repoPath ? ((await deps.repoIdOf?.(l.repoPath)) ?? null) : null, path: l.path, ...(l.repoPath ? { repoPath: l.repoPath } : {}) },
        sha256: brought.value.sha256,
        sourceSha256: brought.value.sourceSha256,
        importedAt: now().toISOString(),
      };
      const entry: GameAssetIndexEntry = { name, kind: l.kind, path: destRel, ...(brought.value.entry ? { entry: brought.value.entry } : {}) };
      await writeJson(join(game.path, GAME_ASSET_INDEX_FILE), { version: 1, assets: [...index.assets, entry] });
      const list = Array.isArray(manifest.value.assets) ? (manifest.value.assets as unknown[]) : [];
      await writeJson(join(game.path, GAME_MANIFEST_FILE), { ...manifest.value, assets: [...list, provenance] });

      const made = await git.commitPaths(game.path, pathsFor(provenance), `assets: import ${name}`);
      if (!made.ok) return made;
      deps.send('mstudio:games:changed', { reason: 'manifest' });
      deps.log.info(`game asset imported ${game.gameId} ${l.kind}/${name}`);
      return ok({ name, kind: l.kind, path: destRel, ...(entry.entry ? { entry: entry.entry } : {}), sha256: provenance.sha256, commit: made.value.sha });
    });
  }

  // --- re-sync ----------------------------------------------------------------------

  /** Where a recorded import came from, as a source `locate` understands. */
  const sourceOf = (p: GameAssetProvenance): GameAssetSource =>
    p.source.repoPath
      ? { tab: p.source.tab as GameAssetSourceTab, repoPath: p.source.repoPath, path: p.source.path }
      : { packPath: p.source.path };

  async function resync(raw: GameResyncRequest): Promise<GitOpResult<GameResyncResult>> {
    const game = await deps.resolve(raw.gameId);
    if (!game) return failure('That game was not found.');
    const check = raw.check ?? false;
    return serial(game.gameId, async () => {
      const manifest = await readManifestRaw(game.path);
      if (!manifest.ok) return manifest;
      const parsed = parseGameManifest(manifest.value);
      const recorded = parsed.ok ? parsed.manifest.assets : [];

      const states: GameResyncResult['assets'] = [];
      const changedNow: { provenance: GameAssetProvenance; located: Located }[] = [];
      for (const provenance of recorded) {
        const located = await locate(sourceOf(provenance));
        if (!located.ok) {
          states.push({ name: provenance.name, kind: provenance.kind, state: 'missing', importedAt: provenance.importedAt });
          continue;
        }
        const l = located.value;
        const hashed = l.terrain ? await hashAsset(l.abs, true, skipTerrainNoise) : await hashAsset(l.abs, l.isDir);
        const same = hashed.ok && hashed.value.sha256 === (provenance.sourceSha256 ?? provenance.sha256);
        states.push({ name: provenance.name, kind: provenance.kind, state: hashed.ok && !same ? 'changed' : hashed.ok ? 'current' : 'missing', importedAt: provenance.importedAt });
        if (hashed.ok && !same) changedNow.push({ provenance, located: l });
      }
      const result = (reimported: string[], commitSha: string | null): GameResyncResult => ({
        assets: states,
        changed: states.filter((s) => s.state === 'changed').length,
        reimported,
        commit: commitSha,
      });
      if (check) return ok(result([], null));

      const wanted = raw.names ? new Set(raw.names) : null;
      const todo = changedNow.filter((c) => !wanted || wanted.has(c.provenance.name));
      if (todo.length === 0) return ok(result([], null));

      const touching = [...todo.map((c) => c.provenance.path), GAME_ASSET_INDEX_FILE, GAME_MANIFEST_FILE];
      const guard = await guardTree(game.path, touching);
      if (!guard.ok) return guard;

      const index = await readIndex(game.path);
      const nextRecorded = recorded.map((p) => ({ ...p }));
      const nextIndex = index.assets.map((e) => ({ ...e }));
      const done: string[] = [];
      for (const { provenance, located } of todo) {
        const brought = await bring(game.path, located, provenance.path);
        if (!brought.ok) {
          // Earlier ones already replaced their copies; the commit below takes what landed.
          if (done.length === 0) return brought;
          deps.log.warn(`game asset re-import ${provenance.name} failed: ${brought.kind === 'error' ? brought.message : 'conflict'}`);
          continue;
        }
        const at = nextRecorded.findIndex((p) => p.name === provenance.name);
        if (at >= 0) nextRecorded[at] = { ...provenance, sha256: brought.value.sha256, sourceSha256: brought.value.sourceSha256, importedAt: now().toISOString() };
        const slot = nextIndex.findIndex((e) => e.name === provenance.name);
        const entry: GameAssetIndexEntry = { name: provenance.name, kind: provenance.kind, path: provenance.path, ...(brought.value.entry ? { entry: brought.value.entry } : {}) };
        if (slot >= 0) nextIndex[slot] = entry;
        else nextIndex.push(entry);
        done.push(provenance.name);
      }
      await writeJson(join(game.path, GAME_ASSET_INDEX_FILE), { version: 1, assets: nextIndex });
      await writeJson(join(game.path, GAME_MANIFEST_FILE), { ...manifest.value, assets: nextRecorded });
      const made = await git.commitPaths(game.path, touching, `assets: re-import ${done.join(', ')}`);
      if (!made.ok) return made;
      for (const state of states) if (done.includes(state.name)) state.state = 'current';
      deps.send('mstudio:games:changed', { reason: 'manifest' });
      deps.log.info(`game assets re-imported ${game.gameId} ${done.join(',')}`);
      return ok({ ...result(done, made.value.sha), changed: states.filter((s) => s.state === 'changed').length });
    });
  }

  return { sources, importAsset, resync, locate };
}

export type AssetBridge = ReturnType<typeof createAssetBridge>;
