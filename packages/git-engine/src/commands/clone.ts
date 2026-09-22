import { join } from 'node:path';

import { execGit } from '../exec/git-exec';

export type CloneResult = { ok: true; path: string } | { ok: false; message: string };

/**
 * `git clone <url> <name>` into `destDir` — Phase 90 Theme C's half of the
 * repo picker's "clone-or-open" listing (`reachable-repos.ts` on the main
 * side supplies the URL; nothing lands on disk until the user has already
 * chosen `destDir`, matching Phase 49's settled posture).
 *
 * Deliberately the one git-engine command that runs `execGit` against a
 * `repoPath` that is not yet a repository — every other command in this
 * package assumes one already exists at `repoPath`. Here it is the clone's
 * *parent* directory, and `name` becomes the child git creates; `resolve` (a
 * bare `node:path.join`) does not belong in `git-engine` itself, so the
 * caller passes the already-joined destination back through `path`.
 *
 * No write-queue here, unlike every other git-engine write: the queue exists
 * because concurrent writers race on one repo's `index.lock`, and a fresh
 * clone has no `index.lock` — no repo, and therefore no registry entry, for
 * anything else in the app to be racing against yet.
 */
export async function cloneRepo(destDir: string, url: string, name: string): Promise<CloneResult> {
  const result = await execGit(destDir, ['clone', '--', url, name], { write: true });
  if (result.exitCode !== 0) {
    const line =
      result.stderr
        .trim()
        .split('\n')
        .map((text) => text.trim())
        .filter(Boolean)
        .pop() ?? 'git clone failed.';
    return { ok: false, message: line };
  }
  return { ok: true, path: join(destDir, name) };
}
