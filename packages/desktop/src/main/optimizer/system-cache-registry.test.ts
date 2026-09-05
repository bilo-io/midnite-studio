import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// `homedir()` is faked to a real tmpdir so `lstat`-based checks (existence,
// symlink, directory) exercise the real filesystem — matching
// `confine-tree.test.ts`'s own reasoning for why a real fixture beats a
// mocked `fs`. Mutated through a hoisted holder, same pattern
// `template-path.test.ts` uses for `electronApp.isPackaged`.
const homeHolder = vi.hoisted(() => ({ value: '' }));
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => homeHolder.value };
});

// `runProcess` is stubbed so `queryTool` entries never actually spawn `go`,
// `pnpm` or `brew` — this suite must pass on a machine with none of them
// installed, and must not depend on what happens to be on this one's PATH.
const runProcessMock = vi.hoisted(() => vi.fn());
vi.mock('../process-runner', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../process-runner')>();
  return { ...actual, runProcess: runProcessMock };
});

import {
  DEFAULT_SYSTEM_CACHE_ENTRIES,
  resolveSystemCacheEntries,
  type SystemCacheEntry,
  type SystemCacheEntryId,
} from './system-cache-registry';

const notInstalled = { ok: false as const, reason: 'not-installed' as const, hint: 'not found' };

describe('DEFAULT_SYSTEM_CACHE_ENTRIES', () => {
  it('has a unique id for every entry, and every id is a member of SystemCacheEntryId', () => {
    const ids = DEFAULT_SYSTEM_CACHE_ENTRIES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    // Compile-time membership: `SystemCacheEntryId` is the exact union of ids.
    const _typedIds: SystemCacheEntryId[] = ids;
    expect(_typedIds.length).toBe(15);
  });

  it('gives every entry a non-empty producer', () => {
    for (const entry of DEFAULT_SYSTEM_CACHE_ENTRIES) {
      expect(entry.producer.length).toBeGreaterThan(0);
    }
  });

  it('writes every `fixed` path homedir-relative — no leading `~`, no leading `/`', () => {
    for (const entry of DEFAULT_SYSTEM_CACHE_ENTRIES) {
      if (entry.resolve.kind !== 'fixed') continue;
      expect(entry.resolve.path.startsWith('~')).toBe(false);
      expect(isAbsolute(entry.resolve.path)).toBe(false);
    }
  });

  it("parses each queryTool entry's real captured stdout shape", () => {
    const goCache = DEFAULT_SYSTEM_CACHE_ENTRIES.find((e) => e.id === 'go-build-cache');
    const pnpmStore = DEFAULT_SYSTEM_CACHE_ENTRIES.find((e) => e.id === 'pnpm-store');
    const brewCache = DEFAULT_SYSTEM_CACHE_ENTRIES.find((e) => e.id === 'homebrew-cache');
    if (goCache?.resolve.kind !== 'queryTool') throw new Error('go-build-cache misconfigured');
    if (pnpmStore?.resolve.kind !== 'queryTool') throw new Error('pnpm-store misconfigured');
    if (brewCache?.resolve.kind !== 'queryTool') throw new Error('homebrew-cache misconfigured');

    expect(goCache.resolve.parse('/Users/x/Library/Caches/go-build\n')).toBe(
      '/Users/x/Library/Caches/go-build',
    );
    expect(pnpmStore.resolve.parse('/Users/x/Library/pnpm/store/v3\n')).toBe(
      '/Users/x/Library/pnpm/store/v3',
    );
    expect(brewCache.resolve.parse('/Users/x/Library/Caches/Homebrew\n')).toBe(
      '/Users/x/Library/Caches/Homebrew',
    );

    // Empty output and multi-line noise both fail to produce a path.
    expect(goCache.resolve.parse('')).toBeNull();
    expect(goCache.resolve.parse('\n')).toBeNull();
  });

  it("grades Plex's two entries opposite ways, asserted by id so a reorder can't silently swap them", () => {
    const transcode = DEFAULT_SYSTEM_CACHE_ENTRIES.find((e) => e.id === 'plex-transcode-cache');
    const agentCache = DEFAULT_SYSTEM_CACHE_ENTRIES.find((e) => e.id === 'plex-plugin-http-cache');
    expect(transcode?.reclaim).toBe('cheap');
    expect(agentCache?.reclaim).toBe('costly');
    expect(transcode?.ecosystem).toBe('media');
    expect(agentCache?.ecosystem).toBe('media');
  });
});

