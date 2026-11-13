import type { SecurityFinding } from '@midnite/studio-shared';

import { createGuardFinding, type GuardCheck } from '../check';
import { LOCKFILE_PARSERS } from '../lockfiles/parsers';
import type { ExecFile } from '../software';

export const LOCKFILE_CHANGES_CHECK_ID = 'lockfile-changes';

/** A commit that touched a lockfile inside the window and is on no remote branch, so no PR can carry it. */
export interface UnpushedLockfileCommit {
  sha: string;
  /** Commit time, ms since epoch. */
  at: number;
}

export interface LocalLockfileChanges {
  repo: string;
  commits: UnpushedLockfileCommit[];
}

/** Lockfiles that pin versions; `requirements.txt` is a hand-edited list and `go.sum` a checksum file, both left out. */
const LOCKFILE_NAMES = Object.keys(LOCKFILE_PARSERS).filter((name) => name !== 'requirements.txt');

/**
 * The forge-free reading of "a lockfile changed in a repo with no PR opened from it" (Phase 122 Theme F): asking the
 * forge needs a credential and a network call, so Guard asks git instead. A commit that touched a lockfile in the
 * window and is reachable from no remote ref has not been pushed, which means nothing can have been opened as a PR
 * from it. Read-only: `git remote` and `git log`, NUL-delimited, never a fetch. A repo with no remote at all has
 * nowhere to open a PR, so it is not reported.
 */
export async function resolveLocalLockfileChanges(exec: ExecFile, repos: readonly string[], sinceMs: number): Promise<LocalLockfileChanges[]> {
  const out: LocalLockfileChanges[] = [];
  for (const repo of repos) {
    try {
      const remotes = (await exec('git', ['-C', repo, 'remote'])).split('\n').filter((line) => line.trim() !== '');
      if (remotes.length === 0) continue;
      const log = await exec('git', [
        '-C', repo, 'log', '-z', `--since=${Math.floor(sinceMs / 1000)}`, '--format=%H%x00%ct', 'HEAD', '--not', '--remotes', '--',
        ...LOCKFILE_NAMES.map((name) => `:(glob)**/${name}`),
      ]);
      const parts = log.split('\0').filter((part) => part !== '');
      const commits: UnpushedLockfileCommit[] = [];
      for (let i = 0; i + 1 < parts.length; i += 2) {
        const at = Number(parts[i + 1]) * 1000;
        if (/^[0-9a-f]{7,64}$/.test(parts[i]!) && Number.isFinite(at)) commits.push({ sha: parts[i]!, at });
      }
      if (commits.length > 0) out.push({ repo, commits });
    } catch {
      // Not a git repo, or git is unavailable: nothing to say about it.
    }
  }
  return out;
}

/** `medium`, one finding per repo: its subject is the repo path, so it resolves once the commits are pushed. */
export const lockfileChangesCheck: GuardCheck = {
  id: LOCKFILE_CHANGES_CHECK_ID,
  title: 'Lockfile changes with no pull request',
  category: 'supply-chain',
  needs: ['localLockfileChanges'],
  run(raw): SecurityFinding[] {
    const changes = (raw as { localLockfileChanges?: LocalLockfileChanges[] }).localLockfileChanges;
    if (!Array.isArray(changes)) return [];
    return changes.flatMap((change) => {
      if (change.commits.length === 0) return [];
      const newest = change.commits.reduce((a, b) => (b.at > a.at ? b : a));
      return [
        createGuardFinding({
          check: lockfileChangesCheck,
          subject: change.repo,
          severity: 'medium',
          title: `A lockfile changed here with nothing pushed for review (${change.repo})`,
          detail: `${change.commits.length} local commit${change.commits.length === 1 ? '' : 's'} in the window touched a lockfile and are on no remote branch (newest ${newest.sha.slice(0, 8)}), so no pull request can cover them. A dependency swap nobody reviewed is how a poisoned version gets in; read the diff, then push it for review or drop it.`,
          evidence: [{ kind: 'path', path: change.repo }],
          firstSeen: newest.at,
        }),
      ];
    });
  },
};
