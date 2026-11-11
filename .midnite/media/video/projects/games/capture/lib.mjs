// Stepped capture for kit games: pause the loop, step it 2 sim frames (60 Hz) per output frame,
// screenshot, then encode the stills as constant 30 fps H.264. Smooth at any machine speed.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const require = createRequire(new URL('../../../../../../packages/app/package.json', import.meta.url));
export const { chromium } = require('@playwright/test');
export const HERE = path.dirname(new URL(import.meta.url).pathname);
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const lerp = (a, b, t) => a + (b - a) * t;
export const FFMPEG = process.env.FFMPEG ?? 'ffmpeg';
export const FFPROBE = process.env.FFPROBE ?? 'ffprobe';

export async function launch({ width = 1920, height = 1080, gpu = true, args = [], init } = {}) {
  const browser = await chromium.launch({
    args: [...(gpu ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] : []), '--autoplay-policy=no-user-gesture-required', ...args],
  });
  const page = await browser.newPage({ viewport: { width, height } });
  if (init) await page.addInitScript(init);
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  return { browser, page };
}

/** Hide every page layer except the given canvas selector (cinematic shots), or show them again. */
export async function cleanFrame(page, on, keep = 'canvas#game') {
  await page.evaluate(([on, keep]) => {
    let st = document.getElementById('__clean');
    if (!st) { st = document.createElement('style'); st.id = '__clean'; document.head.appendChild(st); }
    st.textContent = on ? `body > *:not(${keep}) { visibility: hidden !important; }` : '';
  }, [on, keep]);
}

export function framesDir(name) {
  const dir = path.join(HERE, 'frames', name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Encode frames/<name>/%05d.jpg at 30 fps into <outDir>/<name>.mp4. */
export function encode(name, outDir, fps = 30) {
  fs.mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, name + '.mp4');
  execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', path.join(HERE, 'frames', name, '%05d.jpg'),
    '-c:v', 'libx264', '-crf', '18', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out]);
  return out;
}

/**
 * Record `frames` output frames. Before each one, `before(i, t)` runs (t = 0..1), then the game steps `stepN` sim
 * frames, then a screenshot is taken. `settle` ms of real time per frame lets streaming keep up.
 */
export async function stepRec(page, name, frames, before, { stepN = 2, settle = 0, outDir } = {}) {
  const dir = framesDir(name);
  const t0 = Date.now();
  for (let i = 0; i < frames; i++) {
    if (before) await before(i, frames > 1 ? i / (frames - 1) : 0);
    await page.evaluate((n) => window.__midnite.step(n), stepN);
    if (settle) await sleep(settle);
    await page.screenshot({ path: path.join(dir, String(i).padStart(5, '0') + '.jpg'), type: 'jpeg', quality: 92 });
  }
  const out = encode(name, outDir);
  console.log(`${name}: ${frames} frames in ${((Date.now() - t0) / 1000).toFixed(0)} s → ${out}`);
  return out;
}

/** A contact sheet of n frames from a clip, for checking. */
export function sheet(clip, outPng, n = 6) {
  const d = Number(execFileSync(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', clip]).toString());
  const fps = (n / d).toFixed(4);
  execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-i', clip, '-vf', `fps=${fps},scale=480:-1,tile=3x${Math.ceil(n / 3)}`, '-frames:v', '1', outPng]);
}

/** Real-time CDP screencast straight to disk: returns stop() → { name, frames, times } after encoding at 30fps. */
export async function screencast(page, name, { outDir, quality = 88 } = {}) {
  const cdp = await page.context().newCDPSession(page);
  const dir = framesDir(name);
  const times = [];
  let n = 0;
  cdp.on('Page.screencastFrame', async (f) => {
    const i = n++;
    times.push(f.metadata.timestamp);
    fs.writeFileSync(path.join(dir, String(i).padStart(6, '0') + '.jpg'), Buffer.from(f.data, 'base64'));
    try { await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }); } catch {}
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
  return async function stop() {
    await cdp.send('Page.stopScreencast');
    await sleep(300);
    if (!times.length) throw new Error(`${name}: the screencast caught no frames`);
    let txt = '';
    for (let i = 0; i < times.length; i++) {
      const d = i < times.length - 1 ? times[i + 1] - times[i] : 1 / 30;
      txt += `file '${path.join(dir, String(i).padStart(6, '0') + '.jpg')}'\nduration ${Math.max(d, 0.001).toFixed(4)}\n`;
    }
    fs.writeFileSync(path.join(dir, 'list.txt'), txt);
    fs.mkdirSync(outDir, { recursive: true });
    const out = path.join(outDir, name + '.mp4');
    execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(dir, 'list.txt'), '-vf', 'fps=30,scale=1920:1080:flags=lanczos,format=yuv420p', '-c:v', 'libx264', '-crf', '18', '-preset', 'medium', '-movflags', '+faststart', out]);
    const span = times.at(-1) - times[0];
    console.log(`${name}: ${times.length} frames over ${span.toFixed(1)} s (${(times.length / span).toFixed(1)} fps) → ${out}`);
    return { out, t0: times[0], span };
  };
}

