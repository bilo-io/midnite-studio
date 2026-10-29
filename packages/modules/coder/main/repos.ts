import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

import type { RepoDescriptor } from '@midnite/studio-shared';

/**
 * Coder's own list of repositories (Phase 113 Theme O) — Coder has no Studio
 * repo registry and runs no git, so this is a small JSON file in its userData:
 * `{ version: 1, repos: [{ id, path }] }`.
 *
 * **The renderer never names a path main did not hand it.** A folder joins the
 * list only through {@link CoderRepos.admit}, which accepts a path only if the
 * native folder dialog returned it in this process ({@link CoderRepos.offer})
 * — so a compromised renderer cannot point Coder at an arbitrary directory.
 * After that every channel takes a `repoId`, and main resolves the path.
 */
export type CoderRepos = {
  list(): RepoDescriptor[];
  pathOf(repoId: string): string | null;
  /** Remember a path the folder dialog just returned, so `admit` will accept it once. */
  offer(path: string): void;
  /** Add an offered folder that is a git checkout; refuses anything else. */
  admit(path: string): { ok: true; repo: RepoDescriptor } | { ok: false; message: string };
  remove(repoId: string): void;
};

type Stored = { id: string; path: string };

const FILE = 'repos.json';

const repoIdFor = (path: string): string => createHash('sha256').update(path).digest('hex').slice(0, 16);

function load(file: string): Stored[] {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as { repos?: unknown };
    if (!Array.isArray(parsed.repos)) return [];
    return parsed.repos.filter(
      (r): r is Stored => typeof r === 'object' && r !== null && typeof (r as Stored).id === 'string' && typeof (r as Stored).path === 'string',
    );
  } catch {
    // Missing on first launch, or unreadable: an empty list is the recoverable answer.
    return [];
  }
}

/** `<repo>/.git/HEAD`'s branch, or null when detached or unreadable — read, never run. */
function headRef(path: string): string | null {
  try {
    const head = readFileSync(join(path, '.git', 'HEAD'), 'utf8').trim();
    return head.startsWith('ref: refs/heads/') ? head.slice('ref: refs/heads/'.length) : null;
  } catch {
    return null;
  }
}

const describe = ({ id, path }: Stored): RepoDescriptor => ({ id, path, name: basename(path), headRef: headRef(path), worktrees: [] });

/** A checkout has a `.git` directory, or a linked worktree's `.git` file. */
export const isGitCheckout = (path: string): boolean => existsSync(join(path, '.git'));

export function createCoderRepos(options: { userData: string; isRepository?: (path: string) => boolean }): CoderRepos {
  const isRepository = options.isRepository ?? isGitCheckout;
  const file = join(options.userData, FILE);
  let repos = load(file);
  const offered = new Set<string>();

  const save = (): void => {
    try {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(`${file}.tmp`, `${JSON.stringify({ version: 1, repos }, null, 2)}\n`, 'utf8');
      renameSync(`${file}.tmp`, file);
    } catch {
      // A read-only data directory must not take Coder down; the list lasts for this session.
    }
  };

  return {
    list: () => repos.map(describe),
    pathOf: (repoId) => repos.find((r) => r.id === repoId)?.path ?? null,
    offer: (path) => void offered.add(path),
    admit: (path) => {
      if (!offered.delete(path)) return { ok: false, message: 'Choose the folder with Add repository.' };
      let real: string;
      try {
        real = realpathSync(path);
      } catch {
        return { ok: false, message: 'That folder no longer exists.' };
      }
      if (!isRepository(real)) return { ok: false, message: 'That folder is not a git repository.' };
      const existing = repos.find((r) => r.path === real);
      if (existing) return { ok: true, repo: describe(existing) };
      const entry = { id: repoIdFor(real), path: real };
      repos = [...repos, entry];
      save();
      return { ok: true, repo: describe(entry) };
    },
    remove: (repoId) => {
      repos = repos.filter((r) => r.id !== repoId);
      save();
    },
  };
}
