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
    if (want.length === held.size && want.every((a) => held.has(a))) return;
    // load() clears every held action, so each load re-presses the whole set.
    held.clear();
    for (const a of want) held.add(a);
    const frame = await page.evaluate(() => window.__midnite.getState().frame);
    const events = want.map((action) => ({ f: frame, action, down: true }));
    await page.evaluate((r) => window.__midnite.replay.load(r), { version: 1, seed: 7, frames: 10_000_000, events });
  };
}
const aircraft = (page, type) => page.evaluate((type) => window.__midnite.getState().openWorld.aircraft.find((a) => a.type === type), type);
const warp = async (page, n) => { const press = controls(page); for (let i = 0; i < n; i++) { await press(['debug-warp']); await page.evaluate(() => window.__midnite.step(4)); await press([]); await page.evaluate(() => window.__midnite.step(6)); } };

/**
 * A route along the road graph from the drivable road nearest `at`, heading along `dir` when given: at each junction
 * the straightest continuation. Points are [x, z, half-width, motorway?], in order of travel.
 */
async function planRoute(page, at, dir, length) {
  return page.evaluate(([at, dir, L]) => {
    const g = window.__midnite.gtact;
    const DRV = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential', 'unclassified']);
    const xz = (e) => e.pts.map((p) => [p[0], p[2]]);
    const same = (a, b) => Math.hypot(a[0][0] - b[0][0], a[0][1] - b[0][1]) < 0.5 && Math.hypot(a.at(-1)[0] - b.at(-1)[0], a.at(-1)[1] - b.at(-1)[1]) < 0.5;
    const near = g.roadsNear(at[0], at[1], 40).filter((e) => DRV.has(e.cls)).sort((a, b) => a.d - b.d || b.widthM - a.widthM);
    if (!near[0]) return null;
    let e = near[0];
    let pts = xz(e);
    let k = 0;
    pts.forEach((p, i) => { if (Math.hypot(p[0] - at[0], p[1] - at[1]) < Math.hypot(pts[k][0] - at[0], pts[k][1] - at[1])) k = i; });
    const kn = Math.min(k + 1, pts.length - 1), kp = Math.max(k - 1, 0);
    const fwd = dir ? (pts[kn][0] - pts[kp][0]) * dir[0] + (pts[kn][1] - pts[kp][1]) * dir[1] >= 0 : pts.length - 1 - k >= k;
    if (!fwd) { pts = pts.reverse(); k = pts.length - 1 - k; }
    const tag = (q, c) => q.map((p) => [p[0], p[1], c.widthM / 2, c.cls === 'motorway' ? 1 : 0]);
    const path = tag(pts.slice(k), e);
    let prev = xz(e);
    const len = () => { let l = 0; for (let i = 1; i < path.length; i++) l += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]); return l; };
    let turns = 0;
    while (len() < L && turns < 60) {
      turns += 1;
      const end = path.at(-1), pre = path.at(-2) ?? end;
      const din = [end[0] - pre[0], end[1] - pre[1]]; const dl = Math.hypot(...din) || 1;
      let best = null;
      for (const c of g.roadsNear(end[0], end[1], 2)) {
        if (!DRV.has(c.cls)) continue;
        let q = xz(c);
        if (same(q, prev)) continue;
        const startsHere = Math.hypot(q[0][0] - end[0], q[0][1] - end[1]) < 3;
        if (!startsHere) {
          if (Math.hypot(q.at(-1)[0] - end[0], q.at(-1)[1] - end[1]) >= 3) continue;
          q = q.reverse();
        }
        const j = Math.min(3, q.length - 1);
        const out = [q[j][0] - q[0][0], q[j][1] - q[0][1]]; const ol = Math.hypot(...out) || 1;
        const turn = Math.acos(Math.max(-1, Math.min(1, (din[0] * out[0] + din[1] * out[1]) / dl / ol)));
        const score = turn + (c.cls === e.cls ? 0 : 0.25) - c.widthM * 0.01;
        if (!best || score < best.score) best = { c, q, turn, score };
      }
      if (!best || best.turn > 1.3) break;
      path.push(...tag(best.q.slice(1), best.c));
      prev = xz(best.c); e = best.c;
    }
    return path;
  }, [at, dir, length]);
}

/**
 * Lateral offsets along the route, clear of buildings and props: the road's centre when it is clear, else a quarter
 * width left or right, smoothed so the line has no kinks. Returns [x, z] points.
 */
