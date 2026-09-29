import { constants as fsConstants, type Dirent } from 'node:fs';
import { lstat, mkdir, open, readdir, readFile, realpath, rename, stat } from 'node:fs/promises';
import { join, sep } from 'node:path';

import { WriteQueue } from '@midnite/studio-git-engine';
import {
  failure,
  MEDIA_LARGE_FILE_BYTES,
  MEDIA_ROOT_DIR,
  ok,
  type GitOpResult,
  type MediaFileEntry,
  type MediaProject,
  type MediaTab,
} from '@midnite/studio-shared';

import { confineToRoot, joinWithin } from '../fs-scope';

/**
 * The repo-scoped media store (Phase 99 Theme A): projects and files under
 * `<repo>/.midnite/media/<tab>/<project>/`. Plain files, tracked by git — this
 * module never writes a `.gitignore`.
 *
 * The jail, stated once:
 * - every renderer path is joined under the tab root with `joinWithin`, so
 *   `..`, absolute paths and NUL bytes never leave it;
 * - reads go through `confineToRoot`, so a symlink pointing out resolves to
 *   `null` and is refused;
 * - writes build their directory chain one segment at a time and refuse any
 *   segment that is a symlink — including `.midnite`, `.midnite/media` and the
 *   tab root themselves — so nothing is ever created *through* a link, and the
 *   final file opens with `O_NOFOLLOW`;
 * - every write runs through a per-root `WriteQueue`, so two writers on one
 *   tab root never interleave.
 *
 * Every op answers a `GitOpResult`; nothing throws across IPC.
 */

export type MediaStoreDeps = {
  /** `repoId` → the repo's main worktree path, or `null` if it is not open. */
  resolveRepo: (repoId: string) => Promise<string | null>;
  /** Move a path to the OS Trash (`shell.trashItem` in production). */
  trash: (absPath: string) => Promise<void>;
  /** Called after every successful write so the watcher-less path still pings. */
  onChanged?: (repoId: string, tab: MediaTab) => void;
};

/** Stop a pathological tree from turning one listing into a full-disk walk. */
const MAX_LISTED_FILES = 5000;

type Scope = { repoId: string; tab: MediaTab };
/** Why a tab root did not resolve; `missing` = it simply does not exist yet. */
type Miss = { message: string; missing: boolean };

const within = (parent: string, child: string): boolean =>
  child === parent || child.startsWith(parent + sep);

/** `<repo>/.midnite/media/<tab>`, as segments relative to the repo. */
const rootSegments = (tab: MediaTab): string[] => [...MEDIA_ROOT_DIR.split('/'), tab];

