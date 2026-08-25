'use strict';

const { chmodSync, existsSync, readdirSync, statSync, unlinkSync } = require('node:fs');
const { execFileSync } = require('node:child_process');
const { join } = require('node:path');

/**
 * electron-builder afterPack hook.
 *
 * Three fixes, all of which only bite in a packaged build — which is exactly
 * why they are easy to ship broken.
 */
exports.default = async function afterPack(context) {
  const root = context.appOutDir;

  /**
   * 1. Restore the executable bit.
   *
   * node-pty's `spawn-helper` and dugite's entire `git` tree are executables
   * that can lose +x when copied into the bundle. The repo's postinstall fix
   * (scripts/fix-node-pty.cjs) runs on `pnpm install` — never on a user's
   * machine. Without the bit, opening a terminal fails with "posix_spawnp
   * failed" and every git call fails with EACCES.
   */
  const executables = [];
  walk(root, (file) => {
    if (file.endsWith('spawn-helper')) executables.push(file);
    else if (/\/dugite\/git\/(bin|libexec)\//.test(file)) executables.push(file);
  });
  for (const file of executables) {
    try {
      chmodSync(file, 0o755);
    } catch {
      // best-effort
    }
  }
  console.log(`[afterPack] ensured +x on ${executables.length} bundled executable(s)`);

  /**
   * 2. Prune dangling symlinks before signing.
   *
   * pnpm's store leaves links that do not resolve inside the copied tree.
   * `codesign --deep` fails on a broken link with "No such file or directory"
   * and produces an invalid signature that Gatekeeper then rejects — so the app
   * builds cleanly and refuses to launch.
   */
  const broken = [];
  walk(
    root,
    () => {},
    (link) => {
      if (!existsSync(link)) broken.push(link);
    },
  );
  for (const link of broken) {
    try {
      unlinkSync(link);
    } catch {
      // best-effort
    }
  }
  if (broken.length) console.log(`[afterPack] pruned ${broken.length} dangling symlink(s)`);

  /**
   * 3. Ad-hoc sign on macOS.
   *
   * When packaging unsigned, electron-builder leaves Electron's own signature
   * in place — but copying extraResources in invalidates it ("code has no
   * resources but signature indicates they must be present"), and Gatekeeper
   * refuses to launch the result. A `--force --deep --sign -` signature over
   * the finished bundle is valid and lets the app run locally. This happens
   * before the dmg is built, so the installer carries the fix.
   */
  if (context.electronPlatformName === 'darwin') {
    const appName = `${context.packager.appInfo.productFilename}.app`;
    const appPath = join(root, appName);
    try {
      execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], {
        stdio: 'inherit',
      });
      console.log(`[afterPack] ad-hoc signed ${appName}`);
    } catch (error) {
      console.warn(`[afterPack] ad-hoc codesign failed: ${error.message}`);
    }
  }
};

function walk(dir, onFile, onLink) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    let isDir = entry.isDirectory();
    if (entry.isSymbolicLink()) {
      if (onLink) onLink(full);
      try {
        isDir = statSync(full).isDirectory();
      } catch {
        continue;
      }
    }
    if (isDir) walk(full, onFile, onLink);
    else onFile(full);
  }
}
