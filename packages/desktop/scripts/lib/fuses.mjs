// The fuse table Studio ships (Phase 91 Theme H flips it in afterpack.cjs; Phase 117 Theme A reads it
// back in verify-dist). One source for both, so the hook and the check cannot disagree.
import { FuseV1Options, FuseVersion, getCurrentFuseWire } from '@electron/fuses';

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

/** The `flipFuses` config afterpack.cjs applies: the table plus the version and the signing note. */
export function fuseConfig() {
  return {
    version: FuseVersion.V1,
    resetAdHocDarwinSignature: false, // afterpack's step 4 signs the whole bundle
    ...EXPECTED_FUSES,
  };
}

/** Pure: every fuse whose decoded wire state (1 on, 0 off) disagrees with `expected`. */
export function mismatchesIn(wire, expected = EXPECTED_FUSES) {
  const out = [];
  for (const [fuse, enabled] of Object.entries(expected)) {
    const actual = wire[fuse];
    if (actual !== (enabled ? 1 : 0)) {
      const name = Object.keys(FuseV1Options).find((k) => FuseV1Options[k] === Number(fuse)) ?? `fuse ${fuse}`;
      const found = actual === 1 ? 'on' : actual === 0 ? 'off' : actual === undefined ? 'absent' : `state ${String(actual)}`;
      out.push(`${name}: expected ${enabled ? 'on' : 'off'}, found ${found}`);
    }
  }
  return out;
}

/** Read the fuse wire from a built binary and compare it with the table. Empty when it matches. */
export async function fuseMismatches(exe) {
  const wire = await getCurrentFuseWire(exe);
  if (wire.version !== FuseVersion.V1) return [`fuse wire version ${String(wire.version)} (expected V1)`];
  return mismatchesIn(wire);
}
