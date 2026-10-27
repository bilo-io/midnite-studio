/**
 * gamer-dark — the Gamer app's Media tabs, seeded from the real projects under
 * `.midnite/media/`: Maps (Cape Town, satellite with 3D terrain), Terrain (the
 * Grand Canyon build) and Models (the Lamborghini Gallardo, then Iron Man).
 *
 * Bytes are the real files, served by `fixtures/media-seed.ts`; map tiles go
 * through main's own tile handler over the network (cached in frames/_tiles).
 * Every tab is visited once before recording so its project is loaded and the
 * cuts land on a ready view.
 */
import { expect, test, type Page } from '@playwright/test';

import { clickRailLink, installMockBridge } from '../../../../../../../packages/app/test-support/mock-bridge';
import { click, glide, glideTo, placeCursor, preparePage, Recorder, settlePage } from '../lib';
import { roadmapFixtures } from '../fixtures/roadmap';
import { mediaFilesFrom, serveMediaFiles } from '../fixtures/media-seed';

// three.js / maplibre: hand them the real GPU, like knowledge.cap.ts.
test.use({
  launchOptions: {
    args: ['--force-color-profile=srgb', '--hide-scrollbars', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
  },
});

const MODELS = /^(create-a-yellow-lamborghini-gallardo-spo-20261007-172349|ironman-a-high-fidelity-version-of-iron-20261004-113236|low-poly-red-fox-20261003-142752|create-an-accurate-depiction-of-a-tennis-20261007-171618|modern-abstract-vase-with-geometric-laye-20261003-142458)\//;
const TERRAINS = /^(grand-canyon-arizona-united-states-20261015-173354|bern-canton-of-bern-switzerland-20261008-201520|oslo-oslo-norway-20261009-183557|sydney-new-south-wales-australia-20261015-233112)\//;

// The Lamborghini leads the explorer, so the Models tab opens on it.
const LAMBO_DIR = 'create-a-yellow-lamborghini-gallardo-spo-20261007-172349';
const LAMBO = LAMBO_DIR;
const IRONMAN = 'ironman-a-high-fidelity-version-of-iron-20261004-113236';
function renameModel(files: Record<string, Record<string, string>>): Record<string, Record<string, string>> {
  const [[key, entries]] = Object.entries(files) as [[string, Record<string, string>]];
  return { [key]: Object.fromEntries(Object.entries(entries).map(([k, v]) => [k.startsWith(`${LAMBO_DIR}/`) ? `${LAMBO}/${k.slice(LAMBO_DIR.length + 1)}` : k, v])) };
}

const MAP_VIEW = {
  version: 1,
  view: { center: [18.4035, -33.9625], zoom: 12.7, bearing: -28, pitch: 58 },
  basemap: 'satellite',
  terrain3d: { on: true, exaggeration: 1.6 },
  layerOrder: [],
  layerStyle: {},
  frame: { center: [18.4035, -33.9625], sideM: 3000, size: 1025 },
};

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, ms: number, button: 'left' | 'right' = 'left'): Promise<void> {
  await glide(page, from.x, from.y, 450);
  await page.mouse.down({ button });
  await glide(page, to.x, to.y, ms, 0.02);
  await page.mouse.up({ button });
}

type Pt = { x: number; y: number };
const MAP_MOVES: [Pt, Pt, 'left' | 'right'][] = [
  [{ x: 820, y: 560 }, { x: 600, y: 450 }, 'left'],
  [{ x: 600, y: 450 }, { x: 800, y: 450 }, 'right'],
];

const tab = (page: Page, name: string) => page.getByRole('tab', { name: new RegExp(`^${name}`) }).first();

/** The viewport's mesh-validation pill ("4 warnings") reads as an error on camera; hide just that pill. */
function hideWarningPill(): void {
  const add = (): void => {
    const st = document.createElement('style');
    st.textContent = 'button[aria-expanded].border-amber-500\\/50{visibility:hidden!important}';
    document.documentElement.appendChild(st);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add);
  else add();
}