export function createMediaStore(deps: MediaStoreDeps) {
  const queue = new WriteQueue();

  /**
   * Walk `segments` below `base` (already real), creating missing directories
   * when `create` is set and refusing any segment that exists as anything but
   * a real directory. Returns the final real directory, or `null`.
   */
  async function dirChain(base: string, segments: string[], create: boolean): Promise<string | null> {
    let dir = base;
    for (const segment of segments) {
      if (segment === '' || segment === '.' || segment === '..' || segment.includes('\0')) return null;
      const next = join(dir, segment);
      try {
        const info = await lstat(next);
        if (info.isSymbolicLink() || !info.isDirectory()) return null;
      } catch {
        if (!create) return null;
        try {
          await mkdir(next);
        } catch {
          return null;
        }
      }
      dir = next;
    }
    return dir;
  }

  /** The real repo path and tab root; `create` makes the root on first write. */
  async function tabRoot(scope: Scope, create: boolean): Promise<string | Miss> {
    const repoPath = await deps.resolveRepo(scope.repoId);
    if (!repoPath) return { message: 'Repository is not open.', missing: false };
    let repoReal: string;
    try {
      repoReal = await realpath(repoPath);
    } catch {
      return { message: 'Repository path is unavailable.', missing: false };
    }
    const root = await dirChain(repoReal, rootSegments(scope.tab), create);
    if (root === null) return { message: 'Media folder is not available.', missing: !create };
    return root;
  }

  const isResult = (value: string | Miss): value is Miss => typeof value !== 'string';

  async function countFiles(dir: string, budget = { left: MAX_LISTED_FILES }): Promise<MediaFileEntry[]> {
    const out: MediaFileEntry[] = [];
    async function walk(abs: string, rel: string): Promise<void> {
      let entries: Dirent[];
      try {
        entries = await readdir(abs, { withFileTypes: true });
      } catch {
        return;
      }
      entries.sort((a, b) => a.name.localeCompare(b.name));
      for (const entry of entries) {
        if (budget.left <= 0) return;
        if (entry.isSymbolicLink()) continue;
        const childAbs = join(abs, entry.name);
        const childRel = rel ? `${rel}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          await walk(childAbs, childRel);
        } else if (entry.isFile()) {
          try {
            const info = await stat(childAbs);
            out.push({ path: childRel, size: info.size, mtimeMs: info.mtimeMs });
            budget.left -= 1;
          } catch {
            // raced away — skip
          }
        }
      }
    }
    await walk(dir, '');
    return out;
  }

  async function projectDir(root: string, project: string): Promise<string | null> {
    return dirChain(root, [project], false);
  }

  const changed = (scope: Scope): void => deps.onChanged?.(scope.repoId, scope.tab);

  return {
    /** Resolve (without creating) a tab's root — for the watcher and Reveal. */
    async rootFor(scope: Scope): Promise<string | null> {
      const root = await tabRoot(scope, false);
      return isResult(root) ? null : root;
    },

    async listProjects(scope: Scope): Promise<GitOpResult<MediaProject[]>> {
      const root = await tabRoot(scope, false);
      if (isResult(root)) {
        return root.missing ? ok<MediaProject[]>([]) : failure(root.message);
      }
      let entries: Dirent[];
      try {
        entries = await readdir(root, { withFileTypes: true });
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
      const projects: MediaProject[] = [];
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
        const dir = join(root, entry.name);
        const files = await countFiles(dir);
        const info = await stat(dir);
        projects.push({ name: entry.name, fileCount: files.length, mtimeMs: info.mtimeMs });
      }
      projects.sort((a, b) => a.name.localeCompare(b.name));
      return ok(projects);
    },

    async createProject(scope: Scope & { project: string }): Promise<GitOpResult<MediaProject>> {
      const root = await tabRoot(scope, true);
      if (isResult(root)) return failure(root.message);
      return queue.run(root, async () => {
        const target = joinWithin(root, scope.project);
        if (target === null) return failure('Invalid project name.');
        try {
          await mkdir(target);
        } catch {
          return failure(`A project named "${scope.project}" already exists.`);
        }
        const info = await stat(target);
        changed(scope);
        return ok<MediaProject>({ name: scope.project, fileCount: 0, mtimeMs: info.mtimeMs });
      });
    },

    async renameProject(scope: Scope & { project: string; to: string }): Promise<GitOpResult> {
      const root = await tabRoot(scope, false);
      if (isResult(root)) return failure('Project not found.');
      return queue.run(root, async () => {
        const from = await projectDir(root, scope.project);
        const to = joinWithin(root, scope.to);
        if (from === null) return failure('Project not found.');
        if (to === null) return failure('Invalid project name.');
        if (await exists(to)) return failure(`A project named "${scope.to}" already exists.`);
        await rename(from, to);
        changed(scope);
        return ok();
      });
    },

    async removeProject(scope: Scope & { project: string }): Promise<GitOpResult> {
      const root = await tabRoot(scope, false);
      if (isResult(root)) return failure('Project not found.');
      return queue.run(root, async () => {
        const dir = await projectDir(root, scope.project);
        if (dir === null) return failure('Project not found.');
        await deps.trash(dir);
        changed(scope);
        return ok();
      });
    },

    async listFiles(scope: Scope & { project: string }): Promise<GitOpResult<MediaFileEntry[]>> {
      const root = await tabRoot(scope, false);
      if (isResult(root)) return failure('Project not found.');
      const dir = await projectDir(root, scope.project);
      if (dir === null) return failure('Project not found.');
      return ok(await countFiles(dir));
    },

    async readFile(
      scope: Scope & { project: string; path: string; encoding: 'utf8' | 'base64' },
    ): Promise<GitOpResult<string>> {
      const root = await tabRoot(scope, false);
      if (isResult(root)) return failure('File not found.');
      const target = await confineToRoot(root, `${scope.project}/${scope.path}`);
      if (target === null) return failure('File not found.');
      try {
        return ok(await readFile(target, scope.encoding));
      } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
      }
    },

    async writeFile(
      scope: Scope & { project: string; path: string; content: string; encoding: 'utf8' | 'base64' },
    ): Promise<GitOpResult<{ size: number; largeFile: boolean }>> {
      const root = await tabRoot(scope, true);
      if (isResult(root)) return failure(root.message);
      return queue.run(root, async () => {
        const segments = scope.path.split('/');
        const name = segments.pop() ?? '';
        const dir = await dirChain(root, [scope.project, ...segments], true);
        if (dir === null || !name || name === '.' || name === '..') return failure('Path is not allowed.');
        const realDir = await realpath(dir);
        if (!within(await realpath(root), realDir)) return failure('Path is not allowed.');
        const data = Buffer.from(scope.content, scope.encoding);
        let handle;
        try {
          handle = await open(
            join(realDir, name),
            fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_TRUNC | fsConstants.O_NOFOLLOW,
          );
        } catch {
          return failure('Path is not allowed.');
        }
        try {
          await handle.writeFile(data);
        } finally {
          await handle.close();
        }
        changed(scope);
        return ok({ size: data.length, largeFile: data.length > MEDIA_LARGE_FILE_BYTES });
      });
    },

    async renameFile(scope: Scope & { project: string; path: string; to: string }): Promise<GitOpResult> {
      const root = await tabRoot(scope, false);
      if (isResult(root)) return failure('File not found.');
      return queue.run(root, async () => {
        const from = await confineToRoot(root, `${scope.project}/${scope.path}`);
        if (from === null) return failure('File not found.');
        const segments = scope.to.split('/');
        const name = segments.pop() ?? '';
        const dir = await dirChain(root, [scope.project, ...segments], true);
        if (dir === null || !name) return failure('Path is not allowed.');
        const to = join(dir, name);
        if (await exists(to)) return failure(`"${scope.to}" already exists.`);
        await rename(from, to);
        changed(scope);
        return ok();
      });
    },

    async removeFile(scope: Scope & { project: string; path: string }): Promise<GitOpResult> {
      const root = await tabRoot(scope, false);
      if (isResult(root)) return failure('File not found.');
      return queue.run(root, async () => {
        const target = await confineToRoot(root, `${scope.project}/${scope.path}`);
        if (target === null) return failure('File not found.');
        await deps.trash(target);
        changed(scope);
        return ok();
      });
    },

    /** The absolute path Reveal hands to `shell.showItemInFolder`, confined like a read. */
    async resolveForReveal(scope: Scope & { project: string; path?: string }): Promise<string | null> {
      const root = await tabRoot(scope, false);
      if (isResult(root)) return null;
      return confineToRoot(root, scope.path ? `${scope.project}/${scope.path}` : scope.project);
    },

    /** Resolve a media file for the export service — a read, so the read jail. */
    async resolveForRead(scope: Scope & { project: string; path: string }): Promise<string | null> {
      const root = await tabRoot(scope, false);
      if (isResult(root)) return null;
      return confineToRoot(root, `${scope.project}/${scope.path}`);
    },
  };
}

export type MediaStore = ReturnType<typeof createMediaStore>;

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch {
    return false;
  }
}
