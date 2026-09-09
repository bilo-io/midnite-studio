import { existsSync, statSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, basename } from 'node:path';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { extractYamlScalar } from './lib/yaml-scalar.mjs';
import { SQLITE_PROBE_SOURCE, sqliteProbeModulePath } from './lib/sqlite-probe.mjs';

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

// Same failure mode as the CLI wrapper check above, for the completions
// `extraResources` entry: a typo'd `from` or an empty glob resolves fine
// against the repo's own working tree and only fails once packaged.
console.log('Verifying shell completions shipped into Resources...');
const completionsDir = join(appPath, 'Contents', 'Resources', 'completions');
for (const file of ['_midnite-studio', 'midnite-studio.bash', 'midnite-studio.fish']) {
  const completionPath = join(completionsDir, file);
  if (!existsSync(completionPath)) {
    console.error(`Missing shell completion at ${completionPath}`);
    process.exit(1);
  }
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

// Phase 53 Theme H: `notarize.cjs` silently no-ops without Apple credentials —
// `[notarize] skipped (missing Apple credentials in env)` — and nothing
// downstream ever recorded which mode a build actually shipped in, so a
// mistyped secret name would produce an unnotarized release that looked
// identical to a deliberate unsigned one. Record the mode here, and — per the
// phase doc's own recommendation — require Gatekeeper's assessment to pass
// only when a real cert was used; an unconditional `spctl` gate would fail
// every unsigned build's own verification, which today is all of them.
console.log('Recording code-signing mode...');
let signingMode = 'unsigned (ad-hoc)';
try {
  const codesignInfo = execSync(`codesign -dv --verbose=2 "${appPath}" 2>&1`, { encoding: 'utf8' });
  const isAdHoc = codesignInfo.includes('Signature=adhoc') || codesignInfo.includes('Authority=-');
  signingMode = isAdHoc ? 'unsigned (ad-hoc)' : 'signed (Developer ID)';
} catch (err) {
  console.warn('Could not determine signing mode from codesign output:', err);
}
console.log(`  -> ${signingMode}`);

if (signingMode === 'signed (Developer ID)') {
  console.log('Signed build — verifying Gatekeeper accepts the notarization ticket...');
  try {
    execSync(`spctl --assess --type execute -vv "${appPath}"`, { stdio: 'inherit' });
  } catch {
    console.error(
      'Build is signed with a Developer ID cert but Gatekeeper rejects it — a signed-but-unnotarized ' +
        'release would be quarantined on a stranger\'s Mac exactly like an unsigned one, just without saying so.',
    );
    process.exit(1);
  }
} else {
  console.log('  (no Developer ID cert present — notarization is not expected yet; see docs/RELEASING.md)');
}

// Phase 61 Theme C: no check anywhere verified a native module actually
// survived packaging — not even for node-pty, which has shipped since Phase 1.
// `better-sqlite3` is the first one written down: its `.node` binary must be
// present under `app.asar.unpacked` (asar cannot load a native addon from
// inside itself) and must actually `require` and open a database under
// **Electron's own ABI** — not the host `node` running this script, which is
// Node 22 (ABI 127) and would reject an Electron-ABI-130 binary outright, a
// false failure this script must not produce. So the load check runs INSIDE
// the packaged Electron binary itself, via `ELECTRON_RUN_AS_NODE=1`, exactly
// the runtime the shipped app actually uses.
console.log('Verifying native modules survived packaging (asarUnpack)...');
const unpackedNodeModules = join(appPath, 'Contents', 'Resources', 'app.asar.unpacked', 'node_modules');
for (const moduleName of ['node-pty', 'better-sqlite3']) {
  const moduleDir = join(unpackedNodeModules, moduleName);
  if (!existsSync(moduleDir)) {
    console.error(`Missing unpacked native module directory: ${moduleDir}`);
    process.exit(1);
  }
}
const betterSqlite3Binary = execSync(
  `find "${join(unpackedNodeModules, 'better-sqlite3')}" -name "*.node"`,
  { encoding: 'utf8' },
).trim();
if (!betterSqlite3Binary) {
  console.error('better-sqlite3 shipped unpacked but its .node binary is missing');
  process.exit(1);
}

const probePath = join(releaseDir, '.better-sqlite3-probe.cjs');
writeFileSync(probePath, SQLITE_PROBE_SOURCE);
const electronBinary = join(appPath, 'Contents', 'MacOS', 'Midnite Studio');
try {
  execSync(`"${electronBinary}" "${probePath}" "${sqliteProbeModulePath(appPath)}"`, {
    stdio: 'inherit',
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  });
} catch (err) {
  console.error(`better-sqlite3 failed to load under the packaged Electron binary: ${err.message}`);
  process.exit(1);
} finally {
  rmSync(probePath, { force: true });
}

console.log('✓ All dist verification checks passed successfully!');
