// GTACT (GTA Cape Town) footage. Serve ~/GameDev/gtact on :8731 first:
//   cd ~/GameDev/gtact && python3 -m http.server 8731 --bind 127.0.0.1
// then: node gtact.mjs <shot> [<shot> ...]   (shots below; "all" for every one)
import path from 'node:path';
import { launch, cleanFrame, stepRec, sheet, sleep, ease, lerp, HERE } from './lib.mjs';

const BASE = process.env.GTACT_URL ?? 'http://127.0.0.1:8731/index.html';
const OUT = path.resolve(HERE, '../gtact-showreel/input/clips');
const STILLS = path.join(HERE, 'frames', '_sheets');

/** Camera at p looking at t, through the debug free camera (positive pitch looks down). */
const look = (page, p, t) => {
  const yaw = Math.atan2(-(t[0] - p[0]), -(t[2] - p[2]));
  const pitch = Math.atan2(p[1] - t[1], Math.hypot(t[0] - p[0], t[2] - p[2]));
  return page.evaluate(([x, y, z, yaw, pitch]) => window.__midnite.gtact.cameraAt(x, y, z, yaw, pitch), [...p, yaw, pitch]);
};
const mix = (a, b, t) => a.map((v, i) => lerp(v, b[i], t));

async function boot() {
  const { browser, page } = await launch();
  await page.goto(BASE + '?midnite-deterministic=1&midnite-paused=1&midnite-seed=7');
  await page.waitForFunction(() => window.__midnite?.ready, null, { timeout: 180000 });
  // Past the ~6 s title card, so no shot opens under it.
  for (let i = 0; i < 40; i++) { await page.evaluate(() => window.__midnite.step(10)); await sleep(60); }
  return { browser, page };
}

/** Pre-roll at a pose so terrain and buildings stream in before recording. */
async function preroll(page, p, t, ms = 6000) {
  await look(page, p, t);
  const end = Date.now() + ms;
  while (Date.now() < end) { await page.evaluate(() => window.__midnite.step(1)); await sleep(120); await look(page, p, t); }
}

/** Held actions, sent to the kit through a replay so the game reads them like a pad. */
function controls(page) {
  const held = new Set();
  return async (want) => {
    const frame = await page.evaluate(() => window.__midnite.getState().frame);
    const events = [];
    for (const a of held) if (!want.includes(a)) { events.push({ f: frame, action: a, down: false }); held.delete(a); }
    for (const a of want) if (!held.has(a)) { events.push({ f: frame, action: a, down: true }); held.add(a); }
    if (events.length) await page.evaluate((r) => window.__midnite.replay.load(r), { version: 1, seed: 7, frames: 10_000_000, events });
  };
}
const aircraft = (page, type) => page.evaluate((type) => window.__midnite.getState().openWorld.aircraft.find((a) => a.type === type), type);
const warp = async (page, n) => { const press = controls(page); for (let i = 0; i < n; i++) { await press(['debug-warp']); await page.evaluate(() => window.__midnite.step(4)); await press([]); await page.evaluate(() => window.__midnite.step(6)); } };

