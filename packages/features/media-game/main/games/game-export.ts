import { lstat, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';

import {
  failure,
  GAME_MANIFEST_FILE,
  gameExportExistsMessage,
  gameSlug,
  isGameExportExcluded,
  ok,
  parseGameManifest,
  type GameExportRequest,
  type GameExportResult,
  type GameSummary,
  type GitOpResult,
} from '@midnite/studio-shared';

import { confineToRoot, joinWithin } from '@midnite/studio-runtime';
import { buildRunPackage, buildServeScript, RUN_PACKAGE_FILE, RUN_README, RUN_README_FILE, RUN_SERVE_FILE } from './run-scaffold';
import { buildSingleFile } from './single-file';
import { writeZip, ZipTooLargeError } from './zip-writer';

/**
 * Web export (Phase 107 Theme P): a static folder, a zip, or one HTML file. Every write stays at the
 * destination the caller chose — nothing in the game repo changes — and an existing destination is
 * refused unless the caller says it is replaceable (a native save dialog has already asked). Reads are
 * confined to the game repo and never follow a symlink out of it. Folders are assembled beside their
 * final name and renamed into place, so a failure leaves nothing half-written.
 */
export type GameExportDeps = {
  resolve: (gameId: string) => Promise<GameSummary | null>;
};

const NO_GAME = 'That game was not found.';
const NEEDS_DEST = 'Choose where to save the export.';
const INSIDE_GAME = 'Choose a destination outside the game’s own folder.';

const has = (path: string): Promise<boolean> =>
  lstat(path).then(
    () => true,
    () => false,
  );

/** Every file an export carries, repo-relative and `/`-separated; symlinks and excluded paths are skipped. */
export async function listGameFiles(root: string, dir = ''): Promise<string[]> {
  const entries = await readdir(join(root, dir), { withFileTypes: true }).catch(() => []);
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const out: string[] = [];
  for (const entry of entries) {
    const rel = dir ? `${dir}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink() || isGameExportExcluded(rel)) continue;
    if (entry.isDirectory()) out.push(...(await listGameFiles(root, rel)));
    else if (entry.isFile()) out.push(rel);
  }
  return out;
}

export function createGameExport(deps: GameExportDeps) {
  async function readInRepo(root: string, rel: string): Promise<Buffer | null> {
    const real = await confineToRoot(root, rel);
    return real === null ? null : readFile(real).catch(() => null);
  }

  async function entryPage(root: string): Promise<string> {
    const text = await readFile(join(root, GAME_MANIFEST_FILE), 'utf8').catch(() => null);
    if (text === null) return 'index.html';
    try {
      const parsed = parseGameManifest(JSON.parse(text));
      return parsed.ok ? parsed.manifest.entry : 'index.html';
    } catch {
      return 'index.html';
    }
  }

  /** The run files the game does not already ship; a clash is skipped and reported, never overwritten. */
  async function runScaffold(root: string, files: string[], slug: string): Promise<{ extra: { path: string; bytes: Buffer }[]; warnings: string[] }> {
    const wanted = [
      { path: RUN_SERVE_FILE, text: buildServeScript(await entryPage(root)) },
      { path: RUN_PACKAGE_FILE, text: buildRunPackage(slug) },
      { path: RUN_README_FILE, text: RUN_README },
    ];
    const taken = new Set(files);
    const extra: { path: string; bytes: Buffer }[] = [];
    const warnings: string[] = [];
    for (const { path, text } of wanted) {
      if (taken.has(path)) warnings.push(`The game already has ${path}, so it was kept and not generated; npm start may not work.`);
      else extra.push({ path, bytes: Buffer.from(text, 'utf8') });
    }
    return { extra, warnings };
  }

  async function exportGame(req: GameExportRequest): Promise<GitOpResult<GameExportResult>> {
    try {
      const game = await deps.resolve(req.gameId);
      if (!game) return failure(NO_GAME);
      if (!req.dest) return failure(NEEDS_DEST);
      if (req.dest.includes('\0') || !isAbsolute(req.dest)) return failure('The destination must be an absolute path.');
      const dest = resolve(req.dest);
      const root = resolve(game.path);
      if (dest === root || dest.startsWith(root + sep)) return failure(INSIDE_GAME);
      const slug = gameSlug(game.name);

      if (req.format === 'game-folder') return await exportFolder(root, dest, slug);
      if (await has(dest)) {
        if (!req.overwrite) return failure(gameExportExistsMessage(basename(dest)));
        const info = await lstat(dest);
        if (!info.isFile()) return failure(`${basename(dest)} is not a file.`);
      }
      const parent = await stat(dirname(dest)).catch(() => null);
      if (!parent?.isDirectory()) return failure('The destination folder does not exist.');
      return req.format === 'game-zip' ? await exportZip(root, dest, slug) : await exportHtml(root, dest);
    } catch (error) {
      if (error instanceof ZipTooLargeError) return failure(error.message);
      return failure(error instanceof Error ? error.message : String(error));
    }
  }

  async function exportFolder(root: string, parent: string, slug: string): Promise<GitOpResult<GameExportResult>> {
    const info = await stat(parent).catch(() => null);
    if (!info?.isDirectory()) return failure('The destination folder does not exist.');
    const name = `${slug}-web`;
    const target = joinWithin(parent, name);
    if (target === null) return failure('Unusable export name.');
    if (await has(target)) return failure(gameExportExistsMessage(name));
    const temp = join(parent, `.${name}.tmp-${process.pid}-${Date.now()}`);
    const files = await listGameFiles(root);
    const { extra, warnings } = await runScaffold(root, files, slug);
    let bytes = 0;
    try {
      for (const { path, bytes: data } of extra) {
        await mkdir(temp, { recursive: true });
        await writeFile(join(temp, path), data);
        bytes += data.length;
      }
      for (const rel of files) {
        const data = await readInRepo(root, rel);
        if (data === null) continue;
        const out = joinWithin(temp, rel);
        if (out === null) continue;
        await mkdir(dirname(out), { recursive: true });
        await writeFile(out, data);
        bytes += data.length;
      }
      await mkdir(temp, { recursive: true });
      await rename(temp, target);
    } catch (error) {
      await rm(temp, { recursive: true, force: true });
      throw error;
    }
    return ok({ path: target, bytes, files: files.length + extra.length, warnings });
  }

  async function exportZip(root: string, dest: string, slug: string): Promise<GitOpResult<GameExportResult>> {
    const entries: { path: string; bytes: Buffer }[] = [];
    const listed = await listGameFiles(root);
    for (const rel of listed) {
      const data = await readInRepo(root, rel);
      if (data !== null) entries.push({ path: rel, bytes: data });
    }
    const { extra, warnings } = await runScaffold(root, listed, slug);
    entries.push(...extra);
    const zip = writeZip(entries);
    await writeAtomically(dest, zip);
    return ok({ path: dest, bytes: zip.length, files: entries.length, warnings });
  }

  async function exportHtml(root: string, dest: string): Promise<GitOpResult<GameExportResult>> {
    const entry = await entryPage(root);
    const page = await readInRepo(root, entry);
    if (page === null) return failure(`${entry} was not found in the game.`);
    const built = await buildSingleFile(page.toString('utf8'), {
      read: (path) => readInRepo(root, path),
      list: (dir) => listGameFiles(root, dir.replace(/^\/+|\/+$/g, '')),
    });
    await writeAtomically(dest, Buffer.from(built.html, 'utf8'));
    return ok({ path: dest, bytes: built.bytes, files: 1, warnings: built.warnings });
  }

  return { exportGame };
}

async function writeAtomically(dest: string, data: Buffer): Promise<void> {
  const temp = join(dirname(dest), `.${basename(dest)}.tmp-${process.pid}-${Date.now()}`);
  try {
    await writeFile(temp, data);
    await rename(temp, dest);
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
}

export type GameExport = ReturnType<typeof createGameExport>;
