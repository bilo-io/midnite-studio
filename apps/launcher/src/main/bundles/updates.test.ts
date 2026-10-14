import { cp, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { InstalledApp } from '../../common/installed-state';
import { installAppBundle, type BundleOpsDeps } from './install-bundle';
import { stubIdentity, type BundleRoots } from './layout';
import { readInstalledState } from './state';
import { catalogEntry, fakeIo, fakePayload, fakeRuntime, serve } from './testing';
import { planBundleUpdates, planRestubs, updateInstalledBundles } from './updates';

const record = (id: string, version: string, runtimeVersion = '0.1.0'): InstalledApp => ({
  id,
  version,
  sha256: 'a'.repeat(64),
  bundlePath: `/b/${id}`,
  stubPath: `/s/${id}.app`,
  runtimeVersion,
  installedAt: '2026-10-14T00:00:00.000Z',
});

describe('planBundleUpdates / planRestubs', () => {
  it('updates installed apps whose catalog version moved, and only those', () => {
    const catalog = {
      schemaVersion: 1 as const,
      runtimeVersion: '0.3.0',
      apps: [catalogEntry('cleaner', '0.3.0', Buffer.from('x')), catalogEntry('monitor', '0.2.0', Buffer.from('y')), catalogEntry('coder', '0.3.0', Buffer.from('z'))],
    };
    const state = { schemaVersion: 1 as const, apps: [record('cleaner', '0.2.0'), record('monitor', '0.2.0'), record('vault', '0.2.0')] };
    // coder is not installed (never auto-installed); vault is not in the catalog (left alone).
    expect(planBundleUpdates(catalog, state).map((u) => [u.record.id, u.entry.version])).toEqual([['cleaner', '0.3.0']]);
  });

  it('re-stubs apps cloned from another runtime version', () => {
    const state = { schemaVersion: 1 as const, apps: [record('cleaner', '0.2.0', '0.2.0'), record('monitor', '0.2.0', '0.3.0')] };
    expect(planRestubs(state, '0.3.0').map((a) => a.id)).toEqual(['cleaner']);
  });
});

describe('updateInstalledBundles', () => {
  let root: string;
  let roots: BundleRoots;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'launcher-updates-test-'));
    roots = { installRoot: join(root, 'bundles'), stubRoot: join(root, 'Applications') };
    await fakePayload(join(root, 'payloads', '0.2.0'), '0.2.0');
    await fakePayload(join(root, 'payloads', '0.3.0'), '0.3.0');
    await mkdir(roots.stubRoot, { recursive: true });
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const cleaner = stubIdentity('cleaner', 'Cleaner');
  const zip = (v: string) => Buffer.from(`zip-of-${v}`);
  const deps = async (runtimeVersion: string, served: string): Promise<BundleOpsDeps> => ({
    roots,
    runtime: await fakeRuntime(join(root, `runtime-${runtimeVersion}`), runtimeVersion),
    isRunning: async () => false,
    io: fakeIo(),
    fetchImpl: serve(zip(served)),
    extract: async (zipPath, dest) => {
      const v = (await readFile(zipPath, 'utf8')).replace('zip-of-', '');
      await cp(join(root, 'payloads', v), dest, { recursive: true });
    },
  });

  it('re-clones a stale stub after a runtime update, then pulls the newer bundle', async () => {
    expect(await installAppBundle(catalogEntry('cleaner', '0.2.0', zip('0.2.0')), cleaner, await deps('0.1.0', '0.2.0'))).toEqual({ ok: true });

    const catalog = { schemaVersion: 1 as const, runtimeVersion: '0.3.0', apps: [catalogEntry('cleaner', '0.3.0', zip('0.3.0'))] };
    const outcomes = await updateInstalledBundles(catalog, (id) => (id === 'cleaner' ? cleaner : null), await deps('0.3.0', '0.3.0'));

    expect(outcomes).toEqual([
      { id: 'cleaner', action: 'restub', result: { ok: true } },
      { id: 'cleaner', action: 'update', result: { ok: true } },
    ]);
    const [app] = (await readInstalledState(roots.installRoot)).apps;
    expect(app).toMatchObject({ version: '0.3.0', runtimeVersion: '0.3.0' });
  });

  it('with no catalog (offline, unpublished) still re-stubs, and updates nothing', async () => {
    expect(await installAppBundle(catalogEntry('cleaner', '0.2.0', zip('0.2.0')), cleaner, await deps('0.1.0', '0.2.0'))).toEqual({ ok: true });
    const outcomes = await updateInstalledBundles(null, () => cleaner, await deps('0.3.0', '0.3.0'));
    expect(outcomes.map((o) => o.action)).toEqual(['restub']);
    expect((await readInstalledState(roots.installRoot)).apps[0]).toMatchObject({ version: '0.2.0', runtimeVersion: '0.3.0' });
  });
});
