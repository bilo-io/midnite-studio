import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { InstalledApp } from '../../common/installed-state';
import { lockstepBundleFinder } from './open';
import { recordInstall } from './state';

const record = (version: string): InstalledApp => ({
  id: 'cleaner',
  version,
  sha256: 'a'.repeat(64),
  bundlePath: '/b/cleaner',
  stubPath: '/s/Midnite Cleaner.app',
  runtimeVersion: version,
  installedAt: '2026-10-14T00:00:00.000Z',
});

describe('lockstepBundleFinder', () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'launcher-open-test-'));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('opens a bundle that matches the runtime, finds nothing for an app that is not installed', async () => {
    await recordInstall(root, record('0.3.0'));
    const find = lockstepBundleFinder(root, '0.3.0');
    expect(await find('cleaner')).toBe('/s/Midnite Cleaner.app');
    expect(await find('monitor')).toBeNull();
  });

  it('does not open a bundle a runtime update left behind, and says why', async () => {
    await recordInstall(root, record('0.2.0'));
    const refusals: [string, string][] = [];
    const find = lockstepBundleFinder(root, '0.3.0', (app, r) => refusals.push([app, r.reason]));
    expect(await find('cleaner')).toBeNull();
    expect(refusals).toEqual([['cleaner', 'bundle-behind']]);
  });
});
