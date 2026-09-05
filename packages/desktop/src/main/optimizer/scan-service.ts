import type { Dirent } from 'node:fs';
import { lstat, readdir } from 'node:fs/promises';
import { basename, join } from 'node:path';

import { execGit, mergedNames } from '@midnite/studio-git-engine';
import { SCAN_ITEMS_CAP, type RepoDescriptor, type ScanCategory, type ScanItem, type ScanResult, type Worktree } from '@midnite/studio-shared';

import { confineTree, describeFsError } from '../fs-scope-write';
import { defaultLogger, type Logger } from '../log';
import { listRepos, worktreesFor } from '../repo-registry';

/**
 * Smart Scan + Storage's own walker (Phase 59 Theme C) — every registered
 * repo/worktree plus one optional user-chosen extra root, never an unscoped
 * disk crawl. Sizing is a plain JS `readdir`+`lstat` walk, not `du`: nothing
 * in this repo shells `du`, and a walk is cancellable via `AbortSignal`,
 * reports real progress, and cannot be defeated by a path with a newline
 * in it.
 */

/** No pathological tree can walk past this many directory levels. */
export const MAX_WALK_DEPTH = 12;
/** No pathological tree can walk past this many entries — `node_modules` included. */
export const MAX_WALK_ENTRIES = 200_000;
/** How often `onProgress` fires — every N entries walked, not on a timer. */
const PROGRESS_EVERY_ENTRIES = 50;

/** A build-artifact pattern, matched against a directory's basename. */
export type BuildArtifactPattern = {
  basename: string;
  category: Extract<ScanCategory, 'nodeModules' | 'buildOutput'>;
};

/**
 * Seeded with exactly three patterns — widening this set is a later phase's
 * call (see the phase doc's Decision 6), not this one's. `classify` takes an
 * injectable pattern list so that later widening is a one-line change at the
 * call site rather than an edit here.
 */
export const DEFAULT_BUILD_ARTIFACT_PATTERNS: readonly BuildArtifactPattern[] = [
  { basename: 'node_modules', category: 'nodeModules' },
  { basename: 'dist', category: 'buildOutput' },
  { basename: '.moon', category: 'buildOutput' },
];

/** Pure and exported so a fixture can assert it directory-name by directory-name. */
export function classify(
  path: string,
  patterns: readonly BuildArtifactPattern[] = DEFAULT_BUILD_ARTIFACT_PATTERNS,
): ScanCategory | null {
  const name = basename(path);
  return patterns.find((pattern) => pattern.basename === name)?.category ?? null;
}

type WalkState = {
  items: ScanItem[];
  byCategory: Record<ScanCategory, number>;
  totalBytes: number;
  entriesWalked: number;
  itemsTruncated: boolean;
};

function newWalkState(): WalkState {
  return {
    items: [],
    byCategory: { nodeModules: 0, buildOutput: 0, staleWorktree: 0, looseObjects: 0 },
    totalBytes: 0,
    entriesWalked: 0,
    itemsTruncated: false,
  };
}

function addItem(state: WalkState, item: ScanItem): void {
  state.byCategory[item.category] += item.bytes;
  state.totalBytes += item.bytes;
  if (state.items.length < SCAN_ITEMS_CAP) {
    state.items.push(item);
  } else {
    state.itemsTruncated = true;
  }
}

async function readDirSafe(dir: string, log: Logger): Promise<Dirent[]> {
  try {
    return await readdir(dir, { withFileTypes: true });
  } catch (error) {
    // Permission-denied (or any other unreadable) subtree: skip it and keep
    // walking rather than fail the whole Smart Scan over one root-owned
    // directory. Logged for diagnostics, not surfaced to the user directly.
    log(`[optimizer] scan: could not read "${dir}": ${describeFsError(error)}`);
    return [];
  }
}

/**
 * Total bytes under `root`, walked iteratively (no recursion, so a deep
 * `node_modules` cannot blow the call stack). Shares `state`'s entry budget
 * and abort signal with the outer walk: a matched directory that is itself
 * enormous still respects the same bounds.
 */
