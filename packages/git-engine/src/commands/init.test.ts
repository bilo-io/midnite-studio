import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { execGit } from '../exec/git-exec';
import { TempRepo } from '../testing/temp-repo';
import { initRepo, isInsideWorkTree, workTreeTop } from './init';

const author = { name: 'Test User', email: 'test@example.com' };
let dir: string;

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), 'midnite-studio-init-')));
  writeFileSync(join(dir, 'README.md'), '# game\n');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('initRepo', () => {
  it('creates a repo on main with exactly one commit', async () => {
    const result = await initRepo(dir, { message: 'Create game', author });
    expect(result.ok).toBe(true);

    const count = await execGit(dir, ['rev-list', '--count', 'HEAD']);
    expect(count.stdout.trim()).toBe('1');
    const branch = await execGit(dir, ['symbolic-ref', '--short', 'HEAD']);
    expect(branch.stdout.trim()).toBe('main');
    const subject = await execGit(dir, ['log', '-1', '--format=%s']);
    expect(subject.stdout.trim()).toBe('Create game');
    if (result.ok) {
      const head = await execGit(dir, ['rev-parse', 'HEAD']);
      expect(result.value.head).toBe(head.stdout.trim());
    }
  });

  it('commits the scaffold, not an empty tree', async () => {
    await initRepo(dir, { message: 'Create game', author });
    const files = await execGit(dir, ['ls-tree', '-r', '--name-only', 'HEAD']);
    expect(files.stdout.trim()).toBe('README.md');
  });

  it('refuses a second init of the same folder', async () => {
    await initRepo(dir, { message: 'one', author });
    const again = await initRepo(dir, { message: 'two', author });
    expect(again).toEqual({ ok: false, kind: 'error', message: 'This folder is already a git repository.' });
  });
});

describe('isInsideWorkTree', () => {
  it('is true inside a repository and false outside one', async () => {
    const repo = await TempRepo.create();
    try {
      expect(await isInsideWorkTree(repo.path)).toBe(true);
      expect(await workTreeTop(repo.path)).toBe(repo.path);
    } finally {
      await repo.cleanup();
    }
    expect(await isInsideWorkTree(dir)).toBe(false);
    expect(await workTreeTop(dir)).toBeNull();
  });

  it('is false for a folder that does not exist', async () => {
    expect(await isInsideWorkTree(join(dir, 'missing'))).toBe(false);
  });
});
