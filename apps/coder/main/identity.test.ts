// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { runtimeDataDirectory } from '@midnite/studio-runtime';

import { coderUserData, coderVaultDirectory, isSmoke, SMOKE_ENV } from './identity';

describe('Coder identity', () => {
  it('keeps userData under the runtime data directory', () => {
    expect(coderUserData('/data')).toBe(`${runtimeDataDirectory('/data')}/apps/coder`);
  });
  it('lets a throwaway run override it, and ignores an empty override', () => {
    expect(coderUserData('/data', '/tmp/x')).toBe('/tmp/x');
    expect(coderUserData('/data', '')).toContain('Midnite Runtime');
  });
  it('keeps a throwaway run inside its own vault directory, so a proof cannot reach a real profile', () => {
    expect(coderVaultDirectory('/data', '/tmp/x')).toBe('/tmp/x/runtime');
    expect(coderVaultDirectory('/data')).toBe(runtimeDataDirectory('/data'));
  });
  it('treats only MIDNITE_CODER_SMOKE=1 as a smoke run', () => {
    expect(isSmoke({ [SMOKE_ENV]: '1' })).toBe(true);
    expect(isSmoke({ [SMOKE_ENV]: 'true' })).toBe(false);
    expect(isSmoke({})).toBe(false);
  });
});
