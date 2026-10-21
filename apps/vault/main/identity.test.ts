// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { runtimeDataDirectory } from '@midnite/studio-runtime';

import { isSmoke, SMOKE_ENV, vaultDirectory, vaultUserData } from './identity';

describe('Vault identity', () => {
  it('keeps userData under the runtime data directory', () => {
    expect(vaultUserData('/data')).toBe(`${runtimeDataDirectory('/data')}/apps/vault`);
  });
  it('keeps the vault files in the runtime data directory, and a throwaway run inside its override', () => {
    expect(vaultDirectory('/data')).toBe(runtimeDataDirectory('/data'));
    expect(vaultDirectory('/data', '/tmp/x')).toBe('/tmp/x/runtime');
    expect(vaultDirectory('/data', '')).toBe(runtimeDataDirectory('/data'));
  });
  it('lets a throwaway run override userData, and ignores an empty override', () => {
    expect(vaultUserData('/data', '/tmp/x')).toBe('/tmp/x');
    expect(vaultUserData('/data', '')).toContain('Midnite Runtime');
  });
  it('treats only MIDNITE_VAULT_SMOKE=1 as a smoke run', () => {
    expect(isSmoke({ [SMOKE_ENV]: '1' })).toBe(true);
    expect(isSmoke({ [SMOKE_ENV]: 'true' })).toBe(false);
  });
});