async function clearLine(page, path) {
  const offs = await page.evaluate((path) => {
    const g = window.__midnite.gtact;
    const blocked = (x, z) => g.collidersNear(x, g.heightAt(x, z) + 1.5, z, 1.25).some((c) => c.shape !== 7 && c.body !== 'dynamic');
    return path.map((p, i) => {
      const a = path[Math.max(0, i - 1)], b = path[Math.min(path.length - 1, i + 1)];
      const fx = b[0] - a[0], fz = b[1] - a[1], l = Math.hypot(fx, fz) || 1;
      for (const o of [0, 0.25, -0.25, 0.45, -0.45]) {
        const off = o * p[2] * 2;
        if (!blocked(p[0] + (fz / l) * off, p[1] - (fx / l) * off)) return off;
      }
      return 0;
    });
  }, path);
  const smooth = offs.map((_, i) => { let s = 0, n = 0; for (let k = -4; k <= 4; k++) { const v = offs[i + k]; if (v !== undefined) { s += v; n++; } } return s / n; });
  return path.map((p, i) => {
    const a = path[Math.max(0, i - 1)], b = path[Math.min(path.length - 1, i + 1)];
    const fx = b[0] - a[0], fz = b[1] - a[1], l = Math.hypot(fx, fz) || 1;
    return [p[0] + (fz / l) * smooth[i], p[1] - (fx / l) * smooth[i]];
  });
}

/**
 * Drive a route on the chase camera: steer along the road graph (pure pursuit), slowing for bends; with `stars`, crawl
 * until the cops close to `closeAt` (or `lead` frames), then go.
 */
async function drive(page, name, frames, { stars = 0, lead = 0, maxSpeed = 16, leadSpeed = maxSpeed, closeAt = 0, at = [1063, -831], dir = null, car = 'fulmine', cams = 0 } = {}) {
  let cap = maxSpeed;
  const press = controls(page);
  await page.evaluate((at) => window.__midnite.gtact.teleport(...at), at);
  for (let i = 0; i < 30; i++) { await page.evaluate(() => window.__midnite.step(10)); await sleep(60); }
  const raw = await planRoute(page, at, dir, 1500);
  if (!raw || raw.length < 3) { console.log('drive: no route'); return null; }
  const route = await clearLine(page, raw);
  let rl = 0; for (let i = 1; i < route.length; i++) rl += Math.hypot(route[i][0] - route[i - 1][0], route[i][1] - route[i - 1][1]);
  console.log('route', route.length, 'pts', Math.round(rl), 'm from', route[0].map(Math.round), 'to', route.at(-1).map(Math.round));
  const yaw0 = Math.atan2(-(route[2][0] - route[0][0]), -(route[2][1] - route[0][1]));
  await page.evaluate(([x, z, yaw, car]) => window.__midnite.gtact.car(x, z, yaw, car), [route[0][0], route[0][1], yaw0, car]);
  for (let i = 0; i < 20; i++) { await page.evaluate(() => window.__midnite.step(6)); await sleep(60); }
  let idx = 0, dbg = 0, prevPos = null;
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const ahead = (from, m) => { let i = from, d = 0; while (i < route.length - 1 && d < m) { d += Math.hypot(route[i + 1][0] - route[i][0], route[i + 1][1] - route[i][1]); i++; } return i; };
  const steer = async () => {
    const st = await page.evaluate(() => window.__midnite.getState().player);
    const [px, , pz] = st.position; const h = st.heading, v = st.speed ?? 0;
    // speed is unsigned and 'brake' also reverses: measure signed forward motion along (-sin h, -cos h).
    const fwd = prevPos ? (px - prevPos[0]) * -Math.sin(h) + (pz - prevPos[1]) * -Math.cos(h) : 0;
    prevPos = [px, pz];
    let bi = idx, bd = Infinity;
    for (let i = idx; i < Math.min(route.length, idx + 40); i++) { const d = Math.hypot(route[i][0] - px, route[i][1] - pz); if (d < bd) { bd = d; bi = i; } }
    idx = bi;
    const t = route[ahead(idx, 6 + v * 0.55)];
    const diff = wrap(Math.atan2(-(t[0] - px), -(t[1] - pz)) - h);
    // The sharpest bend in the next 35 m sets the speed.
    let bend = 0;
    for (let i = idx; i < ahead(idx, 35) - 1; i++) {
      const j = ahead(i, 6), k = ahead(j, 6);
      if (k === j) break;
      const a1 = Math.atan2(route[j][0] - route[i][0], route[j][1] - route[i][1]), a2 = Math.atan2(route[k][0] - route[j][0], route[k][1] - route[j][1]);
      bend = Math.max(bend, Math.abs(wrap(a2 - a1)));
    }
    const limit = Math.min(cap, bend > 0.7 ? 7 : bend > 0.4 ? 10 : bend > 0.2 ? 13 : cap);
    const backing = fwd < -0.05;
    const want = backing ? ['forward'] : [v > limit + 1 ? 'brake' : v > limit ? null : 'forward'].filter(Boolean);
    if (!backing) { if (diff > 0.03) want.push('left'); else if (diff < -0.03) want.push('right'); }
    await press(want);
    if (process.env.DRIVE_DEBUG && dbg++ < 400 && dbg % 8 === 0) console.log('steer', JSON.stringify({ p: [px, pz].map(Math.round), h: +h.toFixed(2), v: +v.toFixed(1), idx, t: t.map(Math.round), diff: +diff.toFixed(2), limit, want, r0: route[idx].map(Math.round) }));
    return { idx, off: bd, diff };
  };
  for (let i = 0; i < cams; i++) { await press(['camera-next']); await page.evaluate(() => window.__midnite.step(2)); await press([]); await page.evaluate(() => window.__midnite.step(2)); }
  console.log('traffic cars', await page.evaluate(() => window.__midnite.getState().openWorld.traffic));
  if (stars) {
    for (let i = 0; i < 8 && (await page.evaluate(() => window.__midnite.getState().crime.wanted)) < stars; i++) await page.evaluate(() => window.__midnite.gtact.crime('debug'));
    cap = leadSpeed;
    for (let i = 0; i < lead; i++) {
      await steer(); await page.evaluate(() => window.__midnite.step(2)); await sleep(15);
      if (closeAt && i % 10 === 0) { const near = await page.evaluate(() => window.__midnite.getState().crime.policeNearest); if (near !== null && near < closeAt) { console.log('cops close at lead frame', i, near); break; } }
    }
    cap = maxSpeed;
  }
  let n = 0, last = null;
  const log = async () => {
    if (++n % 60) return;
    const st = await page.evaluate(() => { const s = window.__midnite.getState(); return { p: s.player.position.map(Math.round), v: s.player.speed, w: s.crime.wanted, cops: s.crime.police, near: s.crime.policeNearest }; });
    console.log('  f', n, JSON.stringify({ ...st, idx: last?.idx, off: last && Math.round(last.off * 10) / 10 }));
  };
  return stepRec(page, name, frames, async () => { last = await steer(); await log(); }, { outDir: OUT, settle: 20 });
}

