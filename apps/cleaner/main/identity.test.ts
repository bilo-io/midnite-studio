// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { runtimeDataDirectory } from '@midnite/studio-runtime';

import { cleanerUserData, isSmoke, SMOKE_ENV } from './identity';

describe('Cleaner identity', () => {
  it('keeps userData under the runtime data directory', () => {
    expect(cleanerUserData('/data')).toBe(`${runtimeDataDirectory('/data')}/apps/cleaner`);
  });
  it('lets a throwaway run override it, and ignores an empty override', () => {
    expect(cleanerUserData('/data', '/tmp/x')).toBe('/tmp/x');
    expect(cleanerUserData('/data', '')).toContain('Midnite Runtime');
  });
  it('treats only MIDNITE_CLEANER_SMOKE=1 as a smoke run', () => {
    expect(isSmoke({ [SMOKE_ENV]: '1' })).toBe(true);
    expect(isSmoke({ [SMOKE_ENV]: 'true' })).toBe(false);
    expect(isSmoke({})).toBe(false);
  });
});
