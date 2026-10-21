import { constants as fsConstants } from 'node:fs';
import { lstat, open, readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, normalize, sep } from 'node:path';

import { WORKFLOW_FILE_MAX_BYTES } from '@midnite/studio-shared';

import type { NodeExecutor, NodeOutcome } from '../executor-registry';
import { interpolate } from '../interpolate';

/**
 * `read-file` and `write-file`. Workflows are global, not repo-scoped, so
 * there is no root to confine a path to the way `fs-scope-write.ts` confines
 * the file tree's writes — a path here must be absolute (or `~/…`). The rules
 * that do carry over are the ones that are about the path itself rather than
 * a root: no `.git` segment anywhere, the parent must already exist (no
 * `mkdir -p` nobody asked for), and a write never follows a symlink — the
 * final open is `O_NOFOLLOW`, so a link swapped in after the check is refused
 * by the open itself.
 *
 * `write-file` always declares the `write-files` action
 * (`nodeDeclaredActions`), so a `policy` node upstream governs it — denies it
 * outright, or pauses the run for approval — before this code ever runs.
 */

export type FileExecutorDeps = { home?: () => string };

type ResolvedPath = { ok: true; path: string } | { ok: false; error: string };

export function resolveWorkflowPath(raw: string, home: string): ResolvedPath {
  const trimmed = raw.trim();
  if (trimmed === '') return { ok: false, error: 'This step has no path.' };
  const expanded = trimmed === '~' ? home : trimmed.startsWith('~/') ? join(home, trimmed.slice(2)) : trimmed;
  if (!isAbsolute(expanded)) {
    return { ok: false, error: `"${trimmed}" is not an absolute path — workflows have no folder of their own to resolve it against.` };
  }
  const path = normalize(expanded);
  if (path.split(sep).includes('.git')) return { ok: false, error: 'Paths inside a .git directory are off limits.' };
  return { ok: true, path };
}

function fsError(err: unknown, path: string): string {
  const code = (err as NodeJS.ErrnoException | undefined)?.code;
  if (code === 'ENOENT') return `${path} does not exist.`;
  if (code === 'EACCES' || code === 'EPERM') return `Permission denied: ${path}.`;
  if (code === 'ELOOP') return `${path} is a symlink — not written through.`;
  if (code === 'EISDIR') return `${path} is a directory.`;
  return `Could not access ${path}: ${err instanceof Error ? err.message : String(err)}`;
}

export function createReadFileExecutor(deps: FileExecutorDeps = {}): NodeExecutor {
  return async (node, context): Promise<NodeOutcome> => {
    if (node.kind !== 'read-file') return { ok: false, error: 'Not a read-file node.' };
    const raw = interpolate(node.config.path, context.upstream);
    if (!raw.ok) return raw;
    const resolved = resolveWorkflowPath(raw.value, (deps.home ?? homedir)());
    if (!resolved.ok) return resolved;
    const { path } = resolved;

    try {
      const info = await stat(path);
      if (!info.isFile()) return { ok: false, error: `${path} is not a file.` };
      if (info.size > WORKFLOW_FILE_MAX_BYTES) {
        return { ok: false, error: `${path} is ${info.size} bytes — over the ${WORKFLOW_FILE_MAX_BYTES}-byte limit.` };
      }
      const text = await readFile(path, 'utf8');
      if (node.config.format === 'text') return { ok: true, output: { path, text, bytes: info.size } };
      try {
        return { ok: true, output: { path, json: JSON.parse(text) as unknown, bytes: info.size } };
      } catch {
        return { ok: false, error: `${path} is not valid JSON.` };
      }
    } catch (err) {
      return { ok: false, error: fsError(err, path) };
    }
  };
}

export function createWriteFileExecutor(deps: FileExecutorDeps = {}): NodeExecutor {
  return async (node, context): Promise<NodeOutcome> => {
    if (node.kind !== 'write-file') return { ok: false, error: 'Not a write-file node.' };
    const raw = interpolate(node.config.path, context.upstream);
    if (!raw.ok) return raw;
    const resolved = resolveWorkflowPath(raw.value, (deps.home ?? homedir)());
    if (!resolved.ok) return resolved;
    const { path } = resolved;

    const content = interpolate(node.config.content, context.upstream);
    if (!content.ok) return content;
    const bytes = Buffer.byteLength(content.value, 'utf8');
    if (bytes > WORKFLOW_FILE_MAX_BYTES) {
      return { ok: false, error: `The content is ${bytes} bytes — over the ${WORKFLOW_FILE_MAX_BYTES}-byte limit.` };
    }

    try {
      const parent = await stat(dirname(path)).catch(() => null);
      if (!parent?.isDirectory()) return { ok: false, error: `${dirname(path)} does not exist — create the folder first.` };
      const existing = await lstat(path).catch(() => null);
      if (existing?.isSymbolicLink()) return { ok: false, error: `${path} is a symlink — not written through.` };
      if (existing && !existing.isFile()) return { ok: false, error: `${path} is not a regular file.` };

      const flags =
        fsConstants.O_WRONLY |
        fsConstants.O_CREAT |
        fsConstants.O_NOFOLLOW |
        (node.config.mode === 'append' ? fsConstants.O_APPEND : fsConstants.O_TRUNC);
      const handle = await open(path, flags, 0o644);
      try {
        await handle.writeFile(content.value, 'utf8');
      } finally {
        await handle.close();
      }
      return { ok: true, output: { path, bytes, mode: node.config.mode } };
    } catch (err) {
      return { ok: false, error: fsError(err, path) };
    }
  };
}

export const readFileExecutor = createReadFileExecutor();
export const writeFileExecutor = createWriteFileExecutor();
