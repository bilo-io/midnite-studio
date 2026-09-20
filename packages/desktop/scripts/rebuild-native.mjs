#!/usr/bin/env node
/**
 * Rebuild native modules against Electron's ABI.
 *
 * Was a one-line story — only node-pty, used **only** in the main process,
 * with no Node-ABI consumer of the same module anywhere in this repo. Phase
 * 61 Theme C ends that: `better-sqlite3` is loaded from **both** sides —
 * `db-engine`'s own bare-vitest tests run it under Node's ABI, and the
 * packaged app needs it rebuilt against Electron's. This script now rebuilds
 * a comma-separated list rather than the one hardcoded module; `db-engine:test`
 * relies on a plain `pnpm install`/`node-gyp rebuild` targeting Node's own ABI
 * (never this script), and this script targets Electron's ABI exclusively —
 * running it before `db-engine:test` would break that suite, not fix it.
 *
 *   moon run desktop:rebuild-native
 *
 * Needed after an Electron version bump, and after a fresh install on a machine
 * whose prebuilt native modules target a different ABI.
 */
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, '..');

const electronVersion = require('electron/package.json').version;

const ensured = spawnSync(process.execPath, [resolve(here, '../../../scripts/ensure-electron.mjs')], {
  stdio: 'inherit',
  cwd: projectRoot,
  env: { ...process.env },
});
if (ensured.status) process.exit(ensured.status);

/**
 * Electron 42's node-gyp still passes `-mmacosx-version-min=10.7`. Linking
 * against the Command Line Tools' default MacOSX 26/27 SDK then fails
 * (`unknown architecture arm64e.x1` in the TBD files). Prefer an SDK 15
 * tree when present; GitHub `macos-14` runners already have a compatible SDK.
 */
function darwinLinkEnv() {
  if (process.platform !== 'darwin') return {};
  if (process.env['SDKROOT']) return {};
  const sdks = '/Library/Developer/CommandLineTools/SDKs';
  for (const name of ['MacOSX15.4.sdk', 'MacOSX15.sdk', 'MacOSX14.sdk']) {
    const path = join(sdks, name);
    if (existsSync(path)) {
      return { SDKROOT: path, MACOSX_DEPLOYMENT_TARGET: '13.0' };
    }
  }
  return { MACOSX_DEPLOYMENT_TARGET: '13.0' };
}

const env = { ...process.env, ...darwinLinkEnv() };

// The list of native modules to rebuild against Electron's ABI — node-pty
// (main-process pty spawning) and better-sqlite3 (Phase 61 Theme C's SQLite
// driver). `--only` takes a comma-separated list; extending it here is the
// entire diff a third native module would need.
const NATIVE_MODULES = ['node-pty', 'better-sqlite3'];

const child = spawn(
  'pnpm',
  [
    'exec',
    'electron-rebuild',
    '--version',
    electronVersion,
    // Scope the walk to this package: electron-rebuild otherwise climbs to the
    // workspace root and rebuilds every native module it finds there.
    '--project-dir',
    projectRoot,
    '--only',
    NATIVE_MODULES.join(','),
  ],
  { stdio: 'inherit', cwd: projectRoot, env },
);

child.on('exit', (code) => process.exit(code ?? 0));
