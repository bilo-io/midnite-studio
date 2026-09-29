import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createMediaStore } from './media-store';

let repo: string;
let outside: string;
const trash = vi.fn(async (_path: string) => {});
const onChanged = vi.fn();

const makeStore = () =>
  createMediaStore({ resolveRepo: async (id) => (id === 'r' ? repo : null), trash, onChanged });

const scope = { repoId: 'r', tab: 'doc' as const };

beforeEach(async () => {
  repo = await mkdtemp(join(tmpdir(), 'media-store-'));
  outside = await mkdtemp(join(tmpdir(), 'media-outside-'));
  await writeFile(join(outside, 'secret.txt'), 'secret');
  trash.mockClear();
  onChanged.mockClear();
});

afterEach(async () => {
  await rm(repo, { recursive: true, force: true });
  await rm(outside, { recursive: true, force: true });
});

describe('media-store', () => {
  it('lists no projects (not an error) before the media folder exists', async () => {
    expect(await makeStore().listProjects(scope)).toEqual({ ok: true, value: [] });
  });

  it('refuses an unknown repo', async () => {
    const result = await makeStore().listProjects({ repoId: 'nope', tab: 'doc' });
    expect(result.ok).toBe(false);
  });

  it('writes, lists, reads, renames and trashes under .midnite/media/<tab>/', async () => {
    const store = makeStore();
    expect((await store.createProject({ ...scope, project: 'notes' })).ok).toBe(true);
    const written = await store.writeFile({
      ...scope,
      project: 'notes',
      path: 'drafts/a.md',
      content: '# hi',
      encoding: 'utf8',
    });
    expect(written).toEqual({ ok: true, value: { size: 4, largeFile: false } });
    expect(await readFile(join(repo, '.midnite/media/doc/notes/drafts/a.md'), 'utf8')).toBe('# hi');

    const projects = await store.listProjects(scope);
    expect(projects.ok && projects.value).toMatchObject([{ name: 'notes', fileCount: 1 }]);
    const files = await store.listFiles({ ...scope, project: 'notes' });
    expect(files.ok && files.value.map((f) => f.path)).toEqual(['drafts/a.md']);

    const read = await store.readFile({ ...scope, project: 'notes', path: 'drafts/a.md', encoding: 'utf8' });
    expect(read).toEqual({ ok: true, value: '# hi' });

    expect((await store.renameFile({ ...scope, project: 'notes', path: 'drafts/a.md', to: 'b.md' })).ok).toBe(true);
    expect((await store.removeFile({ ...scope, project: 'notes', path: 'b.md' })).ok).toBe(true);
    expect(trash).toHaveBeenCalledWith(expect.stringMatching(/notes\/b\.md$/));

    expect((await store.removeProject({ ...scope, project: 'notes' })).ok).toBe(true);
    expect(onChanged).toHaveBeenCalledWith('r', 'doc');
  });

  it('writes no .gitignore', async () => {
    const store = makeStore();
    await store.writeFile({ ...scope, project: 'p', path: 'a.md', content: 'x', encoding: 'utf8' });
    await expect(readFile(join(repo, '.midnite/media/.gitignore'), 'utf8')).rejects.toThrow();
    await expect(readFile(join(repo, '.midnite/.gitignore'), 'utf8')).rejects.toThrow();
  });

  it('rejects .. traversal on read and write', async () => {
    const store = makeStore();
    await store.createProject({ ...scope, project: 'p' });
    const read = await store.readFile({ ...scope, project: 'p', path: '../../../../etc/passwd', encoding: 'utf8' });
    expect(read.ok).toBe(false);
    const write = await store.writeFile({ ...scope, project: 'p', path: '../escape.md', content: 'x', encoding: 'utf8' });
    expect(write.ok).toBe(false);
    expect((await store.createProject({ ...scope, project: '..' })).ok).toBe(false);
  });

  it('refuses symlinks pointing out of the root', async () => {
    const store = makeStore();
    await store.createProject({ ...scope, project: 'p' });
    const projectDir = join(repo, '.midnite/media/doc/p');
    await symlink(join(outside, 'secret.txt'), join(projectDir, 'link.txt'));
    await symlink(outside, join(projectDir, 'linkdir'));

    const read = await store.readFile({ ...scope, project: 'p', path: 'link.txt', encoding: 'utf8' });
    expect(read.ok).toBe(false);
    const write = await store.writeFile({ ...scope, project: 'p', path: 'link.txt', content: 'x', encoding: 'utf8' });
    expect(write.ok).toBe(false);
    const through = await store.writeFile({
      ...scope,
      project: 'p',
      path: 'linkdir/new.txt',
      content: 'x',
      encoding: 'utf8',
    });
    expect(through.ok).toBe(false);
    expect(await readFile(join(outside, 'secret.txt'), 'utf8')).toBe('secret');
  });

  it('refuses a symlinked media root rather than writing through it', async () => {
    await mkdir(join(repo, '.midnite'));
    await symlink(outside, join(repo, '.midnite/media'));
    const write = await makeStore().writeFile({ ...scope, project: 'p', path: 'a.md', content: 'x', encoding: 'utf8' });
    expect(write.ok).toBe(false);
  });

  it('flags a file past the large-file threshold', async () => {
    const big = Buffer.alloc(25 * 1024 * 1024 + 1).toString('base64');
    const result = await makeStore().writeFile({
      ...scope,
      tab: 'image',
      project: 'p',
      path: 'big.bin',
      content: big,
      encoding: 'base64',
    });
    expect(result.ok && result.value.largeFile).toBe(true);
  });
});
