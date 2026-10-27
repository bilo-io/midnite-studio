/**
 * Capture helpers for the Midnite Apps promo footage.
 *
 * - `preparePage`: theme, focus/visibility stubs (so focus-gated animations run),
 *   a visible macOS-style cursor overlay with a click ripple, and hides dev overlays.
 * - `Recorder`: CDP `Page.startScreencast` (JPEG q92 at 2x) -> per-frame timestamps ->
 *   constant 30 fps H.264 via ffmpeg's concat demuxer.
 * - Motion helpers: eased, time-based cursor paths, smooth wheel zoom/pan.
 *
 * Nothing here edits the repo; it only imports the e2e mock bridge by path.
 */
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

import type { CDPSession, Page } from '@playwright/test';

export const CAPTURE_DIR = __dirname;
export const CLIPS_DIR = path.resolve(__dirname, '../input/clips');
export const FRAMES_DIR = path.join(__dirname, 'frames');
export const STILLS_DIR = path.join(__dirname, 'stills');
const FFMPEG = '/opt/homebrew/bin/ffmpeg';

export type Theme = 'dark' | 'light';

/* ─── Page preparation ─────────────────────────────────────────────────── */

function focusStub(): void {
  try {
    Object.defineProperty(document, 'hasFocus', { value: () => true, configurable: true });
    Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });
    Object.defineProperty(document, 'hidden', { get: () => false, configurable: true });
  } catch {
    /* ignore */
  }
}

function cursorOverlay(): void {
  const install = (): void => {
    if (document.getElementById('__cap_cursor')) return;
    const style = document.createElement('style');
    style.textContent = `
      #__cap_cursor{position:fixed;left:0;top:0;width:26px;height:26px;pointer-events:none;z-index:2147483647;
        transform:translate(-200px,-200px);will-change:transform;filter:drop-shadow(0 1px 1.5px rgba(0,0,0,.45))}
      .__cap_ripple{position:fixed;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;pointer-events:none;
        z-index:2147483646;border:2px solid rgba(255,255,255,.85);background:rgba(120,160,255,.22);
        animation:__cap_rip .45s ease-out forwards}
      @keyframes __cap_rip{from{transform:scale(.35);opacity:1}to{transform:scale(1.25);opacity:0}}
      vite-error-overlay,#vite-error-overlay,[data-tanstack-query-devtools],.tsqd-parent-container{display:none!important}
      html,body,*{cursor:none!important}
    `;
    document.documentElement.appendChild(style);
    const c = document.createElement('div');
    c.id = '__cap_cursor';
    c.innerHTML =
      '<svg width="26" height="26" viewBox="0 0 26 26" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M3 2 L3 20.2 L7.6 15.9 L10.6 22.6 L13.6 21.3 L10.7 14.7 L16.9 14.7 Z" fill="#000" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/>' +
      '</svg>';
    document.documentElement.appendChild(c);
    const move = (x: number, y: number): void => {
      c.style.transform = `translate(${x - 3}px, ${y - 2}px)`;
    };
    window.addEventListener('mousemove', (e) => move(e.clientX, e.clientY), true);
    window.addEventListener('pointermove', (e) => move(e.clientX, e.clientY), true);
    window.addEventListener(
      'mousedown',
      (e) => {
        const r = document.createElement('div');
        r.className = '__cap_ripple';
        r.style.left = `${e.clientX}px`;
        r.style.top = `${e.clientY}px`;
        document.documentElement.appendChild(r);
        setTimeout(() => r.remove(), 600);
      },
      true,
    );
    // Keep the cursor above anything appended later.
    new MutationObserver(() => {
      if (document.documentElement.lastElementChild !== c && !document.querySelector('.__cap_ripple')) {
        document.documentElement.appendChild(c);
      }
    }).observe(document.documentElement, { childList: true });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
}

function themeSeed(theme: string): void {
  try {
    localStorage.setItem('midnite.theme', theme);
  } catch {
    /* ignore */
  }
}

/** Merge into the persisted ui store, keeping whatever version is there. */
function uiSeed(partial: Record<string, unknown>): void {
  try {
    const raw = localStorage.getItem('midnite-studio.ui');
    const parsed = raw ? JSON.parse(raw) : { version: 18 };
    parsed.state = { ...parsed.state, ...partial };
    localStorage.setItem('midnite-studio.ui', JSON.stringify(parsed));
  } catch {
    /* ignore */
  }
}

export async function preparePage(
  page: Page,
  opts: { theme: Theme; ui?: Record<string, unknown> },
): Promise<void> {
  await page.emulateMedia({ colorScheme: opts.theme, reducedMotion: 'no-preference' });
  await page.addInitScript(focusStub);
  await page.addInitScript(cursorOverlay);
  await page.addInitScript(themeSeed, opts.theme);
  // Repos side panel closed, terminal closed — per the shot rules — plus any extras.
  await page.addInitScript(uiSeed, { reposOpen: false, terminalOpen: false, ...(opts.ui ?? {}) });
}

/** Run after the app has rendered: fonts settled, focus signalled. */
export async function settlePage(page: Page, ms = 800): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await page.bringToFront();
  await page.evaluate(() => {
    window.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('visibilitychange'));
    document.documentElement.dataset['windowFocused'] = 'true';
  });
  await page.waitForTimeout(ms);
}

