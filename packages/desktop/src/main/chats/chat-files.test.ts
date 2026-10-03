import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { listChatFiles, walkFiles } from './chat-files';

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

async function temp(): Promise<string> {
  const d = await mkdtemp(join(tmpdir(), 'mstudio-chat-files-'));
  dirs.push(d);
  return d;
}

async function put(root: string, path: string, text = 'x'): Promise<void> {
  const full = join(root, path);
  await mkdir(join(full, '..'), { recursive: true });
  await writeFile(full, text);
}

describe('walkFiles (scratch dir)', () => {
  it('lists files breadth-first with / separators, skipping .git and node_modules', async () => {
    const root = await temp();
    await put(root, 'a.md');
    await put(root, 'src/b.ts');
    await put(root, 'node_modules/pkg/index.js');
    await put(root, '.git/HEAD');
    await put(root, 'with space.txt');
    expect(await walkFiles(root)).toEqual({ files: ['a.md', 'src/b.ts'], truncated: false });
  });

  it('caps and flags truncation', async () => {
    const root = await temp();
    await put(root, 'a');
    await put(root, 'b');
    await put(root, 'c');
    expect(await walkFiles(root, 2)).toEqual({ files: ['a', 'b'], truncated: true });
  });
});

describe('listChatFiles', () => {
  it('lists tracked plus untracked-not-ignored files of a repo', async () => {
    const repo = await temp();
    const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, stdio: 'ignore' });
    git('init', '-q');
    await put(repo, '.gitignore', 'ignored.log\n');
    await put(repo, 'tracked.ts');
    git('add', '.');
    git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'init');
    await put(repo, 'untracked/new.ts');
    await put(repo, 'ignored.log');

    const { files, truncated } = await listChatFiles({ repoPath: repo, scratchDir: null });
    expect(truncated).toBe(false);
    expect([...files].sort()).toEqual(['.gitignore', 'tracked.ts', 'untracked/new.ts']);
  });

  it('falls back to the scratch dir, and to nothing', async () => {
    const scratch = await temp();
    await put(scratch, 'notes.md');
    expect(await listChatFiles({ repoPath: null, scratchDir: scratch })).toEqual({ files: ['notes.md'], truncated: false });
    expect(await listChatFiles({ repoPath: null, scratchDir: null })).toEqual({ files: [], truncated: false });
  });
});
