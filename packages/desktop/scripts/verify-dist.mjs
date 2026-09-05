import { existsSync, statSync, readFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { extractYamlScalar } from './lib/yaml-scalar.mjs';

const desktopDir = process.cwd();
const releaseDir = join(desktopDir, 'release');
const packageJson = JSON.parse(readFileSync(join(desktopDir, 'package.json'), 'utf8'));
const version = packageJson.version;

const dmgPath = join(releaseDir, `midnite-studio-${version}-arm64.dmg`);
const zipPath = join(releaseDir, `midnite-studio-${version}-arm64.zip`);
const appPath = join(releaseDir, 'mac-arm64', 'Midnite Studio.app');

console.log('Verifying distribution artifacts...');

if (!existsSync(dmgPath)) {
  console.error(`Missing DMG artifact at ${dmgPath}`);
  process.exit(1);
}
if (!existsSync(zipPath)) {
  console.error(`Missing ZIP artifact at ${zipPath}`);
  process.exit(1);
}

const dmgSize = statSync(dmgPath).size;
const zipSize = statSync(zipPath).size;
const minSize = 50 * 1024 * 1024; // 50MB

if (dmgSize < minSize) {
  console.error(`DMG size (${dmgSize} bytes) is below minimum expected threshold of 50MB`);
  process.exit(1);
}
if (zipSize < minSize) {
  console.error(`ZIP size (${zipSize} bytes) is below minimum expected threshold of 50MB`);
  process.exit(1);
}

console.log('Verifying bundle codesign strict integrity...');
try {
  execSync(`codesign --verify --deep --strict "${appPath}"`, { stdio: 'inherit' });
} catch (err) {
  console.error('codesign verification failed', err);
  process.exit(1);
}

console.log('Verifying DMG integrity with hdiutil...');
try {
  execSync(`hdiutil verify "${dmgPath}"`, { stdio: 'inherit' });
} catch (err) {
  console.error('hdiutil verification failed', err);
  process.exit(1);
}

console.log('Verifying Info.plist URL schemes...');
const infoPlistPath = join(appPath, 'Contents', 'Info.plist');
const plistContent = readFileSync(infoPlistPath, 'utf8');
if (!plistContent.includes('midnite-studio')) {
  console.error('Info.plist missing midnite-studio URL scheme');
  process.exit(1);
}

// Phase 49 Theme E: the one `templateRoot()` failure mode dev mode can't
// catch — `electron-builder.yml`'s `extraResources` entry for `templates/`
// silently producing nothing (a typo'd `from`, a glob that matches zero
// files) resolves fine against the repo's own working tree in dev and only
// fails once packaged. A specific file, not just the directory, so a
// truncated copy still fails this check.
console.log('Verifying the onboarding kit template shipped into Resources...');
const templateIndexPath = join(
  appPath,
  'Contents',
  'Resources',
  'templates',
  'midnite',
  '.midnite',
  'tasks',
  '_INDEX.md',
);
if (!existsSync(templateIndexPath)) {
  console.error(`Missing onboarding kit template at ${templateIndexPath}`);
  process.exit(1);
}

// Phase 53 Theme A: the CLI wrapper is resolved at runtime from
// `${process.resourcesPath}/bin/midnite-studio` (see `cli-handlers.ts`'s
// `getBundleBinPath()`) but was never in `extraResources`, so every packaged
// build shipped with the integration pointing at a path that does not exist.
// This bug survived Phase 33's own verification because that verification
// never looked here.
console.log('Verifying the CLI wrapper shipped into Resources...');
const cliWrapperPath = join(appPath, 'Contents', 'Resources', 'bin', 'midnite-studio');
if (!existsSync(cliWrapperPath)) {
  console.error(`Missing CLI wrapper at ${cliWrapperPath}`);
  process.exit(1);
}
const cliWrapperMode = statSync(cliWrapperPath).mode;
if ((cliWrapperMode & 0o111) === 0) {
  console.error(`CLI wrapper at ${cliWrapperPath} is not executable (mode ${cliWrapperMode.toString(8)})`);
  process.exit(1);
}

// Phase 53 Theme C: none of the ten gates above are about the FEED, which is
// the artifact the in-app updater actually consumes and the one most likely
// to be missing or stale. `latest-mac.yml` is what electron-updater polls
// (`publish:` in electron-builder.yml is the `generic` provider pointed at
// exactly this file), so a build missing it, or shipping one that disagrees
// with the zip it describes, is silently un-updatable while every other gate
// still passes.
console.log('Verifying the electron-updater feed manifest (latest-mac.yml)...');
const manifestPath = join(releaseDir, 'latest-mac.yml');
if (!existsSync(manifestPath)) {
  console.error(`Missing electron-updater feed manifest at ${manifestPath}`);
  process.exit(1);
}
const manifestContent = readFileSync(manifestPath, 'utf8');

const manifestVersion = extractYamlScalar(manifestContent, 'version');
if (manifestVersion !== version) {
  console.error(
    `latest-mac.yml version "${manifestVersion}" does not match package.json version "${version}"`,
  );
  process.exit(1);
}

// `path`/`sha512`, because that is what electron-updater downloads and
// verifies — the dmg is only what a human clicks, and a manifest pointing at
// the wrong file (or the right file with a stale hash) would pass every gate
// above while quietly breaking every running app's next update check.
const manifestPathField = extractYamlScalar(manifestContent, 'path');
if (manifestPathField !== basename(zipPath)) {
  console.error(
    `latest-mac.yml path "${manifestPathField}" does not match the emitted zip "${basename(zipPath)}"`,
  );
  process.exit(1);
}
const manifestSha512 = extractYamlScalar(manifestContent, 'sha512');
const actualZipSha512 = createHash('sha512').update(readFileSync(zipPath)).digest('base64');
if (manifestSha512 !== actualZipSha512) {
  console.error('latest-mac.yml sha512 does not match the emitted zip\'s actual sha512');
  process.exit(1);
}

// The `.blockmap` is what makes a DIFFERENTIAL update possible — a release
// missing it still updates, just by re-downloading the whole zip, and nothing
// today would ever say so.
console.log('Verifying the update blockmap...');
const blockmapPath = `${zipPath}.blockmap`;
if (!existsSync(blockmapPath)) {
  console.error(`Missing update blockmap at ${blockmapPath}`);
  process.exit(1);
}

// The cheapest possible guard against shipping a bundle whose INTERNAL
// version disagrees with the tag/package.json it was cut from — exactly the
// disagreement an updater compares against, and the one skew none of the
// other version gates (Theme B's lockstep check, the manifest check above)
// can see, since neither one ever opens the packaged bundle itself.
console.log("Verifying Info.plist's bundle version...");
const bundleShortVersionMatch = /<key>CFBundleShortVersionString<\/key>\s*<string>([^<]+)<\/string>/.exec(
  plistContent,
);
const bundleShortVersion = bundleShortVersionMatch?.[1] ?? null;
if (bundleShortVersion !== version) {
  console.error(
    `Info.plist CFBundleShortVersionString "${bundleShortVersion}" does not match package.json version "${version}"`,
  );
  process.exit(1);
}

console.log('✓ All dist verification checks passed successfully!');
