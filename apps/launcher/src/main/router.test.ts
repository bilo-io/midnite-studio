import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { resourceRefLink } from '@midnite/studio-shared/domain/resource-ref';
import { handoffLink } from '@midnite/studio-shared/handoff';

import { recordInstall } from './bundles/state';
import { handleMidniteLink, installedBundleFinder, linkFromArgv, routeTarget, studioUrlFor, type RouterDeps } from './router';

const deps = (over: Partial<RouterDeps> = {}): RouterDeps => ({
  findAppBundle: async () => null,
  isStudioInstalled: async () => true,
  ...over,
});

describe('studioUrlFor', () => {
  it('maps page, view(+tab) and bare app to midnite-studio links', () => {
    expect(studioUrlFor({ app: 'vault', page: 'accounts' })).toBe('midnite-studio://view?id=settings&page=accounts');
    expect(studioUrlFor({ app: 'gamer', view: 'media', tab: 'game' })).toBe('midnite-studio://view?id=media&tab=game');
    expect(studioUrlFor({ app: 'coder', view: 'sessions' })).toBe('midnite-studio://view?id=sessions');
    expect(studioUrlFor({ app: 'gamer' })).toBe('midnite-studio://view?id=media&tab=game');
    expect(studioUrlFor({ app: 'cleaner' })).toBe('midnite-studio://view?id=optimizer');
  });
});

