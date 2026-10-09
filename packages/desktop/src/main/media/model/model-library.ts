import type { Dirent } from 'node:fs';
import { cp, lstat, mkdir, readdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { WriteQueue } from '@midnite/studio-git-engine';
import {
  buildModelManifest,
  failure,
  isWithinLibraryPath,
  libraryBase,
  libraryParent,
  MODEL_FILE_EXTENSIONS,
  MODEL_MANIFEST_FILE,
  ModelLibraryNameSchema,
  ok,
  parseModelManifest,
  parseModelSidecar,
  type GitOpResult,
  type ModelAuthor,
  type ModelLibraryFile,
  type ModelLibraryGroup,
  type ModelLibraryMigrateResult,
  type ModelLibraryModel,
  type ModelLibraryNode,
} from '@midnite/studio-shared';

import { confineToRoot, joinWithin } from '../../fs-scope';

/**
 * The Models library (Media ▸ Models explorer): groups of per-generation folders under
 * `.midnite/media/model/`. Everything here runs in main, inside the model root's jail, and answers a
 * `GitOpResult` — nothing throws across IPC.
 *
 * Layout rules, in one place:
 * - a top-level directory is always a **group**;
 * - a deeper directory is a **model** when it has a `model.json` or holds a model file directly
 *   (`.obj`/`.fbx`/`.glb`), otherwise a **group** (so groups nest);
 * - a group may still hold **legacy** flat outputs (`<stem>.obj` + `<stem>.json`…); they are listed as
 *   `legacy` models and `migrate` moves each set into its own `<stem>/` folder.
 *
 * Nothing is ever deleted except by `delete`, which goes to the Trash. `migrate` only renames into a
 * folder that did not exist, and a name collision skips that set rather than overwriting.
 */
export type ModelLibraryDeps = {
  /** The model tab's root for a repo, or `null` when it does not exist yet. */
  rootFor: (repoId: string) => Promise<string | null>;
  /** Creates a top-level group (and the root with it) — the media store's `createProject`. */
  createGroup: (repoId: string, name: string) => Promise<GitOpResult<unknown>>;
  trash: (absPath: string) => Promise<void>;
  onChanged?: (repoId: string) => void;
  author: () => Promise<ModelAuthor>;
  now?: () => Date;
};

const MODEL_EXT_SET = new Set<string>(MODEL_FILE_EXTENSIONS);
const MAX_DEPTH = 8;

const extOf = (name: string): string => (name.includes('.') ? (name.split('.').pop() ?? '').toLowerCase() : '');
const hasModelFile = (names: readonly string[]): boolean => names.some((n) => MODEL_EXT_SET.has(extOf(n)));
/** `fox.ref.png` → `fox`; `fox.obj` → `fox`. */
const stemOf = (name: string): string => name.replace(/\.ref\.[^./]+$/, '').replace(/\.[^./]+$/, '');

type Located = { abs: string; rel: string };

export function createModelLibrary(deps: ModelLibraryDeps) {
  const queue = new WriteQueue();
  const now = deps.now ?? (() => new Date());

  async function fileEntry(abs: string, name: string): Promise<ModelLibraryFile | null> {
    try {
      const info = await stat(abs);
      return info.isFile() ? { name, size: info.size, mtimeMs: info.mtimeMs } : null;
    } catch {
      return null;
    }
  }

  async function readManifestOf(dir: string) {
    try {
      return parseModelManifest(await readFile(join(dir, MODEL_MANIFEST_FILE), 'utf8'));
    } catch {
      return null;
    }
  }

  async function scanDir(abs: string, rel: string, depth: number): Promise<ModelLibraryNode[]> {
    let entries: Dirent[];
    try {
      entries = await readdir(abs, { withFileTypes: true });
    } catch {
      return [];
    }
    const nodes: ModelLibraryNode[] = [];
    const loose = new Map<string, ModelLibraryFile[]>();
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
      const childAbs = join(abs, entry.name);
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (depth >= MAX_DEPTH) continue;
        nodes.push(await scanFolder(childAbs, childRel, depth + 1));
      } else if (entry.isFile()) {
        const file = await fileEntry(childAbs, entry.name);
        if (!file) continue;
        const stem = stemOf(entry.name);
        loose.set(stem, [...(loose.get(stem) ?? []), file]);
      }
    }
    // Flat outputs from before the folder layout: one legacy model per stem that has a model file.
    for (const [stem, files] of loose) {
      if (!hasModelFile(files.map((f) => f.name))) continue;
      nodes.push({
        kind: 'model',
        name: stem,
        path: rel ? `${rel}/${stem}` : stem,
        manifest: null,
        files,
        legacy: true,
        mtimeMs: Math.max(...files.map((f) => f.mtimeMs)),
      });
    }
    return sortNodes(nodes);
  }

  async function scanFolder(abs: string, rel: string, depth: number): Promise<ModelLibraryNode> {
    const manifest = await readManifestOf(abs);
    let entries: Dirent[] = [];
    try {
      entries = await readdir(abs, { withFileTypes: true });
    } catch {
      // unreadable — an empty group
    }
    const fileNames = entries.filter((e) => e.isFile() && !e.name.startsWith('.')).map((e) => e.name);
    const isModel = depth >= 2 && (manifest !== null || fileNames.includes(MODEL_MANIFEST_FILE) || hasModelFile(fileNames));
    const info = await stat(abs).catch(() => null);
    const mtimeMs = info?.mtimeMs ?? 0;
    if (isModel) {
      const files: ModelLibraryFile[] = [];
      for (const name of fileNames) {
        const file = await fileEntry(join(abs, name), name);
        if (file) files.push(file);
      }
      files.sort((a, b) => a.name.localeCompare(b.name));
      return {
        kind: 'model',
        name: libraryBase(rel),
        path: rel,
        manifest,
        files,
        legacy: false,
        mtimeMs: Math.max(mtimeMs, ...files.map((f) => f.mtimeMs)),
      } satisfies ModelLibraryModel;
    }
    const children = await scanDir(abs, rel, depth);
    return { kind: 'group', name: libraryBase(rel), path: rel, children, mtimeMs } satisfies ModelLibraryGroup;
  }

  /** Groups first, A→Z; then models, newest first. */
  function sortNodes(nodes: ModelLibraryNode[]): ModelLibraryNode[] {
    return [...nodes].sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'group' ? -1 : 1;
      return a.kind === 'group' ? a.name.localeCompare(b.name) : b.mtimeMs - a.mtimeMs || a.name.localeCompare(b.name);
    });
  }

  async function locate(root: string, rel: string): Promise<Located | null> {
    if (rel === '' || rel.split('/').some((s) => s === '' || s === '.' || s === '..')) return null;
    const abs = joinWithin(root, rel);
    if (abs === null) return null;
    try {
      if ((await lstat(abs)).isSymbolicLink()) return null;
    } catch {
      return null;
    }
    // The symlink half: the real path must still sit under the real root.
    return (await confineToRoot(root, rel)) === null ? null : { abs, rel };
  }

  const changed = (repoId: string): void => deps.onChanged?.(repoId);

  async function exists(path: string): Promise<boolean> {
    try {
      await lstat(path);
      return true;
    } catch {
      return false;
    }
  }

  /** `name`, else `name copy`, `name copy 2`… — the first that does not exist in `dir`. */
  async function uniqueName(dir: string, name: string): Promise<string> {
    if (!(await exists(join(dir, name)))) return name;
    for (let n = 1; n < 1000; n += 1) {
      const candidate = n === 1 ? `${name} copy` : `${name} copy ${n}`;
      if (!(await exists(join(dir, candidate)))) return candidate;
    }
    return `${name} ${Date.now()}`;
  }

  async function updateManifestName(dir: string, name: string): Promise<void> {
    const raw = await readFile(join(dir, MODEL_MANIFEST_FILE), 'utf8').catch(() => null);
    if (raw === null) return;
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      await writeFile(join(dir, MODEL_MANIFEST_FILE), JSON.stringify({ ...parsed, name, updatedAt: now().toISOString() }, null, 2) + '\n');
    } catch {
      // not valid JSON — leave the user's file alone
    }
  }

  /** Writes `model.json` for a folder from its design sidecar; a folder with no valid sidecar is left alone. */
  async function writeManifest(dir: string, stem: string, author: ModelAuthor): Promise<boolean> {
    const sidecarText = await readFile(join(dir, `${stem}.json`), 'utf8').catch(() => null);
    const sidecar = sidecarText === null ? null : parseModelSidecar(sidecarText);
    if (!sidecar) return false;
    const present = (await readdir(dir)).filter((n) => !n.startsWith('.'));
    const manifest = buildModelManifest({ sidecar, stem, author, now: now(), present });
    await writeFile(join(dir, MODEL_MANIFEST_FILE), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' }).catch(() => undefined);
    return true;
  }

  async function migrateDir(abs: string, depth: number, author: ModelAuthor, tally: ModelLibraryMigrateResult): Promise<void> {
    let entries: Dirent[];
    try {
      entries = await readdir(abs, { withFileTypes: true });
    } catch {
      return;
    }
    const loose = new Map<string, string[]>();
    const dirs: Dirent[] = [];
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) dirs.push(entry);
      else if (entry.isFile()) {
        const stem = stemOf(entry.name);
        loose.set(stem, [...(loose.get(stem) ?? []), entry.name]);
      }
    }
    for (const [stem, names] of loose) {
      if (!hasModelFile(names)) continue;
      const folder = join(abs, stem);
      // A name already taken (a file or a folder) — leave this set exactly where it is.
      if (await exists(folder)) {
        tally.skipped += 1;
        continue;
      }
      try {
        await mkdir(folder);
        for (const name of names) await rename(join(abs, name), join(folder, name));
        await writeManifest(folder, stem, author);
        tally.migrated += 1;
      } catch {
        tally.skipped += 1;
      }
    }
    if (depth >= MAX_DEPTH) return;
    for (const dir of dirs) {
      const childAbs = join(abs, dir.name);
      // A folder that already is a model has nothing flat inside it to migrate.
      const inner = await readdir(childAbs).catch(() => [] as string[]);
      if (depth + 1 >= 2 && (inner.includes(MODEL_MANIFEST_FILE) || hasModelFile(inner))) {
        if (!inner.includes(MODEL_MANIFEST_FILE)) await backfillManifest(childAbs, inner, author);
        continue;
      }
      await migrateDir(childAbs, depth + 1, author, tally);
    }
  }

  /** A model folder from before `model.json` (or hand-made): add one when a design sidecar is there. */
  async function backfillManifest(dir: string, names: string[], author: ModelAuthor): Promise<void> {
    const design = names.find((n) => n.endsWith('.json') && n !== MODEL_MANIFEST_FILE);
    if (design) await writeManifest(dir, design.replace(/\.json$/, ''), author);
  }

  return {
    async list(repoId: string): Promise<GitOpResult<{ tree: ModelLibraryNode[] }>> {
      const root = await deps.rootFor(repoId);
      if (root === null) return ok({ tree: [] });
      try {
        return ok({ tree: await scanDir(root, '', 0).then((nodes) => nodes.filter((n) => n.kind === 'group')) });
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },

    async migrate(repoId: string): Promise<GitOpResult<ModelLibraryMigrateResult>> {
      const root = await deps.rootFor(repoId);
      if (root === null) return ok({ migrated: 0, skipped: 0 });
      return queue.run(root, async () => {
        const tally: ModelLibraryMigrateResult = { migrated: 0, skipped: 0 };
        try {
          await migrateDir(root, 0, await deps.author(), tally);
        } catch (error) {
          return failure(error instanceof Error ? error.message : String(error));
        }
        if (tally.migrated > 0) changed(repoId);
        return ok(tally);
      });
    },

    async rename(req: { repoId: string; path: string; to: string }): Promise<GitOpResult<{ path: string }>> {
      const name = ModelLibraryNameSchema.safeParse(req.to);
      if (!name.success) return failure('Use a single folder name.');
      const root = await deps.rootFor(req.repoId);
      if (root === null) return failure('Nothing to rename.');
      return queue.run(root, async () => {
        const from = await locate(root, req.path);
        if (!from) return failure('Not found.');
        const parent = libraryParent(req.path);
        const toRel = parent ? `${parent}/${name.data}` : name.data;
        const toAbs = joinWithin(root, toRel);
        if (toAbs === null) return failure('Invalid name.');
        if (toRel === req.path) return ok({ path: req.path });
        if (await exists(toAbs)) return failure(`"${name.data}" already exists here.`);
        try {
          await rename(from.abs, toAbs);
          await updateManifestName(toAbs, name.data);
        } catch (error) {
          return failure(error instanceof Error ? error.message : String(error));
        }
        changed(req.repoId);
        return ok({ path: toRel });
      });
    },

    async move(req: { repoId: string; path: string; toGroup: string }): Promise<GitOpResult<{ path: string }>> {
      const root = await deps.rootFor(req.repoId);
      if (root === null) return failure('Nothing to move.');
      return queue.run(root, async () => {
        const from = await locate(root, req.path);
        if (!from) return failure('Not found.');
        if (isWithinLibraryPath(req.path, req.toGroup)) return failure('A folder cannot move into itself.');
        let destDir = root;
        if (req.toGroup !== '') {
          const dest = await locate(root, req.toGroup);
          if (!dest) return failure('Destination not found.');
          destDir = dest.abs;
          const destNode = await scanFolder(destDir, req.toGroup, req.toGroup.split('/').length);
          if (destNode.kind === 'model') return failure('Models cannot hold other models. Drop it on a group.');
        } else {
          // Root level holds groups only: a model folder dropped here would be a "group" with files in it.
          const node = await scanFolder(from.abs, req.path, req.path.split('/').length);
          if (node.kind === 'model') return failure('Models live inside a group. Drop it on one.');
        }
        const base = libraryBase(req.path);
        const toRel = req.toGroup ? `${req.toGroup}/${base}` : base;
        if (toRel === req.path) return ok({ path: req.path });
        const toAbs = join(destDir, base);
        if (await exists(toAbs)) return failure(`"${base}" already exists in the destination.`);
        try {
          await rename(from.abs, toAbs);
        } catch (error) {
          return failure(error instanceof Error ? error.message : String(error));
        }
        changed(req.repoId);
        return ok({ path: toRel });
      });
    },

    async delete(req: { repoId: string; path: string }): Promise<GitOpResult> {
      const root = await deps.rootFor(req.repoId);
      if (root === null) return failure('Nothing to delete.');
      return queue.run(root, async () => {
        const target = await locate(root, req.path);
        if (!target) {
          // A legacy model has no folder: trash each file of the set.
          return deleteLegacy(root, req);
        }
        try {
          await deps.trash(target.abs);
        } catch (error) {
          return failure(error instanceof Error ? error.message : String(error));
        }
        changed(req.repoId);
        return ok();
      });
    },

    async duplicate(req: { repoId: string; path: string }): Promise<GitOpResult<{ path: string }>> {
      const root = await deps.rootFor(req.repoId);
      if (root === null) return failure('Nothing to duplicate.');
      return queue.run(root, async () => {
        const parent = libraryParent(req.path);
        const parentAbs = parent ? ((await locate(root, parent))?.abs ?? null) : root;
        if (parentAbs === null) return failure('Not found.');
        const source = await locate(root, req.path);
        const base = libraryBase(req.path);
        try {
          if (!source) return await duplicateLegacy(parentAbs, parent, base, req.repoId);
          const name = await uniqueName(parentAbs, base);
          const target = join(parentAbs, name);
          // `cp` follows nothing it should not: links inside a model folder are not copied.
          await cp(source.abs, target, { recursive: true, errorOnExist: true, force: false, filter: async (src) => !(await lstat(src)).isSymbolicLink() });
          await updateManifestName(target, name);
          changed(req.repoId);
          return ok({ path: parent ? `${parent}/${name}` : name });
        } catch (error) {
          return failure(error instanceof Error ? error.message : String(error));
        }
      });
    },

    async newGroup(req: { repoId: string; parent: string; name: string }): Promise<GitOpResult<{ path: string }>> {
      const name = ModelLibraryNameSchema.safeParse(req.name);
      if (!name.success) return failure('Use a single folder name.');
      if (req.parent === '') {
        const made = await deps.createGroup(req.repoId, name.data);
        return made.ok ? ok({ path: name.data }) : made;
      }
      const root = await deps.rootFor(req.repoId);
      if (root === null) return failure('Group not found.');
      return queue.run(root, async () => {
        const parent = await locate(root, req.parent);
        if (!parent) return failure('Group not found.');
        const target = join(parent.abs, name.data);
        if (await exists(target)) return failure(`"${name.data}" already exists here.`);
        try {
          await mkdir(target);
        } catch (error) {
          return failure(error instanceof Error ? error.message : String(error));
        }
        changed(req.repoId);
        return ok({ path: `${req.parent}/${name.data}` });
      });
    },
  };

  // --- legacy sets (no folder): operate on the files sharing a stem -------------------------------

  async function legacyFiles(parentAbs: string, stem: string): Promise<string[]> {
    const names = await readdir(parentAbs).catch(() => [] as string[]);
    return names.filter((n) => !n.startsWith('.') && stemOf(n) === stem);
  }

  async function deleteLegacy(root: string, req: { repoId: string; path: string }): Promise<GitOpResult> {
    const parent = libraryParent(req.path);
    const parentAbs = parent ? ((await locate(root, parent))?.abs ?? null) : root;
    if (parentAbs === null) return failure('Not found.');
    const names = await legacyFiles(parentAbs, libraryBase(req.path));
    if (names.length === 0) return failure('Not found.');
    try {
      for (const name of names) await deps.trash(join(parentAbs, name));
    } catch (error) {
      return failure(error instanceof Error ? error.message : String(error));
    }
    changed(req.repoId);
    return ok();
  }

  async function duplicateLegacy(parentAbs: string, parent: string, stem: string, repoId: string): Promise<GitOpResult<{ path: string }>> {
    const names = await legacyFiles(parentAbs, stem);
    if (names.length === 0) return failure('Not found.');
    const copy = await uniqueName(parentAbs, `${stem}-copy`);
    for (const name of names) {
      await cp(join(parentAbs, name), join(parentAbs, name.replace(stem, copy)), { errorOnExist: true, force: false });
    }
    changed(repoId);
    return ok({ path: parent ? `${parent}/${copy}` : copy });
  }
}

export type ModelLibrary = ReturnType<typeof createModelLibrary>;

