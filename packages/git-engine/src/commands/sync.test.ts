import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { TempRepo } from '../testing/temp-repo';
import { buildFetchArgs, buildPushArgs, fetch, pull, push } from './sync';

let repo: TempRepo;
beforeEach(async () => {
  repo = await TempRepo.create();
});
afterEach(async () => {
  await repo.cleanup();
});

describe('sync argv (Phase 91 Themes B/C)', () => {
  it('fetch: --all is a field, the remote a guarded positional', () => {
    expect(buildFetchArgs({ remote: 'origin' })).toEqual(['fetch', '--prune', '--tags', '--end-of-options', 'origin']);
    expect(buildFetchArgs({ all: true })).toEqual(['fetch', '--prune', '--tags', '--all', '--end-of-options']);
    expect(buildFetchArgs({})).toContain('origin');
  });

  it('push builds the explicit ref:expect lease form behind the guard', () => {
    expect(
      buildPushArgs({ remote: 'origin', branch: 'main', forceWithLease: { ref: 'refs/heads/main', expect: 'abc1234' } }),
    ).toEqual(['push', '--force-with-lease=refs/heads/main:abc1234', '--end-of-options', 'origin', 'main']);
  });
});

describe('remote names are resolved against the repo (Phase 91 Theme C)', () => {
  it.each([
    ['fetch', () => fetch(repo.path, { remote: 'ext::sh -c id' })],
    ['pull', () => pull(repo.path, { remote: 'ext::sh -c id' })],
    ['push', () => push(repo.path, { remote: 'ext::sh -c id' })],
  ])('%s rejects a transport string rather than escaping it', async (_n, run) => {
    const res = await run();
    expect(res.ok).toBe(false);
    if (!res.ok && res.kind === 'error') expect(res.message).toMatch(/not a remote/);
  });

  it('refuses an ext:: transport even when it is configured as a remote', async () => {
    await repo.git(['remote', 'add', 'evil', "ext::sh -c 'touch mstudio-pwn'"]);
    const res = await fetch(repo.path, { remote: 'evil' });
    expect(res.ok).toBe(false);
    const { existsSync } = await import('node:fs');
    expect(existsSync(`${repo.path}/mstudio-pwn`)).toBe(false);
  });
});
