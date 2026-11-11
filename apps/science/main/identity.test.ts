// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { runtimeDataDirectory } from '@midnite/studio-runtime';

import { isSmoke, scienceUserData, SMOKE_ENV } from './identity';

describe('Science identity', () => {
  it('keeps userData under the runtime data directory', () => {
    expect(scienceUserData('/data')).toBe(`${runtimeDataDirectory('/data')}/apps/science`);
  });
  it('lets a throwaway run override it, and ignores an empty override', () => {
    expect(scienceUserData('/data', '/tmp/x')).toBe('/tmp/x');
    expect(scienceUserData('/data', '')).toContain('Midnite Runtime');
  });
  it('treats only MIDNITE_SCIENCE_SMOKE=1 as a smoke run', () => {
    expect(isSmoke({ [SMOKE_ENV]: '1' })).toBe(true);
    expect(isSmoke({ [SMOKE_ENV]: 'true' })).toBe(false);
    expect(isSmoke({})).toBe(false);
  });
});
