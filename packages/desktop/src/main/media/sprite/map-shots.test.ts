import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  assembleTileset,
  collisionTilesImage,
  createRgba,
  fillMap,
  MapSpecSchema,
  periodicNoise,
  propsTileset,
  readTmj,
  renderTiledMap,
  stackTiles,
  TilesetSpecSchema,
  type RgbaImage,
} from '@midnite/studio-shared';
import { describe, it } from 'vitest';

import { encodePngRgba8 } from '../png/png-codec';

/**
 * Renders a real Theme J map — layout → fill → autotile → decorations → collision → `.tmj` — to files
 * for the PR's screenshots: `map.tmj`, `tileset.png`, `collision.png`, `props.png`, and the map drawn by
 * `renderTiledMap` (what `sprite_render_preview` returns). The base textures and props are procedural
 * stand-ins for generated ones; everything after them is the shipped kernel. Skipped unless
 * `MSTUDIO_SHOTS_ASSETS` names an output folder.
 */
const OUT = process.env['MSTUDIO_SHOTS_ASSETS'];
const png = (img: RgbaImage): Buffer => encodePngRgba8(new Uint8Array(img.data.buffer, img.data.byteOffset, img.data.byteLength), img.width, img.height);

type Rgb = readonly [number, number, number];
function texture(size: number, seed: number, dark: Rgb, light: Rgb): RgbaImage {
  const n1 = periodicNoise(seed), n2 = periodicNoise(seed + 7);
  const img = createRgba(size, size);
  for (let y = 0; y < size; y += 1)
    for (let x = 0; x < size; x += 1) {
      const v = Math.min(1, Math.max(0, 0.5 + 0.35 * n1(x / size, y / size) + 0.15 * n2(((x * 2) / size) % 1, ((y * 2) / size) % 1)));
      img.data.set([dark[0] + (light[0] - dark[0]) * v, dark[1] + (light[1] - dark[1]) * v, dark[2] + (light[2] - dark[2]) * v, 255], (y * size + x) * 4);
    }
  return img;
}

function prop(size: number, body: Rgb, accent: Rgb, round: boolean): RgbaImage {
  const img = createRgba(size, size);
  for (let y = 0; y < size; y += 1)
    for (let x = 0; x < size; x += 1) {
      const dx = x - size / 2 + 0.5, dy = y - size / 2 - 2;
      const inside = round ? dx * dx + dy * dy < (size * 0.34) ** 2 : Math.abs(dx) < size * 0.32 && y > size * 0.3 && y < size - 2;
      if (!inside) continue;
      const edge = round ? dx * dx + dy * dy > (size * 0.28) ** 2 : Math.abs(dx) > size * 0.26 || y < size * 0.36 || y > size - 5 || Math.abs(y - size * 0.65) < 1;
      const c = edge ? accent : body;
      img.data.set([c[0], c[1], c[2], 255], (y * size + x) * 4);
    }
  return img;
}

describe.skipIf(!OUT)('map shot assets (Phase 106 Theme J)', () => {
  it('writes a generated island map and its images', () => {
    mkdirSync(OUT!, { recursive: true });
    const S = 16;
    const spec = TilesetSpecSchema.parse({
      kind: 'tileset',
      name: 'meadow',
      style: 'pixel',
      tileSize: S,
      terrains: [
        { id: 'grass', label: 'Grass', collision: 'walkable' },
        { id: 'dirt', label: 'Dirt', collision: 'walkable' },
        { id: 'water', label: 'Water', collision: 'water' },
        { id: 'stone', label: 'Stone', collision: 'solid' },
      ],
      transitions: [{ a: 'grass', b: 'dirt' }, { a: 'grass', b: 'water' }, { a: 'grass', b: 'stone' }],
    });
    const bases = [
      texture(S, 3, [52, 120, 48], [96, 168, 70]),
      texture(S, 5, [128, 92, 60], [176, 136, 92]),
      texture(S, 9, [30, 90, 160], [70, 150, 210]),
      texture(S, 11, [100, 100, 110], [160, 160, 170]),
    ];
    const built = assembleTileset(spec, spec.terrains.map((t, i) => ({ id: t.id, collision: t.collision, image: bases[i]! })));
    const props = [prop(S, [150, 100, 50], [90, 60, 30], false), prop(S, [40, 130, 40], [20, 80, 20], true), prop(S, [170, 170, 175], [110, 110, 120], true)];
    const sheet = stackTiles(props.map((image) => ({ image })), S, S, 8);
    const propTs = propsTileset(['crate', 'bush', 'rock'], [S, S], sheet.columns, sheet.image);

    const layout = MapSpecSchema.parse({
      width: 40,
      height: 26,
      base: 'grass',
      regions: [
        { terrain: 'water', shape: 'ellipse', points: [[29, 8], [7, 5]] },
        { terrain: 'stone', shape: 'polygon', points: [[2, 17], [9, 15], [12, 22], [4, 24]] },
        { terrain: 'water', shape: 'rect', points: [[0, 0], [39, 1]] },
      ],
      rooms: [{ x: 15, y: 15, w: 8, h: 6, terrain: 'dirt' }],
      corridors: [{ from: [19, 15], to: [27, 13], width: 2, terrain: 'dirt' }],
      paths: [{ points: [[2, 4], [12, 6], [19, 15]], terrain: 'dirt' }],
      objects: [
        { type: 'spawn', name: 'player', x: 3, y: 5 },
        { type: 'exit', name: 'dock', x: 22, y: 8 },
        { type: 'point', name: 'camp', x: 19, y: 18 },
      ],
    });
    const filled = fillMap(layout, { spec, tsj: built.tsj }, 4, { tsj: propTs, density: 0.25 });
    writeFileSync(join(OUT!, 'map.tmj'), JSON.stringify(filled.tmj));
    writeFileSync(join(OUT!, 'tileset.png'), png(built.sheet));
    writeFileSync(join(OUT!, 'props.png'), png(sheet.image));
    writeFileSync(join(OUT!, 'collision.png'), png(collisionTilesImage(S, S)));
    const drawn = renderTiledMap(readTmj(filled.tmj)!, new Map([['tileset.png', built.sheet], ['props.png', sheet.image], ['collision.png', collisionTilesImage(S, S)]]));
    writeFileSync(join(OUT!, 'map-rendered.png'), png(drawn));
  });
});
