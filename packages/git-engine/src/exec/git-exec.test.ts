import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { GitExecError, execGit, resolveMainWorktree, resolveRepoRoot } from './git-exec';

describe('execGit', () => {
  it('reports a missing working directory as a failed result, not a rejection', async () => {
    // dugite rejects outright when it cannot launch git — and a repo the user
    // opened last week may have been moved, deleted or unmounted since. If that
    // surfaced as an exception, restoring the open-repo list would fail boot.
    const gone = join(tmpdir(), 'mgit-does-not-exist-ever');
    const result = await execGit(gone, ['status']);

    expect(result.exitCode).toBe(-1);
    expect(result.stderr).toMatch(/repository|directory|ENOENT/i);
  });

  it('resolves a missing path to null rather than throwing', async () => {
    expect(await resolveRepoRoot('/definitely/not/here')).toBeNull();
    expect(await resolveMainWorktree('/definitely/not/here')).toBeNull();
  });

  it('leaves a non-zero exit as data by default', async () => {
    // git uses exit codes as answers: `diff --quiet` exits 1 when there ARE
    // changes, `merge` exits 1 on conflict. Callers inspect exitCode.
    const dir = await mkdtemp(join(tmpdir(), 'mgit-exec-'));
    const result = await execGit(dir, ['rev-parse', '--show-toplevel']);

    expect(result.exitCode).not.toBe(0);
    await rm(dir, { recursive: true, force: true });
  });

  it('throws with the first stderr line when asked to', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mgit-exec-'));
    await expect(
      execGit(dir, ['rev-parse', '--show-toplevel'], { throwOnError: true }),
    ).rejects.toBeInstanceOf(GitExecError);
    await rm(dir, { recursive: true, force: true });
  });
});
