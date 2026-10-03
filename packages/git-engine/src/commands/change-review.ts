import { copyFile, lstat, mkdir, readlink, rm, symlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import type { FileChangeKind, FileDiff, GitOpResult } from '@midnite/studio-shared';
import { failure, ok } from '@midnite/studio-shared';

import { execGit } from '../exec/git-exec';
import { writeQueue } from '../exec/write-queue';
import { parseUnifiedDiff } from '../parsers/diff-parser';
import { gitErrorLine } from './worktree-ops';

/**
 * Reviewable agent changes — the engine behind the Chats page's "accept or
 * reject" cards.
 *
 * **The mechanism: a throwaway snapshot, a captured diff, a patch back.**
 * An agent run is pointed at a copy of the repo (`createSnapshot`) that
 * includes the user's uncommitted and untracked state, committed once as a
 * baseline inside the copy's own private `.git`. When the turn ends,
 * `captureChanges` stages whatever the agent did there and reads it back as one
 * patch per file. Nothing reaches the real checkout until the user accepts:
 * `applyFilePatches` then applies exactly the accepted files — or exactly the
 * accepted hunks of a file — as a patch, through the per-repo write queue.
 *
 * Why a copy and not a linked worktree: `git worktree add` registers the
 * directory in the real repo's `.git/worktrees`, which would surface in the
 * app's own worktree list and in the user's `git worktree list`, and a
 * worktree starts from a commit, not from the working tree the user is looking
 * at. The copy is engine-agnostic (any CLI that edits files in its cwd works),
 * leaves the real repo's `.git` untouched, and its baseline is the working
 * tree *as the user has it*, so the captured diff is exactly the agent's own.
 *
 * It is a convenience boundary, not a security one: a command the agent runs
 * with an absolute path is not confined here.
 */

/** A snapshot larger than this is refused rather than silently filling the disk. */
export const SNAPSHOT_MAX_BYTES = 750 * 1024 * 1024;
/** One file larger than this is left out of the copy (it would only bloat every diff). */
export const SNAPSHOT_MAX_FILE_BYTES = 20 * 1024 * 1024;
/** A patch bigger than this (all files) is not offered for review. */
export const CHANGE_PATCH_MAX_BYTES = 8 * 1024 * 1024;

/**
 * Environment for every git call INSIDE a snapshot. The user's global config
 * would otherwise leak in — an LFS filter that is not installed in the copy, a
 * signing key, `core.autocrlf` rewriting bytes between the copy and the diff.
 */
const SNAPSHOT_ENV = {
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'Midnite Chats',
  GIT_AUTHOR_EMAIL: 'chats@midnite.invalid',
  GIT_COMMITTER_NAME: 'Midnite Chats',
  GIT_COMMITTER_EMAIL: 'chats@midnite.invalid',
} as const;

const snapshotGit = (dir: string, args: string[], stdin?: string) =>
  execGit(dir, args, { write: true, env: { ...SNAPSHOT_ENV }, ...(stdin === undefined ? {} : { stdin }) });

export type SnapshotInfo = { dir: string; fileCount: number; bytes: number };

/** A repo-relative path git could never have produced — never copy it. */
function unsafeRelPath(rel: string): boolean {
  return rel.length === 0 || rel.startsWith('/') || rel.split('/').includes('..');
}

/**
 * Copy the repo's working tree (tracked + untracked, minus ignored) into
 * `destDir` and commit it there as the baseline.
 *
 * `destDir` is emptied first, so a chat can reuse one stable path every turn —
 * which matters because agent CLIs key their own session store by directory,
 * and `--resume` only finds a session from the directory it was started in.
 */
export async function createSnapshot(
  repoPath: string,
  destDir: string,
  opts: { maxBytes?: number; maxFileBytes?: number } = {},
): Promise<GitOpResult<SnapshotInfo>> {
  const maxBytes = opts.maxBytes ?? SNAPSHOT_MAX_BYTES;
  const maxFileBytes = opts.maxFileBytes ?? SNAPSHOT_MAX_FILE_BYTES;

  const listed = await execGit(repoPath, ['ls-files', '-z', '--cached', '--others', '--exclude-standard']);
  if (listed.exitCode !== 0) {
    return failure(gitErrorLine(listed.stderr) || 'Could not list the repository files.', listed.stderr);
  }
  const paths = [...new Set(listed.stdout.split('\0').filter((p) => p.length > 0))].filter((p) => !unsafeRelPath(p));

  await rm(destDir, { recursive: true, force: true });
  await mkdir(destDir, { recursive: true });

  let bytes = 0;
  let fileCount = 0;
  for (const rel of paths) {
    const from = join(repoPath, rel);
    const to = join(destDir, rel);
    let info;
    try {
      info = await lstat(from);
    } catch {
      continue; // tracked but deleted in the working tree — absent from the baseline too
    }
    if (info.isDirectory()) continue; // a submodule's gitlink
    if (info.isFile() && info.size > maxFileBytes) continue;
    bytes += info.size;
    if (bytes > maxBytes) {
      await rm(destDir, { recursive: true, force: true });
      return failure('This repository is too large to run an editing chat on a copy of it.');
    }
    await mkdir(dirname(to), { recursive: true });
    if (info.isSymbolicLink()) await symlink(await readlink(from), to);
    else await copyFile(from, to);
    fileCount += 1;
  }

  const init = await snapshotGit(destDir, ['init', '--quiet', '--initial-branch=main']);
  if (init.exitCode !== 0) return failure(gitErrorLine(init.stderr) || 'Could not prepare the chat workspace.', init.stderr);
  for (const [key, value] of [
    ['core.autocrlf', 'false'],
    ['core.safecrlf', 'false'],
    ['core.hooksPath', '/dev/null'],
    ['commit.gpgsign', 'false'],
    ['core.quotepath', 'false'],
  ] as const) {
    await snapshotGit(destDir, ['config', key, value]);
  }
  // Ordinary add honours the copied .gitignore, so an artefact the agent writes
  // later (node_modules, dist) stays out of the captured diff. A file the user
  // TRACKS despite matching an ignore rule is forced into the baseline, or the
  // agent's edits to it would never be seen.
  const added = await snapshotGit(destDir, ['add', '-A']);
  if (added.exitCode !== 0) return failure(gitErrorLine(added.stderr) || 'Could not stage the chat workspace.', added.stderr);
  const tracked = await execGit(repoPath, ['ls-files', '-z', '--cached']);
  const copied = new Set(paths);
  const trackedHere = tracked.stdout.split('\0').filter((p) => p.length > 0 && copied.has(p));
  if (trackedHere.length > 0) {
    await snapshotGit(destDir, ['add', '-f', '--pathspec-from-file=-', '--pathspec-file-nul'], `${trackedHere.join('\0')}\0`);
  }
  const committed = await snapshotGit(destDir, ['commit', '--quiet', '--allow-empty', '--no-verify', '-m', 'snapshot']);
  if (committed.exitCode !== 0) {
    return failure(gitErrorLine(committed.stderr) || 'Could not commit the chat workspace.', committed.stderr);
  }
  return ok({ dir: destDir, fileCount, bytes });
}

/** Remove a snapshot directory. Never throws. */
export async function removeSnapshot(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true }).catch(() => undefined);
}

