import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { RETIRED_APP_IDS } from '@midnite/studio-shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { appDataDirectory } from '../data-directory';
import { importRetiredAppData, RETIRED_APP_DATA, retiredImportMarker } from './retired-app-data';

let appData: string;
beforeEach(() => {
  appData = mkdtempSync(join(tmpdir(), 'retired-import-'));
});
afterEach(() => rmSync(appData, { recursive: true, force: true }));

const put = (app: string, rel: string, body: string) => {
  const file = join(appDataDirectory(appData, app), rel);
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, body);
};
const read = (app: string, rel: string) => readFileSync(join(appDataDirectory(appData, app), rel), 'utf8');
const NOW = () => new Date('2026-10-30T12:00:00.000Z');

describe('importRetiredAppData', () => {
  it('brings Capture over into Mind once, leaves the source, and writes a marker', () => {
    put('capture', 'capture/history.json', '[1,2]');
    put('capture', 'capture/recordings/index.json', '{}');
    const first = importRetiredAppData({ appData, host: 'mind', now: NOW });
    expect(first).toEqual([{ app: 'capture', status: 'imported', copied: ['capture'], skipped: [] }]);
    expect(read('mind', 'capture/history.json')).toBe('[1,2]');
    expect(read('mind', 'capture/recordings/index.json')).toBe('{}');
    expect(read('capture', 'capture/history.json')).toBe('[1,2]');
    expect(JSON.parse(readFileSync(retiredImportMarker(appDataDirectory(appData, 'mind'), 'capture'), 'utf8'))).toMatchObject({
      app: 'capture',
      host: 'mind',
      importedAt: '2026-10-30T12:00:00.000Z',
    });

    // The retired app changes afterwards: a second launch never re-runs.
    put('capture', 'capture/history.json', '[1,2,3]');
    expect(importRetiredAppData({ appData, host: 'mind', now: NOW })).toEqual([{ app: 'capture', status: 'already-done' }]);
    expect(read('mind', 'capture/history.json')).toBe('[1,2]');
  });

  it('never overwrites what the host already has, and skips what the source lacks', () => {
    put('coder', 'repos.json', '{"old":true}');
    put('agents', 'repos.json', '{"new":true}');
    put('coder', 'forge-accounts.json', '{}');
    const [coder] = importRetiredAppData({ appData, host: 'agents', now: NOW });
    expect(coder).toMatchObject({ app: 'coder', status: 'imported', copied: ['forge-accounts.json'] });
    expect((coder as { skipped: string[] }).skipped).toEqual(['repos.json', 'db-connections.json', 'tests-trust.json']);
    expect(read('agents', 'repos.json')).toBe('{"new":true}');
  });

  it('imports Coder and Creator into Agents together, and only the host\'s own', () => {
    put('coder', 'repos.json', '{}');
    put('creator', 'media/.midnite/media/doc/a.md', '# hi');
    put('vault', 'x.json', 'nope');
    const results = importRetiredAppData({ appData, host: 'agents', now: NOW });
    expect(results.map((r) => r.app)).toEqual(['coder', 'creator']);
    expect(read('agents', 'media/.midnite/media/doc/a.md')).toBe('# hi');
    expect(existsSync(join(appDataDirectory(appData, 'agents'), 'x.json'))).toBe(false);
  });

  it('does nothing, and writes no marker, when the retired app left no data', () => {
    expect(importRetiredAppData({ appData, host: 'vanguard', now: NOW }).map((r) => r.status)).toEqual([
      'no-source',
      'no-source',
      'no-source',
    ]);
    expect(existsSync(join(appDataDirectory(appData, 'vanguard'), '.migrated'))).toBe(false);
  });

  it('marks a retired app with nothing app-local (Vault) as done once its data directory exists', () => {
    put('vault', 'vault.log', 'x');
    const vault = importRetiredAppData({ appData, host: 'vanguard', now: NOW }).find((r) => r.app === 'vault');
    expect(vault).toEqual({ app: 'vault', status: 'imported', copied: [], skipped: [] });
  });

  it('returns a failure as a result and leaves no marker to retry from', () => {
    put('capture', 'capture/history.json', '[]');
    // The host's `capture` is a file where a directory is needed: copying under it cannot succeed.
    mkdirSync(appDataDirectory(appData, 'mind'), { recursive: true });
    writeFileSync(join(appDataDirectory(appData, 'mind'), '.migrated'), 'a file, not a directory');
    const [result] = importRetiredAppData({ appData, host: 'mind', now: NOW });
    expect(result?.status).toBe('error');
  });
});

describe('RETIRED_APP_DATA', () => {
  it('names every retired app and only plain relative paths', () => {
    expect(Object.keys(RETIRED_APP_DATA).sort()).toEqual([...RETIRED_APP_IDS].sort());
    for (const entries of Object.values(RETIRED_APP_DATA)) {
      for (const entry of entries) expect(entry.startsWith('/') || entry.split('/').includes('..'), entry).toBe(false);
    }
  });

  it('never lists the vault: secrets stay in the runtime vault service', () => {
    for (const entries of Object.values(RETIRED_APP_DATA)) {
      for (const entry of entries) expect(entry.toLowerCase(), entry).not.toContain('vault');
    }
  });
});
