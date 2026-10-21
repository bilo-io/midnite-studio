import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { TempRepo } from '../testing/temp-repo';
import { revertCommit } from './revert';
import { getStatus } from './status';

let repo: TempRepo;

beforeEach(async () => {
  repo = await TempRepo.create();
  await repo.commitFile('src/main.js', 'export const speed = 1;\n', 'scaffold');
});

afterEach(async () => {
  await repo.cleanup();
});

describe('revertCommit', () => {
  it('adds a new commit that undoes the target, keeping history', async () => {
    const agent = await repo.commitFile('src/main.js', 'export const speed = 2;\n', 'agent: faster (pass 1/1)');
    const result = await revertCommit(repo.path, agent);
    expect(result).toEqual({ ok: true });
    expect((await repo.git(['rev-list', '--count', 'HEAD'])).trim()).toBe('3');
    expect((await repo.git(['show', 'HEAD:src/main.js']))).toBe('export const speed = 1;\n');
    expect((await repo.git(['log', '-1', '--format=%s'])).trim()).toMatch(/^Revert "agent: faster/);
  });

  it('returns the conflict envelope when a later commit touched the same lines', async () => {
    const agent = await repo.commitFile('src/main.js', 'export const speed = 2;\n', 'agent: faster');
    await repo.commitFile('src/main.js', 'export const speed = 3;\n', 'by hand');
    const result = await revertCommit(repo.path, agent);
    expect(result).toEqual({ ok: false, kind: 'conflict', op: 'revert', files: ['src/main.js'] });
    expect((await getStatus(repo.path)).inProgress).toBe('revert');
  });

  it('refuses a commit that is not in the repository, and anything that is not a sha', async () => {
    const missing = await revertCommit(repo.path, 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef');
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.kind).toBe('error');
    const flag = await revertCommit(repo.path, '--abort');
    expect(flag.ok).toBe(false);
    if (!flag.ok && flag.kind === 'error') expect(flag.message).toMatch(/not a commit id/);
  });
});
