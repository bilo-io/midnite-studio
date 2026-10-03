import { randomUUID } from 'node:crypto';
import { copyFile, lstat, mkdir, readlink, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import type { FileChangeKind, FileDiff, GitOpResult } from '@midnite/studio-shared';
import { failure, ok } from '@midnite/studio-shared';

import { execGit } from '../exec/git-exec';
import { writeQueue } from '../exec/write-queue';
import { parseUnifiedDiff } from '../parsers/diff-parser';
import { deleteBranch } from './refs-ops';
import { addWorktree, gitErrorLine, removeWorktree } from './worktree-ops';

/**
 * Reviewable agent changes — the engine behind the Chats page's "accept or
 * reject" cards.
 *
 * **The mechanism: a linked worktree, a per-turn tree diff, a patch back.**
 * An editing chat runs its agent in a real `git worktree` of the repo, on its
 * own branch (`createAgentWorktree`), created on the chat's first editing turn
 * and kept for the life of the chat. Because it is an ordinary linked
 * worktree it shows up everywhere a worktree does — the graph, the worktree
 * list, `git worktree list` — and its branch is something the user can keep
 * working on like any other. The new worktree is seeded with the checkout's
 * uncommitted and untracked state, so the agent starts from the working tree
 * the user is looking at, not merely from HEAD.
 *
 * Each turn is bracketed by `snapshotTree`: the worktree's full state —
 * commits the agent made, staged and unstaged edits, new untracked files — is
 * written as a tree object through a throwaway index, never the worktree's own,
 * so taking it changes nothing the user or the agent can see. `captureChanges`
 * diffs the tree from the turn's start against the tree at its end and reads it
 * back as one patch per file. Nothing reaches the user's checkout until they
 * accept: `applyFilePatches` then applies exactly the accepted files — or
 * exactly the accepted hunks of a file — as a patch, through the per-repo
 * write queue.
 *
 * (This replaced a private copy of the repo with its own `.git`, rebuilt and
 * deleted every turn. That kept the user's repo untouched, but it also made
 * an agent's work invisible to the graph and impossible to continue as a
 * branch, which is the thing the user actually wanted from it.)
 *
 * It is a convenience boundary, not a security one: a command the agent runs
 * with an absolute path is not confined here.
 */

/** One file larger than this is not copied into a new worktree's seed. */
export const SEED_MAX_FILE_BYTES = 20 * 1024 * 1024;
/** A tracked-changes diff larger than this is not carried into a new worktree. */
export const SEED_MAX_PATCH_BYTES = 64 * 1024 * 1024;
/** A patch bigger than this (all files) is not offered for review. */
export const CHANGE_PATCH_MAX_BYTES = 8 * 1024 * 1024;

export type AgentWorktree = { path: string; branch: string };

/** A repo-relative path git could never have produced — never copy it. */
function unsafeRelPath(rel: string): boolean {
  return rel.length === 0 || rel.startsWith('/') || rel.split('/').includes('..');
}

/**
 * Create a linked worktree at `path` on a NEW branch `branch`, started at the
 * checkout's HEAD, then seed it with the checkout's uncommitted state.
 *
 * Seeding is best-effort: `seeded: false` means the worktree is usable but
 * holds only HEAD (the tracked changes did not apply, or were too large).
 */
export async function createAgentWorktree(
  repoPath: string,
  worktree: AgentWorktree,
  opts: { maxFileBytes?: number } = {},
): Promise<GitOpResult<AgentWorktree & { seeded: boolean }>> {
  const head = await execGit(repoPath, ['rev-parse', '--verify', '--quiet', 'HEAD^{commit}']);
  if (head.exitCode !== 0) return failure('This repository has no commits yet, so a chat cannot branch from it.');

  await mkdir(dirname(worktree.path), { recursive: true });
  const added = await addWorktree(repoPath, { path: worktree.path, branch: worktree.branch, createBranch: true, startPoint: 'HEAD' });
  if (!added.ok) return added;
  const seeded = await seedFromCheckout(repoPath, worktree.path, opts.maxFileBytes ?? SEED_MAX_FILE_BYTES);
  return ok({ ...worktree, seeded });
}

/**
 * Put an existing branch back into a worktree at `path` — the chat's worktree
 * directory was removed (from the graph, or by hand) but its branch survives.
 */
export async function reattachAgentWorktree(repoPath: string, worktree: AgentWorktree): Promise<GitOpResult<AgentWorktree>> {
  // A directory deleted by hand leaves git's registration behind, which
  // would make `worktree add` refuse the same path.
  await writeQueue.run(repoPath, () => execGit(repoPath, ['worktree', 'prune'], { write: true }));
  await mkdir(dirname(worktree.path), { recursive: true });
  const added = await addWorktree(repoPath, { path: worktree.path, branch: worktree.branch, createBranch: false });
  return added.ok ? ok(worktree) : added;
}

/** Whether `branch` still exists in the repo. */
export async function branchExists(repoPath: string, branch: string): Promise<boolean> {
  const res = await execGit(repoPath, ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}^{commit}`]);
  return res.exitCode === 0;
}

/**
 * Remove a chat's worktree and, if nothing would be lost, its branch.
 *
 * The directory goes with `--force`: uncommitted edits in it are discarded
 * (the caller has confirmed that). The branch is only ever deleted with a
 * plain `branch -d`, so one carrying commits that are not merged anywhere is
 * kept — no commit is ever orphaned — and `branchKept` says so.
 */
export async function removeAgentWorktree(
  repoPath: string,
  worktree: AgentWorktree,
): Promise<GitOpResult<{ branchKept: boolean }>> {
  const removed = await removeWorktree(repoPath, worktree.path, true);
  if (!removed.ok) {
    // Already gone from disk: drop git's stale registration instead.
    await writeQueue.run(repoPath, () => execGit(repoPath, ['worktree', 'prune'], { write: true }));
    await rm(worktree.path, { recursive: true, force: true }).catch(() => undefined);
  }
  if (!(await branchExists(repoPath, worktree.branch))) return ok({ branchKept: false });
  const deleted = await deleteBranch(repoPath, { name: worktree.branch, force: false });
  return ok({ branchKept: !deleted.ok });
}

/**
 * Carry the checkout's uncommitted state into a fresh worktree: tracked
 * changes as one patch, untracked (not ignored) files as copies.
 */
async function seedFromCheckout(repoPath: string, worktreePath: string, maxFileBytes: number): Promise<boolean> {
  return writeQueue.run(worktreePath, async () => {
    let seeded = true;
    const diff = await execGit(repoPath, ['diff', 'HEAD', '--binary', '--no-color', '--no-ext-diff']);
    if (diff.exitCode !== 0 || diff.stdout.length > SEED_MAX_PATCH_BYTES) seeded = false;
    else if (diff.stdout.length > 0) {
      const applied = await execGit(worktreePath, ['apply', '--whitespace=nowarn', '-'], { write: true, stdin: diff.stdout });
      if (applied.exitCode !== 0) seeded = false;
    }

    const listed = await execGit(repoPath, ['ls-files', '-z', '--others', '--exclude-standard']);
    if (listed.exitCode !== 0) return false;
    for (const rel of listed.stdout.split('\0')) {
      if (unsafeRelPath(rel)) continue;
      const from = join(repoPath, rel);
      const to = join(worktreePath, rel);
      try {
        const info = await lstat(from);
        if (info.isDirectory()) continue; // a nested repo
        if (info.isFile() && info.size > maxFileBytes) continue;
        await mkdir(dirname(to), { recursive: true });
        if (info.isSymbolicLink()) await symlink(await readlink(from), to);
        else await copyFile(from, to);
      } catch {
        seeded = false;
      }
    }
    return seeded;
  });
}

/**
 * The worktree's whole state — HEAD plus every staged, unstaged and untracked
 * (not ignored) change — as a tree object id.
 *
 * Built in a throwaway copy of the worktree's index, so the real index, HEAD
 * and files are exactly as they were. Copying the index (rather than starting
 * empty) keeps the stat cache, so only changed files are re-hashed, and keeps a
 * file the user tracks despite an ignore rule in the tree.
 */
export async function snapshotTree(dir: string): Promise<GitOpResult<string>> {
  return writeQueue.run(dir, async () => {
    const located = await execGit(dir, ['rev-parse', '--git-path', 'index']);
    if (located.exitCode !== 0) return failure(gitErrorLine(located.stderr) || 'Not a git worktree.', located.stderr);
    const realIndex = resolve(dir, located.stdout.trim());
    const tempIndex = join(tmpdir(), `midnite-chat-index-${randomUUID()}`);
    try {
      const env = { GIT_INDEX_FILE: tempIndex };
      await copyFile(realIndex, tempIndex).catch(() => undefined);
      let added = await execGit(dir, ['add', '-A'], { write: true, env });
      if (added.exitCode !== 0) {
        // A copied index can be unreadable on its own (a split index keeps its
        // shared half beside the original). Start from HEAD instead: slower, same tree.
        await rm(tempIndex, { force: true });
        await execGit(dir, ['read-tree', 'HEAD'], { write: true, env });
        added = await execGit(dir, ['add', '-A'], { write: true, env });
      }
      if (added.exitCode !== 0) return failure(gitErrorLine(added.stderr) || 'Could not read the worktree.', added.stderr);
      const tree = await execGit(dir, ['write-tree'], { write: true, env });
      if (tree.exitCode !== 0) return failure(gitErrorLine(tree.stderr) || 'Could not read the worktree.', tree.stderr);
      return ok(tree.stdout.trim());
    } finally {
      await rm(tempIndex, { force: true }).catch(() => undefined);
      await rm(`${tempIndex}.lock`, { force: true }).catch(() => undefined);
    }
  });
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
 * Everything that changed in worktree `dir` since `baseTree` (a
 * {@link snapshotTree} result), one {@link CapturedFile} per path. Returns
 * `[]` when nothing changed. Rename detection is on (`-M`), and `--binary`
 * keeps a binary file applyable rather than "differ".
 */
export async function captureChanges(dir: string, baseTree: string): Promise<GitOpResult<CapturedFile[]>> {
  const ended = await snapshotTree(dir);
  if (!ended.ok) return ended;
  const endTree = ended.value;
  if (endTree === baseTree) return ok([]);

  const names = await execGit(dir, ['diff', '--name-status', '-z', '-M', '--no-color', baseTree, endTree]);
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
    const res = await execGit(dir, [
      '--literal-pathspecs',
      'diff',
      '--binary',
      '-M',
      '--no-color',
      '--no-ext-diff',
      '-U3',
      baseTree,
      endTree,
      ...pathspec,
    ]);
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
