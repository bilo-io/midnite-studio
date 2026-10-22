// Usage: node web.mjs [hero|scroll|access ...]
import { launch, startRec, finishRec, sleep, moveTo, moveToEl, click, scrollTo } from './lib.mjs';
const URL = 'http://localhost:5291/';
const KEY = { 'midnite-studio.website.theme': 'dark' };
const which = process.argv.slice(2);
// preload=true: page is loaded before recording starts (scroll/access). hero records its own load.
const run = async (name, fn, preload = true) => {
  const { browser, page, cdp } = await launch({ scheme: 'dark', url: preload ? URL : 'about:blank', storage: KEY });
  try {
    if (preload) await sleep(1500);
    const frames = await startRec(cdp);
    await fn(page);
    await finishRec(cdp, frames, name);
  } finally { await browser.close(); }
};
const jobs = {
  // hero: load the page while recording so the entrance animation is captured
  async hero() {
    await run('web-hero-dark', async (page) => {
      await sleep(500);
      await page.goto(URL, { waitUntil: 'load' });
      await sleep(3500);
      await moveTo(page, 1000, 560, 40);
      await sleep(800);
      await scrollTo(page, 420, 3500);
      await sleep(1200);
    }, false);
  },
  async scroll() {
    await run('web-scroll-dark', async (page) => {
      await sleep(500);
      const H = await page.evaluate(() => document.getElementById('early-access').getBoundingClientRect().top + scrollY - 140);
      const stops = [861, 2832, 5091].filter((y) => y < H + 100);
      await moveTo(page, 1200, 500, 20);
      for (const y of stops) { await scrollTo(page, y, 1800); await sleep(500); }
      await scrollTo(page, Math.min(H, 7141 - 100), 1500);
      await sleep(1200);
    });
  },
  async access() {
    await run('web-access-dark', async (page) => {
      await sleep(500);
      const btn = page.locator('a:has-text("Get Access")').first();
      const b = await btn.boundingBox();
      await moveTo(page, b.x + b.width / 2, b.y + b.height / 2, 50);
      await sleep(900);
      await click(page);
      await sleep(2200);
      const input = page.locator('#early-access-email');
      await input.waitFor();
      const bb = await moveToEl(page, input, { steps: 45 });
      await sleep(400);
      await click(page);
      await page.keyboard.type('you@studio.dev', { delay: 90 });
      await sleep(1800);
    });
  },
};
for (const k of which.length ? which : Object.keys(jobs)) await jobs[k]();
