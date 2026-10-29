import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { loadElectronMajors, supportedElectronMajors } from '../feeds/electron-releases';
import type { FeedFetch } from '../feeds/osv';
import { createGuardResolvers } from '../resolvers';
import { electronFreshnessCheck, pinnedMajor, type ElectronPin } from './electron-freshness';

const pin = (o: Partial<ElectronPin>): ElectronPin => ({ file: 'packages/desktop/package.json', repo: '/r', range: '^38.0.0', major: 38, ...o });
const res = (body: unknown, status = 200) => ({ ok: status < 400, status, headers: { get: () => null }, json: async () => body, text: async () => '' });

describe('electron-freshness check', () => {
  it('flags a pin outside the three supported majors, and only that one', async () => {
    const fs = await electronFreshnessCheck.run({ electronMajors: [41, 40, 39], electronPins: [pin({}), pin({ file: 'apps/launcher/package.json', range: '^41.1.0', major: 41 })] });
    expect(fs).toHaveLength(1);
    expect(fs[0]).toMatchObject({ severity: 'high', fingerprint: 'electron-freshness:/r:packages/desktop/package.json' });
    expect(fs[0]!.remediation[0]).toMatchObject({ id: 'update-package', name: 'electron', to: '41' });
  });

  it('judges nothing against an empty window', async () => {
    expect(await electronFreshnessCheck.run({ electronMajors: [], electronPins: [pin({})] })).toEqual([]);
  });

  it('reads the major from a range', () => {
    expect(pinnedMajor('^41.2.0')).toBe(41);
    expect(pinnedMajor('latest')).toBeNull();
  });
});

describe('electron release feed', () => {
  it('takes the three highest majors', () => {
    expect(supportedElectronMajors([{ version: '41.0.1' }, { version: '40.9.0' }, { version: '39.1.0' }, { version: '38.0.0' }, { version: '41.0.0' }])).toEqual([41, 40, 39]);
    expect(supportedElectronMajors('nope')).toEqual([]);
  });

  it('falls back to the cache when the download fails, and throws with neither', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'electron-'));
    const ok: FeedFetch = async () => res([{ version: '41.0.0' }, { version: '40.0.0' }]);
    const down: FeedFetch = async () => res({}, 503);
    await expect(loadElectronMajors({ fetch: down, cacheDir: dir })).rejects.toThrow();
    expect(await loadElectronMajors({ fetch: ok, cacheDir: dir })).toEqual([41, 40]);
    expect(await loadElectronMajors({ fetch: down, cacheDir: dir })).toEqual([41, 40]);
  });
});

describe('electronPins resolver', () => {
  it('reads electron from the root, packages/* and apps/*', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pins-'));
    await mkdir(join(dir, 'packages', 'desktop'), { recursive: true });
    await mkdir(join(dir, 'apps', 'launcher'), { recursive: true });
    await writeFile(join(dir, 'packages', 'desktop', 'package.json'), JSON.stringify({ devDependencies: { electron: '^38.1.0' } }));
    await writeFile(join(dir, 'apps', 'launcher', 'package.json'), JSON.stringify({ dependencies: { electron: '41.2.0' } }));
    await writeFile(join(dir, 'package.json'), '{ not json');
    const resolvers = createGuardResolvers({ userData: dir, home: dir, repos: () => [dir], fetch: async () => res({}) });
    const pins = (await resolvers['electronPins']!({})) as ElectronPin[];
    expect(pins.map((p) => `${p.file}:${p.major}`).sort()).toEqual(['apps/launcher/package.json:41', 'packages/desktop/package.json:38']);
  });
});
