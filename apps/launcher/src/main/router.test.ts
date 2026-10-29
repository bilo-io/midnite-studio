import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { resourceRefLink } from '@midnite/studio-shared/domain/resource-ref';
import { handoffLink } from '@midnite/studio-shared/handoff';
import { createLinkRateLimiter, PAGE_LINK_RATE_WINDOW_MS } from '@midnite/studio-shared/page-deep-link';

import { recordInstall } from './bundles/state';
import { handleMidniteLink, installedBundleFinder, linkFromArgv, routeTarget, studioUrlFor, type RouterDeps } from './router';

const deps = (over: Partial<RouterDeps> = {}): RouterDeps => ({
  findAppBundle: async () => null,
  isStudioInstalled: async () => true,
  ...over,
});

describe('studioUrlFor', () => {
  it('maps page, view(+tab) and bare app to midnite-studio links', () => {
    expect(studioUrlFor({ app: 'vanguard', module: 'vault', page: 'accounts' })).toBe('midnite-studio://view?id=settings&page=accounts');
    expect(studioUrlFor({ app: 'gamer', view: 'media', tab: 'game' })).toBe('midnite-studio://view?id=media&tab=game');
    expect(studioUrlFor({ app: 'agents', module: 'coder', view: 'sessions' })).toBe('midnite-studio://view?id=sessions');
    expect(studioUrlFor({ app: 'gamer' })).toBe('midnite-studio://view?id=media&tab=game');
    expect(studioUrlFor({ app: 'vanguard', module: 'cleaner' })).toBe('midnite-studio://view?id=optimizer');
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
    const d = deps({ findAppBundle: async () => '/Applications/Midnite Agents.app' });
    expect(await routeTarget({ app: 'agents' }, d)).toEqual({ kind: 'bundle', path: '/Applications/Midnite Agents.app' });
  });
  it('forwards to Studio when there is no bundle', async () => {
    expect(await routeTarget({ app: 'agents', module: 'coder', view: 'tasks' }, deps())).toEqual({
      kind: 'studio',
      url: 'midnite-studio://view?id=tasks',
    });
  });
  it('shows the detail sheet when neither is installed', async () => {
    expect(await routeTarget({ app: 'agents' }, deps({ isStudioInstalled: async () => false }))).toEqual({
      kind: 'detail',
      app: 'agents',
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

describe('an agent-run hand-off (Phase 113 Theme O)', () => {
  const RUN = { issueUrl: 'https://github.com/bilo-io/midnite-studio/issues/42', skill: '/midnite-create' };
  const actions = () => ({ openBundle: vi.fn(async () => {}), openStudioUrl: vi.fn(async () => {}), showDetail: vi.fn() });

  it('goes to Studio’s run receiver, even with an Agents bundle installed — a bundle would drop it', async () => {
    const link = handoffLink({ app: 'agents', run: RUN });
    const param = link.split('run=')[1];
    const a = actions();
    const findAppBundle = vi.fn(async () => '/stubs/Agents.app');
    await handleMidniteLink(link, deps({ findAppBundle }), a);
    expect(a.openStudioUrl).toHaveBeenCalledWith(`midnite-studio://run?req=${param}`);
    expect(a.openBundle).not.toHaveBeenCalled();
    expect(findAppBundle).not.toHaveBeenCalled();
  });

  it('with no Studio, shows the Agents sheet and forwards nothing', async () => {
    const a = actions();
    await handleMidniteLink(handoffLink({ app: 'agents', run: RUN }), deps({ isStudioInstalled: async () => false }), a);
    expect(a.showDetail).toHaveBeenCalledWith('agents');
    expect(a.openStudioUrl).not.toHaveBeenCalled();
  });

  it('lets one run through per 10 s, dropping the rest before Studio sees them (Phase 117 Theme G)', async () => {
    let t = 0;
    const runLimiter = createLinkRateLimiter(PAGE_LINK_RATE_WINDOW_MS, () => t);
    const a = actions();
    const link = handoffLink({ app: 'agents', run: RUN });
    expect(await handleMidniteLink(link, deps({ runLimiter }), a)).toMatchObject({ kind: 'studio' });
    t = 3_000;
    expect(await handleMidniteLink(link, deps({ runLimiter }), a)).toEqual({ kind: 'throttled' });
    // A plain open is not an action: never throttled.
    expect(await handleMidniteLink('midnite://open?app=agents', deps({ runLimiter }), a)).toMatchObject({ kind: 'studio' });
    expect(a.openStudioUrl).toHaveBeenCalledTimes(2);
    t = 10_000;
    expect(await handleMidniteLink(link, deps({ runLimiter }), a)).toMatchObject({ kind: 'studio' });
  });

  it('drops a run parameter that is not base64url instead of forwarding it', async () => {
    const a = actions();
    await handleMidniteLink('midnite://open?app=agents&run=%24(id)', deps(), a);
    // Agents' front door, as for any plain `app=agents` link: the bad run is gone, nothing is started.
    expect(a.openStudioUrl).toHaveBeenCalledWith('midnite-studio://view?id=chats');
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
    const { a } = await run('midnite://open?app=agents&module=coder&view=sessions', deps());
    expect(a.openStudioUrl).toHaveBeenCalledWith('midnite-studio://view?id=sessions');
    expect(a.openBundle).not.toHaveBeenCalled();
  });

  it('neither installed: the launcher detail sheet for that app', async () => {
    const { a, decision } = await run('midnite://open?app=agents', deps({ isStudioInstalled: async () => false }));
    expect(decision).toEqual({ kind: 'detail', app: 'agents' });
    expect(a.showDetail).toHaveBeenCalledWith('agents');
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
    const decision = await handleMidniteLink('midnite://open?app=agents', deps({ findAppBundle: async () => '/x.app' }), a);
    expect(decision).toEqual({ kind: 'detail', app: 'agents' });
    expect(a.showDetail).toHaveBeenCalledWith('agents');
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

describe('retired app links (Phase 124 Theme G)', () => {
  const actions = () => ({ openBundle: vi.fn(async () => {}), openStudioUrl: vi.fn(async () => {}), showDetail: vi.fn() });
  const bundles = (installed: Record<string, string>): RouterDeps['findAppBundle'] => async (app) => installed[app] ?? null;

  it('opens the host when it is installed, even with the old bundle beside it', async () => {
    const a = actions();
    const d = deps({ findAppBundle: bundles({ agents: '/Agents.app', coder: '/Coder.app' }) });
    expect(await handleMidniteLink('midnite://open?app=coder&view=reviews', d, a)).toEqual({ kind: 'bundle', path: '/Agents.app' });
    expect(a.openBundle).toHaveBeenCalledWith('/Agents.app');
  });

  it('falls back to the old bundle while the host is not installed', async () => {
    const a = actions();
    const d = deps({ findAppBundle: bundles({ coder: '/Coder.app' }) });
    expect(await handleMidniteLink('midnite://open?app=coder', d, a)).toEqual({ kind: 'bundle', path: '/Coder.app' });
  });

  it('forwards to Studio on the module, and shows the host sheet when nothing is installed', async () => {
    const a = actions();
    expect(await handleMidniteLink('midnite://open?app=vault&page=accounts', deps(), a)).toEqual({
      kind: 'studio',
      url: 'midnite-studio://view?id=settings&page=accounts',
    });
    const b = actions();
    expect(await handleMidniteLink('midnite://open?app=capture', deps({ isStudioInstalled: async () => false }), b)).toEqual({
      kind: 'detail',
      app: 'mind',
    });
    expect(b.showDetail).toHaveBeenCalledWith('mind');
  });

  it('never routes an agent run to a retired bundle', async () => {
    const d = deps({ findAppBundle: bundles({ coder: '/Coder.app' }) });
    const run = Buffer.from(JSON.stringify({ issueUrl: 'https://github.com/o/r/issues/1', skill: 'x' })).toString('base64url');
    expect((await routeTarget({ app: 'agents', legacyApp: 'coder', run }, d)).kind).toBe('studio');
  });
});

describe('hand-off links through the router', () => {
  const actions = () => ({ openBundle: vi.fn(async () => {}), openStudioUrl: vi.fn(async () => {}), showDetail: vi.fn() });
  const ref = { kind: 'commit', repoId: 'repo:a', sha: 'abc1234' } as const;

  it('forwards a hand-off to Studio as the reveal link for the same ref', async () => {
    const a = actions();
    await handleMidniteLink(handoffLink({ app: 'agents', view: 'graph', ref }), deps(), a);
    expect(a.openStudioUrl).toHaveBeenCalledWith(resourceRefLink(ref));
  });

  it('an installed bundle is opened for a hand-off (ref delivery to it is the runtime transport seam)', async () => {
    const a = actions();
    await handleMidniteLink(handoffLink({ app: 'agents', ref }), deps({ findAppBundle: async () => '/c.app' }), a);
    expect(a.openBundle).toHaveBeenCalledWith('/c.app');
  });
});

describe('linkFromArgv', () => {
  it('finds the midnite:// argument', () => {
    expect(linkFromArgv(['/x/Electron', '--flag', 'midnite://open?app=coder'])).toBe('midnite://open?app=coder');
    expect(linkFromArgv(['/x/Electron', 'midnite-studio://view?id=graph'])).toBeUndefined();
  });
});