async function openGamer(page: Page): Promise<void> {
  await page.addInitScript(hideWarningPill);
  const files = {
    ...mediaFilesFrom('map', 'maps', { as: 'Cape Peninsula', only: (r) => r === 'map.json', edit: () => JSON.stringify(MAP_VIEW) }),
    ...mediaFilesFrom('terrain', 'terrains', { as: 'Landscapes', only: (r) => TERRAINS.test(r), maxTextBytes: 9_000_000 }),
    ...renameModel(mediaFilesFrom('model', 'Testing', { as: 'Showcase', only: (r) => MODELS.test(r), maxTextBytes: 300_000 })),
  };
  await installMockBridge(page, roadmapFixtures({ media: { files } } as never), { cspGuard: false });
  await serveMediaFiles(page, {
    alias: {
      '.midnite/media/map/Cape Peninsula/': '.midnite/media/map/maps/',
      '.midnite/media/terrain/Landscapes/': '.midnite/media/terrain/terrains/',
      [`.midnite/media/model/Showcase/${LAMBO}/`]: `.midnite/media/model/Testing/${LAMBO_DIR}/`,
      '.midnite/media/model/Showcase/': '.midnite/media/model/Testing/',
    },
  });
  await preparePage(page, { theme: 'dark' });
  await page.goto('/');
  await expect(page.getByRole('navigation', { name: 'Views' })).toBeVisible({ timeout: 30_000 });
  await clickRailLink(page, 'Media');
  await page.mouse.move(900, 500);

  // Warm every tab: Models, Terrain, then Maps last (where the clip opens).
  await tab(page, 'Models').click();
  await expect(page.getByText(/Lamborghini Gallardo/).first()).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(2500);
  await page.getByText(IRONMAN, { exact: true }).first().click();
  await page.waitForTimeout(3000);
  await page.getByText(LAMBO, { exact: true }).first().click();
  await page.waitForTimeout(2000);

  await tab(page, 'Terrain').click();
  await page.getByText(/^grand-canyon-arizona/).first().click();
  await expect(page.getByText(/Captured from Maps · Grand Canyon/)).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(4000);

  await tab(page, 'Maps').click();
  await page.getByText('map.json', { exact: true }).first().click();
  await page.waitForTimeout(5000);
  // Fly the clip's own pan once so its tiles are cached, then fly it back.
  for (const [a, b, btn] of MAP_MOVES) await drag(page, a, b, 900, btn);
  await page.waitForTimeout(2500);
  for (const [a, b, btn] of [...MAP_MOVES].reverse()) await drag(page, b, a, 900, btn);
  await page.waitForTimeout(3000);
  await page.mouse.move(900, 500);
  await placeCursor(page, 760, 520);
  await settlePage(page, 1500);
}

test('gamer-dark', async ({ page }) => {
  test.setTimeout(240_000);
  await openGamer(page);
  const rec = new Recorder(page, 'gamer-dark');
  await rec.start();
  await page.waitForTimeout(650);

  // Maps — 0.7 → ~3.4 s: drift across Table Mountain, then rotate.
  await drag(page, MAP_MOVES[0]![0], MAP_MOVES[0]![1], 1200);
  await drag(page, MAP_MOVES[1]![0], MAP_MOVES[1]![1], 800, 'right');

  // Terrain — ~3.4 → ~7.3 s: open the Grand Canyon build, orbit.
  await glideTo(page, tab(page, 'Terrain'), 400);
  await click(page);
  await page.waitForTimeout(150);
  await glideTo(page, page.getByText(/^grand-canyon-arizona/).first(), 400, { x: 0.35, y: 0.5 });
  await click(page);
  await page.waitForTimeout(800);
  await drag(page, { x: 820, y: 520 }, { x: 600, y: 500 }, 1600);

  // Models — ~7.3 → ~10.8 s: the Lamborghini, orbit.
  await glideTo(page, tab(page, 'Models'), 400);
  await click(page);
  await page.waitForTimeout(500);
  await drag(page, { x: 940, y: 300 }, { x: 760, y: 300 }, 1700);
  await page.waitForTimeout(200);

  // ~10.8 s: Iron Man from the explorer, orbit to the end.
  await glideTo(page, page.getByText(IRONMAN, { exact: true }).first(), 500);
  await click(page);
  await page.waitForTimeout(900);
  await drag(page, { x: 950, y: 330 }, { x: 820, y: 330 }, 1300);
  await page.waitForTimeout(600);
  await rec.stop();
});