/** Where `traffic` and `chase` start: DRIVE_AT=[x,z] and DRIVE_DIR=[dx,dz] override the downtown default. */
const driveFrom = () => ({ at: JSON.parse(process.env.DRIVE_AT ?? '[1063,-831]'), dir: JSON.parse(process.env.DRIVE_DIR ?? 'null') });

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
  // CBD traffic: drive a car down a downtown road on the chase camera.
  traffic: (page) => drive(page, 'gtact-traffic', 270, driveFrom()),
  // A police chase: the same downtown drive with three stars; the units close in from behind and alongside.
  chase: (page) => drive(page, 'gtact-chase', Number(process.env.CHASE_FRAMES ?? 420), { stars: 3, lead: 900, leadSpeed: 3, closeAt: Number(process.env.CLOSE_AT ?? 35), maxSpeed: 17, ...driveFrom(), cams: Number(process.env.DRIVE_CAMS ?? 0) }),
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
  // Lion's Head from the Sea Point side, sweeping round towards the city: fynbos, silver trees and the trails.
  async 'lions-head'(page) {
    const c = [-1913, 470, 511], r = 950, h = 230;
    const at = (a) => [c[0] + Math.sin(a) * r, c[1] + h, c[2] + Math.cos(a) * r];
    const a0 = Math.PI + 1.1, a1 = Math.PI + 0.2;
    await page.evaluate(() => window.__midnite.gtact.teleport(-1500, -900));
    await cleanFrame(page, true);
    await preroll(page, at(a0), c, 9000);
    return stepRec(page, 'gtact-lions-head', 300, (i, t) => look(page, at(lerp(a0, a1, ease(t))), c), { outDir: OUT, settle: 60 });
  },
  // Up the front of Table Mountain over the fynbos, kloof forest in the gorges, towards the cliffs.
  async 'table-mountain'(page) {
    const ground = (x, z) => page.evaluate(([x, z]) => window.__midnite.gtact.heightAt(x, z), [x, z]);
    const p0 = [-900, 0, 150], p1 = [-450, 0, 1050];
    const t0 = [-300, 700, 1900], t1 = [-200, 1000, 2100];
    const pose = async (k) => { const p = mix(p0, p1, k); p[1] = Math.max(await ground(p[0], p[2]) + 70, lerp(380, 760, k)); return p; };
    await page.evaluate(() => window.__midnite.gtact.teleport(-700, -400));
    await cleanFrame(page, true);
    await preroll(page, await pose(0), t0, 9000);
    return stepRec(page, 'gtact-table-mountain', 300, async (i, t) => { const k = ease(t) * 0.5 + t * 0.5; return look(page, await pose(k), mix(t0, t1, k)); }, { outDir: OUT, settle: 60 });
  },
  // Table Mountain's southern end: over Back Table's fynbos towards the main table.
  async 'back-table'(page) {
    const p0 = [-1300, 1050, 7400], p1 = [-650, 980, 6300];
    const t0 = [-500, 850, 4600], t1 = [-350, 900, 4200];
    await page.evaluate(() => window.__midnite.gtact.teleport(-600, 5200));
    await cleanFrame(page, true);
    await preroll(page, p0, t0, 9000);
    return stepRec(page, 'gtact-back-table', 240, (i, t) => look(page, mix(p0, p1, ease(t)), mix(t0, t1, t)), { outDir: OUT, settle: 60 });
  },
  // Low along the Sea Point promenade: the unbroken lawn, the sea wall and the Atlantic.
  async promenade(page) {
    const d = [0.7071, -0.7071], sea = [-0.7071, -0.7071], o = [-2065, -2116];
    const at = (s) => [o[0] + d[0] * s + sea[0] * 45, 16, o[1] + d[1] * s + sea[1] * 45];
    const aim = (s) => [o[0] + d[0] * (s + 160) - sea[0] * 30, 4, o[1] + d[1] * (s + 160) - sea[1] * 30];
    await page.evaluate(() => window.__midnite.gtact.teleport(-1950, -2145));
    await cleanFrame(page, true);
    await preroll(page, at(-380), aim(-380), 8000);
    return stepRec(page, 'gtact-promenade', 270, (i, t) => { const s = lerp(-380, 120, t); return look(page, at(s), aim(s)); }, { outDir: OUT, settle: 40 });
  },
  // Cape Town International: a slow orbit over the terminal, the apron and its airliners.
  async airport(page) {
    const c = [17650, 15, 3850], r = 620, h = 190;
    const at = (a) => [c[0] + Math.sin(a) * r, c[1] + h, c[2] + Math.cos(a) * r];
    const a0 = 0.9, a1 = 2.0;
    await page.evaluate(() => window.__midnite.gtact.teleport(17650, 3850));
    await cleanFrame(page, true);
    await preroll(page, at(a0), c, 12000);
    return stepRec(page, 'gtact-airport', 300, (i, t) => look(page, at(lerp(a0, a1, ease(t))), c), { outDir: OUT, settle: 50 });
  },
  // Street traffic: a crane gliding above the middle of a straight CBD road (the chase's road), looking down it.
  async street(page) {
    const g = (x, z, r) => page.evaluate(([x, z, r]) => window.__midnite.gtact.nearestRoad(x, z, r), [x, z, r]);
    const o = [1072, -821], d = [0.5567, -0.8307];
    await page.evaluate(([x, z]) => window.__midnite.gtact.teleport(x, z), [o[0] - d[0] * 60, o[1] - d[1] * 60]);
    for (let i = 0; i < 60; i++) { await page.evaluate(() => window.__midnite.step(10)); await sleep(40); }
    const road = [];
    for (let s = 0; s <= 260; s += 20) road.push(await g(o[0] + d[0] * s, o[1] + d[1] * s, 30));
    if (road.some((r) => !r)) { console.log('street: no road under part of the crane line, skipping'); return null; }
    const along = (s) => { const k = Math.min(road.length - 1.001, s / 20), i = Math.floor(k), f = k - i; return [lerp(road[i].x, road[i + 1].x, f), lerp(road[i].z, road[i + 1].z, f)]; };
    const ground = await page.evaluate(([x, z]) => window.__midnite.gtact.heightAt(x, z), along(40));
    const at = (s) => { const [x, z] = along(20 + s); return [x, ground + 14, z]; };
    const aim = (s) => { const [x, z] = along(150 + s); return [x, ground - 4, z]; };
    console.log('street', JSON.stringify({ road: road.map((r) => r && [r.x, r.z, r.dist]), ground, at0: at(0), aim0: aim(0) }));
    await cleanFrame(page, true);
    await preroll(page, at(0), aim(0), 5000);
    console.log('street traffic', await page.evaluate(() => window.__midnite.getState().openWorld.traffic));
    return stepRec(page, 'gtact-street', 240, (i, t) => look(page, at(t * 50), aim(t * 50)), { outDir: OUT, settle: 20 });
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
