'use strict';

const { FuseV1Options, FuseVersion, getCurrentFuseWire } = require('@electron/fuses');

/**
 * The Electron fuses Midnite Apps ships with (Phase 117 Theme A) — and, through it, every app
 * bundle: a stub (`src/main/bundles/stub.ts`) is an APFS clone of this binary with the bundle as
 * `Resources/app`, so the Browser's Chromium floor is whatever this flips. Studio's own table is
 * `packages/desktop/scripts/afterpack.cjs`; the two differ in one deliberate place.
 *
 * - `RunAsNode` stays ENABLED: a bundle spawns `process.execPath` with `ELECTRON_RUN_AS_NODE=1`
 *   (the runtime's pty broker client, Gamer's agent host), exactly as Studio's terminal does.
 * - `OnlyLoadAppFromAsar` stays DISABLED — the one difference from Studio. A stub runs its bundle
 *   from a folder, not an asar; the fuse would make every installed app refuse to start.
 * - `EnableEmbeddedAsarIntegrityValidation` ON: the launcher's own `app.asar` is checked against the
 *   hash electron-builder stamps into Info.plist. A stub loads no asar (its plist drops the key —
 *   `STUB_PLIST_REMOVE`), so there is nothing for it to validate and nothing to fail.
 * - `EnableNodeOptionsEnvironmentVariable` OFF and `EnableNodeCliInspectArguments` OFF: no
 *   `NODE_OPTIONS=--require` and no `--inspect` into a packaged main.
 */
const EXPECTED_FUSES = {
  [FuseV1Options.RunAsNode]: true,
  [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
  [FuseV1Options.OnlyLoadAppFromAsar]: false,
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
  [FuseV1Options.EnableNodeCliInspectArguments]: false,
};

/** The `flipFuses` config: the table above plus the version and the signing note. */
function fuseConfig() {
  return {
    version: FuseVersion.V1,
    resetAdHocDarwinSignature: false, // afterpack signs the whole bundle after this
    ...EXPECTED_FUSES,
  };
}

/**
 * Read the fuse wire back from a built binary and name every fuse that disagrees with the table.
 * Empty when the binary matches. Used right after the flip (afterpack) and by `verify-fuses.mjs`
 * on a finished `.app`, so a release never ships a binary whose fuses were not what was asked.
 */
async function fuseMismatches(exe) {
  const wire = await getCurrentFuseWire(exe);
  if (wire.version !== FuseVersion.V1) return [`fuse wire version ${String(wire.version)} (expected V1)`];
  return mismatchesIn(wire, EXPECTED_FUSES);
}

/** Pure: compare a decoded fuse wire (`{[fuse]: state}`) with the expected table. 1 = enabled, 0 = disabled. */
function mismatchesIn(wire, expected) {
  const out = [];
  for (const [fuse, enabled] of Object.entries(expected)) {
    const actual = wire[fuse];
    const expectedState = enabled ? 1 : 0;
    if (actual !== expectedState) out.push(`${fuseName(Number(fuse))}: expected ${enabled ? 'on' : 'off'}, found ${describe(actual)}`);
  }
  return out;
}

function fuseName(fuse) {
  return Object.keys(FuseV1Options).find((k) => FuseV1Options[k] === fuse) ?? `fuse ${fuse}`;
}

function describe(state) {
  if (state === 1) return 'on';
  if (state === 0) return 'off';
  return state === undefined ? 'absent' : `state ${String(state)}`;
}

module.exports = { EXPECTED_FUSES, fuseConfig, fuseMismatches, mismatchesIn };
