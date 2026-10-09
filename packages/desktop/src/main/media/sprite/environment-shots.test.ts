import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  assembleTerrainTileset,
  assembleTileset,
  BLOB,
  BLOB47_MASKS,
  buildBackgroundJson,
  createRgba,
  ensureSeamless,
  isoBlock,
  periodicNoise,
  reduceBlob,
  resizeNearest,
  terrainToTiles,
  TilesetSpecSchema,
  BackgroundSpecSchema,
  type RgbaImage,
  type TilesetBase,
} from '@midnite/studio-shared';
import { describe, it } from 'vitest';

import { encodePngRgba8 } from '../png/png-codec';

/**
 * Renders the real kernel output (autotile masks, composited transitions, the isometric
 * re-projection, seam-checked parallax layers, a terrain cut into tiles) to PNGs for the PR's
 * screenshots. The base textures are procedural stand-ins for generated ones — everything after them
 * is the shipped code. Skipped unless `MSTUDIO_SHOTS_ASSETS` names an output folder.
 */
const OUT = process.env['MSTUDIO_SHOTS_ASSETS'];
const png = (img: RgbaImage): Buffer => encodePngRgba8(new Uint8Array(img.data.buffer, img.data.byteOffset, img.data.byteLength), img.width, img.height);
const save = (name: string, img: RgbaImage) => writeFileSync(join(OUT!, name), png(img));

type Rgb = readonly [number, number, number];
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** A seamless texture: two periodic octaves of noise between two colours, plus speckle. */
function texture(size: number, seed: number, dark: Rgb, light: Rgb, speckle?: Rgb): RgbaImage {
  const n1 = periodicNoise(seed), n2 = periodicNoise(seed + 101);
  const img = createRgba(size, size);
  for (let y = 0; y < size; y += 1)
    for (let x = 0; x < size; x += 1) {
      const px = x / size, py = y / size;
      const v = 0.5 + 0.35 * n1(px, py) + 0.15 * n2((px * 2) % 1, (py * 2) % 1);
      let c = mix(dark, light, Math.min(1, Math.max(0, v)));
      const h = Math.imul(x * 73856093 ^ y * 19349663 ^ seed, 83492791) >>> 0;
      if (speckle && h % 23 === 0) c = speckle;
      img.data.set([c[0], c[1], c[2], 255], (y * size + x) * 4);
    }
  return img;
}

const spec = TilesetSpecSchema.parse({
  kind: 'tileset',
  name: 'Meadow',
  style: 'pixel',
  tileSize: 32,
  terrains: [
    { id: 'grass', label: 'Grass' },
    { id: 'dirt', label: 'Dirt' },
    { id: 'water', label: 'Water', collision: 'water' },
    { id: 'stone', label: 'Stone', collision: 'solid' },
  ],
  transitions: [{ a: 'grass', b: 'dirt' }, { a: 'grass', b: 'water' }, { a: 'dirt', b: 'stone' }],
});

const bases = (): TilesetBase[] => [
  { id: 'grass', collision: 'walkable', image: texture(32, 3, [52, 120, 46], [96, 170, 70], [140, 200, 90]) },
  { id: 'dirt', collision: 'walkable', image: texture(32, 5, [112, 80, 52], [158, 118, 78], [90, 62, 40]) },
  { id: 'water', collision: 'water', image: texture(32, 7, [38, 92, 168], [88, 160, 224], [200, 232, 255]) },
  { id: 'stone', collision: 'solid', image: texture(32, 9, [96, 100, 110], [150, 154, 164], [70, 72, 82]) },
];

