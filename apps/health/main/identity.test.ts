// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { runtimeDataDirectory } from '@midnite/studio-runtime';

import { isSmoke, healthUserData, SMOKE_ENV } from './identity';

describe('Health identity', () => {
  it('keeps userData under the runtime data directory', () => {
    expect(healthUserData('/data')).toBe(`${runtimeDataDirectory('/data')}/apps/health`);
  });
  it('lets a throwaway run override it, and ignores an empty override', () => {
    expect(healthUserData('/data', '/tmp/x')).toBe('/tmp/x');
    expect(healthUserData('/data', '')).toContain('Midnite Runtime');
  });
  it('treats only MIDNITE_HEALTH_SMOKE=1 as a smoke run', () => {
    expect(isSmoke({ [SMOKE_ENV]: '1' })).toBe(true);
    expect(isSmoke({ [SMOKE_ENV]: 'true' })).toBe(false);
    expect(isSmoke({})).toBe(false);
  });
});
