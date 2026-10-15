import { describe, expect, it, vi } from 'vitest';

import type { AppInstallProgress, LauncherResult } from '../../common/bridge';
import type { Catalog } from '../../common/catalog-feed';
import { EMPTY_INSTALLED_STATE } from '../../common/installed-state';
import { createAppsOps, type AppsOpsDeps } from './apps-ops';
import type { BundleOpsDeps } from './install-bundle';
import { stubIdentity } from './layout';

const sha = 'a'.repeat(64);
const catalog: Catalog = {
  schemaVersion: 1,
  runtimeVersion: '0.4.1',
  apps: [
    { id: 'cleaner', version: '0.4.1', bundleUrl: 'https://example.com/cleaner.zip', size: 10, sha256: sha, minimumRuntimeVersion: '0.4.1' },
  ],
};
const bundleDeps = { roots: { installRoot: '/i', stubRoot: '/s' }, isRunning: async () => false } as unknown as BundleOpsDeps;

function harness(over: Partial<AppsOpsDeps> = {}) {
  const install = vi.fn<AppsOpsDeps['install']>(async (_entry, _identity, deps) => {
    deps.onProgress?.({ phase: 'download', received: 5, total: 10 });
    return { ok: true };
  });
  const uninstall = vi.fn<AppsOpsDeps['uninstall']>(async () => ({ ok: true }));
  const events: AppInstallProgress[] = [];
  const ops = createAppsOps({
    runtimeVersion: '0.4.1',
    fetchCatalog: async () => catalog,
    readState: async () => ({
      schemaVersion: 1,
      apps: [{ id: 'monitor', version: '0.4.0', sha256: sha, bundlePath: '/i/monitor', stubPath: '/s/Midnite Monitor.app', runtimeVersion: '0.4.1', installedAt: 'now' }],
    }),
    identityFor: (id) => (id === 'studio' ? null : stubIdentity(id, id[0]!.toUpperCase() + id.slice(1))),
    bundleDeps: () => bundleDeps,
    install,
    uninstall,
    onProgress: (e) => events.push(e),
    ...over,
  });
  return { ops, install, uninstall, events };
}

describe('apps ops', () => {
  it('reports installed bundles against the catalog, never leaking paths', async () => {
    const { ops } = harness();
    expect(await ops.status()).toEqual({
      runtimeVersion: '0.4.1',
      canManageBundles: true,
      installed: [{ id: 'monitor', version: '0.4.0', runtimeVersion: '0.4.1' }],
      catalog: { runtimeVersion: '0.4.1', apps: [{ id: 'cleaner', version: '0.4.1' }] },
    });
  });

  it('reports a null catalog when it is missing or its fetch throws, and canManageBundles false in dev', async () => {
    const { ops } = harness({
      fetchCatalog: async () => {
        throw new Error('offline');
      },
      readState: async () => EMPTY_INSTALLED_STATE,
      bundleDeps: () => null,
    });
    expect(await ops.status()).toMatchObject({ catalog: null, installed: [], canManageBundles: false });
  });

  it("installs one app from its catalog entry and tags progress with that app's id", async () => {
    const { ops, install, events } = harness();
    expect(await ops.install('cleaner')).toEqual({ ok: true });
    expect(install).toHaveBeenCalledTimes(1);
    expect(install.mock.calls[0]![0].id).toBe('cleaner');
    expect(install.mock.calls[0]![1].id).toBe('cleaner');
    expect(events).toEqual([{ id: 'cleaner', progress: { phase: 'download', received: 5, total: 10 } }]);
  });

  it('answers with a failure envelope, never a throw, for every refusal', async () => {
    const refused = async (result: Promise<LauncherResult>) => expect(await result).toMatchObject({ ok: false });
    await refused(harness().ops.install('studio'));
    await refused(harness().ops.install('coder')); // nothing published
    await refused(harness({ bundleDeps: () => null }).ops.install('cleaner'));
    await refused(harness({ fetchCatalog: async () => null }).ops.install('cleaner'));
    await refused(
      harness({
        install: async () => {
          throw new Error('disk full');
        },
      }).ops.install('cleaner'),
    );
    await refused(harness().ops.uninstall('studio'));
    await refused(harness({ bundleDeps: () => null }).ops.uninstall('monitor'));
    await refused(
      harness({
        uninstall: async () => {
          throw new Error('busy');
        },
      }).ops.uninstall('monitor'),
    );
  });

  it('uninstalls exactly the named app', async () => {
    const { ops, uninstall } = harness();
    expect(await ops.uninstall('monitor')).toEqual({ ok: true });
    expect(uninstall).toHaveBeenCalledTimes(1);
    expect(uninstall.mock.calls[0]![0].id).toBe('monitor');
  });
});
