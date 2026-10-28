/**
 * Renders the invented posters, show art, album covers and photo frames the
 * media-dark shot serves into Media ▸ Library. Run once:
 *
 *   node fixtures/media-art.mjs
 *
 * Backgrounds are this repo's own Media captures (satellite tiles, terrain
 * drapes, the generated studio wallpapers) — nothing is fetched from the web.
 * Typography is set by headless Chromium from macOS system fonts.
 * Output: fixtures/data/media-art/<name>.jpg
 */
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MEDIA = path.resolve(HERE, '../../../../..');
const OUT = path.join(HERE, 'data/media-art');
const TMP = path.join(OUT, '.src');
fs.mkdirSync(TMP, { recursive: true });

const SRC = {
  canyon: 'map/maps/captures/grand-canyon-arizona-united-states-20261015-153354/satellite.png',
  island: 'map/maps/captures/m33.8058_18.3691-20261009-124716/satellite.png',
  capetown: 'map/maps/captures/cape-town-western-cape-south-africa-20261009-124534/satellite.png',
  manhattan: 'map/maps/captures/40.7834_m73.9619-20261008-133145/satellite.png',
  bern: 'map/maps/captures/bern-canton-of-bern-switzerland-20261008-181520/satellite.png',
  oslo: 'map/maps/captures/oslo-oslo-norway-20261009-163557/satellite.png',
  desert: 'map/maps/captures/35.9770_m114.8446-20261008-132834/satellite.png',
  sydney: 'map/maps/captures/sydney-new-south-wales-australia-20261015-213112/satellite.png',
  coast: 'map/maps/captures/m34.0155_18.3485-20261008-090259/satellite.png',
  canyonDrape: 'terrain/terrains/grand-canyon-arizona-united-states-20261015-173354/build/drape.png',
  building: 'model/Architecture/create-this-building-as-precisely-as-pos-20261008-153842/create-this-building-as-precisely-as-pos-20261008-153842.ref.jpg',
  studio: 'image/generated/build-another-1080p-wallpaper-of-midnigh-20261011-111141.png',
  loft: 'image/generated/build-another-1080p-wallpaper-of-midnigh-20261011-111256.png',
};

function dataUri(key) {
  const out = path.join(TMP, `${key}.jpg`);
  if (!fs.existsSync(out)) {
    execFileSync('/opt/homebrew/bin/ffmpeg', ['-v', 'error', '-y', '-i', path.join(MEDIA, SRC[key]), '-vf', 'scale=2000:-2', '-q:v', '3', out]);
  }
  return `data:image/jpeg;base64,${fs.readFileSync(out).toString('base64')}`;
}

const base = `*{margin:0;box-sizing:border-box}html,body{width:100%;height:100%;overflow:hidden;background:#000}
.bg{position:absolute;inset:0;background-size:cover;background-position:center}
.fill{position:absolute;inset:0}`;

/** A photographic film poster: graded image, gradient, title block. */
function photoPoster({ img, pos = 'center', scale = 1.3, grade, title, tag, credit, font = 'Avenir Next', weight = 700, spacing = '0.08em', size = 46, upper = true, color = '#fff', align = 'bottom' }) {
  return `<style>${base}
  .bg{background-image:url(${dataUri(img)});background-position:${pos};transform:scale(${scale});filter:${grade}}
  .g{background:linear-gradient(180deg,rgba(0,0,0,.25) 0%,rgba(0,0,0,0) 35%,rgba(0,0,0,.15) 55%,rgba(0,0,0,.85) 100%)}
  .t{position:absolute;left:0;right:0;${align === 'top' ? 'top:34px' : 'bottom:44px'};text-align:center;color:${color};padding:0 22px}
  .tag{font:500 11px 'Avenir Next';letter-spacing:.32em;text-transform:uppercase;opacity:.85;margin-bottom:12px}
  h1{font-family:'${font}';font-weight:${weight};font-size:${size}px;line-height:.98;letter-spacing:${spacing};${upper ? 'text-transform:uppercase;' : ''}}
  .cr{position:absolute;bottom:16px;left:0;right:0;text-align:center;font:500 7.5px 'Avenir Next Condensed';letter-spacing:.18em;color:rgba(255,255,255,.55);text-transform:uppercase}
  </style><div class="bg"></div><div class="fill g"></div>
  <div class="t">${tag ? `<div class="tag">${tag}</div>` : ''}<h1>${title}</h1></div><div class="cr">${credit}</div>`;
}

