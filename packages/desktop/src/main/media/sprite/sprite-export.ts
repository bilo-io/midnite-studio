import { copyFile, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  atlasPageImage,
  blitExtruded,
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
 * Only sheets pack today; tilesets, backgrounds, prop sheets and maps add their files with Themes H–J.
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

const KIND_LABEL: Record<Exclude<SpriteAssetSpec['kind'], 'sheet'>, string> = {
  tileset: 'Tileset',
  background: 'Background',
  'prop-sheet': 'Prop sheet',
  map: 'Map',
};

const exists = (path: string): Promise<boolean> =>
  stat(path).then(
    () => true,
    () => false,
  );

const encode = (img: RgbaImage): Buffer => encodePngRgba8(new Uint8Array(img.data.buffer, img.data.byteOffset, img.data.byteLength), img.width, img.height);
const json = (value: unknown): Buffer => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
const yieldToLoop = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

/** The pack's files, in memory: name → bytes. */
export async function buildSpritePack(args: Omit<ExportSpriteArgs, 'dest'>): Promise<GitOpResult<{ files: Map<string, Buffer>; frames: number; pages: number; warnings: string[] }>> {
  const { dir, spec, frames: file } = args;
  if (spec.kind !== 'sheet') return failure(`${KIND_LABEL[spec.kind]} export is not available yet.`);
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

  let packed;
  try {
    packed = packRects(
      frames.map((f) => ({ key: f.name, w: f.spriteSourceSize.w, h: f.spriteSourceSize.h })),
      args.pack,
    );
  } catch (error) {
    return failure(error instanceof Error ? error.message : String(error));
  }

  const files = new Map<string, Buffer>();
  const pages = packed.pages.length;
  for (const [i, page] of packed.pages.entries()) {
    const canvas = createRgba(page.w, page.h);
    for (const p of page.placements) blitExtruded(canvas, images.get(p.key)!, p.x, p.y, args.pack.extrude);
    files.set(atlasPageImage(i, pages), encode(canvas));
    await yieldToLoop();
  }
  files.set('atlas.json', json(buildSpriteAtlasJson(frames, packed, spec.clips)));
  files.set('anims.json', json(buildSpriteAnimsJson(spriteSlug(spec.name), frames, spec.clips)));
  return ok({ files, frames: frames.length, pages, warnings: pages > 1 ? [spriteMultiPageWarning(pages)] : [] });
}

class PackExistsError extends Error {}

/** Writes `files` into a temporary sibling, then renames it to `target` (replacing it only when `replace`). */
async function writeFolder(target: string, files: Map<string, Buffer>, replace: boolean, extra?: { from: string; name: string }): Promise<number> {
  const tmp = `${target}.tmp-${process.pid}-${Date.now()}`;
  await mkdir(tmp, { recursive: true });
  let bytes = 0;
  try {
    for (const [name, data] of files) {
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
    const name = `${spriteSlug(args.spec.name)}.sprite`;
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
    if (error instanceof PackExistsError) return failure(spritePackExists(`${spriteSlug(args.spec.name)}.sprite`));
    return failure(error instanceof Error ? error.message : String(error));
  }
}
