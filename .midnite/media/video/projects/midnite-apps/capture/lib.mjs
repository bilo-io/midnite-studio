// Shared capture helpers: CDP screencast -> timestamped frames -> 30fps H.264.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
// Playwright resolves from the app package, six levels up at the repo root.
const require = createRequire(new URL('../../../../../../packages/app/package.json', import.meta.url));
export const { chromium } = require('@playwright/test');
export const HERE = path.dirname(new URL(import.meta.url).pathname);
export const CLIPS = path.resolve(HERE, '../input/clips');
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const CURSOR = `(() => {
  const mk = () => {
    if (document.getElementById('__cur')) return;
    const c = document.createElement('div'); c.id='__cur';
    c.style.cssText='position:fixed;left:0;top:0;width:28px;height:28px;z-index:2147483647;pointer-events:none;transform:translate(-100px,-100px);filter:drop-shadow(0 1px 2px rgba(0,0,0,.45))';
    c.innerHTML='<svg width="28" height="28" viewBox="0 0 24 24"><path d="M5 2.5v17l4.6-4.1 3 6.6 2.7-1.2-3-6.5H18.5z" fill="#111" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>';
    document.documentElement.appendChild(c);
    const st=document.createElement('style'); st.textContent='@keyframes __rip{from{transform:translate(-50%,-50%) scale(.2);opacity:.7}to{transform:translate(-50%,-50%) scale(1.6);opacity:0}} vite-error-overlay{display:none!important}';
    document.documentElement.appendChild(st);
    window.addEventListener('mousemove',e=>{c.style.transform='translate('+e.clientX+'px,'+e.clientY+'px)'},true);
    window.addEventListener('mousedown',e=>{const r=document.createElement('div');r.style.cssText='position:fixed;z-index:2147483646;pointer-events:none;width:56px;height:56px;border-radius:50%;border:2px solid rgba(120,160,255,.9);background:rgba(120,160,255,.25);left:'+e.clientX+'px;top:'+e.clientY+'px;animation:__rip .5s ease-out forwards';document.documentElement.appendChild(r);setTimeout(()=>r.remove(),600)},true);
  };
  if (document.documentElement) mk(); else document.addEventListener('DOMContentLoaded', mk);
  new MutationObserver(mk).observe(document, {childList:true});
})();`;

export async function launch({ scheme, url, storage = {} }) {
  const browser = await chromium.launch({ args: ['--hide-scrollbars'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: scheme });
  await ctx.addInitScript(CURSOR);
  await ctx.addInitScript((s) => { for (const [k, v] of Object.entries(s)) { try { localStorage.setItem(k, v); } catch {} } }, storage);
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  const m = { x: 720, y: 450 };
  page.__m = m;
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.mouse.move(m.x, m.y);
  return { browser, page, cdp, m };
}

export async function startRec(cdp) {
  const frames = [];
  cdp.on('Page.screencastFrame', async (f) => {
    frames.push({ t: f.metadata.timestamp, data: f.data });
    try { await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }); } catch {}
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 2880, maxHeight: 1800, everyNthFrame: 1 });
  return frames;
}

export async function finishRec(cdp, frames, name) {
  await cdp.send('Page.stopScreencast');
  await sleep(200);
  const dir = path.join(process.env.TMPDIR || '/tmp', 'cap-' + name);
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const list = [];
  frames.forEach((f, i) => { const p = path.join(dir, String(i).padStart(5, '0') + '.jpg'); fs.writeFileSync(p, Buffer.from(f.data, 'base64')); list.push(p); });
  let txt = '';
  const gaps = [];
  for (let i = 0; i < frames.length; i++) {
    const d = i < frames.length - 1 ? frames[i + 1].t - frames[i].t : 0.05;
    gaps.push(d);
    txt += `file '${list[i]}'\nduration ${Math.max(d, 0.001).toFixed(4)}\n`;
  }
  txt += `file '${list[list.length - 1]}'\n`;
  fs.writeFileSync(path.join(dir, 'list.txt'), txt);
  const out = path.join(CLIPS, name + '.mp4');
  execFileSync('/opt/homebrew/bin/ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(dir, 'list.txt'), '-vf', 'fps=30,scale=2880:1800:flags=lanczos', '-c:v', 'libx264', '-crf', '16', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out]);
  const total = frames.at(-1).t - frames[0].t;
  console.log(name, 'frames', frames.length, 'span', total.toFixed(2), 'avg fps', (frames.length / total).toFixed(1), 'max gap', Math.max(...gaps).toFixed(3));
  fs.rmSync(dir, { recursive: true, force: true });
}

export async function moveTo(page, x, y, steps = 40) {
  const m = page.__m;
  for (let i = 1; i <= steps; i++) {
    const t = ease(i / steps);
    await page.mouse.move(m.x + (x - m.x) * t, m.y + (y - m.y) * t);
    await sleep(14);
  }
  m.x = x; m.y = y;
}
export async function moveToEl(page, sel, opts = {}) {
  const el = typeof sel === 'string' ? page.locator(sel).first() : sel;
  await el.scrollIntoViewIfNeeded();
  const b = await el.boundingBox();
  await moveTo(page, b.x + b.width * (opts.fx ?? 0.5), b.y + b.height * (opts.fy ?? 0.5), opts.steps ?? 40);
  return b;
}
export async function click(page) { await page.mouse.down(); await sleep(70); await page.mouse.up(); }
export async function scrollTo(page, target, ms) {
  const start = await page.evaluate(() => window.scrollY);
  const t0 = Date.now();
  for (;;) {
    const t = Math.min(1, (Date.now() - t0) / ms);
    await page.evaluate((y) => window.scrollTo(0, y), start + (target - start) * ease(t));
    if (t >= 1) break;
    await sleep(12);
  }
}