export type CapturedHunk = {
  /** The `@@ … @@ heading` line. */
  header: string;
  insertions: number;
  deletions: number;
  /** The hunk exactly as it appears in the patch, header line included. */
  text: string;
};

export type CapturedFile = {
  path: string;
  oldPath: string | null;
  change: FileChangeKind;
  binary: boolean;
  insertions: number;
  deletions: number;
  /** The whole per-file patch — what `splitFilePatch`/`applyFilePatches` consume. */
  patch: string;
  hunks: CapturedHunk[];
  /** Parsed for the renderer's diff viewer. */
  diff: FileDiff;
};

const STATUS_KIND: Record<string, FileChangeKind> = {
  A: 'added',
  D: 'deleted',
  M: 'modified',
  R: 'renamed',
  C: 'copied',
  T: 'type-changed',
};

/**
 * Split one file's patch into the header git needs to place it (`diff --git`,
 * mode lines, rename lines, `---`/`+++`, or a whole binary section) and its
 * hunks. A line starting `@@ ` can only open a hunk: every body line carries a
 * `+`, `-`, space or `\` marker, so file content can never be mistaken for one.
 */
export function splitFilePatch(patch: string): { header: string; hunks: string[] } {
  const lines = patch.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  const starts: number[] = [];
  lines.forEach((line, i) => {
    if (line.startsWith('@@ ')) starts.push(i);
  });
  if (starts.length === 0) return { header: `${lines.join('\n')}\n`, hunks: [] };
  const header = `${lines.slice(0, starts[0]).join('\n')}\n`;
  const hunks = starts.map((start, n) => `${lines.slice(start, starts[n + 1] ?? lines.length).join('\n')}\n`);
  return { header, hunks };
}

/** The inverse of {@link splitFilePatch}, for a chosen subset of hunks (in their original order). */
export function buildFilePatch(header: string, hunks: readonly string[]): string {
  return header + hunks.join('');
}

function countLines(hunk: string): { insertions: number; deletions: number } {
  let insertions = 0;
  let deletions = 0;
  for (const line of hunk.split('\n').slice(1)) {
    if (line.startsWith('+')) insertions += 1;
    else if (line.startsWith('-')) deletions += 1;
  }
  return { insertions, deletions };
}

/**
 * Everything the agent changed in a snapshot, one {@link CapturedFile} per
 * path. Returns `[]` when it changed nothing. Rename detection is on (`-M`),
 * and `--binary` keeps a binary file applyable rather than "differ".
 */
