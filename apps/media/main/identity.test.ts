// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { runtimeDataDirectory } from '@midnite/studio-runtime';

import { isSmoke, mediaUserData, mediaVaultDirectory, SMOKE_ENV } from './identity';

describe('Media identity', () => {
  it('keeps userData under the runtime data directory', () => {
    expect(mediaUserData('/data')).toBe(`${runtimeDataDirectory('/data')}/apps/media`);
  });
  it('lets a throwaway run override it, and ignores an empty override', () => {
    expect(mediaUserData('/data', '/tmp/x')).toBe('/tmp/x');
    expect(mediaUserData('/data', '')).toContain('Midnite Runtime');
  });
  it('keeps a throwaway run off the real vault socket', () => {
    expect(mediaVaultDirectory('/data')).toBe(runtimeDataDirectory('/data'));
    expect(mediaVaultDirectory('/data', '/tmp/x')).toBe('/tmp/x/runtime');
  });
  it('treats only MIDNITE_MEDIA_SMOKE=1 as a smoke run', () => {
    expect(isSmoke({ [SMOKE_ENV]: '1' })).toBe(true);
    expect(isSmoke({ [SMOKE_ENV]: 'true' })).toBe(false);
    expect(isSmoke({})).toBe(false);
  });
});
