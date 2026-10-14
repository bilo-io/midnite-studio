/**
 * Generate each app's logo: the midnite moon (Studio's own app icon) with its
 * white recoloured to the app's accent as a radial gradient, the black left
 * black, and the app's glyph stamped over it in white.
 *
 *   moon run launcher:logos
 *
 * Runs under Electron rather than plain Node because the compositing is a
 * canvas job — Chromium rasterises the react-icons SVG — and Electron is
 * already this package's dev dependency, so there is nothing new to install.
 *
 * Inputs: Studio's `packages/desktop/resources/icon.icns` (its 1024 px
 * representation, via macOS's `iconutil`), `src/common/catalog.ts` (accents)
 * and `src/renderer/app-glyphs.ts` (glyphs), both read through esbuild so the
 * output can never drift from what the launcher shows.
 *
 * Outputs:
 *   resources/app-logos/<id>.png             1024 px masters, for each app's own .icns later
 *   src/renderer/assets/app-logos/<id>.png   256 px, what the launcher's tiles draw
 */
const { execFileSync } = require('node:child_process');
const { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

const { app, BrowserWindow } = require('electron');
const esbuild = require('esbuild');

const ROOT = join(__dirname, '..');
const STUDIO_ICNS = join(ROOT, '..', '..', 'packages', 'desktop', 'resources', 'icon.icns');
const MASTER_DIR = join(ROOT, 'resources', 'app-logos');
const UI_DIR = join(ROOT, 'src', 'renderer', 'assets', 'app-logos');

function studioIcon1024() {
  const tmp = mkdtempSync(join(tmpdir(), 'midnite-logo-'));
  try {
    const iconset = join(tmp, 'studio.iconset');
    execFileSync('iconutil', ['-c', 'iconset', '-o', iconset, STUDIO_ICNS]);
    return `data:image/png;base64,${readFileSync(join(iconset, 'icon_512x512@2x.png')).toString('base64')}`;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

async function logoData() {
  const result = await esbuild.build({
    entryPoints: [join(__dirname, 'logo-data.tsx')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    jsx: 'automatic',
    write: false,
    logLevel: 'warning',
  });
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', result.outputFiles[0].text)(mod, mod.exports, require);
  return mod.exports.logoData();
}

/* global Image, document -- `compose` is serialised and runs in the page, not in main. */
/** Runs in the page. Returns [1024 px, 256 px] PNG data URLs. */
async function compose({ base, svg, accent }) {
  const S = 1024;
  const load = (src) =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  const rgb = [1, 3, 5].map((i) => parseInt(accent.slice(i, i + 2), 16));
  const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  const light = mix(rgb, [255, 255, 255], 0.4);
  const dark = mix(rgb, [0, 0, 0], 0.4);

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext('2d');
  // The moon is drawn larger than Studio's icon has it — MARK_SCALE about the
  // centre — so it fills more of the rounded square. Studio's background is a
  // full-bleed gradient, so scaling it up only crops more of the same.
  const MARK_SCALE = 1.22;
  const drawn = S * MARK_SCALE;
  ctx.drawImage(await load(base), (S - drawn) / 2, (S - drawn) / 2, drawn, drawn);

  // Recolour by luminance: near-white becomes the gradient, dark stays as it
  // was, and the anti-aliased edges between them blend rather than fringe.
  const image = ctx.getImageData(0, 0, S, S);
  const d = image.data;
  const cx = S / 2 - S * 0.1 * MARK_SCALE;
  const cy = S / 2 - S * 0.16 * MARK_SCALE;
  const radius = S * 0.5 * MARK_SCALE;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      const lum = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      const t = Math.min(1, Math.max(0, (lum - 70) / 180));
      if (t === 0) continue;
      const r = Math.min(1, Math.hypot(x - cx, y - cy) / radius);
      const shade = r < 0.5 ? mix(light, rgb, r / 0.5) : mix(rgb, dark, (r - 0.5) / 0.5);
      for (let c = 0; c < 3; c++) d[i + c] = d[i + c] + (shade[c] - d[i + c]) * t;
    }
  }
  ctx.putImageData(image, 0, 0);

  // The glyph, white, centred on the moon, with a soft shadow so it reads over
  // both the black and the coloured halves.
  const glyph = await load(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
  // Small enough that the crescent still reads around it.
  const size = S * 0.22;
  ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
  ctx.shadowBlur = S * 0.03;
  ctx.shadowOffsetY = S * 0.008;
  ctx.drawImage(glyph, (S - size) / 2, (S - size) / 2, size, size);

  const small = document.createElement('canvas');
  small.width = small.height = 256;
  const sctx = small.getContext('2d');
  sctx.imageSmoothingQuality = 'high';
  sctx.drawImage(canvas, 0, 0, 256, 256);
  return [canvas.toDataURL('image/png'), small.toDataURL('image/png')];
}

app.whenReady().then(async () => {
  try {
    const base = studioIcon1024();
    const apps = await logoData();
    const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
    await win.loadURL('about:blank');
    mkdirSync(MASTER_DIR, { recursive: true });
    mkdirSync(UI_DIR, { recursive: true });
    for (const { id, accent, svg } of apps) {
      const [master, ui] = await win.webContents.executeJavaScript(
        `(${compose.toString()})(${JSON.stringify({ base, svg, accent })})`,
      );
      writeFileSync(join(MASTER_DIR, `${id}.png`), Buffer.from(master.split(',')[1], 'base64'));
      writeFileSync(join(UI_DIR, `${id}.png`), Buffer.from(ui.split(',')[1], 'base64'));
      console.log(`  ${id}`);
    }
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