export async function captureChanges(snapshotDir: string): Promise<GitOpResult<CapturedFile[]>> {
  const staged = await snapshotGit(snapshotDir, ['add', '-A']);
  if (staged.exitCode !== 0) return failure(gitErrorLine(staged.stderr) || 'Could not read the changes.', staged.stderr);

  const names = await snapshotGit(snapshotDir, ['diff', '--cached', '--name-status', '-z', '-M', '--no-color', 'HEAD']);
  if (names.exitCode !== 0) return failure(gitErrorLine(names.stderr) || 'Could not read the changes.', names.stderr);

  const tokens = names.stdout.split('\0');
  const entries: { status: string; path: string; oldPath: string | null }[] = [];
  for (let i = 0; i < tokens.length; ) {
    const status = tokens[i] ?? '';
    if (status === '') break;
    const kind = status[0]!;
    if (kind === 'R' || kind === 'C') {
      entries.push({ status: kind, oldPath: tokens[i + 1] ?? null, path: tokens[i + 2] ?? '' });
      i += 3;
    } else {
      entries.push({ status: kind, oldPath: null, path: tokens[i + 1] ?? '' });
      i += 2;
    }
  }

  const files: CapturedFile[] = [];
  let total = 0;
  for (const entry of entries) {
    if (entry.path === '') continue;
    const pathspec = entry.oldPath ? ['--', entry.oldPath, entry.path] : ['--', entry.path];
    const res = await execGit(snapshotDir, [
      '--literal-pathspecs',
      'diff',
      '--cached',
      '--binary',
      '-M',
      '--no-color',
      '--no-ext-diff',
      '-U3',
      'HEAD',
      ...pathspec,
    ], { env: { ...SNAPSHOT_ENV } });
    if (res.exitCode !== 0 || res.stdout.length === 0) continue;
    total += res.stdout.length;
    if (total > CHANGE_PATCH_MAX_BYTES) {
      return failure('The changes are too large to review here.');
    }

    const patch = res.stdout.endsWith('\n') ? res.stdout : `${res.stdout}\n`;
    const diff = parseUnifiedDiff(patch, { contextLines: 3, fallbackPath: entry.path, maxLines: 50_000 });
    const { header, hunks: rawHunks } = splitFilePatch(patch);
    void header;
    const hunks: CapturedHunk[] = rawHunks.map((text) => ({
      header: text.slice(0, text.indexOf('\n')),
      ...countLines(text),
      text,
    }));
    files.push({
      path: entry.path,
      oldPath: entry.oldPath,
      change: STATUS_KIND[entry.status] ?? diff.change,
      binary: diff.binary || /^GIT binary patch$/m.test(patch),
      insertions: hunks.reduce((n, h) => n + h.insertions, 0),
      deletions: hunks.reduce((n, h) => n + h.deletions, 0),
      patch,
      hunks,
      diff,
    });
  }
  return ok(files);
}

export type FilePatchOutcome = { path: string; ok: true } | { path: string; ok: false; reason: string };

/**
 * Apply per-file patches to the real checkout, each in its own `git apply` so
 * one file that no longer fits does not take the others down with it. A single
 * invocation is atomic: a patch that fails leaves its file untouched.
 *
 * Runs through the per-repo write queue like every other git write. The
 * worktree is changed and the index is NOT — an accepted change is an ordinary
 * unstaged edit, exactly as if the user had made it.
 */
export async function applyFilePatches(
  repoPath: string,
  patches: readonly { path: string; patch: string }[],
): Promise<FilePatchOutcome[]> {
  return writeQueue.run(repoPath, async () => {
    const outcomes: FilePatchOutcome[] = [];
    for (const { path, patch } of patches) {
      const res = await execGit(
        repoPath,
        ['apply', '--recount', '--whitespace=nowarn', '-'],
        { write: true, stdin: patch.endsWith('\n') ? patch : `${patch}\n` },
      );
      if (res.exitCode === 0) outcomes.push({ path, ok: true });
      else outcomes.push({ path, ok: false, reason: describeApplyFailure(res.stderr) });
    }
    return outcomes;
  });
}

/** "error: patch failed: a.txt:12" → a sentence a person can act on. */
function describeApplyFailure(stderr: string): string {
  const lines = stderr
    .split('\n')
    .map((l) => l.replace(/^error:\s*/, '').trim())
    .filter((l) => l.length > 0);
  const already = lines.find((l) => /already exists in working directory/.test(l));
  if (already) return 'That file already exists in your working tree.';
  const missing = lines.find((l) => /No such file|does not exist in index|No such file or directory/.test(l));
  if (missing) return 'That file is no longer in your working tree.';
  const failed = lines.find((l) => /patch failed|does not apply|patch does not apply/.test(l));
  if (failed) return 'Your working tree changed since this edit was made, so it no longer applies.';
  return lines[0] ?? 'The change could not be applied.';
}
