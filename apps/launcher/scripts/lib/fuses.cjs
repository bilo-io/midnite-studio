'use strict';

const fuses = require('@electron/fuses');

const { FuseV1Options } = fuses;

/**
 * The Electron fuses Midnite Apps ships with (Phase 117 Theme A) — and, through it, every app
 * bundle: a stub (`src/main/bundles/stub.ts`) is an APFS clone of this binary with the bundle as
 * `Resources/app`, so the Browser's Chromium floor is whatever this flips. Studio's own table is
 * `packages/desktop/scripts/lib/fuses.mjs`; the two differ in one deliberate place. The flip config
 * and the read-back are the repo-wide `scripts/lib/electron-fuses.mjs`, shared with Studio.
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

/** The shared ESM helper, from CJS. */
const shared = () => import('../../../../scripts/lib/electron-fuses.mjs');

const fuseConfig = async () => (await shared()).fuseConfig(fuses, EXPECTED_FUSES);
const mismatchesIn = async (wire) => (await shared()).mismatchesIn(fuses, wire, EXPECTED_FUSES);
const fuseMismatches = async (exe) => (await shared()).fuseMismatches(fuses, exe, EXPECTED_FUSES);

module.exports = { EXPECTED_FUSES, fuseConfig, fuseMismatches, mismatchesIn };
