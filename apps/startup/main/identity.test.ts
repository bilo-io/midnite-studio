// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { runtimeDataDirectory } from '@midnite/studio-runtime';

import { STARTUP_BUNDLE_ID, startupUserData, isSmoke, SMOKE_ENV } from './identity';

describe('Startup identity', () => {
  it('keeps userData under the runtime data directory', () => {
    expect(startupUserData('/data')).toBe(`${runtimeDataDirectory('/data')}/apps/startup`);
  });
  it('lets a throwaway run override it, and ignores an empty override', () => {
    expect(startupUserData('/data', '/tmp/x')).toBe('/tmp/x');
    expect(startupUserData('/data', '')).toContain('Midnite Runtime');
  });
  it('treats only MIDNITE_STARTUP_SMOKE=1 as a smoke run', () => {
    expect(isSmoke({ [SMOKE_ENV]: '1' })).toBe(true);
    expect(isSmoke({ [SMOKE_ENV]: 'true' })).toBe(false);
    expect(isSmoke({})).toBe(false);
  });
  it('carries the bundle id the launcher\'s stub stamps', () => {
    expect(STARTUP_BUNDLE_ID).toBe('io.bilo.midnite-startup');
  });
});
