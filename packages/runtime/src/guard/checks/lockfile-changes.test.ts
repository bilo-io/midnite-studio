import { describe, expect, it } from 'vitest';

import { lockfileChangesCheck, resolveLocalLockfileChanges } from './lockfile-changes';

const NOW = Date.UTC(2026, 10, 13, 12);
const SINCE = NOW - 7 * 24 * 60 * 60 * 1000;
const SHA = 'a'.repeat(40);

describe('lockfile changes with no pull request (Phase 122 F)', () => {
  it('reads unpushed lockfile commits from git, skipping repos with no remote and non-repos', async () => {
    const calls: string[][] = [];
    const exec = async (_file: string, args: readonly string[]): Promise<string> => {
      calls.push([...args]);
      const repo = args[1]!;
      if (repo === '/norepo') throw new Error('not a git repository');
      if (args[2] === 'remote') return repo === '/local-only' ? '' : 'origin\n';
      if (repo === '/quiet') return '';
      return `${SHA}\0${Math.floor(NOW / 1000)}\0`;
    };
    const result = await resolveLocalLockfileChanges(exec, ['/busy', '/quiet', '/local-only', '/norepo'], SINCE);
    expect(result).toEqual([{ repo: '/busy', commits: [{ sha: SHA, at: Math.floor(NOW / 1000) * 1000 }] }]);
    const log = calls.find((c) => c[2] === 'log' && c[1] === '/busy')!;
    expect(log).toContain('--remotes');
    expect(log).toContain(':(glob)**/pnpm-lock.yaml');
    expect(log).not.toContain(':(glob)**/requirements.txt');
  });

  it('is medium, one finding per repo, and names no secret', () => {
    const f = lockfileChangesCheck.run({
      localLockfileChanges: [
        { repo: '/busy', commits: [{ sha: SHA, at: NOW - 1000 }, { sha: 'b'.repeat(40), at: NOW }] },
        { repo: '/empty', commits: [] },
      ],
    }) as { fingerprint: string; severity: string; detail: string }[];
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ fingerprint: 'lockfile-changes:/busy', severity: 'medium' });
    expect(f[0]!.detail).toContain('2 local commits');
    expect(f[0]!.detail).toContain('bbbbbbbb');
  });

  it('yields nothing on a quiet week or a missing input', () => {
    expect(lockfileChangesCheck.run({ localLockfileChanges: [] })).toEqual([]);
    expect(lockfileChangesCheck.run({})).toEqual([]);
  });
});
