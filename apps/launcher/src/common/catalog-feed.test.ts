import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { APP_IDS } from './catalog';
import { parseCatalog } from './catalog-feed';

const example = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../catalog.example.json', import.meta.url)), 'utf8'),
) as ReturnType<typeof JSON.parse>;

describe('parseCatalog', () => {
  it('accepts the committed example', () => {
    const catalog = parseCatalog(example);
    expect(catalog?.runtimeVersion).toBe('0.1.0');
    expect(catalog?.apps.every((a) => (APP_IDS as readonly string[]).includes(a.id))).toBe(true);
  });

  it('rejects a bad checksum, a non-https bundle, a bad version and a wrong schemaVersion', () => {
    const app = example.apps[0];
    const withApp = (patch: object) => ({ ...example, apps: [{ ...app, ...patch }] });
    expect(parseCatalog(withApp({ sha256: 'xyz' }))).toBeNull();
    expect(parseCatalog(withApp({ sha256: 'A'.repeat(64) }))).toBeNull();
    expect(parseCatalog(withApp({ bundleUrl: 'http://example.com/a.zip' }))).toBeNull();
    expect(parseCatalog(withApp({ version: '../x' }))).toBeNull();
    expect(parseCatalog(withApp({ size: 0 }))).toBeNull();
    expect(parseCatalog({ ...example, schemaVersion: 2 })).toBeNull();
    expect(parseCatalog({ ...example, runtimeVersion: undefined })).toBeNull();
    expect(parseCatalog(null)).toBeNull();
  });

  it('tolerates an app id this launcher has no tile for', () => {
    expect(parseCatalog({ ...example, apps: [{ ...example.apps[0], id: 'future-app' }] })).not.toBeNull();
  });
});
