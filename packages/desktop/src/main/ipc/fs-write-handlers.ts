import { shell } from 'electron';
import { rename as renamePath } from 'node:fs/promises';
import type { z } from 'zod';

import { withFsActivity } from '@midnite/git-engine';
import { CHANNELS, FS_WRITE_CAP_BYTES, failure, ok, schemas, type GitOpResult } from '@midnite/git-shared';

import { resolveScopeRoot } from '../fs-scope';
import {
  confineParent,
  createDirectory,
  createFile,
  describeFsError,
  isSymlinkTarget,
  openForOverwrite,
  targetExists,
  targetPath,
} from '../fs-scope-write';
import { handleOp } from './handle';
import { SNIFF_BYTES } from './fs-handlers';

/**
 * The writable fs surface (Phase 24). Every path crosses `fs-scope-write.ts`'s
 * jail — never `confineToRoot`, which is the read path's and resolves through
 * symlinks on purpose. See that module for the bounds this file holds to.
 *
 * Deliberately outside `write-queue.ts`: that queue exists to serialise
 * writers racing on `index.lock`, and a plain file write never touches it —
 * an external editor saving the same file behaves exactly like this, no
 * queue involved. The consequence was the watcher's own write-echo problem;
 * Theme G closes it with `fs-activity.ts`, the same `onActivity` shape
 * `write-queue.ts` uses for git writes. Wrapped here at registration, one
 * choke point, rather than inside each handler — so `writeFile`/`create`/
 * `rename`/`deleteEntry` stay plain functions a unit test can call directly
 * with no activity tracker involved at all.
 */
export function registerFsWriteHandlers(): void {
  handleOp(CHANNELS.fsWriteFile, schemas.FsWriteFileRequest, (req) =>
    withFsActivity(req.repoId, () => writeFile(req)),
  );
  handleOp(CHANNELS.fsCreate, schemas.FsCreateRequest, (req) =>
    withFsActivity(req.repoId, () => create(req)),
  );
  handleOp(CHANNELS.fsRename, schemas.FsRenameRequest, (req) =>
    withFsActivity(req.repoId, () => rename(req)),
  );
  handleOp(CHANNELS.fsDelete, schemas.FsDeleteRequest, (req) =>
    withFsActivity(req.repoId, () => deleteEntry(req)),
  );
}

/** Exported for direct unit testing — `registerFsWriteHandlers` is main's own entry point. */
export async function writeFile(req: z.output<typeof schemas.FsWriteFileRequest>): Promise<GitOpResult> {
  const contentBytes = Buffer.byteLength(req.content, 'utf8');
  if (contentBytes > FS_WRITE_CAP_BYTES) return failure('the file is too large to write');

  const root = await resolveScopeRoot(req);
  if (!root) return failure('unknown scope root');
  const target = await confineParent(root, req.relPath);
  if (!target) return failure('path is outside the allowed root');
  if (await isSymlinkTarget(target)) return failure('refusing to write through a symlink');

  const handle = await openForOverwrite(target);
  if (!handle) return failure('the file does not exist or cannot be opened');

  try {
    const stat = await handle.stat();
    if (stat.mtimeMs !== req.expectedVersion.mtimeMs || stat.size !== req.expectedVersion.size) {
      return failure('the file changed on disk since it was last read', undefined, 'stale-write');
    }

    // Refuse to overwrite a file the renderer never actually loaded as text —
    // the version check alone cannot catch a file that always was binary.
    const sniffLen = Math.min(SNIFF_BYTES, stat.size);
    if (sniffLen > 0) {
      const sniff = Buffer.alloc(sniffLen);
      const { bytesRead } = await handle.read(sniff, 0, sniffLen, 0);
      if (sniff.subarray(0, bytesRead).includes(0)) {
        return failure('refusing to overwrite a binary file as text');
      }
    }

    await handle.truncate(0);
    await handle.write(Buffer.from(req.content, 'utf8'), 0, contentBytes, 0);
    return ok();
  } catch (error) {
    return failure(describeFsError(error));
  } finally {
    await handle.close();
  }
}

export async function create(req: z.output<typeof schemas.FsCreateRequest>): Promise<GitOpResult> {
  const root = await resolveScopeRoot(req);
  if (!root) return failure('unknown scope root');
  const target = await confineParent(root, req.relPath);
  if (!target) return failure('path is outside the allowed root');

  if (req.kind === 'directory') {
    const created = await createDirectory(target);
    return created ? ok() : failure('could not create the folder — it may already exist');
  }

  const handle = await createFile(target);
  if (!handle) return failure('a file already exists at that path');
  await handle.close();
  return ok();
}

export async function rename(req: z.output<typeof schemas.FsRenameRequest>): Promise<GitOpResult> {
  const root = await resolveScopeRoot(req);
  if (!root) return failure('unknown scope root');

  const from = await confineParent(root, req.fromRelPath);
  if (!from) return failure('source path is outside the allowed root');
  if (await isSymlinkTarget(from)) return failure('refusing to rename a symlink');

  const to = await confineParent(root, req.toRelPath);
  if (!to) return failure('destination path is outside the allowed root');
  if (await targetExists(to)) return failure('something already exists at the destination');

  try {
    await renamePath(targetPath(from), targetPath(to));
    return ok();
  } catch (error) {
    return failure(describeFsError(error));
  }
}

export async function deleteEntry(req: z.output<typeof schemas.FsDeleteRequest>): Promise<GitOpResult> {
  const root = await resolveScopeRoot(req);
  if (!root) return failure('unknown scope root');
  const target = await confineParent(root, req.relPath);
  if (!target) return failure('path is outside the allowed root');
  if (await isSymlinkTarget(target)) return failure('refusing to trash a symlink');
  if (!(await targetExists(target))) return failure('nothing exists at that path');

  try {
    await shell.trashItem(targetPath(target));
    return ok();
  } catch (error) {
    return failure(describeFsError(error));
  }
}
