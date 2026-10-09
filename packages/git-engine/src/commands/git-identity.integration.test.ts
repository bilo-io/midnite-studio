import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getGlobalGitIdentity, setGlobalGitIdentity } from './git-identity';

describe('global git identity', () => {
  let home: string;
  const saved: Record<string, string | undefined> = {};

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), 'mstudio-gitid-'));
    for (const key of ['HOME', 'GIT_CONFIG_GLOBAL', 'XDG_CONFIG_HOME']) saved[key] = process.env[key];
    process.env['HOME'] = home;
    process.env['GIT_CONFIG_GLOBAL'] = join(home, '.gitconfig');
    process.env['XDG_CONFIG_HOME'] = join(home, '.config');
  });

  afterEach(async () => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(home, { recursive: true, force: true });
  });

  it('reads an unset identity as empty strings, not a failure', async () => {
    await writeFile(join(home, '.gitconfig'), '');
    expect(await getGlobalGitIdentity(home)).toEqual({ ok: true, value: { name: '', email: '' } });
  });

  it('writes both keys and reads them back', async () => {
    const result = await setGlobalGitIdentity({ name: 'Ada Lovelace', email: 'ada@example.com' }, home);
    expect(result).toEqual({ ok: true, value: { name: 'Ada Lovelace', email: 'ada@example.com' } });
    expect(await getGlobalGitIdentity(home)).toEqual({
      ok: true,
      value: { name: 'Ada Lovelace', email: 'ada@example.com' },
    });
  });

  it('serialises two concurrent writes instead of racing the config lock', async () => {
    const [a, b] = await Promise.all([
      setGlobalGitIdentity({ name: 'A', email: 'a@x.io' }, home),
      setGlobalGitIdentity({ name: 'B', email: 'b@x.io' }, home),
    ]);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
  });
});
