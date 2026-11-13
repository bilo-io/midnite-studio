import { readFileSync } from 'node:fs';

import { describe, expect, it, vi } from 'vitest';

import { LAUNCHER_FEED_URL, LAUNCHER_UPDATE_FEED, runLauncherUpdates, type UpdaterLike } from './updater';

function fakeUpdater(check: () => Promise<unknown> = async () => null): UpdaterLike & { feeds: unknown[] } {
  const feeds: unknown[] = [];
  return {
    feeds,
    autoDownload: true,
    autoInstallOnAppQuit: true,
    setFeedURL: (options) => feeds.push(options),
    checkForUpdates: check,
  };
}

describe('the launcher feed', () => {
  it('is generic and namespaced under midnite-launcher/ — never the github provider', () => {
    expect(LAUNCHER_UPDATE_FEED).toEqual({
      provider: 'generic',
      url: 'https://raw.githubusercontent.com/bilo-io/midnite-apps/main/midnite-launcher/feed',
      channel: 'latest',
    });
    expect(LAUNCHER_FEED_URL).not.toMatch(/releases\/latest/);
  });

  it('is the feed electron-builder.yml writes into app-update.yml', () => {
    const yml = readFileSync(new URL('../../electron-builder.yml', import.meta.url), 'utf8');
    expect(yml).toContain(`provider: generic\n    url: ${LAUNCHER_FEED_URL}\n    channel: latest`);
    expect(yml).not.toMatch(/provider:\s*github/);
  });
});

describe('runLauncherUpdates', () => {
  it('does nothing in dev — no feed, no check, no bundle pass', async () => {
    const updater = fakeUpdater(vi.fn());
    const updateBundles = vi.fn();
    expect(await runLauncherUpdates({ updater, isPackaged: false, adHocSigned: true, updateBundles })).toBe('dev');
    expect(updater.feeds).toEqual([]);
    expect(updateBundles).not.toHaveBeenCalled();
  });

  it('a signed build checks its own feed, auto-installs on quit, then updates the bundles', async () => {
    const order: string[] = [];
    const updater = fakeUpdater(async () => order.push('runtime'));
    const mode = await runLauncherUpdates({
      updater,
      isPackaged: true,
      adHocSigned: false,
      updateBundles: async () => {
        order.push('bundles');
      },
    });
    expect(mode).toBe('auto');
    expect(updater.feeds).toEqual([LAUNCHER_UPDATE_FEED]);
    expect([updater.autoDownload, updater.autoInstallOnAppQuit]).toEqual([true, true]);
    expect(order).toEqual(['runtime', 'bundles']);
  });

  it('with the update switch off it makes no feed request, and the bundle pass still runs', async () => {
    const check = vi.fn(async () => null);
    const updater = fakeUpdater(check);
    const updateBundles = vi.fn(async () => undefined);
    await runLauncherUpdates({ updater, isPackaged: true, adHocSigned: false, updateBundles, checkRuntime: false });
    expect(check).not.toHaveBeenCalled();
    expect(updateBundles).toHaveBeenCalledOnce();
  });

  it('an ad-hoc build only checks, and a failed check still lets the bundles update', async () => {
    const updater = fakeUpdater(async () => Promise.reject(new Error('offline')));
    const errors: string[] = [];
    const updateBundles = vi.fn(async () => undefined);
    const mode = await runLauncherUpdates({ updater, isPackaged: true, adHocSigned: true, updateBundles, onError: (m) => errors.push(m) });
    expect(mode).toBe('check-only');
    expect([updater.autoDownload, updater.autoInstallOnAppQuit]).toEqual([false, false]);
    expect(updateBundles).toHaveBeenCalledOnce();
    expect(errors).toEqual(['offline']);
  });
});
