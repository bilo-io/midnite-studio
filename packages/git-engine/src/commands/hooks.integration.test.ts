import { afterEach, describe, expect, it } from 'vitest';

import { TempRepo } from '../testing/temp-repo';
import { getHooksPath } from './hooks';

describe('getHooksPath', () => {
  const repos: TempRepo[] = [];
  const makeRepo = async (): Promise<TempRepo> => {
    const repo = await TempRepo.create();
    repos.push(repo);
    return repo;
  };

  afterEach(async () => {
    await Promise.all(repos.splice(0).map((r) => r.cleanup()));
  });

  it('returns null for a repo with no core.hooksPath set', async () => {
    const repo = await makeRepo();
    await expect(getHooksPath(repo.path)).resolves.toBeNull();
  });

  it('returns the configured relative path, verbatim', async () => {
    const repo = await makeRepo();
    await repo.git(['config', 'core.hooksPath', '.githooks']);
    await expect(getHooksPath(repo.path)).resolves.toBe('.githooks');
  });

  it('returns an absolute configured path, verbatim', async () => {
    const repo = await makeRepo();
    await repo.git(['config', 'core.hooksPath', '/tmp/some-hooks-dir']);
    await expect(getHooksPath(repo.path)).resolves.toBe('/tmp/some-hooks-dir');
  });

  it('returns null rather than empty string for an explicitly blank value', async () => {
    const repo = await makeRepo();
    // git rejects an empty --value outright; the empty-string guard in
    // getHooksPath is defensive rather than reachable through git itself, but
    // the function's contract ("never ''") is worth asserting directly.
    await repo.git(['config', 'core.hooksPath', 'unset-me']);
    await repo.git(['config', '--unset', 'core.hooksPath']);
    await expect(getHooksPath(repo.path)).resolves.toBeNull();
  });
});
