import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { MirrorConfigSchema, loadMirrorConfig, saveMirrorConfig } from './mirror-config';

describe('mirror config', () => {
  it('defaults to a daily interval and no repos, and survives a missing or corrupt file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'forge-host-cfg-'));
    try {
      expect(await loadMirrorConfig(join(dir, 'none.json'))).toMatchObject({ interval: 'daily', repos: [] });
      await writeFile(join(dir, 'bad.json'), '{nope');
      expect((await loadMirrorConfig(join(dir, 'bad.json'))).repos).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('round-trips through an owner-only file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'forge-host-cfg-'));
    try {
      const file = join(dir, 'sub', 'mirrors.json');
      const config = MirrorConfigSchema.parse({ interval: 'weekly', repos: [{ host: 'github.com', owner: 'a', repo: 'b', url: 'https://github.com/a/b.git' }] });
      await saveMirrorConfig(file, config);
      expect((await stat(file)).mode & 0o777).toBe(0o600);
      expect(await loadMirrorConfig(file)).toEqual(config);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('refuses an unsafe owner or remote', () => {
    const bad = (over: object) => MirrorConfigSchema.safeParse({ repos: [{ host: 'h.com', owner: 'o', repo: 'r', url: 'https://h.com/o/r', ...over }] }).success;
    expect(bad({})).toBe(true);
    expect(bad({ owner: '../x' })).toBe(false);
    expect(bad({ url: '--upload-pack=x' })).toBe(false);
  });
});