/* ─── Cursor motion ────────────────────────────────────────────────────── */

const mousePos = new WeakMap<Page, { x: number; y: number }>();

export const ease = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOut = (t: number): number => 1 - Math.pow(1 - t, 3);

export async function placeCursor(page: Page, x: number, y: number): Promise<void> {
  await page.mouse.move(x, y);
  mousePos.set(page, { x, y });
}

/**
 * Time-based eased move along a gentle arc. ~60 updates/s.
 */
export async function glide(page: Page, x: number, y: number, ms = 900, arc = 0.08): Promise<void> {
  const from = mousePos.get(page) ?? { x: 720, y: 450 };
  const dx = x - from.x;
  const dy = y - from.y;
  // perpendicular offset for a slight curve
  const nx = -dy * arc;
  const ny = dx * arc;
  const t0 = Date.now();
  for (;;) {
    const t = Math.min(1, (Date.now() - t0) / ms);
    const e = ease(t);
    const bump = Math.sin(Math.PI * e);
    await page.mouse.move(from.x + dx * e + nx * bump, from.y + dy * e + ny * bump);
    if (t >= 1) break;
    await page.waitForTimeout(14);
  }
  mousePos.set(page, { x, y });
}

export async function glideTo(page: Page, selector: string | import('@playwright/test').Locator, ms = 900, offset = { x: 0.5, y: 0.5 }): Promise<{ x: number; y: number }> {
  const loc = typeof selector === 'string' ? page.locator(selector).first() : selector;
  const box = await loc.boundingBox();
  if (!box) throw new Error(`no box for ${String(selector)}`);
  const x = box.x + box.width * offset.x;
  const y = box.y + box.height * offset.y;
  await glide(page, x, y, ms);
  return { x, y };
}

export async function click(page: Page, holdMs = 90): Promise<void> {
  await page.mouse.down();
  await page.waitForTimeout(holdMs);
  await page.mouse.up();
}

/** Smooth wheel: total delta spread over `ms` with an ease-in-out profile. */
export async function smoothWheel(
  page: Page,
  total: { dx?: number; dy?: number },
  ms = 1200,
  modifier?: 'Control' | 'Meta',
): Promise<void> {
  if (modifier) await page.keyboard.down(modifier);
  const t0 = Date.now();
  let doneX = 0;
  let doneY = 0;
  for (;;) {
    const t = Math.min(1, (Date.now() - t0) / ms);
    const e = ease(t);
    const wantX = (total.dx ?? 0) * e;
    const wantY = (total.dy ?? 0) * e;
    const sx = wantX - doneX;
    const sy = wantY - doneY;
    if (Math.abs(sx) > 0.01 || Math.abs(sy) > 0.01) {
      await page.mouse.wheel(sx, sy);
      doneX = wantX;
      doneY = wantY;
    }
    if (t >= 1) break;
    await page.waitForTimeout(14);
  }
  if (modifier) await page.keyboard.up(modifier);
}

/** Smooth element scroll (scrollTop) for lists that don't take synthetic wheel well. */
export async function smoothScrollEl(page: Page, selector: string, dy: number, ms = 1500): Promise<void> {
  await page.evaluate(
    async ({ selector, dy, ms }) => {
      const el = document.querySelector(selector) as HTMLElement | null;
      if (!el) return;
      const start = el.scrollTop;
      const t0 = performance.now();
      await new Promise<void>((resolve) => {
        const step = (now: number): void => {
          const t = Math.min(1, (now - t0) / ms);
          const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
          el.scrollTop = start + dy * e;
          if (t < 1) requestAnimationFrame(step);
          else resolve();
        };
        requestAnimationFrame(step);
      });
    },
    { selector, dy, ms },
  );
}

