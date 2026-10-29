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
 * Outputs (one per app, plus `launcher` — the launcher's own mark):
 *   resources/app-logos/<id>.png             1024 px masters, each app's .icns is built from
 *   src/renderer/assets/app-logos/<id>.png   256 px, what the launcher draws
 *   packages/frame/src/shell/app-logos/<id>.png  a byte copy of that 256 px file, what each app's window shows (Phase 123 C; not `launcher`)
 *   every app's icon.icns                    from those masters, by `app-icons.cjs` — so the Dock matches the tile
 */
const { execFileSync } = require('node:child_process');
const { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

const { app, BrowserWindow } = require('electron');
const esbuild = require('esbuild');

const { writeAppIcons } = require('./app-icons.cjs');

const ROOT = join(__dirname, '..');
const STUDIO_ICNS = join(ROOT, '..', '..', 'packages', 'desktop', 'resources', 'icon.icns');
const MASTER_DIR = join(ROOT, 'resources', 'app-logos');
const UI_DIR = join(ROOT, 'src', 'renderer', 'assets', 'app-logos');
const FRAME_DIR = join(ROOT, '..', '..', 'packages', 'frame', 'src', 'shell', 'app-logos');

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
async function compose({ base, svg, accent, brand }) {
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

  // The midnite brand ramp — the website's `--ws-rainbow-0..5` (and Studio's
  // `--rainbow-*`): blue → indigo → violet → purple, with pink only at the far
  // end. Laid diagonally across the moon, top-left to bottom-right, with the
  // same soft highlight and edge falloff the single-accent logos get.
  // The moon is drawn larger than Studio's icon has it — about the centre.
  const MARK_SCALE = 1.22;
  const BRAND = [
    [0, [46, 124, 250]],
    [0.3, [102, 114, 245]],
    [0.55, [139, 92, 246]],
    [0.78, [168, 85, 247]],
    [1, [231, 64, 209]],
  ];
  const span = S * 0.4 * MARK_SCALE;
  function brandShade(x, y, r) {
    const along = Math.min(1, Math.max(0, ((x - S / 2) + (y - S / 2)) / (2 * span) + 0.5));
    let k = 1;
    while (k < BRAND.length - 1 && BRAND[k][0] < along) k++;
    const [p0, c0] = BRAND[k - 1];
    const [p1, c1] = BRAND[k];
    const base = mix(c0, c1, (along - p0) / (p1 - p0));
    return r < 0.5 ? mix(mix(base, [255, 255, 255], 0.3), base, r / 0.5) : mix(base, [0, 0, 0], ((r - 0.5) / 0.5) * 0.3);
  }

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext('2d');
  // MARK_SCALE (above) fills more of the rounded square. Studio's background is a
  // full-bleed gradient, so scaling it up only crops more of the same.
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
      const shade = brand ? brandShade(x, y, r) : r < 0.5 ? mix(light, rgb, r / 0.5) : mix(rgb, dark, (r - 0.5) / 0.5);
      for (let c = 0; c < 3; c++) d[i + c] = d[i + c] + (shade[c] - d[i + c]) * t;
    }
  }
  ctx.putImageData(image, 0, 0);

  // The glyph, white, centred on the moon, with a soft shadow so it reads over
  // both the black and the coloured halves.
  const glyph = await load(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
  // Small enough that the crescent still reads around it.
  const size = S * 0.27;
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
    mkdirSync(FRAME_DIR, { recursive: true });
    for (const { id, accent, brand, svg } of apps) {
      const [master, ui] = await win.webContents.executeJavaScript(
        `(${compose.toString()})(${JSON.stringify({ base, svg, accent, brand })})`,
      );
      writeFileSync(join(MASTER_DIR, `${id}.png`), Buffer.from(master.split(',')[1], 'base64'));
      const uiPng = Buffer.from(ui.split(',')[1], 'base64');
      writeFileSync(join(UI_DIR, `${id}.png`), uiPng);
      // The launcher's own mark is not a suite app; every other id gets a copy in the frame.
      if (id !== 'launcher') writeFileSync(join(FRAME_DIR, `${id}.png`), uiPng);
      console.log(`  ${id}`);
    }
    for (const line of writeAppIcons()) console.log(`  ${line}`);
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