/** Paints a map of one terrain over another, picking each cell's blob tile from its neighbours. */
function autotileDemo(): RgbaImage {
  const built = assembleTileset(spec, bases());
  const cols = 8;
  const W = 14, H = 9, S = 32;
  // 1 = b (dirt) over a (grass): a blob, a strip and a lone cell
  const grid = Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => {
    const inBlob = (x - 4) ** 2 / 9 + (y - 4) ** 2 / 6 <= 1;
    const inStrip = y === 7 && x >= 7 && x <= 12;
    const lone = x === 12 && y === 1;
    return inBlob || inStrip || lone ? 1 : 0;
  }));
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : grid[y]![x]!);
  const out = createRgba(W * S, H * S);
  const sheetW = built.sheet.width;
  const blit = (id: number, dx: number, dy: number) => {
    const sx = (id % cols) * S, sy = Math.floor(id / cols) * S;
    for (let y = 0; y < S; y += 1)
      for (let x = 0; x < S; x += 1) {
        const s = ((sy + y) * sheetW + sx + x) * 4, o = ((dy + y) * out.width + dx + x) * 4;
        for (let c = 0; c < 4; c += 1) out.data[o + c] = built.sheet.data[s + c]!;
      }
  };
  const transitionBase = 4; // grass-dirt set starts after the four bases
  for (let y = 0; y < H; y += 1)
    for (let x = 0; x < W; x += 1) {
      if (!at(x, y)) { blit(0, x * S, y * S); continue; }
      const m =
        (at(x, y - 1) ? BLOB.N : 0) | (at(x + 1, y - 1) ? BLOB.NE : 0) | (at(x + 1, y) ? BLOB.E : 0) | (at(x + 1, y + 1) ? BLOB.SE : 0) |
        (at(x, y + 1) ? BLOB.S : 0) | (at(x - 1, y + 1) ? BLOB.SW : 0) | (at(x - 1, y) ? BLOB.W : 0) | (at(x - 1, y - 1) ? BLOB.NW : 0);
      blit(transitionBase + BLOB47_MASKS.indexOf(reduceBlob(m)), x * S, y * S);
    }
  return out;
}

function parallax(): Array<{ name: string; image: RgbaImage }> {
  const [w, h] = [1280, 360];
  const layers: Array<{ name: string; image: RgbaImage }> = [];
  const make = (name: string, f: (x: number, y: number) => [number, number, number, number]) => {
    const img = createRgba(w, h);
    for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) img.data.set(f(x, y), (y * w + x) * 4);
    const checked = ensureSeamless(img, 'x');
    layers.push({ name, image: checked.image });
  };
  const wave = (x: number, periods: number, phase = 0) => Math.sin((x / w) * Math.PI * 2 * periods + phase);
  make('sky', (_x, y) => [Math.round(120 + (y / h) * 90), Math.round(170 + (y / h) * 60), 235, 255]);
  make('far', (x, y) => (y > 150 - 55 * (0.6 * wave(x, 3) + 0.4 * wave(x, 7, 1)) + 60 ? [112, 128, 170, 255] : [0, 0, 0, 0]));
  make('mid', (x, y) => (y > 225 - 35 * (0.7 * wave(x, 4, 2) + 0.3 * wave(x, 9)) ? [64, 120, 84, 255] : [0, 0, 0, 0]));
  make('near', (x, y) => (y > 310 - 14 * (0.5 * wave(x, 11) + 0.5 * wave(x, 17, 1)) ? [36, 82, 52, 255] : [0, 0, 0, 0]));
  return layers;
}

function props(): RgbaImage {
  const cell = 32;
  const names = 3;
  const img = createRgba(cell * names, cell);
  const rect = (x0: number, y0: number, w: number, h: number, c: Rgb) => {
    for (let y = y0; y < y0 + h; y += 1) for (let x = x0; x < x0 + w; x += 1) img.data.set([c[0], c[1], c[2], 255], (y * img.width + x) * 4);
  };
  rect(5, 12, 22, 17, [150, 104, 56]); rect(5, 12, 22, 2, [196, 150, 90]); rect(5, 19, 22, 2, [110, 74, 40]); rect(14, 12, 4, 17, [110, 74, 40]);
  rect(cell + 8, 8, 16, 21, [128, 84, 44]); rect(cell + 7, 13, 18, 2, [70, 70, 80]); rect(cell + 7, 22, 18, 2, [70, 70, 80]); rect(cell + 10, 7, 12, 2, [170, 120, 70]);
  rect(2 * cell + 14, 14, 4, 15, [110, 74, 40]); rect(2 * cell + 5, 6, 22, 9, [170, 124, 70]); rect(2 * cell + 8, 9, 16, 1, [90, 60, 30]); rect(2 * cell + 8, 12, 10, 1, [90, 60, 30]);
  return img;
}

