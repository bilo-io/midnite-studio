import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  failure,
  MSTUDIO_BLOB_MAX_BYTES,
  ok,
  type ConflictSide,
  type GitOpResult,
} from '@midnite/studio-shared';

import { readBlob } from './blob';
import { stagePaths } from './stage';

/**
 * Whole-file conflict resolution: accept one side for an entire unmerged
 * path, no partial state. The safe baseline `applyConflictHunk` (hunk-level)
 * builds past.
 */

const INDEX_STAGE: Record<ConflictSide, string> = { base: ':1', ours: ':2', theirs: ':3' };

/**
 * Accepts `side`'s content for `path` and stages it.
 *
 * Reads the blob straight off the requested index stage via `readBlob` —
 * never `HEAD` or a branch ref, since a resolution must use exactly what git
 * itself considers that side of *this* conflict, stage-1 `base` included when
 * one exists. `base` fails with a clear reason on an add/add conflict, which
 * has no common ancestor and so no stage 1 at all.
 *
 * `readBlob`, not a string-returning `git show`: it collects raw `Buffer`s
 * off `cat-file blob` rather than letting dugite decode stdout as a string,
 * which would mangle any byte outside the assumed encoding — the same class
 * of silent corruption Phase 48 found and fixed for CRLF endings, here one
 * step earlier in the pipeline.
 *
 * Not queued: reading a stage is not a git write, and writing the resolved
 * bytes to the worktree file is a plain fs write, not an index mutation —
 * `stagePaths` below is what actually touches `index.lock`, and it queues
 * itself. Wrapping this whole function in the write queue as well would
 * deadlock: `stagePaths`' own `writeQueue.run` would then be nested inside
 * an already-running task for the same repo key.
 */
export async function resolveConflictWholeFile(
  worktreePath: string,
  path: string,
  side: ConflictSide,
): Promise<GitOpResult> {
  const blob = await readBlob(worktreePath, INDEX_STAGE[side], path, {
    maxBytes: MSTUDIO_BLOB_MAX_BYTES,
  });
  if (!blob.ok) {
    return failure(
      blob.reason === 'too-large'
        ? `'${path}' is too large to resolve this way.`
        : `'${path}' has no ${side} version to accept.`,
    );
  }

  try {
    await writeFile(join(worktreePath, path), blob.bytes);
  } catch (error) {
    return failure(error instanceof Error ? error.message : `Could not write ${path}.`);
  }

  const staged = await stagePaths(worktreePath, [path]);
  if (!staged.ok) return staged;

  return ok();
}
