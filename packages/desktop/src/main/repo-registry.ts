import { basename } from 'node:path';

import {
  currentBranch,
  listRefs,
  listWorktrees,
  resolveMainWorktree,
  resolveRepoRoot,
} from '@midnite/git-engine';
import type { Ref, RepoDescriptor, Worktree } from '@midnite/git-shared';

import { nullRepoStore, type RepoStore } from './repo-store';

/**
 * The set of open repositories, keyed by an id the renderer uses for everything.
 *
 * Ids rather than paths on the wire, for two reasons: a path is user data that
 * has no business being reconstructed in the renderer, and the id lets main own
 * the "which checkout does this call mean" question — a repo and its linked
 * worktrees are one entry here, not several.
 *
 * The id is derived from the main worktree's path, so reopening the same
 * repository (or opening one of its worktrees) resolves to the same entry
 * rather than creating a duplicate.
 */

export type RepoEntry = {
  id: string;
  /** Absolute path of the MAIN worktree — never a linked one. */
  path: string;
};

const entries = new Map<string, RepoEntry>();

/**
 * Where the open-repo list is persisted. Injected at boot (main passes a store
 * rooted at `app.getPath('userData')`) so nothing in this module imports
 * `electron` and the whole registry is testable against a temp directory.
 */
let store: RepoStore = nullRepoStore;

export function configureRegistry(next: RepoStore): void {
  store = next;
}

/** Stable, filesystem-derived, and readable in a log. */
const idForPath = (path: string): string => `repo:${path}`;

export type OpenResult =
  | { ok: true; repo: RepoDescriptor }
  | { ok: false; message: string };

/**
 * Open a repository from any path inside it.
 *
 * Deliberately tolerant about what it's given: a repo root, a subdirectory, or
 * a linked worktree all resolve to the same entry. That last case is the one
 * that matters — dropping a worktree onto the sidebar should nest it under the
 * repository that owns it, not add a second top-level repo whose "worktrees"
 * list is identical to the first's.
 */
export async function openRepo(path: string): Promise<OpenResult> {
  const root = await resolveRepoRoot(path);
  if (!root) {
    return { ok: false, message: `"${basename(path) || path}" is not a git repository.` };
  }

  // A linked worktree's `.git` is a FILE pointing at the shared git dir, so the
  // only correct way to find the owning repo is to ask git.
  const main = (await resolveMainWorktree(path)) ?? root;

  const id = idForPath(main);
  if (!entries.has(id)) {
    entries.set(id, { id, path: main });
    await persist();
  }

  const repo = await describe(id, main);
  return repo ? { ok: true, repo } : { ok: false, message: `Could not read "${main}".` };
}

export async function closeRepo(repoId: string): Promise<void> {
  if (entries.delete(repoId)) await persist();
}

/**
 * Apply the sidebar's user-defined order.
 *
 * Order is the `Map`'s insertion order, which is what `persist()` writes out as
 * `repos.json`'s `paths` array — so reordering means rebuilding the map, and the
 * order round-trips through the same file the list itself does. Keeping it here
 * rather than as a renderer-side sort means it survives a cleared localStorage
 * alongside the repos it orders.
 *
 * Takes the whole id list so it is idempotent, and reconciles: unknown ids are
 * ignored, and repos the renderer omitted keep their relative order at the end
 * rather than being dropped.
 */
export async function reorderRepos(repoIds: readonly string[]): Promise<void> {
  const remaining = new Map(entries);
  const ordered: [string, RepoEntry][] = [];

  for (const id of repoIds) {
    const entry = remaining.get(id);
    if (entry) {
      ordered.push([id, entry]);
      remaining.delete(id);
    }
  }

  entries.clear();
  for (const [id, entry] of [...ordered, ...remaining.entries()]) entries.set(id, entry);
  await persist();
}

export function getRepo(repoId: string): RepoEntry | undefined {
  return entries.get(repoId);
}

/**
 * Resolve the working directory a call should run in.
 *
 * Every op carries an optional `worktreePath`, because worktrees have
 * independent indexes and HEADs — staging in one must not stage in another.
 * Unset means the main worktree. A path outside the repo is ignored rather than
 * trusted: it arrives from the renderer.
 */
export async function resolveWorkdir(
  repoId: string,
  worktreePath?: string,
): Promise<string | null> {
  const entry = entries.get(repoId);
  if (!entry) return null;
  if (!worktreePath) return entry.path;

  const worktrees = await listWorktrees(entry.path, repoId);
  return worktrees.some((w) => w.path === worktreePath) ? worktreePath : entry.path;
}

export async function listRepos(): Promise<RepoDescriptor[]> {
  const described = await Promise.all(
    [...entries.values()].map((entry) => describe(entry.id, entry.path)),
  );
  return described.filter((repo): repo is RepoDescriptor => repo !== null);
}

export async function refsFor(repoId: string): Promise<Ref[]> {
  const entry = entries.get(repoId);
  return entry ? listRefs(entry.path) : [];
}

export async function worktreesFor(repoId: string): Promise<Worktree[]> {
  const entry = entries.get(repoId);
  return entry ? listWorktrees(entry.path, repoId) : [];
}

/**
 * Restore the persisted list at boot.
 *
 * Paths that no longer resolve (the folder was moved or deleted between
 * sessions) are dropped silently and the pruned list is written back — a repo
 * the user can't act on is worse than no entry at all.
 */
export async function restoreRepos(): Promise<void> {
  const paths = await store.load();
  for (const path of paths) {
    const main = await resolveMainWorktree(path);
    if (!main) continue;
    const id = idForPath(main);
    if (!entries.has(id)) entries.set(id, { id, path: main });
  }
  await persist();
}

async function describe(id: string, path: string): Promise<RepoDescriptor | null> {
  const worktrees = await listWorktrees(path, id);
  if (worktrees.length === 0) return null;

  return {
    id,
    path,
    name: basename(path),
    headRef: await currentBranch(path),
    worktrees,
  };
}

const persist = (): Promise<void> => store.save([...entries.values()].map((e) => e.path));

/** Test seam: forget every open repo and the configured store. */
export function resetRegistry(): void {
  entries.clear();
  store = nullRepoStore;
}
