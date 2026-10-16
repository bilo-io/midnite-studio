// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { runtimeDataDirectory } from '@midnite/studio-runtime';

import { moneyUserData, isSmoke, SMOKE_ENV } from './identity';

describe('Money identity', () => {
  it('keeps userData under the runtime data directory', () => {
    expect(moneyUserData('/data')).toBe(`${runtimeDataDirectory('/data')}/apps/money`);
  });
  it('lets a throwaway run override it, and ignores an empty override', () => {
    expect(moneyUserData('/data', '/tmp/x')).toBe('/tmp/x');
    expect(moneyUserData('/data', '')).toContain('Midnite Runtime');
  });
  it('treats only MIDNITE_MONEY_SMOKE=1 as a smoke run', () => {
    expect(isSmoke({ [SMOKE_ENV]: '1' })).toBe(true);
    expect(isSmoke({ [SMOKE_ENV]: 'true' })).toBe(false);
    expect(isSmoke({})).toBe(false);
  });
});
