import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

import type { z } from 'zod';

import { checkIgnored } from '@midnite/git-engine';
import { CHANNELS, FS_TEXT_CAP_BYTES, schemas, type FsEntry } from '@midnite/git-shared';

import { confineToRoot, resolveScopeRoot } from '../fs-scope';
import { handle } from './handle';

type ListResponse = z.infer<typeof schemas.FsListDirResponse>;
type ReadResponse = z.infer<typeof schemas.FsReadFileResponse>;

/** NUL anywhere in the first 8 KB marks a file binary — the classic sniff. */
const SNIFF_BYTES = 8 * 1024;

/**
 * The read-only fs surface. Two invokes, no writes — see shared/src/fs.ts for
 * why the absence of write channels is the point. Every path is confined by
 * `confineToRoot` before any fs call touches it.
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
    return { kind: 'text', content: bytes.toString('utf8'), size: info.size };
  } catch (error) {
    return { kind: 'error', message: error instanceof Error ? error.message : String(error) };
  }
}