describe('resolveSystemCacheEntries', () => {
  let home: string;
  let outsideHome: string;

  beforeAll(async () => {
    // realpath'd up front — macOS's tmpdir is itself a symlink (/var →
    // /private/var), and the containment check compares against the REAL home.
    home = await realpath(await mkdtemp(join(tmpdir(), 'mstudio-system-cache-')));
    outsideHome = await realpath(await mkdtemp(join(tmpdir(), 'mstudio-system-cache-outside-')));
    homeHolder.value = home;
  });

  afterAll(async () => {
    await rm(home, { recursive: true, force: true });
    await rm(outsideHome, { recursive: true, force: true });
  });

  afterEach(() => {
    runProcessMock.mockReset();
  });

  const fixed = (id: SystemCacheEntryId, path: string): SystemCacheEntry => ({
    id,
    label: id,
    ecosystem: 'node',
    producer: 'test',
    reclaim: 'costly',
    resolve: { kind: 'fixed', path },
  });

  it('returns exactly one entry with a fake homedir containing only .npm, every queryTool stubbed to fail', async () => {
    await mkdir(join(home, '.npm'), { recursive: true });
    runProcessMock.mockResolvedValue(notInstalled);

    const resolved = await resolveSystemCacheEntries(DEFAULT_SYSTEM_CACHE_ENTRIES);

    expect(resolved).toHaveLength(1);
    expect(resolved[0]?.entry.id).toBe('npm-cache');
    expect(resolved[0]?.path).toBe(join(home, '.npm'));
  });

  it('drops a queryTool entry reporting not-installed, without throwing', async () => {
    runProcessMock.mockResolvedValue(notInstalled);
    const entries = [
      {
        id: 'go-build-cache' as const,
        label: 'Go build cache',
        ecosystem: 'go' as const,
        producer: 'go build',
        reclaim: 'cheap' as const,
        resolve: { kind: 'queryTool' as const, command: 'go', args: ['env', 'GOCACHE'], parse: (s: string) => s.trim() || null },
      },
    ];
    await expect(resolveSystemCacheEntries(entries)).resolves.toEqual([]);
  });

  it('drops a queryTool entry that exits non-zero even with stdout', async () => {
    runProcessMock.mockResolvedValue({
      ok: true,
      data: '/wherever',
      stderr: '',
      exitCode: 1,
      ranAt: 0,
      durationMs: 0,
    });
    const entries = [
      {
        id: 'go-build-cache' as const,
        label: 'Go build cache',
        ecosystem: 'go' as const,
        producer: 'go build',
        reclaim: 'cheap' as const,
        resolve: { kind: 'queryTool' as const, command: 'go', args: ['env', 'GOCACHE'], parse: (s: string) => s.trim() || null },
      },
    ];
    await expect(resolveSystemCacheEntries(entries)).resolves.toEqual([]);
  });

  it('drops a queryTool result outside the home directory', async () => {
    runProcessMock.mockResolvedValue({
      ok: true,
      data: outsideHome,
      stderr: '',
      exitCode: 0,
      ranAt: 0,
      durationMs: 0,
    });
    const entries = [
      {
        id: 'go-build-cache' as const,
        label: 'Go build cache',
        ecosystem: 'go' as const,
        producer: 'go build',
        reclaim: 'cheap' as const,
        resolve: { kind: 'queryTool' as const, command: 'go', args: ['env', 'GOCACHE'], parse: (s: string) => s.trim() || null },
      },
    ];
    await expect(resolveSystemCacheEntries(entries)).resolves.toEqual([]);
  });

  it('drops the home directory itself', async () => {
    runProcessMock.mockResolvedValue({
      ok: true,
      data: home,
      stderr: '',
      exitCode: 0,
      ranAt: 0,
      durationMs: 0,
    });
    const entries = [
      {
        id: 'go-build-cache' as const,
        label: 'Go build cache',
        ecosystem: 'go' as const,
        producer: 'go build',
        reclaim: 'cheap' as const,
        resolve: { kind: 'queryTool' as const, command: 'go', args: ['env', 'GOCACHE'], parse: (s: string) => s.trim() || null },
      },
    ];
    await expect(resolveSystemCacheEntries(entries)).resolves.toEqual([]);
  });

  it('drops a fixed entry whose resolved path is a symlink', async () => {
    await mkdir(join(home, 'real-cargo-registry'), { recursive: true });
    await symlink(join(home, 'real-cargo-registry'), join(home, '.cargo-symlinked'));

    const resolved = await resolveSystemCacheEntries([fixed('cargo-registry', '.cargo-symlinked')]);
    expect(resolved).toEqual([]);
  });

  it('drops a nonexistent fixed entry silently (not installed / never used)', async () => {
    const resolved = await resolveSystemCacheEntries([fixed('gradle-caches', '.gradle-does-not-exist')]);
    expect(resolved).toEqual([]);
  });

  it('drops a fixed entry that resolves to a file, not a directory', async () => {
    await writeFile(join(home, 'not-a-dir'), 'x');
    const resolved = await resolveSystemCacheEntries([fixed('npm-cache', 'not-a-dir')]);
    expect(resolved).toEqual([]);
  });

  it('keeps the first of two entries resolving to the same real path, drops the later one', async () => {
    await mkdir(join(home, 'shared-cache'), { recursive: true });
    const entries = [fixed('npm-cache', 'shared-cache'), fixed('yarn-cache', 'shared-cache')];
    const resolved = await resolveSystemCacheEntries(entries);
    expect(resolved).toHaveLength(1);
    expect(resolved[0]?.entry.id).toBe('npm-cache');
  });

  describe("Plex's two entries (Phase 74 Theme A)", () => {
    // Own isolated fake home per test, swapped into `homeHolder` and restored
    // after — the outer describe's shared `home` accumulates fixtures across
    // tests, and a Plex "Cache" directory created by one test would corrupt
    // the symlink/not-installed assertions of another.
    const plexEntries = DEFAULT_SYSTEM_CACHE_ENTRIES.filter((e) => e.id.startsWith('plex-'));
    let plexHome: string;
    let outerHome: string;

    beforeAll(async () => {
      outerHome = homeHolder.value;
    });

    beforeEach(async () => {
      plexHome = await realpath(await mkdtemp(join(tmpdir(), 'mstudio-plex-')));
      homeHolder.value = plexHome;
    });

    afterEach(async () => {
      homeHolder.value = outerHome;
      await rm(plexHome, { recursive: true, force: true });
    });

    it('resolve under a fake homedir when both directories exist', async () => {
      await mkdir(join(plexHome, 'Library/Application Support/Plex Media Server/Cache'), {
        recursive: true,
      });
      await mkdir(
        join(plexHome, 'Library/Application Support/Plex Media Server/Plug-in Support/Caches'),
        { recursive: true },
      );

      const resolved = await resolveSystemCacheEntries(plexEntries);

      expect(resolved).toHaveLength(2);
      const byId = new Map(resolved.map((r) => [r.entry.id, r.path]));
      expect(byId.get('plex-transcode-cache')).toBe(
        join(plexHome, 'Library/Application Support/Plex Media Server/Cache'),
      );
      expect(byId.get('plex-plugin-http-cache')).toBe(
        join(plexHome, 'Library/Application Support/Plex Media Server/Plug-in Support/Caches'),
      );
    });

    it('is a silent skip when Plex is not installed (neither directory exists)', async () => {
      const resolved = await resolveSystemCacheEntries(plexEntries);
      expect(resolved).toEqual([]);
    });

    it('drops a symlinked Plex "Cache" directory rather than following it', async () => {
      const realTarget = join(plexHome, 'real-plex-cache-target');
      await mkdir(realTarget, { recursive: true });
      await mkdir(join(plexHome, 'Library/Application Support/Plex Media Server'), {
        recursive: true,
      });
      await symlink(realTarget, join(plexHome, 'Library/Application Support/Plex Media Server/Cache'));

      const resolved = await resolveSystemCacheEntries([
        DEFAULT_SYSTEM_CACHE_ENTRIES.find((e) => e.id === 'plex-transcode-cache')!,
      ]);

      expect(resolved).toEqual([]);
    });
  });
});
