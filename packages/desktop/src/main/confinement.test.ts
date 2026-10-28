import { mkdtempSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { createConfinementService } from './confinement';

function make(opts: { enabled?: boolean; available?: boolean } = {}) {
  const userData = mkdtempSync(join(tmpdir(), 'confinement-'));
  const tracked: Array<[string, number]> = [];
  const service = createConfinementService({
    userData,
    homeDir: '/Users/u',
    availability: () => (opts.available === false ? { available: false, reason: 'no sandbox-exec' } : { available: true }),
    enabled: () => opts.enabled ?? false,
    registryRepos: async () => ['/Users/u/Dev/a', '/Users/u/Dev/b'],
    audit: { record: () => 'id' },
    raiseFinding: () => undefined,
    resolveRoots: async (cwd) => [cwd],
    denials: { track: (s, p) => void tracked.push([s, p]), untrack: () => undefined, handleLine: async () => undefined, stop: () => undefined },
  });
  return { service, userData, tracked };
}

describe('createConfinementService', () => {
  it('confines nothing while the setting is off (the default)', async () => {
    const { service } = make();
    expect(await service.prepare('s1', '/Users/u/Dev/a')).toBeNull();
    expect(service.status()).toEqual({ available: true, enabled: false });
  });

  it('builds a profile for the session: repo writable, the other repo unreadable, vault files protected', async () => {
    const { service, userData } = make({ enabled: true });
    const result = await service.prepare('s1', '/Users/u/Dev/a');
    expect(result).toMatchObject({ ok: true });
    if (!result?.ok) throw new Error('unreachable');
    const text = readFileSync(result.profile, 'utf8');
    expect(text).toContain('(subpath "/Users/u/Dev/b")');
    expect(text).toContain(`secrets.vault.json`);
    expect(text).toContain(join(userData, 'security'));
    result.release();
    expect(existsSync(result.profile)).toBe(false);
  });

  it('an explicit request overrides the setting, and fails closed when unavailable', async () => {
    const on = make({ enabled: false });
    expect(await on.service.prepare('s', '/Users/u/Dev/a', true)).toMatchObject({ ok: true });
    expect(await on.service.prepare('s2', '/Users/u/Dev/a', false)).toBeNull();
    const off = make({ enabled: true, available: false });
    expect(await off.service.prepare('s', '/x')).toBeNull();
    expect(await off.service.prepare('s', '/x', true)).toEqual({ ok: false, message: 'no sandbox-exec' });
    expect(off.service.status()).toEqual({ available: false, reason: 'no sandbox-exec', enabled: false });
  });

  it('hands a pid to the denial watcher', () => {
    const { service, tracked } = make();
    service.track('s1', 42);
    expect(tracked).toEqual([['s1', 42]]);
  });
});
