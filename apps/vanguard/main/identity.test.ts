// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { runtimeDataDirectory } from '@midnite/studio-runtime';

import { vanguardUserData, isSmoke, SMOKE_ENV } from './identity';

describe('Vanguard identity', () => {
  it('keeps userData under the runtime data directory', () => {
    expect(vanguardUserData('/data')).toBe(`${runtimeDataDirectory('/data')}/apps/vanguard`);
  });
  it('lets a throwaway run override it, and ignores an empty override', () => {
    expect(vanguardUserData('/data', '/tmp/x')).toBe('/tmp/x');
    expect(vanguardUserData('/data', '')).toContain('Midnite Runtime');
  });
  it('treats only MIDNITE_VANGUARD_SMOKE=1 as a smoke run', () => {
    expect(isSmoke({ [SMOKE_ENV]: '1' })).toBe(true);
    expect(isSmoke({ [SMOKE_ENV]: 'true' })).toBe(false);
    expect(isSmoke({})).toBe(false);
  });
});