const SHOTS = {
  // Orbit the CBD from the harbour side, Table Mountain behind it.
  async 'cbd-orbit'(page) {
    const c = [1063, 30, -831], r = 520, h = 230;
    const at = (a) => [c[0] + Math.sin(a) * r, c[1] + h, c[2] + Math.cos(a) * r];
    const a0 = Math.PI + 0.75, a1 = Math.PI - 0.35;
    await cleanFrame(page, true);
    await preroll(page, at(a0), c);
    return stepRec(page, 'gtact-cbd-orbit', 240, (i, t) => look(page, at(lerp(a0, a1, ease(t))), c), { outDir: OUT, settle: 40 });
  },
  // Offshore down the Atlantic seaboard: Sea Point, Clifton, Lion's Head, Camps Bay and the Twelve Apostles.
  async seaboard(page) {
    const p0 = [-3000, 170, -2300], p1 = [-3750, 210, 1500];
    const t0 = [-2000, 40, -1400], t1 = [-2500, 300, 2600];
    await cleanFrame(page, true);
    await preroll(page, p0, t0);
    return stepRec(page, 'gtact-seaboard', 420, (i, t) => { const k = ease(t) * 0.6 + t * 0.4; return look(page, mix(p0, p1, k), mix(t0, t1, k)); }, { outDir: OUT, settle: 60 });
  },
  // From above the V&A, a slow push towards the city bowl with Table Mountain and Lion's Head.
  async 'city-bowl'(page) {
    const p0 = [900, 260, -3500], p1 = [950, 200, -2300];
    const t0 = [700, 300, 1800], t1 = [700, 250, 1800];
    await cleanFrame(page, true);
    await preroll(page, p0, t0);
    return stepRec(page, 'gtact-city-bowl', 210, (i, t) => look(page, mix(p0, p1, ease(t)), mix(t0, t1, t)), { outDir: OUT, settle: 40 });
  },
  // CBD traffic: drive a car down a downtown road on the chase camera; a small steering loop keeps it on the road.
  async traffic(page) {
    const press = controls(page);
    const S = () => page.evaluate(() => window.__midnite.getState().player);
    await page.evaluate(() => window.__midnite.gtact.teleport(1063, -831));
    for (let i = 0; i < 30; i++) { await page.evaluate(() => window.__midnite.step(10)); await sleep(60); }
    const q0 = await page.evaluate(() => window.__midnite.gtact.nearestRoad(1063, -831, 300));
    await page.evaluate(([x, z]) => window.__midnite.gtact.car(x, z), [q0.x, q0.z]);
    await page.evaluate(() => window.__midnite.step(30));
    // Which way does the car face? Creep forward and measure.
    const p0 = (await S()).position;
    await press(['forward']); await page.evaluate(() => window.__midnite.step(40)); await press(['brake']); await page.evaluate(() => window.__midnite.step(60)); await press([]);
    const p1 = (await S()).position;
    let d = [p1[0] - p0[0], p1[2] - p0[2]]; const dl = Math.hypot(...d) || 1; d = [d[0] / dl, d[1] / dl];
    // A road point nearby whose road runs along d.
    const pick = await page.evaluate(([d]) => {
      const g = window.__midnite.gtact; let best = null;
      for (let x = 763; x <= 1363; x += 40) for (let z = -1131; z <= -531; z += 40) {
        const q = g.nearestRoad(x, z, 25); if (!q) continue;
        const f = g.nearestRoad(q.x + d[0] * 40, q.z + d[1] * 40, 20), b = g.nearestRoad(q.x + d[0] * 90, q.z + d[1] * 90, 20);
        if (!f || !b) continue;
        const score = f.dist + b.dist + Math.hypot(q.x - 1063, q.z + 831) * 0.01;
        if (!best || score < best.score) best = { x: q.x, z: q.z, score };
      }
      return best;
    }, [d]);
    if (!pick) { console.log('traffic: no straight downtown road found, skipping'); return null; }
    console.log('drive dir', d, 'start', pick);
    await page.evaluate(([x, z]) => window.__midnite.gtact.car(x, z), [pick.x - d[0] * 20, pick.z - d[1] * 20]);
    for (let i = 0; i < 20; i++) { await page.evaluate(() => window.__midnite.step(6)); await sleep(60); }
    const steer = async () => {
      const st = await S();
      const p = st.position;
      const la = [p[0] + d[0] * 18, p[2] + d[1] * 18];
      const q = await page.evaluate(([x, z]) => window.__midnite.gtact.nearestRoad(x, z, 40), la);
      const want = ['forward'];
      if (q) {
        const cross = d[0] * (q.z - p[2]) - d[1] * (q.x - p[0]);
        if (cross > 1.2) want.push('right'); else if (cross < -1.2) want.push('left');
        const nd = [q.x - p[0], q.z - p[2]]; const n = Math.hypot(...nd); if (n > 5) { const k = 0.15; d = [d[0] * (1 - k) + (nd[0] / n) * k, d[1] * (1 - k) + (nd[1] / n) * k]; const m = Math.hypot(...d); d = [d[0] / m, d[1] / m]; }
      }
      if ((st.speed ?? 0) > 16) want[0] = 'brake';
      await press(want);
    };
    console.log('traffic cars', await page.evaluate(() => window.__midnite.getState().openWorld.traffic));
    return stepRec(page, 'gtact-traffic', 270, steer, { outDir: OUT, settle: 20 });
  },
  // The helicopter from the Sea Point helipad: lift off, climb, then swing right along the coast towards Green Point.
  async heli(page) {
    const press = controls(page);
    await warp(page, 3);
    await press(['interact']); await page.evaluate(() => window.__midnite.step(4)); await press([]);
    await page.evaluate(() => window.__midnite.step(30));
    const plan = (f) => f < 200 ? ['jump'] : f < 320 ? ['jump', 'forward'] : f < 520 ? ['forward', 'right'] : f < 640 ? ['forward', 'jump'] : ['forward'];
    let f = 0;
    for (; f < 60; f += 2) { await press(plan(f)); await page.evaluate(() => window.__midnite.step(2)); await sleep(30); }
    console.log('heli', JSON.stringify((await page.evaluate(() => window.__midnite.getState().player))).slice(0, 200));
    return stepRec(page, 'gtact-heli', 360, async () => { await press(plan(f)); f += 2; }, { outDir: OUT, settle: 20 });
  },
  // The jet: take-off roll down the airport runway, rotate and climb out.
  async jet(page) {
    const press = controls(page);
    await warp(page, 4);
    await press(['interact']); await page.evaluate(() => window.__midnite.step(4)); await press([]);
    await page.evaluate(() => window.__midnite.step(20));
    const plan = (f) => f < 330 ? ['forward'] : f < 420 ? ['forward', 'jump'] : f < 560 ? ['forward'] : f < 700 ? ['forward', 'right'] : ['forward'];
    let f = 0;
    for (; f < 40; f += 2) { await press(plan(f)); await page.evaluate(() => window.__midnite.step(2)); await sleep(30); }
    console.log('jet', JSON.stringify((await page.evaluate(() => window.__midnite.getState().player))).slice(0, 200));
    return stepRec(page, 'gtact-jet', 420, async () => { await press(plan(f)); f += 2; }, { outDir: OUT, settle: 20 });
  },
  // The pause menu: it opens on the map, pans, drops a waypoint, flips to the 3D map and back, then steps through the tabs.
  async menu(page) {
    const press = controls(page);
    await page.evaluate(() => window.__midnite.step(60));
    const beats = [[10, ['pause']], [14, []], [50, ['sprint']], [110, []], [120, ['back', 'right']], [200, []], [210, ['jump']], [240, []],
      [255, ['confirm']], [259, []], [290, ['camera-next']], [294, []], [450, ['camera-next']], [454, []], [480, ['menu-next']], [484, []],
      [530, ['menu-next']], [534, []], [580, ['menu-next']], [584, []]];
    let f = 0;
    return stepRec(page, 'gtact-menu', 320, async () => { const b = beats.filter(([at]) => at <= f).at(-1); await press(b ? b[1] : []); f += 2; }, { outDir: OUT, settle: 30 });
  },
};

const want = process.argv.slice(2);
const names = want.includes('all') ? Object.keys(SHOTS) : want;
const { browser, page } = await boot();
for (const n of names) {
  const clip = await SHOTS[n](page);
  if (clip) { (await import('node:fs')).mkdirSync(STILLS, { recursive: true }); sheet(clip, path.join(STILLS, path.basename(clip, '.mp4') + '.png')); }
}
await browser.close();
