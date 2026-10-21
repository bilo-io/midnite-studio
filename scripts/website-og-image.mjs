#!/usr/bin/env node
/**
 * Renders the website's social preview card: `packages/website/public/img/og/midnite-apps.png`.
 *
 *   node scripts/website-og-image.mjs
 *
 * 1200×630, the size every Open Graph and `summary_large_image` consumer crops
 * to. It is drawn as an HTML page and screenshotted by Playwright rather than
 * composed as an SVG, because the wordmark is set in the site's own brand face
 * (Damion, `packages/website/src/fonts/damion/`) and an SVG rasteriser only
 * sees system fonts.
 *
 * What it carries, and why:
 * - **Studio's brand gradient** — the same five stops the launcher's logo
 *   generator lays across Studio's moon (`apps/launcher/scripts/generate-app-logos.cjs`),
 *   blue through violet to pink. It fills the mark and the wordmark, and
 *   tints the glow behind them.
 * - **The plain moon** — the disc-and-crescent mark with no rocket in it, traced
 *   from `logo.png` (the path is `packages/app/src/components/icons/midnite-icon.tsx`'s).
 *   The rocket is Studio's own; the card speaks for the whole suite.
 * - **The suite** — every app's logo in a row, from `public/img/apps/`, in the
 *   order the site's catalog lists them.
 *
 * The output is committed; this script only needs re-running when the card
 * should change. Playwright is resolved out of the pnpm store, the way
 * `generate-dock-icon.mjs` resolves sharp, because it is `@midnite/app`'s
 * dependency and not the root's.
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const website = join(root, 'packages/website');
const OUTPUT = join(website, 'public/img/og/midnite-apps.png');

/** Every app on the site, in catalog order (`packages/website/src/apps/catalog.ts`). */
const APPS = [
  'studio', 'agents', 'coder', 'gamer', 'creator', 'media', 'money',
  'mind', 'browser', 'cleaner', 'vault', 'capture', 'monitor',
];

/** Studio's brand ramp, as `generate-app-logos.cjs` lays it across Studio's moon. */
const BRAND = [
  [0, '#2e7cfa'],
  [30, '#6672f5'],
  [55, '#8b5cf6'],
  [78, '#a855f7'],
  [100, '#e740d1'],
];

/** The moon, from `midnite-icon.tsx`: one evenodd path on a 1024 canvas. */
const MOON_PATH = `M0 512A512 512 0 1 1 1024 512A512 512 0 1 1 0 512Z
  M47 512A465 465 0 1 1 977 512A465 465 0 1 1 47 512Z
  M0 512A512 512 0 0 1 1024 512Z
  M551 222A297 297 0 0 1 532 803L494 805L463 802L427 794L387 779L359 764L323 738L293 709L278 690L315 711L342 720L370 725L408 725L419 723A219.7 219.7 0 0 0 461 310L441 303L414 298L371 298L348 302L321 311L284 331L299 312L323 288L367 256L414 234L445 225L473 220L517 218Z`;

const loadPlaywright = async () => {
  const pnpmDir = join(root, 'node_modules/.pnpm');
  const entry = existsSync(pnpmDir)
    ? readdirSync(pnpmDir).find((d) => /^playwright@\d/.test(d))
    : undefined;
  if (!entry) throw new Error('Could not resolve playwright: run pnpm install first.');
  return import(pathToFileURL(join(pnpmDir, entry, 'node_modules/playwright/index.mjs')).href);
};

/** A deterministic star field, so a re-run without a design change is byte-stable. */
const stars = () => {
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  return Array.from({ length: 90 }, () => {
    const x = (rand() * 1200).toFixed(1);
    const y = (rand() * 630).toFixed(1);
    const r = (0.4 + rand() * 1.1).toFixed(2);
    const o = (0.15 + rand() * 0.5).toFixed(2);
    return `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" opacity="${o}"/>`;
  }).join('');
};

const ramp = BRAND.map(([at, c]) => `${c} ${at}%`).join(', ');
const file = (p) => pathToFileURL(join(website, p)).href;

