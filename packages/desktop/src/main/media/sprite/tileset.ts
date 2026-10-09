import {
  assembleTerrainTileset,
  assembleTileset,
  ensureSeamless,
  handDrawnProvider,
  mapToPalette,
  medianCut,
  rgbaFromRaster,
  resizeArea,
  resizeNearest,
  SPRITE_DEFAULT_PALETTE_SIZE,
  TERRAIN_ISO_FLAT_NOTE,
  terrainGridBlocker,
  terrainTileGrid,
  terrainToTiles,
  terrainUniqueBlocker,
  tileablePrompt,
  tilesetBlocker,
  type GitOpResult,
  type RgbaImage,
  type SpriteAssetSpec,
  type SpriteGenerateRequest,
  type TilesetBase,
  type TilesetSpec,
} from '@midnite/studio-shared';

import type { ImageBytesRequest } from '../image/image-service';
import type { GeneratedImage } from '../image/types';
import { decodePng, encodePngRgba8 } from '../png/png-codec';
import { decodeFrame, type FrameTranscode } from './frame-pipeline';
import type { SpriteJobContext, SpriteJobRunner } from './sprite-service';

/**
 * Phase 106 Theme H: the tileset frame source, and Theme I's terrain-to-tiles source.
 *
 * **Generated tilesets.** Each terrain's base tile is one image request (`tileablePrompt`: seamless,
 * tileable, top-down), downsampled to the tile size (nearest-neighbour in pixel style, area-averaged
 * otherwise) and seam-checked: a tile that fails `seamScore` is repaired with a cross-fade, and one still
 * failing is drawn once more and the better of the two is kept, with a `seam` warning on the job. In pixel
 * style one palette is fitted over every base. Transitions are then **composited, not generated**
 * (`assembleTileset`), so every edge matches by construction; nothing but the bases costs a request.
 *
 * **From a terrain.** A Phase 105 terrain's `build/drape.png` (the splat bake when it has none) is cut
 * into a grid, deduped, and written as a tileset plus the `map.tmj` that lays it out.
 *
 * Files written beside `sprite.json`: `terrains/<id>.png` (the bases), `terrains/seams.json`,
 * `tileset.png`, `tileset.tsj` and, from a terrain, `map.tmj`.
 */
export const TERRAIN_SEAMS_FILE = 'terrains/seams.json';
/** Re-draws of a base tile that fails the seam check even after repair. */
export const SEAM_REDRAWS = 1;

/** What the job needs of a Phase 105 terrain, already read. */
export type TerrainSource = {
  /** Metres along one side. */
  worldSize: number;
  /** `build/drape.png`, or the splat bake. */
  drape: Uint8Array;
  /** `build/landcover.png` (grey class indices), when there is one. */
  landcover: Uint8Array | null;
};

export type EnvironmentDeps = {
  generateImage: (req: ImageBytesRequest) => Promise<GitOpResult<GeneratedImage>>;
  toPng: FrameTranscode;
  /** Reads a terrain's build products, or says why it cannot. */
  readTerrain: (target: { repoId: string; project: string; terrain: string }) => Promise<GitOpResult<TerrainSource>>;
  now?: () => Date;
};

export const encodeImage = (img: RgbaImage): Buffer => encodePngRgba8(new Uint8Array(img.data.buffer, img.data.byteOffset, img.data.byteLength), img.width, img.height);
const json = (value: unknown): Buffer => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');

/** Refuses a job up front: an unbuildable spec, or a terrain grid that is too large. */
export function tilesetPreflight(spec: SpriteAssetSpec, req: Pick<SpriteGenerateRequest, 'turnaround'>): string | null {
  if (spec.kind !== 'tileset' || req.turnaround) return null;
  return tilesetBlocker(spec);
}

/** The error text of a failed `GitOpResult`. */
export const failureMessage = (result: Extract<GitOpResult<unknown>, { ok: false }>): string => (result.kind === 'error' ? result.message : 'The image request failed.');

export async function reportOf(ctx: SpriteJobContext, deps: Pick<EnvironmentDeps, 'now'>, frames: number, failing: number): Promise<void> {
  const at = (deps.now?.() ?? new Date()).toISOString();
  await ctx.updateAsset((current) => ({ ...current, lastReport: { frames, failing, at } }) as SpriteAssetSpec);
}

type Seam = { score: number; repaired: boolean; passes: boolean; attempts: number };

/** One terrain's base tile: drawn, downsampled, seam-checked and, if need be, drawn again. */
async function drawBase(ctx: SpriteJobContext, deps: EnvironmentDeps, spec: TilesetSpec, terrain: TilesetSpec['terrains'][number], count: () => void): Promise<{ image: RgbaImage; seam: Seam }> {
  const { provider, model } = handDrawnProvider(spec);
  const pixel = spec.style === 'pixel';
  const prompt = tileablePrompt(spec, terrain);
  let best: { image: RgbaImage; seam: Seam } | null = null;
  for (let attempt = 1; attempt <= 1 + SEAM_REDRAWS; attempt += 1) {
    if (ctx.signal.aborted) throw new Error('cancelled');
    count();
    const result = await deps.generateImage({ provider, model, prompt, aspect: '1:1', signal: ctx.signal });
    if (!result.ok) throw new Error(failureMessage(result));
    const drawn = await decodeFrame(result.value.bytes, deps.toPng);
    const small = pixel ? resizeNearest(drawn, spec.tileSize, spec.tileSize) : resizeArea(drawn, spec.tileSize, spec.tileSize);
    const checked = ensureSeamless(small, 'xy');
    const seam = { score: checked.score, repaired: checked.repaired, passes: checked.passes, attempts: attempt };
    if (!best || checked.score < best.seam.score) best = { image: checked.image, seam };
    if (best.seam.passes) break;
  }
  return best!;
}

