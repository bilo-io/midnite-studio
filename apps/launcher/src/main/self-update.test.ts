import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { launcherSelfStatus, SELF_UPDATE_SCRIPT, startSelfUpdate } from './self-update';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'launcher-self-update-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function fakeSpawn() {
  const unref = vi.fn();
  const spawn = vi.fn(() => ({ unref, once: vi.fn() }));
  return { spawn, unref };
}

describe('startSelfUpdate', () => {
  it('refuses in a dev run and spawns nothing', () => {
    const { spawn } = fakeSpawn();
    const result = startSelfUpdate({ isPackaged: false, logPath: join(dir, 'self-update.log'), spawn });
    expect(result.ok).toBe(false);
    expect(spawn).not.toHaveBeenCalled();
  });

  it('runs the website installer detached, with the URL as an argument, and lets it outlive the app', () => {
    const { spawn, unref } = fakeSpawn();
    const result = startSelfUpdate({
      isPackaged: true,
      logPath: join(dir, 'logs', 'self-update.log'),
      spawn,
      env: { PATH: '/usr/bin:/bin', MIDNITE_LAUNCHER_NO_OPEN: '1' },
    });
    expect(result).toEqual({ ok: true });
    expect(spawn).toHaveBeenCalledTimes(1);
    const [command, args, options] = spawn.mock.calls[0] as unknown as [string, string[], { detached: boolean; env: NodeJS.ProcessEnv }];
    expect(command).toBe('/bin/sh');
    expect(args).toEqual(['-c', SELF_UPDATE_SCRIPT, 'sh', 'https://midnite-apps.vercel.app/install.sh']);
    expect(options.detached).toBe(true);
    // The installer reopens the launcher it quit — an inherited NO_OPEN would leave none running.
    expect(options.env).toEqual({ PATH: '/usr/bin:/bin' });
    expect(unref).toHaveBeenCalled();
  });

  it('reports a spawn that throws instead of throwing', () => {
    const spawn = vi.fn(() => {
      throw new Error('EAGAIN');
    });
    expect(startSelfUpdate({ isPackaged: true, logPath: join(dir, 'self-update.log'), spawn })).toEqual({ ok: false, message: 'EAGAIN' });
  });
});

describe('launcherSelfStatus', () => {
  it('reads the launcher feed', async () => {
    const fetchImpl = vi.fn(async (_url: string) => new Response(JSON.stringify({ version: '0.0.6', releasedAt: '2026-10-27T00:00:00Z' })));
    const status = await launcherSelfStatus({ current: '0.0.5', isPackaged: true, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(fetchImpl.mock.calls[0]?.[0]).toBe('https://raw.githubusercontent.com/bilo-io/midnite-apps/main/midnite-launcher/version.json');
    expect(status).toEqual({
      current: '0.0.5',
      latest: { version: '0.0.6', releasedAt: '2026-10-27T00:00:00Z', notesUrl: null },
      feedError: null,
      canUpdate: true,
    });
  });

  it('carries the feed error when offline', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('offline');
    });
    const status = await launcherSelfStatus({ current: '0.0.5', isPackaged: false, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(status.latest).toBeNull();
    expect(status.feedError).toMatch(/offline/);
    expect(status.canUpdate).toBe(false);
  });
});
