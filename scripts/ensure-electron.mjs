#!/usr/bin/env node
/**
 * Electron 42 dropped the npm `postinstall` binary download (supply-chain).
 * CI and `electron-rebuild` still need `dist/Electron.app` on disk. This is
 * the former install script, invoked from our own postinstall and from
 * `desktop:rebuild-native`. No-op when the matching binary is already present.
 */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const desktopPkg = join(repoRoot, 'packages/desktop/package.json');
const require = createRequire(desktopPkg);

let installJs;
try {
  installJs = require.resolve('electron/install.js');
} catch {
  process.exit(0);
}

const result = spawnSync(process.execPath, [installJs], { stdio: 'inherit' });
process.exit(result.status ?? 1);
