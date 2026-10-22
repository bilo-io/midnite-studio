#!/usr/bin/env node
// verify-fuses (Phase 117 Theme A): read the Electron fuses back from a built Midnite Apps.app and
// fail unless they match `lib/fuses.cjs`. `moon run launcher:verify-fuses` after `launcher:dist`;
// pass another `.app` path to check an installed copy or a stub (a stub is a clone of this binary,
// so the Browser bundle's floor is whatever this prints).
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, join } from 'node:path';

const require = createRequire(import.meta.url);
const { fuseMismatches } = require('./lib/fuses.cjs');

const appPath = process.argv[2] ?? join(process.cwd(), 'release', 'mac-arm64', 'Midnite Apps.app');
// `basename` drops a trailing separator (shell tab-completion leaves one on a `.app`).
const exe = join(appPath, 'Contents', 'MacOS', basename(appPath, '.app'));
if (!existsSync(exe)) {
  console.error(`verify-fuses: no binary at ${exe}`);
  process.exit(1);
}
const mismatches = await fuseMismatches(exe);
if (mismatches.length > 0) {
  console.error(`verify-fuses: ${appPath} fuses are not as shipped:\n  ${mismatches.join('\n  ')}`);
  process.exit(1);
}
console.log(`verify-fuses: ${appPath} matches lib/fuses.cjs`);