function terrainMap(): { map: RgbaImage; drape: RgbaImage } {
  const size = 128;
  const noise = periodicNoise(21);
  const drape = createRgba(size, size);
  for (let y = 0; y < size; y += 1)
    for (let x = 0; x < size; x += 1) {
      const d = Math.hypot(x - 64, y - 64) / 60 + noise(x / size, y / size) * 0.28;
      const c: Rgb = d > 1 ? [44, 100, 170] : d > 0.88 ? [214, 196, 140] : d > 0.4 ? mix([64, 130, 62], [100, 160, 70], noise((x / size * 3) % 1, (y / size * 3) % 1) * 0.5 + 0.5) : [120, 122, 128];
      drape.data.set([c[0], c[1], c[2], 255], (y * size + x) * 4);
    }
  const cut = terrainToTiles(drape, 16, 16, 16, { pixel: true });
  const built = assembleTerrainTileset({ name: 'isle', tileSize: 16, projection: 'orthogonal', scheme: 'blob47' }, cut);
  const map = createRgba(16 * 16, 16 * 16);
  const cols = built.tsj.columns;
  for (let row = 0; row < 16; row += 1)
    for (let col = 0; col < 16; col += 1) {
      const id = cut.grid[row * 16 + col]!;
      const sx = (id % cols) * 16, sy = Math.floor(id / cols) * 16;
      for (let y = 0; y < 16; y += 1)
        for (let x = 0; x < 16; x += 1) {
          const s = ((sy + y) * built.sheet.width + sx + x) * 4, o = ((row * 16 + y) * map.width + col * 16 + x) * 4;
          for (let c = 0; c < 4; c += 1) map.data[o + c] = built.sheet.data[s + c]!;
        }
    }
  return { map, drape };
}

describe.skipIf(!OUT)('environment renders', () => {
  it('writes the shot assets', () => {
    mkdirSync(OUT!, { recursive: true });
    const built = assembleTileset(spec, bases());
    save('tileset.png', built.sheet);
    writeFileSync(join(OUT!, 'tileset.tsj'), JSON.stringify(built.tsj));
    save('autotile-demo.png', autotileDemo());
    save('kernel-autotile-blob47.png', resizeNearest(autotileDemo(), 14 * 32 * 2, 9 * 32 * 2));
    const iso = assembleTileset({ ...spec, projection: 'isometric' }, bases());
    save('tileset-iso.png', iso.sheet);
    save('kernel-isometric-tileset.png', resizeNearest(iso.sheet, iso.sheet.width * 2, iso.sheet.height * 2));
    save('iso-block.png', isoBlock(bases()[0]!.image));
    const layers = parallax();
    for (const l of layers) save(`layer-${l.name}.png`, l.image);
    const bgSpec = BackgroundSpecSchema.parse({ kind: 'background', name: 'Dusk', size: [1280, 360] });
    writeFileSync(join(OUT!, 'background.json'), JSON.stringify(buildBackgroundJson(bgSpec)));
    save('props.png', resizeNearest(props(), 96 * 3, 96));
    for (const [i, name] of ['crate', 'barrel', 'sign'].entries()) {
      const one = createRgba(32, 32);
      const sheet = props();
      for (let y = 0; y < 32; y += 1) for (let x = 0; x < 32; x += 1) for (let c = 0; c < 4; c += 1) one.data[(y * 32 + x) * 4 + c] = sheet.data[(y * sheet.width + i * 32 + x) * 4 + c]!;
      save(`prop-${name}.png`, one);
    }
    for (const id of ['grass', 'dirt', 'water', 'stone']) save(`base-${id}.png`, bases().find((b) => b.id === id)!.image);
    const { map, drape } = terrainMap();
    save('terrain-map.png', map);
    save('kernel-terrain-to-tiles.png', resizeNearest(map, 16 * 16 * 3, 16 * 16 * 3));
    save('terrain-drape.png', drape);
  });
});
