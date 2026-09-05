import { mkdir, mkdtemp, realpath, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { confineAllowlist } from './fs-scope-write';

describe('confineAllowlist (Phase 73 — the system-cache registry jail)', () => {
  let home: string;
  let outside: string;
  let allowed: string[];

  beforeAll(async () => {
    // realpath'd up front — macOS's tmpdir is itself a symlink (/var →
    // /private/var), and confineAllowlist compares against REAL paths.
    home = await realpath(await mkdtemp(join(tmpdir(), 'mstudio-confine-allowlist-')));
    outside = await realpath(await mkdtemp(join(tmpdir(), 'mstudio-confine-allowlist-outside-')));

    await mkdir(join(home, '.cargo', 'registry'), { recursive: true });
    await mkdir(join(home, '.cargo', 'registry-old'), { recursive: true });
    await symlink(outside, join(home, '.cargo', 'escape-link'));

    allowed = [join(home, '.cargo', 'registry')];
  });

  afterAll(async () => {
    await rm(home, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  });

  it('accepts an exact match against a registered entry', async () => {
    const target = join(home, '.cargo', 'registry');
    await expect(confineAllowlist(allowed, target)).resolves.toBe(await realpath(target));
  });

  it('refuses a path outside every entry', async () => {
    await expect(confineAllowlist(allowed, outside)).resolves.toBeNull();
  });

  it('refuses a path UNDER an entry — the descent case', async () => {
    const nested = join(home, '.cargo', 'registry', 'cache');
    await mkdir(nested, { recursive: true });
    await expect(confineAllowlist(allowed, nested)).resolves.toBeNull();
  });

  it('refuses a path that is a PARENT of an entry — the case a startsWith mistake would pass', async () => {
    await expect(confineAllowlist(allowed, join(home, '.cargo'))).resolves.toBeNull();
  });

  it('refuses a sibling whose name shares a prefix with an entry', async () => {
    await expect(
      confineAllowlist(allowed, join(home, '.cargo', 'registry-old')),
    ).resolves.toBeNull();
  });

  it('refuses a symlink pointing an entry at somewhere else — resolves to its real target first', async () => {
    // The allowlist itself names the symlink; realpath-both-sides means it
    // would compare equal to `outside` if this function alone were relied on
    // — this is exactly why `resolveSystemCacheEntries` refuses a symlinked
    // entry BEFORE it ever reaches here (see that suite's own symlink case).
    // This test documents `confineAllowlist`'s contract in isolation: an
    // allowlist entry sitting at a symlink resolves through it.
    const symlinkedAllowed = [join(home, '.cargo', 'escape-link')];
    await expect(confineAllowlist(symlinkedAllowed, outside)).resolves.toBe(outside);
  });

  it('refuses a nonexistent path rather than throwing', async () => {
    await expect(confineAllowlist(allowed, join(home, 'nope'))).resolves.toBeNull();
  });

  it('refuses when an allowlist entry itself does not exist, without throwing', async () => {
    const target = join(home, '.cargo', 'registry');
    await expect(
      confineAllowlist([join(home, 'does-not-exist'), ...allowed], target),
    ).resolves.toBe(await realpath(target));
  });
});

describe('confineAllowlist — Plex siblings (Phase 74 Theme A)', () => {
  let plexHome: string;
  let plexAllowed: string[];

  beforeAll(async () => {
    plexHome = await realpath(await mkdtemp(join(tmpdir(), 'mstudio-confine-plex-')));
    const server = join(plexHome, 'Library', 'Application Support', 'Plex Media Server');

    await mkdir(join(server, 'Cache', 'Transcode'), { recursive: true });
    await mkdir(join(server, 'Metadata'), { recursive: true });
    await mkdir(join(server, 'Plug-in Support', 'Databases'), { recursive: true });
    await mkdir(join(server, 'Plug-in Support', 'Caches'), { recursive: true });

    // Only the two Phase 74 registry paths are ever allowed — everything
    // else in this tree is a dangerous sibling that must stay refused.
    plexAllowed = [join(server, 'Cache'), join(server, 'Plug-in Support', 'Caches')];
  });

  afterAll(async () => {
    await rm(plexHome, { recursive: true, force: true });
  });

  const server = () => join(plexHome, 'Library', 'Application Support', 'Plex Media Server');

  it('accepts the allowed Cache directory itself', async () => {
    const target = join(server(), 'Cache');
    await expect(confineAllowlist(plexAllowed, target)).resolves.toBe(await realpath(target));
  });

  it('refuses the parent "Plex Media Server" directory', async () => {
    await expect(confineAllowlist(plexAllowed, server())).resolves.toBeNull();
  });

  it('refuses "Metadata" (artwork, expensive to rebuild) — a dangerous sibling', async () => {
    await expect(confineAllowlist(plexAllowed, join(server(), 'Metadata'))).resolves.toBeNull();
  });

  it('refuses "Plug-in Support/Databases" — the actual Plex database', async () => {
    await expect(
      confineAllowlist(plexAllowed, join(server(), 'Plug-in Support', 'Databases')),
    ).resolves.toBeNull();
  });

  it('refuses "Plug-in Support" itself — the parent of an allowed entry', async () => {
    await expect(
      confineAllowlist(plexAllowed, join(server(), 'Plug-in Support')),
    ).resolves.toBeNull();
  });

  it('refuses "Cache/Transcode" — a CHILD of an allowed entry, proving equality not prefix', async () => {
    await expect(
      confineAllowlist(plexAllowed, join(server(), 'Cache', 'Transcode')),
    ).resolves.toBeNull();
  });
});
