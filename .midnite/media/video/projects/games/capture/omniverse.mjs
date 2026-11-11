// Omniverse footage, real time. Serve the game first: cd ~/GameDev/xmen/game && ./node_modules/.bin/vite --port 5174 --host 127.0.0.1
//   node omniverse.mjs <shot> [...]   shots: menus goku storm spidey
// Private fan project: these clips hold trademarked characters and ripped models (see ~/GameDev/xmen/README.md). Keep them local.
import path from 'node:path';
import { launch, screencast, vrec, cue, VIRTUAL_TIME, sleep, HERE } from './lib.mjs';

const BASE = process.env.OMNI_URL ?? 'http://127.0.0.1:5174/';
const OUT = path.resolve(HERE, '../omniverse-showreel/input/clips');
const FILL = () => { const m = window.__xmen.meter; if (m) m.value = m.slots; };
const CLEAN = `.hp-debug,.hp-ctl{display:none!important}`;

async function open() {
  const { browser, page } = await launch({ init: VIRTUAL_TIME });
  page.on('pageerror', (e) => console.log('pageerror', e.message.slice(0, 160)));
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForFunction(() => window.__xmen, null, { timeout: 180000 });
  await page.addStyleTag({ content: CLEAN });
  return { browser, page };
}
async function enter(page, cid, loc) {
  await page.evaluate(async ({ cid, loc }) => {
    const man = await (await fetch('/assets/manifest.json')).json();
    const c = man.find((x) => x.id === cid);
    await window.__xmen.start(c, c.models[0], loc);
  }, { cid, loc });
  await page.addStyleTag({ content: CLEAN });
  await sleep(2500);
}
const K = (page) => ({
  hold: (k) => page.keyboard.down(k), up: (k) => page.keyboard.up(k),
  tap: async (k, ms = 90) => { await page.keyboard.down(k); await sleep(ms); await page.keyboard.up(k); },
});
const click = async (page, n = 1, gap = 260, button = 'left') => { for (let i = 0; i < n; i++) { await page.mouse.down({ button }); await sleep(70); await page.mouse.up({ button }); await sleep(gap); } };

const SHOTS = {
  // Title → character select (a few heroes in the 3D preview) → location select.
  async menus() {
    const { browser, page } = await open();
    await sleep(9000);
    const stop = await screencast(page, 'omni-menus', { outDir: OUT });
    await sleep(3500);
    await page.click('#title [data-action="play"]');
    await sleep(2500);
    for (const name of ['Goku', 'Storm', 'Spider-Man', 'Wolverine', 'Invincible']) {
      const el = page.locator('#roster').getByText(name, { exact: true }).first();
      if (await el.count()) { await el.scrollIntoViewIfNeeded(); await el.click(); await sleep(2600); }
    }
    await page.click('#select [data-action="go"]');
    await sleep(2500);
    for (const name of ['Titan Colosseum', 'The X-Mansion']) {
      const el = page.locator('#locations').getByText(name, { exact: true }).first();
      if (await el.count()) { await el.click(); await sleep(3000); }
    }
    await stop();
    await browser.close();
  },
  // Goku in the Titan Colosseum: super form, combos, flight, supers.
  async goku() {
    const { browser, page } = await open();
    await enter(page, 'goku', 'titan-colosseum');
    await page.mouse.move(960, 540);
    const ev = [[0, 'eval', FILL], [20, 'tap', 'KeyG'], [120, 'down', 'KeyW'], [120, 'down', 'ShiftLeft'], [175, 'up', 'ShiftLeft'], [175, 'up', 'KeyW'],
      ...[180, 187, 194, 201, 208, 215].map((f) => [f, 'click']), ...[230, 242, 254].map((f) => [f, 'rclick']),
      [270, 'tap', 'KeyR'], [282, 'down', 'Space'], [320, 'up', 'Space'], [322, 'down', 'KeyW'], [322, 'down', 'ShiftLeft'], [400, 'down', 'KeyD'], [436, 'up', 'KeyD'],
      [460, 'up', 'ShiftLeft'], [460, 'up', 'KeyW'], [462, 'eval', FILL], [466, 'tap', 'Digit1'], [536, 'tap', 'Digit2']];
    await vrec(page, 'omni-goku', 620, cue(page, ev), { outDir: OUT });
    await browser.close();
  },
  // Storm takes off over the X-Mansion grounds.
  async storm() {
    const { browser, page } = await open();
    await enter(page, 'storm', 'x-mansion');
    await page.mouse.move(960, 540);
    const ev = [[10, 'down', 'KeyR'], [16, 'down', 'Space'], [150, 'up', 'Space'], [140, 'down', 'KeyW'], [150, 'down', 'ShiftLeft'], [190, 'down', 'Space'], [250, 'up', 'Space'],
      [300, 'down', 'KeyA'], [350, 'up', 'KeyA'], [470, 'up', 'ShiftLeft'], [470, 'up', 'KeyW']];
    await vrec(page, 'omni-storm', 480, cue(page, ev), { outDir: OUT });
    await browser.close();
  },
  // Spider-Man in the test level: sprint, jump and swing.
  async spidey() {
    const { browser, page } = await open();
    await enter(page, 'spider-man', 'test-level');
    await page.evaluate(() => window.__xmen.teleport(window.__xmen.state.floor, 98, 100));
    await sleep(9000);
    await page.screenshot({ path: path.join(HERE, 'frames', '_sheets', 'omni-spidey-start.jpg'), quality: 60 });
    await page.mouse.move(960, 540);
    const ev = [[10, 'down', 'KeyS'], [10, 'down', 'ShiftLeft'], [40, 'down', 'KeyR'], [420, 'up', 'KeyR'], [430, 'up', 'ShiftLeft'], [430, 'up', 'KeyS']];
    for (let k = 0; k < 6; k++) ev.push([50 + 60 * k, 'tap', 'Space']);
    await vrec(page, 'omni-spidey', 440, cue(page, ev), { outDir: OUT });
    await browser.close();
  },
};
for (const n of process.argv.slice(2)) { console.log('shot', n); await SHOTS[n](); }
