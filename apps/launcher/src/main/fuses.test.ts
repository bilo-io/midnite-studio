// @vitest-environment node
// vitest: the fuse table the launcher's afterPack flips and verify-fuses reads back — pure comparison.
import { createRequire } from 'node:module';

import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { FuseV1Options } = require('@electron/fuses') as { FuseV1Options: Record<string, number> };
const { EXPECTED_FUSES, fuseConfig, mismatchesIn } = require('../../scripts/lib/fuses.cjs') as {
  EXPECTED_FUSES: Record<number, boolean>;
  fuseConfig: () => Promise<Record<string, unknown>>;
  mismatchesIn: (wire: Record<number, number>) => Promise<string[]>;
};
/** The raw wire bytes `getCurrentFuseWire` returns: `'1'` on, `'0'` off (`scripts/lib/electron-fuses.mjs`). */
const ON = '1'.charCodeAt(0);
const OFF = '0'.charCodeAt(0);

describe('launcher fuses (Phase 117 Theme A)', () => {
  it('keeps RunAsNode on (bundles spawn process.execPath as node) and OnlyLoadAppFromAsar off (a stub runs a folder)', () => {
    expect(EXPECTED_FUSES[FuseV1Options['RunAsNode']!]).toBe(true);
    expect(EXPECTED_FUSES[FuseV1Options['OnlyLoadAppFromAsar']!]).toBe(false);
  });
  it('closes NODE_OPTIONS and --inspect, and validates the asar', () => {
    expect(EXPECTED_FUSES[FuseV1Options['EnableNodeOptionsEnvironmentVariable']!]).toBe(false);
    expect(EXPECTED_FUSES[FuseV1Options['EnableNodeCliInspectArguments']!]).toBe(false);
    expect(EXPECTED_FUSES[FuseV1Options['EnableEmbeddedAsarIntegrityValidation']!]).toBe(true);
  });
  it('the flip config carries the table and leaves signing to afterPack', async () => {
    const config = await fuseConfig();
    expect(config['resetAdHocDarwinSignature']).toBe(false);
    for (const [fuse, enabled] of Object.entries(EXPECTED_FUSES)) expect(config[fuse]).toBe(enabled);
  });
  it('names every fuse a built binary disagrees on, and nothing when it matches', async () => {
    const matching = Object.fromEntries(Object.entries(EXPECTED_FUSES).map(([fuse, on]) => [fuse, on ? ON : OFF]));
    expect(await mismatchesIn(matching)).toEqual([]);
    const stock = { ...matching, [FuseV1Options['EnableNodeOptionsEnvironmentVariable']!]: ON };
    expect(await mismatchesIn(stock)).toEqual(['EnableNodeOptionsEnvironmentVariable: expected off, found on']);
    const { [FuseV1Options['RunAsNode']!]: _dropped, ...missing } = matching;
    expect(await mismatchesIn(missing)).toEqual(['RunAsNode: expected on, found absent']);
  });
});
