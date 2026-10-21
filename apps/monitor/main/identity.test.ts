// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { runtimeDataDirectory } from '@midnite/studio-runtime';

import { monitorUserData, isSmoke, SMOKE_ENV } from './identity';

describe('Monitor identity', () => {
  it('keeps userData under the runtime data directory', () => {
    expect(monitorUserData('/data')).toBe(`${runtimeDataDirectory('/data')}/apps/monitor`);
  });
  it('lets a throwaway run override it, and ignores an empty override', () => {
    expect(monitorUserData('/data', '/tmp/x')).toBe('/tmp/x');
    expect(monitorUserData('/data', '')).toContain('Midnite Runtime');
  });
  it('treats only MIDNITE_MONITOR_SMOKE=1 as a smoke run', () => {
    expect(isSmoke({ [SMOKE_ENV]: '1' })).toBe(true);
    expect(isSmoke({ [SMOKE_ENV]: 'true' })).toBe(false);
    expect(isSmoke({})).toBe(false);
  });
});
