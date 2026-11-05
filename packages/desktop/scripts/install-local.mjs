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
import { findAppMainPids } from './lib/running-app.mjs';

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

// Replacing a bundle under a live Electron app crashes it mid-run, so quit it
// first — gracefully, never with a kill (a close guard may be holding unsaved
// work). The pty broker runs the same executable but is deliberately left alone.
const executable = join(target, 'Contents', 'MacOS', APP_NAME.replace(/\.app$/, ''));
const QUIT_TIMEOUT_MS = 15_000;
const POLL_MS = 250;

function runningPids() {
  try {
    const out = execFileSync('ps', ['-axo', 'pid=,command='], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    return findAppMainPids(out, executable);
  } catch {
    return [];
  }
}

const wasRunning = existsSync(target) && runningPids().length > 0;
if (wasRunning) {
  console.log(`Quitting the running ${APP_NAME.replace(/\.app$/, '')} to replace it (will relaunch afterwards).`);
  try {
    execFileSync('osascript', ['-e', `quit app "${APP_NAME.replace(/\.app$/, '')}"`], { stdio: 'ignore' });
  } catch {
    // Fall through: the poll below decides whether it actually quit.
  }
  const deadline = Date.now() + QUIT_TIMEOUT_MS;
  while (runningPids().length > 0 && Date.now() < deadline) {
    execFileSync('sleep', [String(POLL_MS / 1000)]);
  }
  if (runningPids().length > 0) {
    console.error(
      `${APP_NAME} did not quit within ${QUIT_TIMEOUT_MS / 1000}s (an unsaved-changes prompt may be open). ` +
        `Quit it yourself and re-run; nothing was replaced.`,
    );
    process.exit(1);
  }
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

if (wasRunning) {
  console.log(`Relaunching ${APP_NAME.replace(/\.app$/, '')}.`);
  execFileSync('open', ['-a', target], { stdio: 'ignore' });
}

console.log(`Installed. Launch it from Finder to exercise the login-shell PATH fix.`);
