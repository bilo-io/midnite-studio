import { encodePngRgba8 } from '@midnite/studio-runtime';

/**
 * The 2D starters' tile palette (Phase 132 Theme F, Decision 18). Each starter's `levels/level.tmj` embeds a tileset
 * whose `image` is `palette.png`, but that PNG is never committed: it is drawn here, from code, whenever a 2D starter
 * is composed, so a scaffolded game gets it and the template tree holds no binary for it. The tileset in the `.tmj`
 * (`tilewidth` 32, nine tiles in a row, a `kind` property on each) and this list describe the same image;
 * `starter-levels.test.ts` pins the two together.
 */
export const PALETTE_FILE = 'palette.png';
export const PALETTE_TILE = 32;

/** One flat tile per kind, in tile-id order. The ninth is a second wall: the raycaster's wall ids run 1 to 9. */
export const PALETTE_KINDS = [
  { kind: 'ground', color: [0x5b, 0x65, 0x77] },
  { kind: 'ledge', color: [0x9a, 0x6b, 0x3f] },
  { kind: 'oneway', color: [0xd1, 0xa2, 0x62] },
  { kind: 'wall', color: [0x8a, 0x5a, 0x48] },
  { kind: 'door', color: [0x3b, 0x82, 0xf6] },
  { kind: 'water', color: [0x2a, 0x6f, 0xb8] },
  { kind: 'hazard', color: [0xe5, 0x48, 0x4d] },
  { kind: 'decor', color: [0x4c, 0xa5, 0x6a] },
  { kind: 'wall', color: [0x6d, 0x5f, 0x8a] },
] as const;

/** The palette image: `PALETTE_KINDS.length` flat tiles of 32 px in a row, each with a 1 px darker edge so cells read. */
export function encodePalettePng(): Buffer {
  const width = PALETTE_KINDS.length * PALETTE_TILE;
  const height = PALETTE_TILE;
  const data = new Uint8Array(width * height * 4);
  PALETTE_KINDS.forEach(({ color }, index) => {
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < PALETTE_TILE; x += 1) {
        const edge = x === 0 || y === 0 || x === PALETTE_TILE - 1 || y === height - 1;
        const at = (y * width + index * PALETTE_TILE + x) * 4;
        for (let c = 0; c < 3; c += 1) data[at + c] = edge ? Math.round((color[c] ?? 0) * 0.78) : (color[c] ?? 0);
        data[at + 3] = 255;
      }
    }
  });
  return encodePngRgba8(data, width, height);
}
