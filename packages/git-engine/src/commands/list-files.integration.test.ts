import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { listFiles, LIST_FILES_MAX } from './list-files';
import { TempRepo } from '../testing/temp-repo';

describe('listFiles integration', () => {
  let repo: TempRepo;

  beforeAll(async () => {
    repo = await TempRepo.create();

    // 1. A committed tracked file
    await writeFile(join(repo.path, 'tracked.txt'), 'tracked content');
    await repo.git(['add', 'tracked.txt']);
    await repo.git(['commit', '-m', 'Initial commit']);

    // 2. An untracked-but-not-ignored file
    await writeFile(join(repo.path, 'untracked.ts'), 'export const x = 1;');

    // 3. A file containing spaces in path
    await writeFile(join(repo.path, 'path with spaces.txt'), 'spaces');

    // 4. An ignored file
    await writeFile(join(repo.path, '.gitignore'), 'ignored.txt\n*.log\n');
    await writeFile(join(repo.path, 'ignored.txt'), 'secret');
    await writeFile(join(repo.path, 'debug.log'), 'log output');
  });

  afterAll(async () => {
    await repo.cleanup();
  });

  it('lists tracked and untracked files while excluding ignored files', async () => {
    const result = await listFiles(repo.path);
    expect(result.truncated).toBe(false);
    expect(result.files).toContain('tracked.txt');
    expect(result.files).toContain('untracked.ts');
    expect(result.files).toContain('path with spaces.txt');
    expect(result.files).toContain('.gitignore');

    // Ignored files must NOT be present
    expect(result.files).not.toContain('ignored.txt');
    expect(result.files).not.toContain('debug.log');
  });

  it('handles custom limits and sets truncated: true', async () => {
    const result = await listFiles(repo.path, 2);
    expect(result.truncated).toBe(true);
    expect(result.files).toHaveLength(2);
  });
});