/** A graphic (non-photographic) poster or cover. */
function graphic(html, css) {
  return `<style>${base}${css}</style>${html}`;
}

const FILMS = [
  ['salt-line', photoPoster({ img: 'island', scale: 1.6, grade: 'saturate(.7) hue-rotate(-12deg) contrast(1.15) brightness(.85)', title: 'Salt<br>Line', tag: 'A film by Noor Adeyemi', credit: 'Harbourlight Pictures · Coming home is the hardest crossing' })],
  ['long-meridian', photoPoster({ img: 'canyonDrape', scale: 1.4, grade: 'saturate(1.25) contrast(1.1) sepia(.15)', title: 'The Long Meridian', font: 'Didot', weight: 400, spacing: '0.02em', size: 44, upper: false, tag: 'Two brothers · one map', credit: 'Red Mesa Films · Shot on location' })],
  ['northbound', photoPoster({ img: 'oslo', scale: 1.5, grade: 'saturate(.55) hue-rotate(160deg) brightness(.8) contrast(1.2)', title: 'Northbound', size: 33, spacing: '0.12em', tag: 'Winter, 1987', credit: 'Fjordlys Studio · A Nordic thriller' })],
  ['quiet-grid', photoPoster({ img: 'manhattan', scale: 1.25, grade: 'grayscale(.6) contrast(1.3) brightness(.75)', title: 'Quiet<br>Grid', font: 'Futura', weight: 700, size: 52, spacing: '0.04em', tag: 'The city never sleeps. Neither does she.', credit: 'Eighth Avenue Pictures' })],
  [
    'parallax',
    graphic(
      `<div class="fill a"></div><div class="c c1"></div><div class="c c2"></div><div class="c c3"></div><div class="t"><div class="k">A Midnite original</div><h1>PARALLAX</h1><div class="s">Some distances only close in the dark</div></div>`,
      `.a{background:radial-gradient(120% 80% at 50% 10%,#3b1d6e 0%,#140a2e 55%,#05030d 100%)}
      .c{position:absolute;border-radius:50%;mix-blend-mode:screen}
      .c1{width:300px;height:300px;left:-40px;top:80px;background:radial-gradient(circle,#ff5fa2 0%,rgba(255,95,162,0) 70%)}
      .c2{width:260px;height:260px;right:-50px;top:150px;background:radial-gradient(circle,#4fc3ff 0%,rgba(79,195,255,0) 70%)}
      .c3{width:130px;height:130px;left:115px;top:150px;border:2px solid rgba(255,255,255,.8)}
      .t{position:absolute;bottom:52px;left:0;right:0;text-align:center;color:#fff}
      .k{font:500 10px 'Avenir Next';letter-spacing:.34em;text-transform:uppercase;opacity:.8;margin-bottom:10px}
      h1{font:700 44px 'Avenir Next';letter-spacing:.22em}
      .s{font:italic 400 12px 'New York';opacity:.8;margin-top:10px}`,
    ),
  ],
  ['table-mountain', photoPoster({ img: 'capetown', scale: 1.7, pos: '40% 45%', grade: 'saturate(1.1) contrast(1.1) brightness(.9) sepia(.2)', title: 'After the<br>South Easter', font: 'New York', weight: 600, size: 36, spacing: '0', upper: false, tag: 'Cape Town · Summer', credit: 'Signal Hill Films' })],
  ['the-dry', photoPoster({ img: 'desert', scale: 1.4, grade: 'saturate(1.3) contrast(1.15) hue-rotate(-8deg)', title: 'The Dry', size: 56, spacing: '0.06em', font: 'Futura', tag: 'Nothing grows here', credit: 'Basin & Range' })],
  [
    'signal',
    graphic(
      `<div class="fill a"></div><div class="lines"></div><div class="t"><h1>SIGNAL<br>/ NOISE</h1><div class="s">A documentary about the people who keep the internet up</div></div>`,
      `.a{background:linear-gradient(160deg,#0c3b2e 0%,#06231c 60%,#020c09 100%)}
      .lines{position:absolute;inset:60px 30px 200px 30px;background:repeating-linear-gradient(90deg,rgba(120,255,190,.0) 0 6px,rgba(120,255,190,.55) 6px 8px);mask:linear-gradient(180deg,transparent,#000 30%,#000 70%,transparent);-webkit-mask:radial-gradient(70% 60% at 50% 50%,#000 30%,transparent 75%)}
      .t{position:absolute;bottom:48px;left:28px;right:28px;color:#d8ffee}
      h1{font:800 42px 'Avenir Next Condensed';letter-spacing:.04em;line-height:.95}
      .s{font:500 11px 'Avenir Next';opacity:.75;margin-top:12px;line-height:1.35}`,
    ),
  ],
];

