// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { runtimeDataDirectory } from '@midnite/studio-runtime';

import { gamerUserData, isSmoke, SMOKE_ENV } from './identity';

describe('Gamer identity', () => {
  it('keeps userData under the runtime data directory', () => {
    expect(gamerUserData('/data')).toBe(`${runtimeDataDirectory('/data')}/apps/gamer`);
  });
  it('lets a throwaway run override it, and ignores an empty override', () => {
    expect(gamerUserData('/data', '/tmp/x')).toBe('/tmp/x');
    expect(gamerUserData('/data', '')).toContain('Midnite Runtime');
  });
  it('treats only MIDNITE_GAMER_SMOKE=1 as a smoke run', () => {
    expect(isSmoke({ [SMOKE_ENV]: '1' })).toBe(true);
    expect(isSmoke({ [SMOKE_ENV]: 'true' })).toBe(false);
    expect(isSmoke({})).toBe(false);
  });
});