/**
 * Virtual time for games without a step hook: rAF and performance.now/Date.now are routed through a clock that runs
 * in real time until window.__vt.freeze(), after which only window.__vt.tick(ms) advances it and runs the frame.
 */
export const VIRTUAL_TIME = `(() => {
  const rAF = window.requestAnimationFrame.bind(window), pNow = performance.now.bind(performance), dNow = Date.now;
  let frozen = false, base = 0, at = 0, q = [], id = 0;
  const now = () => frozen ? at : pNow() - base;
  performance.now = now;
  const d0 = dNow() - pNow();
  Date.now = () => Math.round(d0 + base + now());
  window.requestAnimationFrame = (cb) => { const i = ++id; q.push([i, cb]); return i; };
  window.cancelAnimationFrame = (i) => { q = q.filter((e) => e[0] !== i); };
  const flush = (t) => { const run = q; q = []; for (const [, cb] of run) { try { cb(t); } catch (e) { console.error(e); } } };
  const loop = () => { if (!frozen) flush(now()); rAF(loop); };
  rAF(loop);
  window.__vt = {
    freeze() { at = now(); frozen = true; },
    thaw() { base = pNow() - at; frozen = false; },
    tick(ms) { at += ms; flush(at); },
    get now() { return now(); },
  };
})();`;

/** Virtual-time recording: per frame, before(i, t) → tick 1000/30 ms (in `sub` steps) → settle → screenshot. */
export async function vrec(page, name, frames, before, { outDir, sub = 2, settle = 0 } = {}) {
  const dir = framesDir(name);
  const t0 = Date.now();
  await page.evaluate(() => window.__vt.freeze());
  for (let i = 0; i < frames; i++) {
    if (before) await before(i, frames > 1 ? i / (frames - 1) : 0);
    await page.evaluate((s) => { for (let k = 0; k < s; k++) window.__vt.tick(1000 / 30 / s); }, sub);
    if (settle) await sleep(settle);
    await page.screenshot({ path: path.join(dir, String(i).padStart(5, '0') + '.jpg'), type: 'jpeg', quality: 92 });
  }
  await page.evaluate(() => window.__vt.thaw());
  const out = encode(name, outDir);
  console.log(`${name}: ${frames} frames in ${((Date.now() - t0) / 1000).toFixed(0)} s → ${out}`);
  return out;
}

/** Frame-indexed input script for vrec: [[frame, 'down'|'up'|'tap'|'click'|'rclick'|'eval', arg]]. */
export function cue(page, events) {
  const at = new Map();
  for (const e of events) { const [f] = e; if (!at.has(f)) at.set(f, []); at.get(f).push(e); }
  const later = [];
  return async (i) => {
    for (const [f, fn] of later.splice(0)) if (f <= i) await fn(); else later.push([f, fn]);
    for (const [, kind, arg] of at.get(i) ?? []) {
      if (kind === 'down') await page.keyboard.down(arg);
      else if (kind === 'up') await page.keyboard.up(arg);
      else if (kind === 'tap') { await page.keyboard.down(arg); later.push([i + 3, () => page.keyboard.up(arg)]); }
      else if (kind === 'click' || kind === 'rclick') { const button = kind === 'click' ? 'left' : 'right'; await page.mouse.down({ button }); later.push([i + 2, () => page.mouse.up({ button })]); }
      else if (kind === 'eval') await page.evaluate(arg);
    }
  };
}
