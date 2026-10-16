// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { runtimeDataDirectory } from '@midnite/studio-runtime';

import { mindUserData, isSmoke, SMOKE_ENV } from './identity';

describe('Mind identity', () => {
  it('keeps userData under the runtime data directory', () => {
    expect(mindUserData('/data')).toBe(`${runtimeDataDirectory('/data')}/apps/mind`);
  });
  it('lets a throwaway run override it, and ignores an empty override', () => {
    expect(mindUserData('/data', '/tmp/x')).toBe('/tmp/x');
    expect(mindUserData('/data', '')).toContain('Midnite Runtime');
  });
  it('treats only MIDNITE_MIND_SMOKE=1 as a smoke run', () => {
    expect(isSmoke({ [SMOKE_ENV]: '1' })).toBe(true);
    expect(isSmoke({ [SMOKE_ENV]: 'true' })).toBe(false);
    expect(isSmoke({})).toBe(false);
  });
});
