import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ app: { getPath: () => '/tmp' } }));
vi.mock('../log', () => ({ defaultLogger: { warn: vi.fn(), info: vi.fn() } }));

import { createStudioMirrorHost, resolveMirrorForge, type MirrorForgePorts } from './mirror-host-wiring';

const repoOf = (url: string) => ({ host: new URL(url).host, owner: 'o', repo: 'r', url });
const adapter = { kind: 'x' };

function ports(over: Partial<MirrorForgePorts> & { kind?: string }): MirrorForgePorts {
  return {
    parse: ((url: string) => ({ host: new URL(url).host, owner: 'o', repo: 'r', kind: over.kind ?? 'github' })) as MirrorForgePorts['parse'],
    activeAccountFor: (async () => null) as MirrorForgePorts['activeAccountFor'],
    adapterFor: (() => adapter) as unknown as MirrorForgePorts['adapterFor'],
    githubWhoami: (async () => null) as MirrorForgePorts['githubWhoami'],
    ...over,
  };
}

describe('resolveMirrorForge', () => {
  it('mirrors refs only for a non-GitHub forge with no account, even though an adapter exists', async () => {
    expect(await resolveMirrorForge(repoOf('https://gitlab.com/o/r.git'), ports({ kind: 'gitlab' }))).toBeNull();
  });

  it('uses the account login for a non-GitHub forge', async () => {
    const account = { login: 'glbilo' } as never;
    const got = await resolveMirrorForge(repoOf('https://gitlab.com/o/r.git'), ports({ kind: 'gitlab', activeAccountFor: async () => account }));
    expect(got?.account).toBe('glbilo');
  });

  it('records the identity gh is signed in as for a gh-delegated GitHub', async () => {
    const whoami = vi.fn(async () => ({ login: 'octocat', displayName: '', avatarUrl: null }));
    const got = await resolveMirrorForge(repoOf('https://github.com/o/r.git'), ports({ githubWhoami: whoami as never }));
    expect(got?.account).toBe('octocat');
    expect(whoami).toHaveBeenCalledWith('github.com');
  });

  it('prefers the active account login for GitHub and skips the whoami call', async () => {
    const whoami = vi.fn();
    const got = await resolveMirrorForge(repoOf('https://github.com/o/r.git'), ports({ activeAccountFor: async () => ({ login: 'acct' }) as never, githubWhoami: whoami as never }));
    expect(got?.account).toBe('acct');
    expect(whoami).not.toHaveBeenCalled();
  });

  it('is refs only for GitHub when gh has no identity', async () => {
    expect(await resolveMirrorForge(repoOf('https://github.com/o/r.git'), ports({}))).toBeNull();
  });

  it('is null for an unparseable url or a forge with no adapter', async () => {
    expect(await resolveMirrorForge(repoOf('https://x.com/o/r.git'), ports({ parse: () => null }))).toBeNull();
    expect(await resolveMirrorForge(repoOf('https://github.com/o/r.git'), ports({ adapterFor: (() => null) as never }))).toBeNull();
  });
});

describe('studio mirror host', () => {
  it('builds a host whose start and stop are safe with no mirrors.json', async () => {
    const host = createStudioMirrorHost('/nonexistent-mirror-host-dir');
    await expect(host.start()).resolves.toBeUndefined();
    host.stop(); // clears the re-arm timer start() left for the default (daily) interval
  });
});
