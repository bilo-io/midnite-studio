// Usage: node launcher.mjs [grid-light grid-dark detail-light table-light jump-light jump-dark]
import { launch, startRec, finishRec, sleep, moveTo, moveToEl, click, scrollTo } from './lib.mjs';
const BASE = 'http://localhost:5292/';
const run = async (name, scheme, query, fn) => {
  const { browser, page, cdp } = await launch({ scheme, url: BASE + query, storage: { 'midnite-launcher.theme': scheme, 'midnite-launcher.layout': 'grid' } });
  try {
    await sleep(700);
    const frames = await startRec(cdp);
    await sleep(500);
    await fn(page);
    await finishRec(cdp, frames, name);
  } finally { await browser.close(); }
};
const tile = (id) => `#tile-${id}`;
const grid = (scheme) => async (page) => {
  for (const id of ['studio', 'agents', 'coder', 'gamer', 'creator', 'media', 'money', 'mind', 'browser']) {
    await moveToEl(page, tile(id), { steps: 28 }); await sleep(450);
  }
  await scrollTo(page, 500, 2200); await sleep(500);
  for (const id of ['science', 'accountant', 'vanguard']) {
    if (await page.locator(tile(id)).count()) { await moveToEl(page, tile(id), { steps: 28 }); await sleep(450); }
  }
  await sleep(500);
};
const jump = (ids) => async (page) => {
  for (const id of ids) {
    await moveToEl(page, tile(id), { steps: 32 }); await sleep(150);
    await click(page); await sleep(1300);
    await page.keyboard.press('Escape'); await sleep(250);
  }
};
const JUMP = ['studio', 'agents', 'coder', 'creator', 'gamer', 'mind'];
const jobs = {
  'grid-light': () => run('launcher-grid-light', 'light', '?studio=installed', grid()),
  'grid-dark': () => run('launcher-grid-dark', 'dark', '?studio=installed', grid()),
  'jump-light': () => run('launcher-jump-light', 'light', '?studio=installed', jump(JUMP)),
  'jump-dark': () => run('launcher-jump-dark', 'dark', '?studio=installed', jump(JUMP)),
  'detail-light': () => run('launcher-detail-light', 'light', '?studio=missing', async (page) => {
    await moveToEl(page, tile('studio'), { steps: 35 }); await sleep(500);
    await click(page); await sleep(1500);
    await moveTo(page, 700, 520, 30);
    await scrollTo; await page.mouse.wheel(0, 0);
    const inst = page.locator('.sheet-actions .btn-primary');
    await moveToEl(page, inst, { steps: 35 }); await sleep(500);
    await click(page);
    await sleep(3600); // fake download + install progress
    await moveTo(page, 700, 700, 30);
    await page.locator('.sheet').evaluate((el) => el.scrollTo({ top: 400, behavior: 'smooth' }));
    await sleep(1800);
    await page.locator('.sheet').evaluate((el) => el.scrollTo({ top: 0, behavior: 'smooth' }));
    await sleep(1200);
    await moveToEl(page, '.sheet-actions .btn-primary', { steps: 30 }); await sleep(800);
  }),
  'table-light': () => run('launcher-table-light', 'light', '?studio=update', async (page) => {
    await sleep(800);
    await moveToEl(page, '.banner .btn-primary', { steps: 35 }); await sleep(900);
    await moveToEl(page, 'button:has-text("Table")', { steps: 35 }); await sleep(500);
    await click(page); await sleep(1500);
    await moveTo(page, 700, 450, 30); await sleep(400);
    await moveTo(page, 700, 700, 40); await sleep(500);
    await scrollTo(page, 400, 2000); await sleep(600);
    await moveTo(page, 600, 300, 40); await sleep(500);
    await scrollTo(page, 0, 1200); await sleep(400);
    await moveToEl(page, 'button:has-text("Grid")', { steps: 40 }); await sleep(400);
    await click(page); await sleep(1500);
  }),
};
for (const k of process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(jobs)) await jobs[k]();