describe('routeTarget', () => {
  it("finds an app's bundle through the installed-state record, and nothing without one", async () => {
    const root = await mkdtemp(join(tmpdir(), 'launcher-router-test-'));
    try {
      const find = installedBundleFinder(root);
      expect(await find('cleaner')).toBeNull();
      await recordInstall(root, {
        id: 'cleaner',
        version: '0.1.0',
        sha256: 'a'.repeat(64),
        bundlePath: join(root, 'cleaner'),
        stubPath: '/stubs/Midnite Cleaner.app',
        runtimeVersion: '0.1.0',
        installedAt: '2026-10-14T00:00:00.000Z',
      });
      expect(await find('cleaner')).toBe('/stubs/Midnite Cleaner.app');
      expect(await find('coder')).toBeNull();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it('prefers an installed app bundle', async () => {
    const d = deps({ findAppBundle: async () => '/Applications/Midnite Coder.app' });
    expect(await routeTarget({ app: 'coder' }, d)).toEqual({ kind: 'bundle', path: '/Applications/Midnite Coder.app' });
  });
  it('forwards to Studio when there is no bundle', async () => {
    expect(await routeTarget({ app: 'coder', view: 'tasks' }, deps())).toEqual({
      kind: 'studio',
      url: 'midnite-studio://view?id=tasks',
    });
  });
  it('shows the detail sheet when neither is installed', async () => {
    expect(await routeTarget({ app: 'coder' }, deps({ isStudioInstalled: async () => false }))).toEqual({
      kind: 'detail',
      app: 'coder',
    });
  });
});

describe('handleMidniteLink', () => {
  const actions = () => ({ openBundle: vi.fn(async () => {}), openStudioUrl: vi.fn(async () => {}), showDetail: vi.fn() });

  it('ignores anything that is not a valid link', async () => {
    const a = actions();
    expect(await handleMidniteLink('midnite://open?app=nope', deps(), a)).toBeNull();
    expect(await handleMidniteLink('midnite-studio://view?id=graph', deps(), a)).toBeNull();
    expect(a.openStudioUrl).not.toHaveBeenCalled();
    expect(a.showDetail).not.toHaveBeenCalled();
  });
  it('opens the bundle', async () => {
    const a = actions();
    await handleMidniteLink('midnite://open?app=coder', deps({ findAppBundle: async () => '/x.app' }), a);
    expect(a.openBundle).toHaveBeenCalledWith('/x.app');
    expect(a.openStudioUrl).not.toHaveBeenCalled();
  });
  it('forwards to Studio, dropping a bad tab', async () => {
    const a = actions();
    await handleMidniteLink('midnite://open?app=gamer&view=media&tab=bogus', deps(), a);
    expect(a.openStudioUrl).toHaveBeenCalledWith('midnite-studio://view?id=media');
  });
  it('forwards a settings page', async () => {
    const a = actions();
    await handleMidniteLink('midnite://open?app=vault&page=accounts', deps(), a);
    expect(a.openStudioUrl).toHaveBeenCalledWith('midnite-studio://view?id=settings&page=accounts');
  });
  it('shows the detail sheet with no Studio', async () => {
    const a = actions();
    await handleMidniteLink('midnite://open?app=money', deps({ isStudioInstalled: async () => false }), a);
    expect(a.showDetail).toHaveBeenCalledWith('money');
    expect(a.openStudioUrl).not.toHaveBeenCalled();
  });
  it('falls back to the sheet when opening fails', async () => {
    const a = actions();
    a.openStudioUrl.mockRejectedValueOnce(new Error('boom'));
    expect(await handleMidniteLink('midnite://open?app=money', deps(), a)).toEqual({ kind: 'detail', app: 'money' });
    expect(a.showDetail).toHaveBeenCalledWith('money');
  });
});

describe('every router fallback, end to end through handleMidniteLink', () => {
  const run = async (raw: unknown, d: RouterDeps) => {
    const a = { openBundle: vi.fn(async () => {}), openStudioUrl: vi.fn(async () => {}), showDetail: vi.fn() };
    const decision = await handleMidniteLink(raw, d, a);
    return { a, decision };
  };

  it('installed bundle wins even when Studio is installed too', async () => {
    const { a, decision } = await run(
      'midnite://open?app=coder&view=sessions',
      deps({ findAppBundle: async (app) => (app === 'coder' ? '/stubs/Coder.app' : null) }),
    );
    expect(decision).toEqual({ kind: 'bundle', path: '/stubs/Coder.app' });
    expect(a.openBundle).toHaveBeenCalledWith('/stubs/Coder.app');
    expect(a.openStudioUrl).not.toHaveBeenCalled();
    expect(a.showDetail).not.toHaveBeenCalled();
  });

  it('not installed but Studio is: forwards the exact midnite-studio:// link', async () => {
    const { a } = await run('midnite://open?app=coder&view=sessions', deps());
    expect(a.openStudioUrl).toHaveBeenCalledWith('midnite-studio://view?id=sessions');
    expect(a.openBundle).not.toHaveBeenCalled();
  });

  it('neither installed: the launcher detail sheet for that app', async () => {
    const { a, decision } = await run('midnite://open?app=coder', deps({ isStudioInstalled: async () => false }));
    expect(decision).toEqual({ kind: 'detail', app: 'coder' });
    expect(a.showDetail).toHaveBeenCalledWith('coder');
    expect(a.openBundle).not.toHaveBeenCalled();
    expect(a.openStudioUrl).not.toHaveBeenCalled();
  });

  it.each([undefined, null, 42, '', 'not a url', 'midnite://open', 'midnite://open?app=', 'midnite://open?app=nope', 'midnite://close?app=coder', 'https://open?app=coder'])(
    'malformed or unknown (%j) is a safe no-op',
    async (raw) => {
      const { a, decision } = await run(raw, deps());
      expect(decision).toBeNull();
      expect(a.openBundle).not.toHaveBeenCalled();
      expect(a.openStudioUrl).not.toHaveBeenCalled();
      expect(a.showDetail).not.toHaveBeenCalled();
    },
  );

  it('a failing bundle open falls back to the sheet, not to Studio', async () => {
    const a = { openBundle: vi.fn(async () => { throw new Error('boom'); }), openStudioUrl: vi.fn(async () => {}), showDetail: vi.fn() };
    const decision = await handleMidniteLink('midnite://open?app=coder', deps({ findAppBundle: async () => '/x.app' }), a);
    expect(decision).toEqual({ kind: 'detail', app: 'coder' });
    expect(a.showDetail).toHaveBeenCalledWith('coder');
    expect(a.openStudioUrl).not.toHaveBeenCalled();
  });

  it('uses a real installed.json in a temp dir for the bundle step', async () => {
    const root = await mkdtemp(join(tmpdir(), 'launcher-router-e2e-'));
    try {
      const d = deps({ findAppBundle: installedBundleFinder(root) });
      expect((await run('midnite://open?app=cleaner', d)).decision).toEqual({ kind: 'studio', url: 'midnite-studio://view?id=optimizer' });
      await recordInstall(root, {
        id: 'cleaner',
        version: '0.1.0',
        sha256: 'b'.repeat(64),
        bundlePath: join(root, 'cleaner'),
        stubPath: '/stubs/Midnite Cleaner.app',
        runtimeVersion: '0.1.0',
        installedAt: '2026-10-14T00:00:00.000Z',
      });
      expect((await run('midnite://open?app=cleaner', d)).decision).toEqual({ kind: 'bundle', path: '/stubs/Midnite Cleaner.app' });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe('hand-off links through the router', () => {
  const actions = () => ({ openBundle: vi.fn(async () => {}), openStudioUrl: vi.fn(async () => {}), showDetail: vi.fn() });
  const ref = { kind: 'commit', repoId: 'repo:a', sha: 'abc1234' } as const;

  it('forwards a hand-off to Studio as the reveal link for the same ref', async () => {
    const a = actions();
    await handleMidniteLink(handoffLink({ app: 'coder', view: 'graph', ref }), deps(), a);
    expect(a.openStudioUrl).toHaveBeenCalledWith(resourceRefLink(ref));
  });

  it('an installed bundle is opened for a hand-off (ref delivery to it is the runtime transport seam)', async () => {
    const a = actions();
    await handleMidniteLink(handoffLink({ app: 'coder', ref }), deps({ findAppBundle: async () => '/c.app' }), a);
    expect(a.openBundle).toHaveBeenCalledWith('/c.app');
  });
});

describe('linkFromArgv', () => {
  it('finds the midnite:// argument', () => {
    expect(linkFromArgv(['/x/Electron', '--flag', 'midnite://open?app=coder'])).toBe('midnite://open?app=coder');
    expect(linkFromArgv(['/x/Electron', 'midnite-studio://view?id=graph'])).toBeUndefined();
  });
});
