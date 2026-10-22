import { FuseV1Options } from '@electron/fuses';
import { describe, expect, it } from 'vitest';

import { FUSE_DISABLED, FUSE_ENABLED } from '../../../../scripts/lib/electron-fuses.mjs';
import { EXPECTED_FUSES, fuseConfig, mismatchesIn } from './fuses.mjs';

describe('Studio fuses (Phase 91 Theme H, read back in Phase 117 Theme A)', () => {
  it('keeps RunAsNode on for the terminal broker and loads the app only from the asar', () => {
    expect(EXPECTED_FUSES[FuseV1Options.RunAsNode]).toBe(true);
    expect(EXPECTED_FUSES[FuseV1Options.OnlyLoadAppFromAsar]).toBe(true);
    expect(EXPECTED_FUSES[FuseV1Options.EnableNodeOptionsEnvironmentVariable]).toBe(false);
    expect(EXPECTED_FUSES[FuseV1Options.EnableNodeCliInspectArguments]).toBe(false);
  });
  it('the flip config is the table, signing left to afterpack', () => {
    const config = fuseConfig();
    expect(config.resetAdHocDarwinSignature).toBe(false);
    for (const [fuse, enabled] of Object.entries(EXPECTED_FUSES)) expect(config[fuse]).toBe(enabled);
  });
  it('names the fuses a binary disagrees on, reading the raw wire bytes', () => {
    const matching = Object.fromEntries(
      Object.entries(EXPECTED_FUSES).map(([fuse, on]) => [fuse, on ? FUSE_ENABLED : FUSE_DISABLED]),
    );
    expect(mismatchesIn(matching)).toEqual([]);
    expect(mismatchesIn({ ...matching, [FuseV1Options.EnableNodeCliInspectArguments]: FUSE_ENABLED })).toEqual([
      'EnableNodeCliInspectArguments: expected off, found on',
    ]);
  });
});
