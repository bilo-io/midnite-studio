#!/usr/bin/env node
/**
 * Install the freshly built app into /Applications.
 *
 * Uses `ditto`, never `cp -R`. `cp` does not preserve extended attributes,
 * resource forks or — critically — code signatures: a `cp`-ed .app has a broken
 * signature and macOS refuses to launch it, with an error that blames the app
 * rather than the copy. `ditto` is the supported way to move a bundle.
 */
import { existsSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

// Matches electron-builder's `productName` — the display name, space and all.
const APP_NAME = 'Midnite Studio.app';
// Bundle names this app has had before. Left behind by an older install one
// would sit in /Applications beside the new one, and Spotlight would happily
// launch the stale build.
const LEGACY_APP_NAMES = ['midnite-git.app', 'Midnite Git.app'];
const source = join(root, 'release', 'mac-arm64', APP_NAME);
const target = join('/Applications', APP_NAME);

if (!existsSync(source)) {
  console.error(`No built app at ${source}. Run \`moon run desktop:dist\` first.`);
  process.exit(1);
}

if (existsSync(target)) {
  console.log(`Removing existing ${target}`);
  rmSync(target, { recursive: true, force: true });
}

console.log(`ditto ${source} → ${target}`);
execFileSync('ditto', [source, target], { stdio: 'inherit' });

// A locally built, ad-hoc-signed app still carries the quarantine bit if it
// came from a dmg; clear it so Finder launches it without the right-click dance.
try {
  execFileSync('xattr', ['-dr', 'com.apple.quarantine', target], { stdio: 'ignore' });
} catch {
  // Not quarantined — nothing to clear.
}

for (const legacyName of LEGACY_APP_NAMES) {
  const legacyTarget = join('/Applications', legacyName);
  if (existsSync(legacyTarget)) {
    console.log(`Removing pre-rename ${legacyTarget}`);
    rmSync(legacyTarget, { recursive: true, force: true });
  }
}

console.log(`Installed. Launch it from Finder to exercise the login-shell PATH fix.`);