async function dirBytes(
  root: string,
  state: WalkState,
  signal: AbortSignal,
  log: Logger,
): Promise<number> {
  let total = 0;
  const stack = [root];

  while (stack.length > 0) {
    if (signal.aborted || state.entriesWalked >= MAX_WALK_ENTRIES) break;
    const dir = stack.pop();
    if (dir === undefined) continue;

    const entries = await readDirSafe(dir, log);
    for (const entry of entries) {
      if (signal.aborted || state.entriesWalked >= MAX_WALK_ENTRIES) break;
      state.entriesWalked += 1;
      if (entry.isSymbolicLink()) continue; // never traversed or sized

      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (entry.isFile()) {
        try {
          total += (await lstat(full)).size;
        } catch {
          // Vanished between readdir and lstat — skip rather than fail the sizing pass.
        }
      }
    }
  }

  return total;
}

async function walk(
  dir: string,
  depth: number,
  repoId: string | null,
  state: WalkState,
  signal: AbortSignal,
  onProgress: (done: number, total: number) => void,
  log: Logger,
): Promise<void> {
  if (signal.aborted || depth > MAX_WALK_DEPTH || state.entriesWalked >= MAX_WALK_ENTRIES) return;

  const entries = await readDirSafe(dir, log);
  for (const entry of entries) {
    if (signal.aborted || state.entriesWalked >= MAX_WALK_ENTRIES) return;
    state.entriesWalked += 1;
    if (state.entriesWalked % PROGRESS_EVERY_ENTRIES === 0) {
      onProgress(state.entriesWalked, MAX_WALK_ENTRIES);
    }

    if (entry.name === '.git') continue; // refused at any depth
    if (entry.isSymbolicLink()) continue; // never traversed

    const full = join(dir, entry.name);
    if (!entry.isDirectory()) continue;

    const category = classify(full);
    if (category !== null) {
      // A directory matching a pattern is SIZED and not descended into — the
      // walk's entry budget must not be spent on npm's own tree.
      const bytes = await dirBytes(full, state, signal, log);
      addItem(state, { path: full, bytes, category, repoId });
      continue;
    }

    await walk(full, depth + 1, repoId, state, signal, onProgress, log);
  }
}

/**
 * A worktree is a stale-worktree candidate when: its branch is not null (a
 * detached HEAD is never a candidate), it is not the main worktree, and that
 * branch is merged into the repository's default branch (`headRef`). A repo
 * with no `headRef` (a brand-new repo with no commits) has no default branch
 * to merge against, so it contributes no candidates.
 */
export async function staleWorktreeCandidates(
  repo: RepoDescriptor,
  worktrees: readonly Worktree[],
): Promise<Set<string>> {
  const candidates = new Set<string>();
  if (!repo.headRef) return candidates;

  const mergedRes = await execGit(repo.path, [
    'for-each-ref',
    '--format=%(refname:short)',
    '--merged',
    repo.headRef,
    'refs/heads',
  ]);
  if (mergedRes.exitCode !== 0) return candidates;

  const merged = mergedNames(mergedRes.stdout);
  for (const worktree of worktrees) {
    if (worktree.isMain) continue;
    if (worktree.branch === null) continue;
    if (merged.has(worktree.branch)) candidates.add(worktree.path);
  }
  return candidates;
}

type ScanRootEntry = { path: string; repoId: string | null; stale: boolean };

async function collectRoots(extraRoot?: string): Promise<ScanRootEntry[]> {
  const repos = await listRepos();
  const roots: ScanRootEntry[] = [];

  for (const repo of repos) {
    const worktrees = await worktreesFor(repo.id);
    const stale = await staleWorktreeCandidates(repo, worktrees);
    for (const worktree of worktrees) {
      roots.push({ path: worktree.path, repoId: repo.id, stale: stale.has(worktree.path) });
    }
  }

  if (extraRoot) roots.push({ path: extraRoot, repoId: null, stale: false });
  return roots;
}

export type ScanWorkspaceOptions = {
  /** One user-chosen extra root per scan — never an unscoped crawl. */
  extraRoot?: string;
  signal: AbortSignal;
  /** A stream, not a return value — the Scan button's progress ring is driven by this. */
  onProgress: (done: number, total: number) => void;
  log?: Logger;
};