const SHOWS = [
  ['harbour-lights', photoPoster({ img: 'capetown', scale: 2.2, pos: '70% 20%', grade: 'saturate(.8) hue-rotate(185deg) brightness(.75) contrast(1.2)', title: 'Harbour<br>Lights', size: 42, spacing: '0.1em', tag: 'Series · Season 2', credit: 'New episodes every Friday' })],
  ['low-orbit', graphic(
    `<div class="fill a"></div><div class="planet"></div><div class="ring"></div><div class="t"><div class="k">Series</div><h1>Low Orbit</h1></div>`,
    `.a{background:radial-gradient(100% 70% at 50% 100%,#1a2a6c 0%,#0b1030 45%,#02030a 100%)}
    .planet{position:absolute;width:420px;height:420px;left:-30px;bottom:-250px;border-radius:50%;background:radial-gradient(circle at 40% 30%,#6aa8ff,#1d3a8a 55%,#081232 80%);box-shadow:0 0 80px rgba(100,160,255,.5)}
    .ring{position:absolute;width:4px;height:4px;left:250px;top:120px;border-radius:50%;background:#fff;box-shadow:0 0 18px 6px rgba(255,255,255,.7)}
    .t{position:absolute;top:60px;left:0;right:0;text-align:center;color:#fff}
    .k{font:500 10px 'Avenir Next';letter-spacing:.34em;text-transform:uppercase;opacity:.75;margin-bottom:10px}
    h1{font:300 46px 'Avenir Next';letter-spacing:.06em}`,
  )],
  ['the-atlas-office', photoPoster({ img: 'building', scale: 1.15, pos: '50% 30%', grade: 'saturate(.9) contrast(1.05)', title: 'The Atlas Office', font: 'Didot', weight: 400, size: 38, spacing: '0', upper: false, color: '#fff', tag: 'A workplace comedy', credit: 'Season 1 · 8 episodes' })],
  ['ridgeline', photoPoster({ img: 'bern', scale: 1.5, grade: 'saturate(.9) contrast(1.15) brightness(.85)', title: 'Ridgeline', size: 40, spacing: '0.16em', tag: 'Series · Season 1', credit: 'An alpine mystery' })],
];

const cover = (bg, title, artist, extra = '', titleCss = '') =>
  graphic(
    `<div class="fill a"></div>${extra}<div class="t"><div class="ar">${artist}</div><h1>${title}</h1></div>`,
    `.a{background:${bg}}
    .t{position:absolute;left:26px;right:26px;bottom:24px;color:#fff}
    .ar{font:600 11px 'Avenir Next';letter-spacing:.3em;text-transform:uppercase;opacity:.85}
    h1{font:700 30px 'Avenir Next';margin-top:6px;line-height:1;${titleCss}}`,
  );

