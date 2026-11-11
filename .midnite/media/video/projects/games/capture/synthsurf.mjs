// Synth Surf footage, real time. Serve the game first: cd ~/GameDev/synthsurf && ./node_modules/.bin/vite --port 5175 --host 127.0.0.1
//   node synthsurf.mjs menu   → title menu, then the song import
//   node synthsurf.mjs run    → a whole run of Unstoppable Driver; writes synthsurf-run.clock.json (wall time ↔ song time)
import fs from 'node:fs';
import path from 'node:path';
import { launch, screencast, sleep, HERE } from './lib.mjs';

const BASE = process.env.SS_URL ?? 'http://127.0.0.1:5175/?debug';
const OUT = path.resolve(HERE, '../synthsurf-showreel/input/clips');
const SONG = path.join(process.env.HOME, 'GameDev/synthsurf/public/audio/tracks/unstoppable-driver.mp3');
const HIDE_DEBUG = `.lil-gui{display:none!important} body>div[style*="z-index: 10000"]{display:none!important}`;

const { browser, page } = await launch({});
page.on('pageerror', (e) => console.log('pageerror', e.message.slice(0, 160)));
await page.goto(BASE, { waitUntil: 'load' });
await page.addStyleTag({ content: HIDE_DEBUG });
await sleep(3000);

async function importSong(rec) {
  await page.click('[data-screen="menu"] [data-goto="tracks"]');
  await sleep(1200);
  await page.setInputFiles('[data-drop="input"]', SONG);
  await page.waitForSelector('[data-screen="tracks"] .song-play', { timeout: 60000 });
  await sleep(rec ? 2500 : 500);
}

const mode = process.argv[2] ?? 'run';
if (mode === 'menu') {
  const stop = await screencast(page, 'synthsurf-menu', { outDir: OUT });
  await sleep(4000);
  for (const k of ['ArrowDown', 'ArrowDown', 'ArrowUp', 'ArrowUp']) { await page.keyboard.press(k); await sleep(450); }
  await sleep(800);
  await importSong(true);
  await stop();
} else {
  await importSong(false);
  await page.click('[data-screen="tracks"] .song-play');
  await page.waitForFunction(() => window.__synthsurfDebug?.runPhase?.() === 'running', null, { timeout: 60000 });
  await page.addStyleTag({ content: HIDE_DEBUG });
  const clockOf = () => page.evaluate(() => {
    const row = [...document.querySelectorAll('.lil-gui .controller')].find((c) => c.querySelector('.name')?.textContent === 'clock');
    return parseFloat(row?.querySelector('input')?.value ?? 'NaN');
  });
  const stop = await screencast(page, 'synthsurf-run', { outDir: OUT });
  const samples = [];
  const keys = ['ArrowLeft', 'ArrowRight'];
  const t0 = Date.now();
  let lane = 0;
  while (Date.now() - t0 < 214000) {
    const wall = Date.now() / 1000;
    samples.push({ wall, clock: await clockOf() });
    if (await page.evaluate(() => window.__synthsurfDebug.runPhase()) !== 'running' && Date.now() - t0 > 10000) break;
    // Weave across the lanes: one or two steps, then a beat to settle.
    const dir = lane >= 2 ? 0 : lane <= -2 ? 1 : Math.random() < 0.5 ? 0 : 1;
    const steps = Math.random() < 0.35 ? 2 : 1;
    for (let s = 0; s < steps; s++) { await page.keyboard.press(keys[dir]); lane += dir ? 1 : -1; await sleep(110); }
    await sleep(350 + Math.random() * 500);
  }
  const res = await stop();
  fs.writeFileSync(path.join(OUT, 'synthsurf-run.clock.json'), JSON.stringify({ t0: res.t0, span: res.span, samples }, null, 1));
}
await browser.close();
