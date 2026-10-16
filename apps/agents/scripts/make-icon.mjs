#!/usr/bin/env node
// make-icon — writes resources/icon.icns: the launcher catalog's Agents glyph (PiRobotFill)
// in white on a rounded square in Agents' accent. (Phase 113 Theme H1)
//
// `node scripts/make-icon.mjs [outDir]` (default: ../resources). SVG -> 1024px PNG through headless
// Chromium (Playwright, already a repo dependency; sips cannot rasterise SVG reliably) -> every
// iconset size with `sips` -> `iconutil -c icns`. macOS only. The release packs the committed .icns;
// re-run this only when the glyph or accent changes.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const ACCENT = '#8b5cf6';

export function iconSvg(size = 1024) {
  const { PiRobotFill } = require('react-icons/pi');
  const { createElement } = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  // Apple's icon grid: the artwork is ~80% of the canvas, corner radius ~22% of that.
  const art = size * 0.8;
  const inset = (size - art) / 2;
  const glyph = renderToStaticMarkup(
    createElement(PiRobotFill, { size: art * 0.55, color: '#ffffff' }),
  ).replace('<svg', `<svg x="${inset + art * 0.225}" y="${inset + art * 0.225}"`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
<rect x="${inset}" y="${inset}" width="${art}" height="${art}" rx="${art * 0.225}" fill="${ACCENT}"/>
${glyph}
</svg>`;
}

async function rasterise(svg, png, size) {
  const pw = createRequire(path.join(here, '../../../packages/app/package.json'))('@playwright/test');
  const browser = await pw.chromium.launch({
    // CHROMIUM_PATH: use an already-installed browser instead of the one Playwright pins.
    executablePath: process.env.CHROMIUM_PATH || undefined,
  });
  try {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(`<body style="margin:0;background:transparent">${svg}</body>`);
    await page.screenshot({ path: png, omitBackground: true });
  } finally {
    await browser.close();
  }
}

export async function makeIcon(outDir) {
  const work = mkdtempSync(path.join(tmpdir(), 'agents-icon-'));
  try {
    const master = path.join(work, 'master.png');
    await rasterise(iconSvg(1024), master, 1024);
    const set = path.join(work, 'icon.iconset');
    mkdirSync(set);
    for (const base of [16, 32, 128, 256, 512]) {
      for (const scale of [1, 2]) {
        const px = base * scale;
        const name = `icon_${base}x${base}${scale === 2 ? '@2x' : ''}.png`;
        execFileSync('sips', ['-z', String(px), String(px), master, '--out', path.join(set, name)], { stdio: 'ignore' });
      }
    }
    mkdirSync(outDir, { recursive: true });
    const icns = path.join(outDir, 'icon.icns');
    execFileSync('iconutil', ['-c', 'icns', set, '-o', icns]);
    writeFileSync(path.join(work, 'done'), '');
    return icns;
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(await makeIcon(path.resolve(process.argv[2] ?? path.join(here, '../resources'))));
}
