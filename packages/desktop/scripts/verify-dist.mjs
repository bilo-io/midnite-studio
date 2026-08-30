import { existsSync, statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

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

console.log('✓ All dist verification checks passed successfully!');
