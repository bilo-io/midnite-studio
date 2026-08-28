import {
  mkdtemp,
  readFile,
  realpath,
  rm,
  stat,
  symlink,
  writeFile as writeFileFixture,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { create, deleteEntry, rename, writeFile } from './fs-write-handlers';

const { resolveWorkdir, trashItem } = vi.hoisted(() => ({
  resolveWorkdir: vi.fn(),
  trashItem: vi.fn(async () => undefined),
}));
vi.mock('electron', () => ({ shell: { trashItem }, ipcMain: { handle: vi.fn() } }));
vi.mock('../repo-registry', () => ({ resolveWorkdir }));

const base = { scope: 'repo' as const, repoId: 'r1' };

async function versionOf(path: string) {
  const info = await stat(path);
  return { mtimeMs: info.mtimeMs, size: info.size };
}

describe('fs write handlers (Phase 24 Theme B)', () => {
  let root: string;

  beforeAll(async () => {
    // realpath'd: macOS's tmpdir is itself a symlink (/var → /private/var).
    root = await realpath(await mkdtemp(join(tmpdir(), 'mgit-write-handlers-')));
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  afterEach(() => {
    resolveWorkdir.mockReset();
    trashItem.mockClear();
  });

  describe('writeFile', () => {
    it('overwrites an existing file when the version matches', async () => {
      resolveWorkdir.mockResolvedValue(root);
      const path = join(root, 'a.txt');
      await writeFileFixture(path, 'old');
      const expectedVersion = await versionOf(path);

      const result = await writeFile({ ...base, relPath: 'a.txt', content: 'new', expectedVersion });
      expect(result).toEqual({ ok: true });
      await expect(readFile(path, 'utf8')).resolves.toBe('new');
    });

    it('refuses with code stale-write when the file moved since the read', async () => {
      resolveWorkdir.mockResolvedValue(root);
      const path = join(root, 'b.txt');
      await writeFileFixture(path, 'old');
      const staleVersion = { mtimeMs: 1, size: 999 };

      const result = await writeFile({ ...base, relPath: 'b.txt', content: 'new', expectedVersion: staleVersion });
      expect(result).toMatchObject({ ok: false, code: 'stale-write' });
      await expect(readFile(path, 'utf8')).resolves.toBe('old'); // untouched
    });

    it('refuses to overwrite a binary file even when the version matches', async () => {
      resolveWorkdir.mockResolvedValue(root);
      const path = join(root, 'c.bin');
      await writeFileFixture(path, Buffer.from([0, 1, 2, 3]));
      const expectedVersion = await versionOf(path);

      const result = await writeFile({ ...base, relPath: 'c.bin', content: 'text', expectedVersion });
      expect(result).toMatchObject({ ok: false, kind: 'error' });
      await expect(readFile(path)).resolves.toEqual(Buffer.from([0, 1, 2, 3])); // untouched
    });

    it('refuses a write past FS_WRITE_CAP_BYTES', async () => {
      resolveWorkdir.mockResolvedValue(root);
      const path = join(root, 'd.txt');
      await writeFileFixture(path, 'old');
      const expectedVersion = await versionOf(path);
      const tooBig = 'x'.repeat(2 * 1024 * 1024);

      const result = await writeFile({ ...base, relPath: 'd.txt', content: tooBig, expectedVersion });
      expect(result).toMatchObject({ ok: false });
      await expect(readFile(path, 'utf8')).resolves.toBe('old');
    });

    it('refuses to write through a symlink', async () => {
      resolveWorkdir.mockResolvedValue(root);
      const real = join(root, 'e-real.txt');
      await writeFileFixture(real, 'real');
      await symlink(real, join(root, 'e-alias.txt'));
      const expectedVersion = await versionOf(real);

      const result = await writeFile({
        ...base,
        relPath: 'e-alias.txt',
        content: 'evil',
        expectedVersion,
      });
      expect(result).toMatchObject({ ok: false });
      await expect(readFile(real, 'utf8')).resolves.toBe('real');
    });

    it('refuses a missing file rather than creating one', async () => {
      resolveWorkdir.mockResolvedValue(root);
      const result = await writeFile({
        ...base,
        relPath: 'never-existed.txt',
        content: 'x',
        expectedVersion: { mtimeMs: 0, size: 0 },
      });
      expect(result).toMatchObject({ ok: false });
    });
  });

  describe('create', () => {
    it('creates an empty file', async () => {
      resolveWorkdir.mockResolvedValue(root);
      const result = await create({ ...base, relPath: 'new-file.txt', kind: 'file' });
      expect(result).toEqual({ ok: true });
      await expect(readFile(join(root, 'new-file.txt'), 'utf8')).resolves.toBe('');
    });

    it('creates a directory', async () => {
      resolveWorkdir.mockResolvedValue(root);
      const result = await create({ ...base, relPath: 'new-dir', kind: 'directory' });
      expect(result).toEqual({ ok: true });
      await expect(stat(join(root, 'new-dir')).then((s) => s.isDirectory())).resolves.toBe(true);
    });

    it('refuses to create over an existing entry', async () => {
      resolveWorkdir.mockResolvedValue(root);
      await writeFileFixture(join(root, 'taken.txt'), 'x');
      const result = await create({ ...base, relPath: 'taken.txt', kind: 'file' });
      expect(result).toMatchObject({ ok: false });
    });

    it('refuses a path under .git', async () => {
      resolveWorkdir.mockResolvedValue(root);
      const result = await create({ ...base, relPath: '.git/hooks/evil', kind: 'file' });
      expect(result).toMatchObject({ ok: false });
    });
  });

  describe('rename', () => {
    it('renames within the same directory', async () => {
      resolveWorkdir.mockResolvedValue(root);
      await writeFileFixture(join(root, 'from.txt'), 'x');
      const result = await rename({ ...base, fromRelPath: 'from.txt', toRelPath: 'to.txt' });
      expect(result).toEqual({ ok: true });
      await expect(readFile(join(root, 'to.txt'), 'utf8')).resolves.toBe('x');
    });

    it('refuses when the destination already exists', async () => {
      resolveWorkdir.mockResolvedValue(root);
      await writeFileFixture(join(root, 'src.txt'), 'a');
      await writeFileFixture(join(root, 'dest.txt'), 'b');
      const result = await rename({ ...base, fromRelPath: 'src.txt', toRelPath: 'dest.txt' });
      expect(result).toMatchObject({ ok: false });
      await expect(readFile(join(root, 'dest.txt'), 'utf8')).resolves.toBe('b'); // untouched
    });

    it('refuses to rename a symlink', async () => {
      resolveWorkdir.mockResolvedValue(root);
      const real = join(root, 'real-2.txt');
      await writeFileFixture(real, 'x');
      await symlink(real, join(root, 'link.txt'));
      const result = await rename({ ...base, fromRelPath: 'link.txt', toRelPath: 'renamed.txt' });
      expect(result).toMatchObject({ ok: false });
    });
  });

  describe('deleteEntry', () => {
    it('trashes an existing file rather than unlinking it', async () => {
      resolveWorkdir.mockResolvedValue(root);
      await writeFileFixture(join(root, 'doomed.txt'), 'x');
      const result = await deleteEntry({ ...base, relPath: 'doomed.txt' });
      expect(result).toEqual({ ok: true });
      expect(trashItem).toHaveBeenCalledWith(join(root, 'doomed.txt'));
    });

    it('refuses when nothing exists at the path', async () => {
      resolveWorkdir.mockResolvedValue(root);
      const result = await deleteEntry({ ...base, relPath: 'ghost.txt' });
      expect(result).toMatchObject({ ok: false });
      expect(trashItem).not.toHaveBeenCalled();
    });

    it('refuses to trash a symlink', async () => {
      resolveWorkdir.mockResolvedValue(root);
      const real = join(root, 'real-3.txt');
      await writeFileFixture(real, 'x');
      await symlink(real, join(root, 'link-3.txt'));
      const result = await deleteEntry({ ...base, relPath: 'link-3.txt' });
      expect(result).toMatchObject({ ok: false });
      expect(trashItem).not.toHaveBeenCalled();
    });
  });

  // `scope: 'claude-home'` never reaches these handlers at all — `FsWriteScopeSchema`
  // is a bare `z.literal('repo')`, so the request fails zod parsing before
  // `handleOp` calls in. Covered in shared's ipc.test.ts, not exercised here.
});
