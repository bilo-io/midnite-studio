/**
 * Write every suite app's Dock/Finder icon from its launcher logo, so the Dock shows exactly what the
 * launcher's tile shows.
 *
 *   moon run launcher:icons        (also the last step of `moon run launcher:logos`)
 *
 * Input: the 1024 px masters in `resources/app-logos/<id>.png` that `generate-app-logos.cjs` writes.
 * Outputs, each through `sips` (every iconset size) then `iconutil` — macOS only:
 *   apps/launcher/resources/icon.icns          the launcher, from launcher.png
 *   apps/<id>/resources/icon.icns              each extracted app (what `pack-bundle.mjs` ships and a stub shows)
 *   packages/desktop/resources/icon-suite.icns Studio as packaged (`electron-builder.yml`), from studio.png
 *
 * Studio's own `resources/icon.icns` is left alone: it is the midnite crescent, shared with the midnite app,
 * and it is the base `generate-app-logos.cjs` tints every logo from, so overwriting it would feed a logo back
 * into its own generator.
 */
const { execFileSync } = require('node:child_process');
const { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

const ROOT = join(__dirname, '..');
const REPO = join(ROOT, '..', '..');
const MASTER_DIR = join(ROOT, 'resources', 'app-logos');

/** Where each logo's icns goes, or `null` for a logo with no installable app beside it yet. */
function targetFor(id) {
  if (id === 'launcher') return join(ROOT, 'resources', 'icon.icns');
  if (id === 'studio') return join(REPO, 'packages', 'desktop', 'resources', 'icon-suite.icns');
  const app = join(REPO, 'apps', id);
  return existsSync(join(app, 'moon.yml')) ? join(app, 'resources', 'icon.icns') : null;
}

/** One 1024 px PNG → an .icns with every size macOS asks for. */
function writeIcns(master, out) {
  const tmp = mkdtempSync(join(tmpdir(), 'midnite-icns-'));
  try {
    const iconset = join(tmp, 'icon.iconset');
    mkdirSync(iconset);
    for (const size of [16, 32, 128, 256, 512]) {
      for (const [scale, suffix] of [[1, ''], [2, '@2x']]) {
        const px = String(size * scale);
        execFileSync('sips', ['-z', px, px, master, '--out', join(iconset, `icon_${size}x${size}${suffix}.png`)], { stdio: 'ignore' });
      }
    }
    mkdirSync(join(out, '..'), { recursive: true });
    execFileSync('iconutil', ['-c', 'icns', '-o', out, iconset]);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function writeAppIcons() {
  const written = [];
  for (const file of readdirSync(MASTER_DIR).filter((name) => name.endsWith('.png')).sort()) {
    const id = file.slice(0, -'.png'.length);
    const out = targetFor(id);
    if (out === null) continue;
    writeIcns(join(MASTER_DIR, file), out);
    written.push(`${id} → ${out.slice(REPO.length + 1)}`);
  }
  return written;
}

module.exports = { targetFor, writeAppIcons };

if (require.main === module) {
  for (const line of writeAppIcons()) console.log(`  ${line}`);
}
