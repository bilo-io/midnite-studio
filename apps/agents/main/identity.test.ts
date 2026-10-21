// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { runtimeDataDirectory } from '@midnite/studio-runtime';

import { agentsUserData, agentsVaultDirectory, isSmoke, SMOKE_ENV } from './identity';

describe('Agents identity', () => {
  it('keeps userData under the runtime data directory', () => {
    expect(agentsUserData('/data')).toBe(`${runtimeDataDirectory('/data')}/apps/agents`);
  });
  it('lets a throwaway run override it, and ignores an empty override', () => {
    expect(agentsUserData('/data', '/tmp/x')).toBe('/tmp/x');
    expect(agentsUserData('/data', '')).toContain('Midnite Runtime');
  });
  it('keeps a throwaway run inside its own vault directory, so a proof cannot reach a real profile', () => {
    expect(agentsVaultDirectory('/data', '/tmp/x')).toBe('/tmp/x/runtime');
    expect(agentsVaultDirectory('/data')).toBe(runtimeDataDirectory('/data'));
  });
  it('treats only MIDNITE_AGENTS_SMOKE=1 as a smoke run', () => {
    expect(isSmoke({ [SMOKE_ENV]: '1' })).toBe(true);
    expect(isSmoke({ [SMOKE_ENV]: 'true' })).toBe(false);
    expect(isSmoke({})).toBe(false);
  });
});
