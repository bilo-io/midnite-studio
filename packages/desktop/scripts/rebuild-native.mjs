#!/usr/bin/env node
/**
 * Rebuild native modules against Electron's ABI.
 *
 * Only node-pty is native here, and it is used **only** in the main process —
 * which is what makes this a one-line story rather than midnite's dual-ABI
 * staging. There is no Node-ABI consumer of the same module in this repo, so a
 * single rebuild is correct for everything.
 *
 *   moon run desktop:rebuild-native
 *
 * Needed after an Electron version bump, and after a fresh install on a machine
 * whose prebuilt node-pty targets a different ABI.
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, '..');

const electronVersion = require('electron/package.json').version;

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
    'node-pty',
  ],
  { stdio: 'inherit', cwd: projectRoot, env: { ...process.env } },
);

child.on('exit', (code) => process.exit(code ?? 0));