/** Concurrent base requests, at most: tiles are cheap, providers are rate limited. */
const IN_FLIGHT = 2;

export function createTilesetRunner(deps: EnvironmentDeps): SpriteJobRunner {
  return async (ctx) => {
    const spec = ctx.spec;
    if (spec.kind !== 'tileset') throw new Error('Only a tileset is built here.');
    const blocked = tilesetBlocker(spec);
    if (blocked) throw new Error(blocked);
    if (spec.fromTerrain) return fromTerrain(ctx, deps, spec);

    const total = spec.terrains.length + 1;
    const drawn = new Map<string, { image: RgbaImage; seam: Seam }>();
    let done = 0;
    const queue = [...spec.terrains];
    const worker = async (): Promise<void> => {
      for (let terrain = queue.shift(); terrain; terrain = queue.shift()) {
        ctx.progress({ done, total, stage: 'generating', frame: terrain.id });
        drawn.set(terrain.id, await drawBase(ctx, deps, spec, terrain, () => ctx.countRequest()));
        done += 1;
      }
    };
    await Promise.all(Array.from({ length: Math.min(IN_FLIGHT, queue.length) }, worker));
    if (ctx.signal.aborted) throw new Error('cancelled');

    let images = spec.terrains.map((t) => drawn.get(t.id)!.image);
    if (spec.style === 'pixel') {
      ctx.progress({ done, total, stage: 'processing' });
      const fixed = spec.palette && 'colours' in spec.palette ? spec.palette.colours : undefined;
      const size = spec.palette && 'size' in spec.palette ? spec.palette.size : SPRITE_DEFAULT_PALETTE_SIZE;
      const colours = fixed ?? medianCut(images.map((i) => i.data), size);
      images = images.map((i) => mapToPalette(i, colours));
      if (!fixed) await ctx.updateAsset((current) => (current.kind === 'tileset' ? { ...current, palette: { colours } } : current));
    }

    const bases: TilesetBase[] = spec.terrains.map((t, i) => ({ id: t.id, collision: t.collision, image: images[i]! }));
    for (const base of bases) await ctx.writeAssetFile(`terrains/${base.id}.png`, encodeImage(base.image));
    await ctx.writeAssetFile(TERRAIN_SEAMS_FILE, json(Object.fromEntries(spec.terrains.map((t) => [t.id, drawn.get(t.id)!.seam]))));

    ctx.progress({ done, total, stage: 'packing' });
    const built = assembleTileset(spec, bases);
    await ctx.writeAssetFile('tileset.png', encodeImage(built.sheet));
    await ctx.writeAssetFile('tileset.tsj', json(built.tsj));

    const failing = spec.terrains.filter((t) => !drawn.get(t.id)!.seam.passes);
    if (failing.length > 0) ctx.note(`Seam warning: ${failing.map((t) => t.label).join(', ')} still show a seam after repair.`);
    await reportOf(ctx, deps, built.tiles.length, failing.length);
    ctx.progress({ done: total, total, stage: 'packing' });
  };
}

/** A terrain's drape (PNG bytes) as RGBA. */
function decodeRgba(bytes: Uint8Array): RgbaImage {
  const decoded = decodePng(bytes);
  if (!decoded.ok) throw new Error(decoded.message);
  return rgbaFromRaster(decoded.image);
}

async function fromTerrain(ctx: SpriteJobContext, deps: EnvironmentDeps, spec: TilesetSpec): Promise<void> {
  const source = spec.fromTerrain!;
  const total = 3;
  ctx.progress({ done: 0, total, stage: 'processing', frame: source.terrain });
  const read = await deps.readTerrain({ repoId: ctx.target.repoId, project: source.project, terrain: source.terrain });
  if (!read.ok) throw new Error(read.kind === 'error' ? read.message : 'Could not read the terrain.');
  const terrain = read.value;

  const grid = terrainGridBlocker(terrain.worldSize, source.metresPerTile);
  if (grid) throw new Error(grid);
  const side = terrainTileGrid(terrain.worldSize, source.metresPerTile);

  const drape = decodeRgba(terrain.drape);
  let classes: Uint8Array | null = null;
  let res = 0;
  if (terrain.landcover) {
    const land = decodePng(terrain.landcover);
    if (land.ok) {
      classes = Uint8Array.from(land.image.data, (v) => v);
      res = land.image.width;
    }
  }
  if (ctx.signal.aborted) throw new Error('cancelled');
  const cut = terrainToTiles(drape, side, side, spec.tileSize, { classes, res, pixel: spec.style === 'pixel' });
  const tooMany = terrainUniqueBlocker(cut.tiles.length);
  if (tooMany) throw new Error(tooMany);

  ctx.progress({ done: 1, total, stage: 'packing' });
  const built = assembleTerrainTileset(spec, cut);
  await ctx.writeAssetFile('tileset.png', encodeImage(built.sheet));
  await ctx.writeAssetFile('tileset.tsj', json(built.tsj));
  await ctx.writeAssetFile('map.tmj', json(built.tmj));
  if (spec.projection === 'isometric') ctx.note(TERRAIN_ISO_FLAT_NOTE);
  await reportOf(ctx, deps, built.tileCount, 0);
  ctx.progress({ done: total, total, stage: 'packing' });
}
