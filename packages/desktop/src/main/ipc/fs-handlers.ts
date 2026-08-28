import { shell } from 'electron';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

import type { z } from 'zod';

import { checkIgnored, listFiles } from '@midnite/git-engine';
import {
  CHANNELS,
  FS_DIR_STATS_WALK_CAP,
  FS_TEXT_CAP_BYTES,
  schemas,
  type FsEntry,
} from '@midnite/git-shared';

import { confineToRoot, resolveScopeRoot } from '../fs-scope';
import { resolveWorkdir } from '../repo-registry';
import { handle } from './handle';

type ListResponse = z.infer<typeof schemas.FsListDirResponse>;
type ReadResponse = z.infer<typeof schemas.FsReadFileResponse>;
type DirStatsResponse = z.infer<typeof schemas.FsDirStatsResponse>;
type ShowItemResponse = z.infer<typeof schemas.ShowItemInFolderResponse>;
type ListFilesResponse = z.infer<typeof schemas.FsListFilesResponse>;

/** NUL anywhere in the first 8 KB marks a file binary — the classic sniff.
 *  Exported so `fs-write-handlers.ts` re-sniffs an overwrite target with the
 *  exact same threshold rather than a second tunable that can drift. */
export const SNIFF_BYTES = 8 * 1024;

/**
 * The read-only fs surface: listing, reading, a directory's blast-radius
 * stats, the Finder hand-off, and repository-wide file listing. None of these write.
 * Every path is confined by `confineToRoot` before any fs call touches it.
 */
export function registerFsHandlers(): void {
  handle<typeof schemas.FsListDirRequest, ListResponse>(
    CHANNELS.fsListDir,
    schemas.FsListDirRequest,
    (req) => listDir(req),
    (issue) => ({ ok: false, message: issue }),
  );

  handle<typeof schemas.FsReadFileRequest, ReadResponse>(
    CHANNELS.fsReadFile,
    schemas.FsReadFileRequest,
    (req) => readFileCapped(req),
    (issue) => ({ kind: 'error', message: issue }),
  );

  handle<typeof schemas.FsDirStatsRequest, DirStatsResponse>(
    CHANNELS.fsDirStats,
    schemas.FsDirStatsRequest,
    (req) => dirStats(req),
    (issue) => ({ ok: false, message: issue }),
  );

  handle<typeof schemas.ShowItemInFolderRequest, ShowItemResponse>(
    CHANNELS.shellShowItemInFolder,
    schemas.ShowItemInFolderRequest,
    (req) => showItemInFolder(req),
    (issue) => ({ ok: false, message: issue }),
  );

  handle<typeof schemas.FsListFilesRequest, ListFilesResponse>(
    CHANNELS.fsListFiles,
    schemas.FsListFilesRequest,
    (req) => listRepoFiles(req),
    (issue) => ({ ok: false, message: issue }),
  );
}

async function listDir(req: z.output<typeof schemas.FsListDirRequest>): Promise<ListResponse> {
  const root = await resolveScopeRoot(req);
  if (!root) return { ok: false, message: 'unknown scope root' };
  const dir = await confineToRoot(root, req.relPath);
  if (!dir) return { ok: false, message: 'path is outside the allowed root' };

  let dirents;
  try {
    dirents = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }

  const entries: FsEntry[] = await Promise.all(
    dirents.map(async (dirent) => {
      const kind = dirent.isSymbolicLink() ? 'symlink' : dirent.isDirectory() ? 'dir' : 'file';
      let size = 0;
      if (kind === 'file') {
        try {
          size = (await stat(join(dir, dirent.name))).size;
        } catch {
          // Raced a delete — a 0-byte row beats dropping the listing.
        }
      }
      return { name: dirent.name, kind, size, isIgnored: false };
    }),
  );

  // One batched check-ignore per listing; `~/.claude` is not a repo, so the
  // flag stays false there. The `.git` dir itself never appears in gitignore
  // but is noise in a file browser all the same — mark it so the tree dims it.
  if (req.scope === 'repo' && entries.length > 0) {
    const prefix = req.relPath.length > 0 ? `${req.relPath}/` : '';
    const ignored = await checkIgnored(
      root,
      entries.map((entry) => `${prefix}${entry.name}`),
    );
    for (const entry of entries) {
      entry.isIgnored = ignored.has(`${prefix}${entry.name}`) || entry.name === '.git';
    }
  }

  entries.sort((a, b) =>
    (a.kind === 'dir') === (b.kind === 'dir')
      ? a.name.localeCompare(b.name)
      : a.kind === 'dir'
        ? -1
        : 1,
  );
  return { ok: true, entries };
}