const ALBUMS = [
  ['neon-tide', cover('linear-gradient(135deg,#ff3d8b 0%,#7b2ff7 50%,#120638 100%)', 'Neon Tide', 'Halcyon Drive', '<div style="position:absolute;inset:40px 40px 120px 40px;border-radius:50%;border:2px solid rgba(255,255,255,.6)"></div>')],
  ['late-session', graphic(`<div class="bg" style="background-image:url(${dataUri('studio')});filter:saturate(1.1) brightness(.85)"></div><div class="fill" style="background:linear-gradient(180deg,transparent 40%,rgba(0,0,0,.8))"></div><div style="position:absolute;left:24px;bottom:22px;color:#fff"><div style="font:600 11px 'Avenir Next';letter-spacing:.3em;text-transform:uppercase;opacity:.85">The Night Desk</div><div style="font:italic 600 30px 'New York';margin-top:4px">Late Session</div></div>`, '')],
  ['meridian', cover('radial-gradient(circle at 30% 30%,#ffd36e 0%,#ff7a3d 40%,#5a1a0b 100%)', 'Meridian', 'Kalahari Sound System', '', "font-family:'Futura';letter-spacing:.08em;text-transform:uppercase")],
  ['blue-hour', cover('linear-gradient(180deg,#0f2b5b 0%,#3b6db3 55%,#b9d3f0 100%)', 'Blue Hour', 'Marta Lindqvist', '<div style="position:absolute;left:0;right:0;top:150px;height:2px;background:rgba(255,255,255,.7)"></div>', "font-family:'Didot';font-weight:400;font-size:34px")],
  ['loft-parties', graphic(`<div class="bg" style="background-image:url(${dataUri('loft')});filter:saturate(1.2) contrast(1.1) brightness(.8)"></div><div class="fill" style="background:linear-gradient(0deg,rgba(255,120,40,.35),transparent 60%)"></div><div style="position:absolute;left:0;right:0;top:26px;text-align:center;color:#fff"><div style="font:800 34px 'Avenir Next Condensed';letter-spacing:.06em;text-transform:uppercase">Warehouse<br>Hours</div><div style="font:600 10px 'Avenir Next';letter-spacing:.3em;text-transform:uppercase;margin-top:8px;opacity:.9">Okuhle &amp; The Strangers</div></div>`, '')],
  ['terra', graphic(`<div class="bg" style="background-image:url(${dataUri('canyon')});filter:saturate(1.3) contrast(1.2)"></div><div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center"><div style="width:190px;height:190px;border-radius:50%;background:rgba(0,0,0,.55);backdrop-filter:blur(4px);display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff"><div style="font:700 34px 'Futura';letter-spacing:.2em">TERRA</div><div style="font:600 9px 'Avenir Next';letter-spacing:.3em;text-transform:uppercase;margin-top:6px">Field Recordings</div></div></div>`, '')],
];

const PHOTOS = [
  ['grand-canyon', 'canyon', 'saturate(1.1)'],
  ['robben-island', 'island', ''],
  ['table-bay', 'capetown', ''],
  ['central-park', 'manhattan', ''],
  ['bern-old-town', 'bern', ''],
  ['oslofjord', 'oslo', ''],
  ['sydney-harbour', 'sydney', ''],
  ['mojave-edge', 'desert', ''],
  ['chapmans-peak', 'coast', ''],
  ['the-studio', 'studio', ''],
  ['loft-launch-party', 'loft', ''],
  ['sea-point-block', 'building', ''],
].map(([name, img, grade]) => [name, `<style>${base}.bg{background-image:url(${dataUri(img)});filter:${grade || 'none'}}</style><div class="bg"></div>`]);

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 3.5 });
async function shoot(name, html, w, h) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<!doctype html><html><body>${html}</body></html>`, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(OUT, `${name}.jpg`), type: 'jpeg', quality: 88 });
}
for (const [n, h] of [...FILMS, ...SHOWS]) await shoot(n, h, 300, 450);
for (const [n, h] of ALBUMS) await shoot(n, h, 300, 300);
for (const [n, h] of PHOTOS) await shoot(n, h, 480, 360);
await browser.close();
console.log('wrote', fs.readdirSync(OUT).filter((f) => f.endsWith('.jpg')).length, 'images to', OUT);
