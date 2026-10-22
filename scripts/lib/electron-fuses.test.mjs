import { describe, expect, it, vi } from 'vitest';

import { FUSE_DISABLED, FUSE_ENABLED, fuseConfig, fuseMismatches, mismatchesIn } from './electron-fuses.mjs';

/** The shape of `@electron/fuses` the helper reads — enum values as the real package declares them. */
const fuses = {
  FuseVersion: { V1: '1' },
  FuseV1Options: { RunAsNode: 0, EnableNodeOptionsEnvironmentVariable: 2, OnlyLoadAppFromAsar: 5 },
  getCurrentFuseWire: vi.fn(),
};
const table = { 0: true, 2: false, 5: true };

describe('electron-fuses', () => {
  it('compares against the raw wire bytes: 49 is on, 48 is off', () => {
    expect(FUSE_ENABLED).toBe(49);
    expect(FUSE_DISABLED).toBe(48);
    expect(mismatchesIn(fuses, { 0: 49, 2: 48, 5: 49 }, table)).toEqual([]);
    // A boolean-shaped fixture — the convention the first cut of this helper wrongly assumed — is a mismatch.
    expect(mismatchesIn(fuses, { 0: 1, 2: 0, 5: 1 }, table)).toHaveLength(3);
  });
  it('names every fuse a binary disagrees on', () => {
    expect(mismatchesIn(fuses, { 0: 49, 2: 49, 5: 49 }, table)).toEqual([
      'EnableNodeOptionsEnvironmentVariable: expected off, found on',
    ]);
    expect(mismatchesIn(fuses, { 2: 48, 5: 114 }, table)).toEqual([
      'RunAsNode: expected on, found absent',
      'OnlyLoadAppFromAsar: expected on, found wire state 114',
    ]);
  });
  it('the flip config is the table plus the version, signing left to afterPack', () => {
    expect(fuseConfig(fuses, table)).toEqual({ version: '1', resetAdHocDarwinSignature: false, ...table });
  });
  it('reads the wire from the binary and refuses an unknown wire version', async () => {
    fuses.getCurrentFuseWire.mockResolvedValueOnce({ version: '1', 0: 49, 2: 48, 5: 49 });
    expect(await fuseMismatches(fuses, '/x', table)).toEqual([]);
    fuses.getCurrentFuseWire.mockResolvedValueOnce({ version: '2' });
    expect(await fuseMismatches(fuses, '/x', table)).toEqual(['fuse wire version 2 (expected V1)']);
  });
});
