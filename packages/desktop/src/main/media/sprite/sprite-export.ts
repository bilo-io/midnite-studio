import { copyFile, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import {
  atlasPageImage,
  backgroundLayerFile,
  BackgroundJsonSchema,
  blitExtruded,
  buildBackgroundJson,
  buildSpriteAnimsJson,
  buildSpriteAtlasJson,
  composeFrame,
  createRgba,
  failure,
  ok,
  packRects,
  rgbaFromRaster,
  sheetFrames,
  SPRITE_NO_FRAMES,
  SPRITE_SPEC_FILE,
  spriteFramePath,
  spriteMultiPageWarning,
  spritePackExists,
  spriteSlug,
  trimFrame,
  type AtlasFrame,
  type GitOpResult,
  type RgbaImage,
  type SpriteAssetSpec,
  type SpriteClip,
  type SpriteExportResult,
  type SpriteFramesFile,
  type SpritePackOptions,
} from '@midnite/studio-shared';

import { decodePng, encodePngRgba8 } from '../png/png-codec';

/**
 * Phase 106 Theme G: packs a sheet's frames into `atlas.png` + `atlas.json` + `anims.json`.
 *
 * Each frame is read from `frames/`, composed as the previewer shows it (`flipped`, `anchorNudge`),
 * trimmed, and packed with MaxRects; the JSON is the dual-purpose Phaser/Aseprite atlas, or Phaser's
 * multiatlas when the frames overflow one page (with a warning: Aseprite tags are dropped).
 *
 * The pack is always written to the asset's own `export/` (what a game's asset bridge imports) and,
 * with `dest`, also as `<dest>/<name>.sprite/` with a copy of `sprite.json` for provenance. An existing
 * pack folder at `dest` is refused, never overwritten. Both are written to a temporary folder first
 * and renamed into place, so a failed export leaves nothing half-written.
 *
 * Every kind packs into its own folder (Themes H and I): a sheet or a prop sheet into `<name>.sprite/`
 * (a prop sheet has no `anims.json`), a tileset into `<name>.tileset/` (`tileset.png`, `tileset.tsj`, and
 * the `map.tmj` of a terrain-sourced one) and a background into `<name>.background/` (`layers/*.png`,
 * `background.json`). Maps add theirs with Theme J.
 */
export type ExportSpriteArgs = {
  /** Absolute asset folder. */
  dir: string;
  spec: SpriteAssetSpec;
  frames: SpriteFramesFile;
  pack: SpritePackOptions;
  /** Also write `<dest>/<name>.sprite/`. */
  dest?: string;
};

/** The folder suffix each kind exports as. */
const PACK_SUFFIX = { sheet: 'sprite', 'prop-sheet': 'sprite', tileset: 'tileset', background: 'background', map: 'map' } as const;

type Pack = { files: Map<string, Buffer>; frames: number; pages: number; warnings: string[] };

export const SPRITE_NO_PROPS = 'There are no props to pack yet. Generate some first.';
export const SPRITE_NO_TILESET = 'There is no tileset to export yet. Generate it first.';
export const SPRITE_NO_LAYERS = 'There are no background layers to export yet. Generate them first.';

const exists = (path: string): Promise<boolean> =>
  stat(path).then(
    () => true,
    () => false,
  );

const encode = (img: RgbaImage): Buffer => encodePngRgba8(new Uint8Array(img.data.buffer, img.data.byteOffset, img.data.byteLength), img.width, img.height);
const json = (value: unknown): Buffer => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
const yieldToLoop = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

/** The pack's files, in memory: name → bytes. */
export async function buildSpritePack(args: Omit<ExportSpriteArgs, 'dest'>): Promise<GitOpResult<Pack>> {
  const { spec } = args;
  switch (spec.kind) {
    case 'sheet':
      return buildSheetPack(args, spec);
    case 'prop-sheet':
      return buildPropsPack(args, spec);
    case 'tileset':
      return buildTilesetPack(args.dir);
    case 'background':
      return buildBackgroundPack(args.dir, spec);
    case 'map':
      return failure('Map export is not available yet.');
  }
}

async function buildSheetPack(args: Omit<ExportSpriteArgs, 'dest'>, spec: Extract<SpriteAssetSpec, { kind: 'sheet' }>): Promise<GitOpResult<Pack>> {
  const { dir, frames: file } = args;
  const planned = sheetFrames(spec, file);
  if (planned.length === 0) return failure(SPRITE_NO_FRAMES);

  const frames: AtlasFrame[] = [];
  const images = new Map<string, RgbaImage>();
  for (const [i, f] of planned.entries()) {
    let bytes: Buffer;
    try {
      bytes = await readFile(join(dir, spriteFramePath(f.clip, f.dir, f.n)));
    } catch {
      return failure(`Frame ${f.key} is listed but its PNG is missing.`);
    }
    const decoded = decodePng(bytes);
    if (!decoded.ok) return failure(`Frame ${f.key}: ${decoded.message}`);
    const trimmed = trimFrame(composeFrame(rgbaFromRaster(decoded.image), f.meta, spec.anchor.x));
    images.set(f.key, trimmed.image);
    frames.push({ name: f.key, clip: f.clip, dir: f.dir, spriteSourceSize: trimmed.spriteSourceSize, sourceSize: trimmed.sourceSize, trimmed: trimmed.trimmed });
    if (i % 16 === 15) await yieldToLoop();
  }

  const atlas = await packAtlas(frames, images, args.pack, spec.clips);
  if (!atlas.ok) return atlas;
  const { files, pages } = atlas.value;
  files.set('anims.json', json(buildSpriteAnimsJson(spriteSlug(spec.name), frames, spec.clips)));
  return ok({ files, frames: frames.length, pages, warnings: pages > 1 ? [spriteMultiPageWarning(pages)] : [] });
}

/** Packs `images` and writes `atlas.png` (or its pages) and `atlas.json`. */
async function packAtlas(
  frames: readonly AtlasFrame[],
  images: ReadonlyMap<string, RgbaImage>,
  options: SpritePackOptions,
  clips: SpriteClip[],
): Promise<GitOpResult<{ files: Map<string, Buffer>; pages: number }>> {
  let packed;
  try {
    packed = packRects(
      frames.map((f) => ({ key: f.name, w: f.spriteSourceSize.w, h: f.spriteSourceSize.h })),
      options,
    );
  } catch (error) {
    return failure(error instanceof Error ? error.message : String(error));
  }
  const files = new Map<string, Buffer>();
  const pages = packed.pages.length;
  for (const [i, page] of packed.pages.entries()) {
    const canvas = createRgba(page.w, page.h);
    for (const p of page.placements) blitExtruded(canvas, images.get(p.key)!, p.x, p.y, options.extrude);
    files.set(atlasPageImage(i, pages), encode(canvas));
    await yieldToLoop();
  }
  files.set('atlas.json', json(buildSpriteAtlasJson(frames, packed, clips)));
  return ok({ files, pages });
}

/** A prop sheet: every prop is one frame, named for the prop, packed like a sheet's — with no clips and no `anims.json`. */
async function buildPropsPack(args: Omit<ExportSpriteArgs, 'dest'>, spec: Extract<SpriteAssetSpec, { kind: 'prop-sheet' }>): Promise<GitOpResult<Pack>> {
  const frames: AtlasFrame[] = [];
  const images = new Map<string, RgbaImage>();
  for (const prop of spec.props) {
    const bytes = await readFile(join(args.dir, `props/${prop.name}/000.png`)).catch(() => null);
    if (!bytes) continue;
    const decoded = decodePng(bytes);
    if (!decoded.ok) return failure(`Prop ${prop.name}: ${decoded.message}`);
    const trimmed = trimFrame(rgbaFromRaster(decoded.image));
    images.set(prop.name, trimmed.image);
    frames.push({ name: prop.name, clip: 'props', dir: '', spriteSourceSize: trimmed.spriteSourceSize, sourceSize: trimmed.sourceSize, trimmed: trimmed.trimmed });
  }
  if (frames.length === 0) return failure(SPRITE_NO_PROPS);
  const atlas = await packAtlas(frames, images, args.pack, []);
  if (!atlas.ok) return atlas;
  const { files, pages } = atlas.value;
  // A prop atlas has no animations: the tags the shared builder derives from the frame names are dropped.
  const atlasJson = JSON.parse(files.get('atlas.json')!.toString('utf8')) as { meta?: { frameTags?: unknown } };
  if (atlasJson.meta?.frameTags) atlasJson.meta.frameTags = [];
  files.set('atlas.json', json(atlasJson));
  return ok({ files, frames: frames.length, pages, warnings: pages > 1 ? [spriteMultiPageWarning(pages)].map((w) => w.replace(' Aseprite tags omitted.', '')) : [] });
}

/** `tileset.png` and `tileset.tsj` as the job wrote them, plus `map.tmj` for a terrain-sourced tileset. */
async function buildTilesetPack(dir: string): Promise<GitOpResult<Pack>> {
  const files = new Map<string, Buffer>();
  for (const name of ['tileset.png', 'tileset.tsj']) {
    const bytes = await readFile(join(dir, name)).catch(() => null);
    if (!bytes) return failure(SPRITE_NO_TILESET);
    files.set(name, bytes);
  }
  const tmj = await readFile(join(dir, 'map.tmj')).catch(() => null);
  if (tmj) files.set('map.tmj', tmj);
  const tiles = (JSON.parse(files.get('tileset.tsj')!.toString('utf8')) as { tilecount?: number }).tilecount ?? 0;
  return ok({ files, frames: tiles, pages: 1, warnings: [] });
}

/** The layer PNGs the spec lists, and `background.json` rebuilt from the spec (so a renamed layer never lingers). */
async function buildBackgroundPack(dir: string, spec: Extract<SpriteAssetSpec, { kind: 'background' }>): Promise<GitOpResult<Pack>> {
  const files = new Map<string, Buffer>();
  for (const layer of spec.layers) {
    const bytes = await readFile(join(dir, backgroundLayerFile(layer.name))).catch(() => null);
    if (!bytes) return failure(SPRITE_NO_LAYERS);
    files.set(backgroundLayerFile(layer.name), bytes);
  }
  files.set('background.json', json(BackgroundJsonSchema.parse(buildBackgroundJson(spec))));
  return ok({ files, frames: spec.layers.length, pages: 1, warnings: [] });
}

class PackExistsError extends Error {}

/** Writes `files` into a temporary sibling, then renames it to `target` (replacing it only when `replace`). */
async function writeFolder(target: string, files: Map<string, Buffer>, replace: boolean, extra?: { from: string; name: string }): Promise<number> {
  const tmp = `${target}.tmp-${process.pid}-${Date.now()}`;
  await mkdir(tmp, { recursive: true });
  let bytes = 0;
  try {
    for (const [name, data] of files) {
      await mkdir(dirname(join(tmp, name)), { recursive: true });
      await writeFile(join(tmp, name), data);
      bytes += data.length;
    }
    if (extra) {
      await copyFile(extra.from, join(tmp, extra.name));
      bytes += (await stat(join(tmp, extra.name))).size;
    }
    if (replace) await rm(target, { recursive: true, force: true });
    else if (await exists(target)) throw new PackExistsError();
    await rename(tmp, target);
  } catch (error) {
    await rm(tmp, { recursive: true, force: true });
    throw error;
  }
  return bytes;
}

export async function exportSprite(args: ExportSpriteArgs): Promise<GitOpResult<SpriteExportResult>> {
  try {
    const name = `${spriteSlug(args.spec.name)}.${PACK_SUFFIX[args.spec.kind]}`;
    const target = args.dest ? join(args.dest, name) : null;
    if (target && (await exists(target))) return failure(spritePackExists(name));
    const built = await buildSpritePack(args);
    if (!built.ok) return built;
    const { files, frames, pages, warnings } = built.value;
    const local = await writeFolder(join(args.dir, 'export'), files, true);
    if (!target) return ok({ path: join(args.dir, 'export'), bytes: local, frames, pages, warnings });
    await mkdir(args.dest!, { recursive: true });
    const bytes = await writeFolder(target, files, false, { from: join(args.dir, SPRITE_SPEC_FILE), name: SPRITE_SPEC_FILE });
    return ok({ path: target, bytes, frames, pages, warnings });
  } catch (error) {
    if (error instanceof PackExistsError) return failure(spritePackExists(`${spriteSlug(args.spec.name)}.${PACK_SUFFIX[args.spec.kind]}`));
    return failure(error instanceof Error ? error.message : String(error));
  }
}
