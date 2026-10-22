// electron-builder afterPack hook for Midnite Apps: ad-hoc sign the finished bundle on macOS.
//
// Without a Developer ID cert electron-builder signs nothing, so the bundle keeps the linker
// signature of Electron's own binary — `Identifier=Electron`, no sealed resources — and
// `codesign --verify --deep --strict` rejects it with "code has no resources but signature
// indicates they must be present". install.sh runs exactly that check, so every launcher release
// up to v0.0.3 was refused by its own installer. A `--force --deep --sign -` over the finished
// bundle seals it, the same step `packages/desktop/scripts/afterpack.cjs` takes for Studio.
//
// With a cert, electron-builder signs after this hook and replaces the ad-hoc signature. Unlike
// Studio's hook this one throws: a launcher with a broken seal is not worth shipping.
const { execFileSync } = require('node:child_process');
const { join } = require('node:path');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const appName = `${context.packager.appInfo.productFilename}.app`;
  const appPath = join(context.appOutDir, appName);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' });
  execFileSync('codesign', ['--verify', '--deep', '--strict', appPath], { stdio: 'inherit' });
  console.log(`[afterPack] ad-hoc signed ${appName}`);
};
