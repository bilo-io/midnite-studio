import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// Imported dynamically below, after the mocks are in place — `fs-handlers.ts`
// pulls in `@midnite/git-engine` at module scope, and only `dirStats`/
// `showItemInFolder` are under test here (the read-only stats + reveal pair
// Theme C added beside the existing `listDir`/`readFileCapped`).
const { resolveWorkdir, showItemInFolder: showItemInFolderMock } = vi.hoisted(() => ({
  resolveWorkdir: vi.fn(),
  showItemInFolder: vi.fn(),
}));
vi.mock('electron', () => ({
  shell: { showItemInFolder: showItemInFolderMock },
  ipcMain: { handle: vi.fn() },
}));
vi.mock('../repo-registry', () => ({ resolveWorkdir }));

const base = { scope: 'repo' as const, repoId: 'r1' };

describe('fs read handlers — dirStats + showItemInFolder (Phase 24 Theme C)', () => {
  let root: string;

  beforeAll(async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), 'mgit-fs-handlers-')));
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  afterEach(() => {
    resolveWorkdir.mockReset();
    showItemInFolderMock.mockClear();
  });

  describe('dirStats', () => {
    it('counts files and bytes across nested directories', async () => {
      resolveWorkdir.mockResolvedValue(root);
      await mkdir(join(root, 'nested'), { recursive: true });
      await writeFile(join(root, 'a.txt'), '12345'); // 5 bytes
      await writeFile(join(root, 'nested', 'b.txt'), '1234567'); // 7 bytes

      const { dirStatsForTest } = await importHandlers();
      const result = await dirStatsForTest({ ...base, relPath: '' });
      expect(result).toEqual({ ok: true, fileCount: 2, totalBytes: 12, truncated: false });
    });

    it('reports an empty directory as zero, not an error', async () => {
      resolveWorkdir.mockResolvedValue(root);
      await mkdir(join(root, 'empty-dir'));
      const { dirStatsForTest } = await importHandlers();
      const result = await dirStatsForTest({ ...base, relPath: 'empty-dir' });
      expect(result).toEqual({ ok: true, fileCount: 0, totalBytes: 0, truncated: false });
    });

    it('refuses a path outside the confined root', async () => {
      resolveWorkdir.mockResolvedValue(root);
      const { dirStatsForTest } = await importHandlers();
      const result = await dirStatsForTest({ ...base, relPath: '../escape' });
      expect(result).toMatchObject({ ok: false });
    });

    it('refuses a missing directory', async () => {
      resolveWorkdir.mockResolvedValue(root);
      const { dirStatsForTest } = await importHandlers();
      const result = await dirStatsForTest({ ...base, relPath: 'never-existed' });
      expect(result).toMatchObject({ ok: false });
    });
  });

  describe('showItemInFolder', () => {
    it('hands the confined, real path to shell.showItemInFolder', async () => {
      resolveWorkdir.mockResolvedValue(root);
      await writeFile(join(root, 'reveal-me.txt'), 'x');
      const { showItemInFolderForTest } = await importHandlers();
      const result = await showItemInFolderForTest({ ...base, relPath: 'reveal-me.txt' });
      expect(result).toEqual({ ok: true });
      expect(showItemInFolderMock).toHaveBeenCalledWith(join(root, 'reveal-me.txt'));
    });

    it('refuses a path outside the confined root without calling the OS', async () => {
      resolveWorkdir.mockResolvedValue(root);
      const { showItemInFolderForTest } = await importHandlers();
      const result = await showItemInFolderForTest({ ...base, relPath: '../escape.txt' });
      expect(result).toMatchObject({ ok: false });
      expect(showItemInFolderMock).not.toHaveBeenCalled();
    });

    it('refuses a symlink whose target lands outside the root', async () => {
      resolveWorkdir.mockResolvedValue(root);
      const outside = await mkdtemp(join(tmpdir(), 'mgit-fs-handlers-outside-'));
      await symlink(outside, join(root, 'escape-link'));
      const { showItemInFolderForTest } = await importHandlers();
      const result = await showItemInFolderForTest({ ...base, relPath: 'escape-link' });
      expect(result).toMatchObject({ ok: false });
      expect(showItemInFolderMock).not.toHaveBeenCalled();
      await rm(outside, { recursive: true, force: true });
    });
  });
});

/**
 * `dirStats`/`showItemInFolder` are module-private — only `registerFsHandlers`
 * is exported, matching this file's own read/write split precedent
 * (`fs-write-handlers.ts` exports its verbs directly for unit testing, but
 * this module's existing `listDir`/`readFileCapped` were never exercised
 * this way either). Reach them through the registered `ipcMain.handle` calls
 * instead of widening the module's public surface for tests alone.
 */
async function importHandlers() {
  const { CHANNELS } = await import('@midnite/git-shared');
  const { registerFsHandlers } = await import('./fs-handlers');
  const ipcMain = (await import('electron')).ipcMain as unknown as { handle: ReturnType<typeof vi.fn> };
  ipcMain.handle.mockClear();
  registerFsHandlers();
  const calls = ipcMain.handle.mock.calls as [string, (event: unknown, raw: unknown) => unknown][];
  const handlerFor = (channel: string) => {
    const call = calls.find(([ch]) => ch === channel);
    if (!call) throw new Error(`no handler registered for ${channel}`);
    return (payload: unknown) => call[1](undefined, payload);
  };
  return {
    dirStatsForTest: handlerFor(CHANNELS.fsDirStats),
    showItemInFolderForTest: handlerFor(CHANNELS.shellShowItemInFolder),
  };
}
