// Phase 113 Themes E1 + F2 — catalog.json is built from the real files, in lockstep, and is
// exactly what the launcher accepts. Plain vitest: temp files, no network, no browser.
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseCatalog } from '../apps/launcher/src/common/catalog-feed.ts';
import { buildCatalog, parseAppArg, parseArgs } from './build-catalog.mjs';

const dir = mkdtempSync(path.join(tmpdir(), 'build-catalog-'));
function file(name, contents) {
  const p = path.join(dir, name);
  writeFileSync(p, contents);
  return p;
}
const studioZip = file('midnite-studio-0.3.1-arm64.zip', 'studio bytes');
const cleanerZip = file('midnite-cleaner-0.3.1-bundle.zip', 'cleaner bytes!');
const url = (n) => `https://github.com/bilo-io/midnite-apps/releases/download/x/v0.3.1/${n}`;

describe('buildCatalog', () => {
  const catalog = buildCatalog({
    version: '0.3.1',
    apps: [
      { id: 'studio', file: studioZip, url: url('studio.zip') },
      { id: 'cleaner', file: cleanerZip, url: url('cleaner.zip') },
    ],
    releasedAt: '2026-10-15T00:00:00Z',
  });

  it('stamps one version everywhere and hashes the real files', () => {
    expect(catalog.runtimeVersion).toBe('0.3.1');
    const [studio, cleaner] = catalog.apps;
    expect(studio).toMatchObject({ id: 'studio', version: '0.3.1', minimumRuntimeVersion: '0.3.1', size: 12 });
    expect(studio.sha256).toBe(createHash('sha256').update('studio bytes').digest('hex'));
    expect(cleaner.size).toBe(14);
    expect(cleaner.releasedAt).toBe('2026-10-15T00:00:00Z');
  });

  it('is accepted by the launcher schema, lockstep check included', () => {
    expect(parseCatalog(JSON.parse(JSON.stringify(catalog)))).not.toBeNull();
  });

  it('refuses an app whose version differs from the release (lockstep)', () => {
    expect(() =>
      buildCatalog({ version: '0.3.1', apps: [{ id: 'studio', file: studioZip, url: url('s'), version: '0.3.0' }] }),
    ).toThrow(/lockstep/);
  });

  it('refuses http URLs, duplicates, empty lists and bad versions', () => {
    const app = { id: 'studio', file: studioZip, url: url('s') };
    expect(() => buildCatalog({ version: '0.3.1', apps: [{ ...app, url: 'http://x/y.zip' }] })).toThrow(/https/);
    expect(() => buildCatalog({ version: '0.3.1', apps: [app, app] })).toThrow(/twice/);
    expect(() => buildCatalog({ version: '0.3.1', apps: [] })).toThrow(/at least one/);
    expect(() => buildCatalog({ version: 'latest', apps: [app] })).toThrow(/version/);
  });
});

describe('CLI arguments', () => {
  it('splits --app on the first two = only', () => {
    expect(parseAppArg('studio=a.zip=https://x/y?z=1')).toEqual({ id: 'studio', file: 'a.zip', url: 'https://x/y?z=1' });
    expect(() => parseAppArg('studio=a.zip')).toThrow(/expects/);
  });
  it('strips a leading v from the tag', () => {
    expect(parseArgs(['--version', 'v0.3.1', '--app', 'studio=a=https://b', '--out', 'c.json'])).toMatchObject({
      version: '0.3.1',
      out: 'c.json',
    });
  });
});
