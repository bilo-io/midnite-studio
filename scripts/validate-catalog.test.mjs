// Plain vitest (no browser capability needed): the script bundles the launcher's real parser with
// esbuild, so this proves both the import mechanism and the verdicts on real build-catalog output.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildCatalog } from './build-catalog.mjs';
import { loadLauncherParseCatalog, parseArgs, validateCatalog } from './validate-catalog.mjs';

let dir;
let parseCatalog;
let catalog;

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'validate-catalog-test-'));
  const zip = path.join(dir, 'a.zip');
  writeFileSync(zip, 'zip-bytes');
  catalog = buildCatalog({
    version: '0.0.6',
    apps: [
      { id: 'studio', file: zip, url: 'https://example.com/studio.zip' },
      { id: 'vanguard', file: zip, url: 'https://example.com/vanguard.zip' },
    ],
  });
  parseCatalog = await loadLauncherParseCatalog();
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('validateCatalog', () => {
  it('accepts what build-catalog writes', () => {
    const result = validateCatalog(catalog, parseCatalog, { version: '0.0.6', expectApps: ['studio', 'vanguard'] });
    expect(result.ok).toBe(true);
  });

  it('rejects a catalog whose app version differs from runtimeVersion (lockstep)', () => {
    const skewed = { ...catalog, apps: [{ ...catalog.apps[0], version: '0.0.5' }, catalog.apps[1]] };
    const result = validateCatalog(skewed, parseCatalog);
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatch(/REJECT/);
  });

  it('rejects a malformed file', () => {
    expect(validateCatalog({ schemaVersion: 2 }, parseCatalog).ok).toBe(false);
  });

  it('flags a wrong release version and a missing expected app', () => {
    const result = validateCatalog(catalog, parseCatalog, { version: '0.0.7', expectApps: ['browser'] });
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(['runtimeVersion is 0.0.6, the release is 0.0.7', 'app "browser" is not listed']);
  });
});

describe('parseArgs', () => {
  it('reads the file, --version (v stripped) and repeated --expect-app', () => {
    expect(parseArgs(['c.json', '--version', 'v0.0.6', '--expect-app', 'a', '--expect-app', 'b'])).toEqual({
      file: 'c.json',
      version: '0.0.6',
      expectApps: ['a', 'b'],
    });
  });

  it('throws without a file or on an unknown flag', () => {
    expect(() => parseArgs([])).toThrow(/usage/);
    expect(() => parseArgs(['c.json', '--nope'])).toThrow(/unknown flag/);
  });
});
