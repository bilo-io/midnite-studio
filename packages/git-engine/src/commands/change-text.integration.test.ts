import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { readChangeText } from './change-text';
import { TempRepo } from '../testing/temp-repo';

describe('readChangeText integration', () => {
  let repo: TempRepo;

  beforeAll(async () => {
    repo = await TempRepo.create();
    await writeFile(join(repo.path, 'a.txt'), 'one\n');
    await writeFile(join(repo.path, 'b.txt'), 'one\n');
    await repo.git(['add', '.']);
    await repo.git(['commit', '-m', 'init']);
  });

  afterAll(async () => {
    await repo.cleanup();
  });

  it('is null on a clean tree', async () => {
    expect(await readChangeText(repo.path)).toBeNull();
  });

  it('reads the working tree plus untracked names (newline-safe) when nothing is staged', async () => {
    await writeFile(join(repo.path, 'a.txt'), 'two\n');
    await writeFile(join(repo.path, 'new\nfile.txt'), 'x');
    const change = await readChangeText(repo.path);
    expect(change?.source).toBe('working');
    expect(change?.patch).toContain('+two');
    expect(change?.untracked).toEqual(['new\nfile.txt']);
  });

  it('prefers the staged diff when anything is staged', async () => {
    await repo.git(['add', 'a.txt']);
    await writeFile(join(repo.path, 'b.txt'), 'changed\n');
    const change = await readChangeText(repo.path);
    expect(change?.source).toBe('staged');
    expect(change?.patch).toContain('+two');
    expect(change?.patch).not.toContain('changed');
    expect(change?.untracked).toEqual([]);
  });
});