export async function typeSlow(page: Page, text: string, perCharMs = 55): Promise<void> {
  for (const ch of text) {
    await page.keyboard.type(ch);
    await page.waitForTimeout(perCharMs + Math.round(Math.random() * 25));
  }
}

/* ─── Recorder ─────────────────────────────────────────────────────────── */

export class Recorder {
  private cdp!: CDPSession;
  private frames: { file: string; ts: number }[] = [];
  private dir: string;
  private stopped = false;

  constructor(
    private page: Page,
    private name: string,
  ) {
    this.dir = path.join(FRAMES_DIR, name);
  }

  async start(): Promise<void> {
    fs.rmSync(this.dir, { recursive: true, force: true });
    fs.mkdirSync(this.dir, { recursive: true });
    this.cdp = await this.page.context().newCDPSession(this.page);
    this.cdp.on('Page.screencastFrame', (f: { data: string; sessionId: number; metadata: { timestamp?: number } }) => {
      if (this.stopped) return;
      const file = path.join(this.dir, `${String(this.frames.length).padStart(5, '0')}.jpg`);
      fs.writeFileSync(file, Buffer.from(f.data, 'base64'));
      this.frames.push({ file, ts: f.metadata.timestamp ?? Date.now() / 1000 });
      this.cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
    });
    await this.cdp.send('Page.startScreencast', {
      format: 'jpeg',
      quality: 92,
      maxWidth: 2880,
      maxHeight: 1800,
      everyNthFrame: 1,
    });
  }

  /** Stop, encode to input/clips/<name>.mp4, return stats. */
  async stop(): Promise<{ out: string; frames: number; seconds: number; maxGapMs: number }> {
    const endTs = Date.now() / 1000;
    await this.cdp.send('Page.stopScreencast').catch(() => {});
    this.stopped = true;
    await this.cdp.detach().catch(() => {});
    const frames = this.frames;
    if (frames.length < 2) throw new Error(`${this.name}: only ${frames.length} frames captured`);
    const first = frames[0]!.ts;
    const last = Math.max(endTs, frames[frames.length - 1]!.ts + 1 / 30);
    let maxGap = 0;
    const lines: string[] = [];
    for (let i = 0; i < frames.length; i += 1) {
      const next = i + 1 < frames.length ? frames[i + 1]!.ts : last;
      const d = Math.max(0.001, next - frames[i]!.ts);
      if (i + 1 < frames.length) maxGap = Math.max(maxGap, d);
      lines.push(`file '${frames[i]!.file}'`, `duration ${d.toFixed(5)}`);
    }
    lines.push(`file '${frames[frames.length - 1]!.file}'`);
    const list = path.join(this.dir, 'list.txt');
    fs.writeFileSync(list, lines.join('\n') + '\n');
    fs.mkdirSync(CLIPS_DIR, { recursive: true });
    const out = path.join(CLIPS_DIR, `${this.name}.mp4`);
    execFileSync(
      FFMPEG,
      [
        '-y', '-loglevel', 'error',
        '-f', 'concat', '-safe', '0', '-i', list,
        '-vf', 'fps=30,scale=2880:1800:flags=lanczos,format=yuv420p',
        '-c:v', 'libx264', '-crf', '16', '-preset', 'slow', '-movflags', '+faststart',
        out,
      ],
      { stdio: 'inherit' },
    );
    const stats = { out, frames: frames.length, seconds: last - first, maxGapMs: Math.round(maxGap * 1000) };
    fs.writeFileSync(path.join(this.dir, 'stats.json'), JSON.stringify(stats, null, 2));
    // eslint-disable-next-line no-console
    console.log(`[capture] ${this.name}: ${stats.frames} frames over ${stats.seconds.toFixed(2)}s, max gap ${stats.maxGapMs}ms -> ${out}`);
    return stats;
  }
}

/** Click a rail link, then move the pointer off the (hover-expanded) rail and let it collapse. */
export async function gotoView(page: Page, name: string): Promise<void> {
  const link = page.getByRole('link', { name, exact: true });
  await link.hover();
  await link.click();
  await page.mouse.move(900, 500);
  mousePos.set(page, { x: 900, y: 500 });
  await page.waitForTimeout(450);
}
