import { describe, expect, it } from 'vitest';

import { parseCatalog, type Catalog } from './catalog-feed';
import { catalogLockstepViolations, checkLockstep } from './lockstep';

describe('checkLockstep', () => {
  it('passes only on exact equality', () => {
    expect(checkLockstep({ runtimeVersion: '0.3.0', bundleVersion: '0.3.0' })).toEqual({ ok: true });
  });

  it('refuses a newer bundle as bundle-ahead, an older one as bundle-behind (numeric, not lexical)', () => {
    expect(checkLockstep({ runtimeVersion: '0.9.0', bundleVersion: '0.10.0' })).toMatchObject({ ok: false, reason: 'bundle-ahead' });
    expect(checkLockstep({ runtimeVersion: '0.10.0', bundleVersion: '0.9.0' })).toMatchObject({ ok: false, reason: 'bundle-behind' });
    expect(checkLockstep({ runtimeVersion: '0.3.0', bundleVersion: '0.3.1' })).toMatchObject({ ok: false, reason: 'bundle-ahead' });
  });

  it('names the bundle and both versions in the message', () => {
    const v = checkLockstep({ runtimeVersion: '0.3.0', bundleVersion: '0.2.0', label: 'Cleaner 0.2.0' });
    expect(v).toMatchObject({ ok: false, message: expect.stringContaining('Cleaner 0.2.0') });
    expect(v.ok ? '' : v.message).toContain('0.3.0');
  });
});

const entry = (id: string, version: string, minimumRuntimeVersion = '0.1.0') => ({
  id,
  version,
  bundleUrl: `https://example.com/${id}.zip`,
  size: 1,
  sha256: 'a'.repeat(64),
  minimumRuntimeVersion,
});

describe('catalog lockstep', () => {
  const consistent: Catalog = { schemaVersion: 1, runtimeVersion: '0.3.0', apps: [entry('studio', '0.3.0'), entry('cleaner', '0.3.0')] };

  it('accepts a catalog whose apps all share the runtimeVersion', () => {
    expect(catalogLockstepViolations(consistent)).toEqual([]);
    expect(parseCatalog(consistent)).toEqual(consistent);
  });

  it('rejects a catalog where an app disagrees, naming it', () => {
    const bad = { ...consistent, apps: [entry('studio', '0.3.0'), entry('cleaner', '0.2.0')] };
    expect(catalogLockstepViolations(bad)).toEqual([
      { ok: false, reason: 'catalog-mismatch', message: expect.stringContaining('cleaner 0.2.0') },
    ]);
    expect(parseCatalog(bad)).toBeNull();
  });

  it('keeps minimumRuntimeVersion as data: it neither relaxes nor adds to the rule', () => {
    const lowMin = { ...consistent, apps: [entry('cleaner', '0.3.0', '0.1.0')] };
    expect(parseCatalog(lowMin)).not.toBeNull();
    // A bundle older than the runtime is refused even though the runtime satisfies its minimum.
    expect(checkLockstep({ runtimeVersion: '0.3.0', bundleVersion: '0.2.0' }).ok).toBe(false);
  });
});
