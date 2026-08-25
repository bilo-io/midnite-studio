import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { TempRepo } from '../testing/temp-repo';
import { checkIgnored } from './ignore';

describe('checkIgnored', () => {
  let repo: TempRepo;

  beforeEach(async () => {
    repo = await TempRepo.create();
    await repo.commitFile('README.md', '# base\n', 'base');
  });

  afterEach(async () => {
    await repo.cleanup();
  });

  it('returns the ignored subset, batched through one invocation', async () => {
    await repo.commitFile('.gitignore', 'dist/\n*.log\n', 'ignore rules');
    await mkdir(join(repo.path, 'dist'), { recursive: true });
    await writeFile(join(repo.path, 'dist/out.js'), 'x');
    await writeFile(join(repo.path, 'build.log'), 'x');
    await writeFile(join(repo.path, 'src.ts'), 'x');

    const ignored = await checkIgnored(repo.path, ['dist', 'build.log', 'src.ts', 'README.md']);
    expect(ignored).toEqual(new Set(['dist', 'build.log']));
  });

  it('round-trips names containing spaces and newlines (the NUL rule)', async () => {
    await repo.commitFile('.gitignore', '*.tmp\n', 'ignore rules');
    const weird = 'a name\nwith newline.tmp';
    await writeFile(join(repo.path, weird), 'x');
    await writeFile(join(repo.path, 'plain with space.txt'), 'x');

    const ignored = await checkIgnored(repo.path, [weird, 'plain with space.txt']);
    expect(ignored).toEqual(new Set([weird]));
  });

  it('degrades to an empty set when nothing is ignored, or outside a repo', async () => {
    await writeFile(join(repo.path, 'kept.ts'), 'x');
    expect(await checkIgnored(repo.path, ['kept.ts'])).toEqual(new Set());
    expect(await checkIgnored('/nonexistent/nowhere', ['x'])).toEqual(new Set());
    expect(await checkIgnored(repo.path, [])).toEqual(new Set());
  });
});