export async function scanWorkspace(opts: ScanWorkspaceOptions): Promise<ScanResult> {
  const log = opts.log ?? defaultLogger;
  const roots = await collectRoots(opts.extraRoot);
  const state = newWalkState();

  for (const root of roots) {
    if (opts.signal.aborted) break;

    if (root.stale) {
      // The whole worktree is the candidate — sized as one item rather than
      // also walked for node_modules/dist inside it, which would double-count
      // bytes reclaimable by the one delete that already covers them.
      const bytes = await dirBytes(root.path, state, opts.signal, log);
      addItem(state, { path: root.path, bytes, category: 'staleWorktree', repoId: root.repoId });
    } else {
      await walk(root.path, 0, root.repoId, state, opts.signal, opts.onProgress, log);
    }
    opts.onProgress(state.entriesWalked, MAX_WALK_ENTRIES);
  }

  /*
   * `looseObjects` is deliberately never populated. Decision 11 reads the
   * git-gc figure through git-engine's existing `parseCountObjects`/`readHealth`
   * read-only, but that function returns loose-object COUNT plus a COMBINED
   * (packed + loose) byte figure — never the loose-only byte size a category
   * total needs — and the guardrail is "git-engine gains nothing," so no new
   * export was added to get one. The category stays in the wire contract for
   * a later phase that does add it; this scan reports zero for it rather than
   * a wrong number.
   */

  return {
    totalBytes: state.totalBytes,
    byCategory: state.byCategory,
    items: state.items,
    truncated: state.itemsTruncated || state.entriesWalked >= MAX_WALK_ENTRIES,
  };
}

export type CleanOutcome = {
  freedBytes: number;
  skipped: { path: string; reason: string }[];
};

/**
 * Re-validates each path against the CURRENT filesystem state before it is
 * trashed — a `ScanResult` is computed, rendered and confirmed, and minutes
 * may pass in between. A path that no longer exists, is now a symlink, or no
 * longer resolves under any of `knownRoots` is skipped and reported rather
 * than thrown.
 *
 * `freedBytes` is measured fresh here (a directory's current size via the
 * same `dirBytes` walk, or a plain `lstat` for a file) rather than trusted
 * from the renderer's earlier scan — the two can disagree by however much
 * changed in the interval this re-validation exists to cover, and this is the
 * one figure that is actually true at delete time.
 *
 * `trash` is injected so this stays testable under bare vitest
 * (`scan-service.test.ts` passes a fake); the real caller supplies Electron's
 * `shell.trashItem`, never a bare recursive `fs.rm`.
 */
export async function cleanItems(
  paths: readonly string[],
  roots: readonly string[],
  trash: (path: string) => Promise<void>,
): Promise<CleanOutcome> {
  let freedBytes = 0;
  const skipped: { path: string; reason: string }[] = [];

  for (const path of paths) {
    let stat;
    try {
      stat = await lstat(path);
    } catch {
      skipped.push({ path, reason: 'no longer exists' });
      continue;
    }
    if (stat.isSymbolicLink()) {
      skipped.push({ path, reason: 'is now a symlink' });
      continue;
    }

    let confined: string | null = null;
    for (const root of roots) {
      confined = await confineTree(root, path);
      if (confined !== null) break;
    }
    if (confined === null) {
      skipped.push({ path, reason: 'no longer resolves under a known root' });
      continue;
    }

    const abort = new AbortController();
    const bytes = stat.isDirectory()
      ? await dirBytes(confined, newWalkState(), abort.signal, defaultLogger)
      : stat.size;

    try {
      await trash(confined);
      freedBytes += bytes;
    } catch (error) {
      skipped.push({ path, reason: describeFsError(error) });
    }
  }

  return { freedBytes, skipped };
}

/** Every path `cleanItems` may confine against, for the caller to assemble. */
export async function knownRoots(): Promise<string[]> {
  const roots: string[] = [];
  for (const repo of await listRepos()) {
    for (const worktree of await worktreesFor(repo.id)) roots.push(worktree.path);
  }
  return roots;
}
