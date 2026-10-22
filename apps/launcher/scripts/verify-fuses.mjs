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
if (!existsSync(appPath)) {
  console.error(`verify-fuses: no app at ${appPath}`);
  process.exit(1);
}
// `basename` drops a trailing separator (shell tab-completion leaves one on a `.app`). The wire is
// not read from this file: `@electron/fuses` maps any path inside a `.app` to the framework binary
// (`Contents/Frameworks/Electron Framework.framework/Electron Framework`), so a bundle with that
// missing fails the read below, and the read's own error is the message.
const exe = join(appPath, 'Contents', 'MacOS', basename(appPath, '.app'));
let mismatches;
try {
  mismatches = await fuseMismatches(exe);
} catch (err) {
  console.error(`verify-fuses: cannot read the fuses of ${appPath}: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
if (mismatches.length > 0) {
  console.error(`verify-fuses: ${appPath} fuses are not as shipped:\n  ${mismatches.join('\n  ')}`);
  process.exit(1);
}
console.log(`verify-fuses: ${appPath} matches lib/fuses.cjs`);