async function readFileCapped(
  req: z.output<typeof schemas.FsReadFileRequest>,
): Promise<ReadResponse> {
  const root = await resolveScopeRoot(req);
  if (!root) return { kind: 'error', message: 'unknown scope root' };
  const file = await confineToRoot(root, req.relPath);
  if (!file) return { kind: 'error', message: 'path is outside the allowed root' };

  try {
    const info = await stat(file);
    if (!info.isFile()) return { kind: 'error', message: 'not a file' };
    if (info.size > FS_TEXT_CAP_BYTES) return { kind: 'too-large', size: info.size };

    const bytes = await readFile(file);
    if (bytes.subarray(0, SNIFF_BYTES).includes(0)) return { kind: 'binary', size: info.size };
    return {
      kind: 'text',
      content: bytes.toString('utf8'),
      size: info.size,
      version: { mtimeMs: info.mtimeMs, size: info.size },
    };
  } catch (error) {
    return { kind: 'error', message: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Walk a confined directory counting files and bytes, for a delete confirm's
 * blast radius. A breadth-first queue rather than recursion so the cap check
 * can stop mid-walk without unwinding a call stack, and a single `readdir`
 * per directory rather than a second `stat` per entry — `Dirent` alone is
 * enough to keep or descend; only files need their size.
 */
async function dirStats(req: z.output<typeof schemas.FsDirStatsRequest>): Promise<DirStatsResponse> {
  const root = await resolveScopeRoot(req);
  if (!root) return { ok: false, message: 'unknown scope root' };
  const start = await confineToRoot(root, req.relPath);
  if (!start) return { ok: false, message: 'path is outside the allowed root' };

  let fileCount = 0;
  let totalBytes = 0;
  let truncated = false;
  const queue = [start];

  try {
    while (queue.length > 0 && !truncated) {
      const dir = queue.shift()!;
      const dirents = await readdir(dir, { withFileTypes: true });
      for (const dirent of dirents) {
        if (dirent.isDirectory()) {
          queue.push(join(dir, dirent.name));
          continue;
        }
        if (fileCount >= FS_DIR_STATS_WALK_CAP) {
          truncated = true;
          break;
        }
        fileCount += 1;
        if (dirent.isFile()) {
          try {
            totalBytes += (await stat(join(dir, dirent.name))).size;
          } catch {
            // Raced a delete of its own — a short-by-one byte count beats
            // dropping the whole walk over one entry.
          }
        }
      }
    }
    return { ok: true, fileCount, totalBytes, truncated };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

/** Reveal a confined path in the OS file manager. Read-only: nothing here mutates the target. */
async function showItemInFolder(
  req: z.output<typeof schemas.ShowItemInFolderRequest>,
): Promise<ShowItemResponse> {
  const root = await resolveScopeRoot(req);
  if (!root) return { ok: false, message: 'unknown scope root' };
  const target = await confineToRoot(root, req.relPath);
  if (!target) return { ok: false, message: 'path is outside the allowed root' };

  shell.showItemInFolder(target);
  return { ok: true };
}

/**
 * List all tracked and untracked files via `git ls-files` for the command palette (Phase 23 Theme G).
 */
async function listRepoFiles(
  req: z.output<typeof schemas.FsListFilesRequest>,
): Promise<ListFilesResponse> {
  const cwd = await resolveWorkdir(req.repoId, req.worktreePath);
  if (!cwd) return { ok: false, message: 'That repository is no longer open.' };

  const result = await listFiles(cwd);
  return {
    ok: true,
    files: result.files,
    truncated: result.truncated,
  };
}
