import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { execGit } from '../exec/git-exec';
import { TempRepo } from '../testing/temp-repo';
import { cloneRepo } from './clone';

let source: TempRepo;
let destDir: string;

beforeEach(async () => {
  source = await TempRepo.create();
  await source.commitFile('README.md', '# base\n', 'base');
  destDir = mkdtempSync(join(tmpdir(), 'midnite-studio-clone-dest-'));
});

afterEach(async () => {
  await source.cleanup();
  rmSync(destDir, { recursive: true, force: true });
});

describe('cloneRepo', () => {
  it('clones a local repo into a named child of destDir', async () => {
    const result = await cloneRepo(destDir, source.path, 'cloned-repo');

    expect(result).toEqual({ ok: true, path: join(destDir, 'cloned-repo') });
    expect(existsSync(join(destDir, 'cloned-repo', 'README.md'))).toBe(true);
    expect(existsSync(join(destDir, 'cloned-repo', '.git'))).toBe(true);
  });

  it('makes a bare mirror with every ref when asked', async () => {
    await source.git(['branch', 'topic']);
    const result = await cloneRepo(destDir, source.path, 'm.git', { mirror: true });

    expect(result).toEqual({ ok: true, path: join(destDir, 'm.git') });
    expect(existsSync(join(destDir, 'm.git', 'HEAD'))).toBe(true);
    expect(existsSync(join(destDir, 'm.git', '.git'))).toBe(false);
    const refs = await execGit(join(destDir, 'm.git'), ['for-each-ref', '--format=%(refname)']);
    expect(refs.stdout).toContain('refs/heads/topic');
  });

  it('reports failure for a URL that resolves to nothing', async () => {
    const result = await cloneRepo(destDir, join(destDir, 'does-not-exist'), 'nope');

    expect(result.ok).toBe(false);
    expect(existsSync(join(destDir, 'nope'))).toBe(false);
  });

  it('refuses to clone into a name that already exists and is non-empty', async () => {
    const first = await cloneRepo(destDir, source.path, 'twice');
    expect(first.ok).toBe(true);

    const second = await cloneRepo(destDir, source.path, 'twice');
    expect(second.ok).toBe(false);
  });
});
