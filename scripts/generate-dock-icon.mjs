#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

function loadSharp() {
  try {
    return require('sharp');
  } catch {
    const pnpmDir = join(root, 'node_modules/.pnpm');
    if (existsSync(pnpmDir)) {
      const entry = readdirSync(pnpmDir).find((d) => d.startsWith('sharp@'));
      if (entry) {
        return require(join(pnpmDir, entry, 'node_modules/sharp'));
      }
    }
    throw new Error('Could not resolve sharp module');
  }
}

const sharp = loadSharp();
const APP_LOGO_PATH = join(root, 'packages/app/src/assets/logo.png');
const DESKTOP_RESOURCES_DIR = join(root, 'packages/desktop/resources');
const OUTPUT_PNG = join(DESKTOP_RESOURCES_DIR, 'icon.png');
const OUTPUT_ICNS = join(DESKTOP_RESOURCES_DIR, 'icon.icns');
const TEMP_ICONSET = join(root, '.iconset-tmp.iconset');

async function buildMasterIcon() {
  const width = 1024;
  const height = 1024;
  const logoSize = 660; // Matches standard macOS squircle proportions
  const left = Math.round((width - logoSize) / 2);
  const top = Math.round((height - logoSize) / 2);

  const squircleSvg = `
  <svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <!-- Refined dark gradient background -->
      <linearGradient id="bgGrad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#1c1c20" />
        <stop offset="50%" stop-color="#141417" />
        <stop offset="100%" stop-color="#0b0b0e" />
      </linearGradient>

      <!-- Apple macOS standard top-edge rim lighting -->
      <linearGradient id="rimGrad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#ffffff" stop-opacity="0.25" />
        <stop offset="30%" stop-color="#ffffff" stop-opacity="0.08" />
        <stop offset="70%" stop-color="#ffffff" stop-opacity="0.02" />
        <stop offset="100%" stop-color="#ffffff" stop-opacity="0.0" />
      </linearGradient>

      <!-- Soft top surface sheen -->
      <radialGradient id="topSheen" cx="50%" cy="15%" r="65%" fx="50%" fy="0%">
        <stop offset="0%" stop-color="#ffffff" stop-opacity="0.05" />
        <stop offset="100%" stop-color="#ffffff" stop-opacity="0.0" />
      </radialGradient>

      <!-- Coin drop shadow for physical depth inside squircle -->
      <filter id="coinDropShadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="6" stdDeviation="14" flood-color="#000000" flood-opacity="0.55" />
        <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#000000" flood-opacity="0.35" />
      </filter>
    </defs>

    <!-- Base squircle (Apple macOS standard: 824x824 at 100,100 with rx=185) -->
    <rect x="100" y="100" width="824" height="824" rx="185" ry="185" fill="url(#bgGrad)" />

    <!-- Top sheen overlay clipped to squircle -->
    <rect x="100" y="100" width="824" height="824" rx="185" ry="185" fill="url(#topSheen)" />

    <!-- Inset rim highlight stroke -->
    <rect x="100.75" y="100.75" width="822.5" height="822.5" rx="184.25" ry="184.25" fill="none" stroke="url(#rimGrad)" stroke-width="1.5" />

    <!-- Shadow under circular coin -->
    <circle cx="512" cy="512" r="${logoSize / 2}" fill="#000000" filter="url(#coinDropShadow)" />

    <!-- Subtle hairline ring around coin (ring-1 ring-border/60 style) -->
    <circle cx="512" cy="512" r="${logoSize / 2}" fill="none" stroke="#ffffff" stroke-opacity="0.14" stroke-width="2" />
  </svg>`;

  const bgBuf = await sharp(Buffer.from(squircleSvg)).png().toBuffer();

  const logoBuf = await sharp(APP_LOGO_PATH)
    .resize(logoSize, logoSize, { fit: 'contain' })
    .toBuffer();

  return await sharp(bgBuf)
    .composite([{ input: logoBuf, left, top }])
    .png()
    .toBuffer();
}

async function main() {
  console.log('Rendering 1024x1024 master icon...');
  const masterBuf = await buildMasterIcon();

  // Save 512x512 icon.png for cross-platform / Linux
  const icon512Buf = await sharp(masterBuf).resize(512, 512).png().toBuffer();
  writeFileSync(OUTPUT_PNG, icon512Buf);
  console.log(`Wrote ${OUTPUT_PNG} (512x512)`);

  // Prepare macOS iconset
  if (existsSync(TEMP_ICONSET)) {
    rmSync(TEMP_ICONSET, { recursive: true, force: true });
  }
  mkdirSync(TEMP_ICONSET, { recursive: true });

  const iconSizes = [
    { name: 'icon_16x16.png', size: 16 },
    { name: 'icon_16x16@2x.png', size: 32 },
    { name: 'icon_32x32.png', size: 32 },
    { name: 'icon_32x32@2x.png', size: 64 },
    { name: 'icon_128x128.png', size: 128 },
    { name: 'icon_128x128@2x.png', size: 256 },
    { name: 'icon_256x256.png', size: 256 },
    { name: 'icon_256x256@2x.png', size: 512 },
    { name: 'icon_512x512.png', size: 512 },
    { name: 'icon_512x512@2x.png', size: 1024 },
  ];

  for (const { name, size } of iconSizes) {
    const resized = size === 1024 ? masterBuf : await sharp(masterBuf).resize(size, size).png().toBuffer();
    writeFileSync(join(TEMP_ICONSET, name), resized);
  }

  console.log('Converting iconset to icns with iconutil...');
  execSync(`iconutil -c icns "${TEMP_ICONSET}" -o "${OUTPUT_ICNS}"`, { stdio: 'inherit' });
  console.log(`Wrote ${OUTPUT_ICNS}`);

  // Cleanup temp iconset
  rmSync(TEMP_ICONSET, { recursive: true, force: true });
  console.log('Icon generation complete!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
