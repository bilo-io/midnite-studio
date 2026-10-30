import { describe, expect, it } from 'vitest';

import type { AppsStatus } from './bridge';
import { LEGACY_APP_HOSTS, LEGACY_BUNDLE_APP_IDS } from './catalog';
import { replacedBundles, replacesLine, swapOffer } from './migration';

const status = (ids: string[]): AppsStatus => ({
  runtimeVersion: '0.4.1',
  canManageBundles: true,
  catalog: null,
  installed: ids.map((id) => ({ id, version: '0.4.0', runtimeVersion: '0.4.1' })),
});

describe('replacedBundles', () => {
  it('is empty with no status or no retired bundle installed', () => {
    expect(replacedBundles('agents', null)).toEqual([]);
    expect(replacedBundles('agents', status(['gamer', 'mind']))).toEqual([]);
  });

  it('lists the retired bundles of one host, and no other host', () => {
    const s = status(['coder', 'creator', 'vault', 'cleaner']);
    expect(replacedBundles('agents', s).map((r) => r.id)).toEqual(['coder', 'creator']);
    expect(replacedBundles('vanguard', s).map((r) => r.id)).toEqual(['cleaner', 'vault']);
    expect(replacedBundles('mind', s)).toEqual([]);
  });

  it('covers every retired bundle through its host', () => {
    for (const id of LEGACY_BUNDLE_APP_IDS) {
      const host = LEGACY_APP_HOSTS[id].app;
      expect(replacedBundles(host, status([id])).map((r) => r.id)).toEqual([id]);
    }
  });
});

describe('replacesLine and swapOffer', () => {
  it('phrases one, two and three names', () => {
    const one = replacedBundles('mind', status(['capture']));
    expect(replacesLine(one)).toBe('Replaces Capture');
    expect(replacesLine(replacedBundles('agents', status(['coder', 'creator'])))).toBe('Replaces Coder and Creator');
    expect(replacesLine(replacedBundles('vanguard', status(['cleaner', 'vault', 'monitor'])))).toBe('Replaces Cleaner, Vault and Monitor');
    expect(replacesLine([])).toBeNull();
  });

  it('offers the host while it is missing, the removal once it is there, nothing otherwise', () => {
    const replaced = replacedBundles('agents', status(['coder']));
    expect(swapOffer(replaced, false)).toBe('install-host');
    expect(swapOffer(replaced, true)).toBe('remove-old');
    expect(swapOffer([], true)).toBeNull();
  });
});
