import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const homeHolder = vi.hoisted(() => ({ value: '' }));
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => homeHolder.value };
});

const runProcessMock = vi.hoisted(() => vi.fn());
vi.mock('../process-runner', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../process-runner')>();
  return { ...actual, runProcess: runProcessMock };
});

import { defaultLogger } from '../log';
import type { SystemCacheEntry } from './system-cache-registry';
import { cleanSystemCaches, scanSystemCaches, sizeOneEntry } from './system-cache-service';

const notInstalled = { ok: false as const, reason: 'not-installed' as const, hint: 'not found' };

describe('scanSystemCaches / cleanSystemCaches', () => {
  // A fresh fake homedir per test — several tests mutate `.npm` directly, and
  // sharing one directory across tests would let an earlier test's leftover
  // files (a mock `trash` never actually deletes anything) leak into a
  // later test's byte counts.
  let home: string;

  beforeEach(async () => {
    home = await realpath(await mkdtemp(join(tmpdir(), 'mstudio-system-cache-svc-')));
    homeHolder.value = home;
    runProcessMock.mockResolvedValue(notInstalled);
  });

  afterEach(async () => {
    runProcessMock.mockReset();
    await rm(home, { recursive: true, force: true });
  });

  it('produces totalBytes matching a fixture and a byEcosystem that sums to it', async () => {
    await mkdir(join(home, '.npm'), { recursive: true });
    await writeFile(join(home, '.npm', 'a.bin'), 'x'.repeat(100));
    await writeFile(join(home, '.npm', 'b.bin'), 'x'.repeat(50));

    const result = await scanSystemCaches({ signal: new AbortController().signal, onProgress: () => {} });

    expect(result.totalBytes).toBe(150);
    expect(result.approximate).toBe(false);
    const sum = Object.values(result.byEcosystem).reduce((a, b) => a + b, 0);
    expect(sum).toBe(result.totalBytes);
    const npmItem = result.items.find((i) => i.entryId === 'npm-cache');
    expect(npmItem?.bytes).toBe(150);
    expect(npmItem?.label).toBe('npm cache');
    expect(npmItem?.producer.length).toBeGreaterThan(0);
  });

  it('an entry whose resolved path no longer exists is silently absent, not an error', async () => {
    const result = await scanSystemCaches({ signal: new AbortController().signal, onProgress: () => {} });
    expect(result.items.find((i) => i.entryId === 'cargo-registry')).toBeUndefined();
    expect(result.items).toHaveLength(0);
  });

  it('an aborted scan resolves with a partial result rather than throwing', async () => {
    await mkdir(join(home, '.npm'), { recursive: true });
    const controller = new AbortController();
    controller.abort();

    await expect(
      scanSystemCaches({ signal: controller.signal, onProgress: () => {} }),
    ).resolves.toMatchObject({ items: [] });
  });

  describe('sizeOneEntry — the per-entry approximate budget', () => {
    const entry: SystemCacheEntry = {
      id: 'npm-cache',
      label: 'npm cache',
      ecosystem: 'node',
      producer: 'npm install',
      reclaim: 'costly',
      resolve: { kind: 'fixed', path: '.npm' },
    };

    it('flags approximate when the walk hits the budget, and still reports non-zero bytes', async () => {
      const dir = join(home, 'many-files');
      await mkdir(dir, { recursive: true });
      for (let i = 0; i < 8; i += 1) {
        await writeFile(join(dir, `f${i}.bin`), 'x'.repeat(10));
      }

      const item = await sizeOneEntry(
        { entry, path: dir },
        5, // a small injected budget — the real 50,000 would need 50,001 real files
        new AbortController().signal,
        defaultLogger,
      );

      expect(item.approximate).toBe(true);
      expect(item.bytes).toBeGreaterThan(0);
    });

    it('a second entry scanned after an approximate one still reports its own real size', async () => {
      const small = join(home, 'small-entry');
      await mkdir(small, { recursive: true });
      await writeFile(join(small, 'one.bin'), 'x'.repeat(42));

      const item = await sizeOneEntry(
        { entry, path: small },
        5,
        new AbortController().signal,
        defaultLogger,
      );

      expect(item.approximate).toBe(false);
      expect(item.bytes).toBe(42);
    });
  });

  describe('cleanSystemCaches', () => {
    it('never reaches trash for an unknown entryId', async () => {
      const trash = vi.fn().mockResolvedValue(undefined);

      const outcome = await cleanSystemCaches(['not-a-real-entry'], trash);

      expect(trash).not.toHaveBeenCalled();
      expect(outcome.skipped).toEqual([
        { path: 'not-a-real-entry', reason: 'not a known system cache' },
      ]);
    });

    it('trashes a known entry and reports its freed bytes', async () => {
      await mkdir(join(home, '.npm'), { recursive: true });
      await writeFile(join(home, '.npm', 'a.bin'), 'x'.repeat(64));

      const trash = vi.fn().mockResolvedValue(undefined);
      const outcome = await cleanSystemCaches(['npm-cache'], trash);

      expect(trash).toHaveBeenCalledWith(join(home, '.npm'));
      expect(outcome.freedBytes).toBe(64);
      expect(outcome.skipped).toEqual([]);
    });

    it('skips an entry that has become a symlink between scan and clean', async () => {
      const real = join(home, 'real-npm');
      await mkdir(real, { recursive: true });
      await symlink(real, join(home, '.npm'));

      const trash = vi.fn().mockResolvedValue(undefined);
      const outcome = await cleanSystemCaches(['npm-cache'], trash);

      expect(trash).not.toHaveBeenCalled();
      // resolveSystemCacheEntries already drops a symlinked entry, so it
      // never even reaches cleanSystemCaches's own byEntryId map.
      expect(outcome.skipped).toEqual([
        { path: 'npm-cache', reason: 'not a known system cache' },
      ]);
    });
  });
});
