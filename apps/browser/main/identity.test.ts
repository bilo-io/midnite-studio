// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { runtimeDataDirectory } from '@midnite/studio-runtime';

import { browserUserData, isSmoke, SMOKE_ENV } from './identity';

describe('Browser identity', () => {
  it('keeps userData under the runtime data directory', () => {
    expect(browserUserData('/data')).toBe(`${runtimeDataDirectory('/data')}/apps/browser`);
  });
  it('lets a throwaway run override it, and ignores an empty override', () => {
    expect(browserUserData('/data', '/tmp/x')).toBe('/tmp/x');
    expect(browserUserData('/data', '')).toContain('Midnite Runtime');
  });
  it('treats only MIDNITE_BROWSER_SMOKE=1 as a smoke run', () => {
    expect(isSmoke({ [SMOKE_ENV]: '1' })).toBe(true);
    expect(isSmoke({ [SMOKE_ENV]: 'true' })).toBe(false);
    expect(isSmoke({})).toBe(false);
  });
});
