// The fuse table Studio ships (Phase 91 Theme H flips it in afterpack.cjs; Phase 117 Theme A reads it
// back in verify-dist). One table for both; the flip config and the read-back are the repo-wide
// helper, `scripts/lib/electron-fuses.mjs`, shared with the launcher.
import * as fuses from '@electron/fuses';

import * as shared from '../../../../scripts/lib/electron-fuses.mjs';

const { FuseV1Options } = fuses;

/**
 * RunAsNode stays ENABLED on purpose: `electron-builder.yml` launches the terminal broker
 * (`dist/bundle/broker.js`) via `ELECTRON_RUN_AS_NODE`, so turning that fuse off would silently
 * break every terminal. Do not "finish the checklist" by disabling it.
 */
export const EXPECTED_FUSES = {
  [FuseV1Options.RunAsNode]: true,
  [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
  [FuseV1Options.OnlyLoadAppFromAsar]: true,
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
  [FuseV1Options.EnableNodeCliInspectArguments]: false,
};

export const fuseConfig = () => shared.fuseConfig(fuses, EXPECTED_FUSES);
export const mismatchesIn = (wire) => shared.mismatchesIn(fuses, wire, EXPECTED_FUSES);
export const fuseMismatches = (exe) => shared.fuseMismatches(fuses, exe, EXPECTED_FUSES);