const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  @font-face { font-family: Damion; src: url('${file('src/fonts/damion/Damion-latin.woff2')}') format('woff2'); }
  * { box-sizing: border-box; margin: 0; }
  html, body { width: 1200px; height: 630px; overflow: hidden; }
  body {
    position: relative;
    background: #07070d;
    color: #fff;
    font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif;
  }
  .glow { position: absolute; border-radius: 50%; filter: blur(90px); }
  .g1 { width: 620px; height: 620px; left: -160px; top: -200px; background: #2e7cfa; opacity: .42; }
  .g2 { width: 560px; height: 560px; left: 170px; top: 210px; background: #8b5cf6; opacity: .40; }
  .g3 { width: 520px; height: 520px; right: -170px; bottom: -260px; background: #e740d1; opacity: .34; }
  .g4 { width: 380px; height: 380px; right: 120px; top: -220px; background: #a855f7; opacity: .22; }
  .stars { position: absolute; inset: 0; }
  .frame {
    position: absolute; inset: 22px; border-radius: 34px;
    border: 1px solid rgb(255 255 255 / .09);
    background: linear-gradient(180deg, rgb(255 255 255 / .035), rgb(255 255 255 / 0));
  }
  .content {
    position: absolute; inset: 0; display: flex; align-items: center; gap: 64px;
    padding: 0 84px 40px;
  }
  .moon { flex: none; width: 300px; height: 300px; filter: drop-shadow(0 0 36px rgb(139 92 246 / .55)) drop-shadow(0 18px 40px rgb(0 0 0 / .6)); }
  .copy { display: flex; flex-direction: column; gap: 22px; min-width: 0; }
  .eyebrow {
    font-size: 17px; font-weight: 600; letter-spacing: .22em; text-transform: uppercase;
    color: rgb(255 255 255 / .62);
  }
  .wordmark { display: flex; align-items: baseline; gap: 18px; line-height: 1; white-space: nowrap; }
  .brand {
    font-family: Damion, cursive; font-size: 132px; padding-right: .15em;
    background: linear-gradient(100deg, ${ramp});
    -webkit-background-clip: text; background-clip: text; color: transparent;
    filter: drop-shadow(0 0 22px rgb(139 92 246 / .45));
  }
  .product { font-size: 92px; font-weight: 700; letter-spacing: -.035em; margin-left: -6px; }
  .tagline { font-size: 32px; font-weight: 500; line-height: 1.25; color: rgb(255 255 255 / .86); letter-spacing: -.01em; }
  .apps { position: absolute; left: 0; right: 0; bottom: 50px; display: flex; justify-content: center; gap: 14px; }
  .apps img { width: 54px; height: 54px; border-radius: 14px; box-shadow: 0 10px 24px -8px rgb(0 0 0 / .8), 0 0 0 1px rgb(255 255 255 / .08); }
</style></head><body>
  <div class="glow g1"></div><div class="glow g2"></div><div class="glow g3"></div><div class="glow g4"></div>
  <svg class="stars" viewBox="0 0 1200 630">${stars()}</svg>
  <div class="frame"></div>
  <div class="content">
    <svg class="moon" viewBox="0 0 1024 1024">
      <defs>
        <linearGradient id="brand" x1="0" y1="0" x2="1" y2="1">
          ${BRAND.map(([at, c]) => `<stop offset="${at}%" stop-color="${c}"/>`).join('')}
        </linearGradient>
      </defs>
      <path d="${MOON_PATH}" fill="url(#brand)" fill-rule="evenodd"/>
    </svg>
    <div class="copy">
      <p class="eyebrow">macOS · Apple silicon</p>
      <p class="wordmark"><span class="brand">Midnite</span><span class="product">Apps</span></p>
      <p class="tagline">One launcher for the whole midnite suite:<br>code, agents, media, ideas and more.</p>
    </div>
  </div>
  <div class="apps">${APPS.map((id) => `<img src="${file(`public/img/apps/${id}.png`)}" alt="">`).join('')}</div>
</body></html>`;

const work = mkdtempSync(join(tmpdir(), 'website-og-'));
try {
  const page_ = join(work, 'og.html');
  writeFileSync(page_, html);
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
    await page.goto(pathToFileURL(page_).href, { waitUntil: 'load' });
    await page.evaluate('document.fonts.ready');
    mkdirSync(dirname(OUTPUT), { recursive: true });
    await page.screenshot({ path: OUTPUT });
  } finally {
    await browser.close();
  }
  console.log(`wrote ${OUTPUT}`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
