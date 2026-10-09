import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  backgroundLayerFile,
  clipFrames,
  composeFrame,
  createRgba,
  readTmj,
  renderTiledMap,
  resizeArea,
  resizeNearest,
  rgbaFromRaster,
  spriteFramePath,
  spriteSheetDirections,
  type RgbaImage,
  type RgbaLike,
  type SpriteAssetSpec,
  type SpriteFramesFile,
} from '@midnite/studio-shared';

import { encodeApng } from '../png/apng';
import { decodePng, encodePngRgba8 } from '../png/png-codec';

/**
 * The pictures `sprite_render_preview` answers with (Phase 106 Theme K) — what lets an agent *see* an
 * asset instead of reading numbers:
 *
 * - a sheet: one contact sheet per clip (≤ 8 columns, frames in reading order, composed as they play —
 *   flipped and nudged — on a checker), plus with `animate` one APNG of that clip at its fps;
 * - a tileset: `tileset.png`; a background: the layers composited back to front; a prop sheet: its props
 *   on a checker; a map: `map.tmj` drawn with its tilesets.
 *
 * Small pixel art is enlarged with nearest-neighbour so a 16 px frame is legible; anything wider than
 * {@link PREVIEW_MAX_WIDTH} is scaled down. Nothing here reads outside the asset folder.
 */
export const PREVIEW_MAX_WIDTH = 1024;
export const CONTACT_COLUMNS = 8;
/** Frames are enlarged until about this many pixels across, at most 4×. */
const LEGIBLE = 96;

export type PreviewPicture = { label: string; png: Buffer; mimeType: 'image/png' };
export type PreviewResult = { pictures: PreviewPicture[]; notes: string[] };

const encode = (img: RgbaImage): Buffer => encodePngRgba8(new Uint8Array(img.data.buffer, img.data.byteOffset, img.data.byteLength), img.width, img.height);

async function readImage(path: string): Promise<RgbaImage | null> {
  const bytes = await readFile(path).catch(() => null);
  if (!bytes) return null;
  const decoded = decodePng(bytes);
  return decoded.ok ? rgbaFromRaster(decoded.image) : null;
}

/** Draws `src` over `dst` at (ox, oy), alpha-over. */
function over(dst: RgbaImage, src: RgbaLike, ox: number, oy: number): void {
  for (let y = 0; y < src.height; y += 1) {
    const ty = oy + y;
    if (ty < 0 || ty >= dst.height) continue;
    for (let x = 0; x < src.width; x += 1) {
      const tx = ox + x;
      if (tx < 0 || tx >= dst.width) continue;
      const s = (y * src.width + x) * 4, d = (ty * dst.width + tx) * 4;
      const a = src.data[s + 3]! / 255;
      if (a === 0) continue;
      const da = dst.data[d + 3]! / 255;
      const outA = a + da * (1 - a);
      for (let c = 0; c < 3; c += 1) dst.data[d + c] = Math.round((src.data[s + c]! * a + dst.data[d + c]! * da * (1 - a)) / Math.max(outA, 1e-6));
      dst.data[d + 3] = Math.round(outA * 255);
    }
  }
}

function checker(width: number, height: number, cell = 8): RgbaImage {
  const img = createRgba(width, height);
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      const v = (Math.floor(x / cell) + Math.floor(y / cell)) % 2 === 0 ? 205 : 160;
      img.data.set([v, v, v, 255], (y * width + x) * 4);
    }
  return img;
}

const enlarge = (w: number, h: number): number => Math.max(1, Math.min(4, Math.floor(LEGIBLE / Math.max(w, h))));

/** Scaled down to {@link PREVIEW_MAX_WIDTH} when wider. */
function capWidth(img: RgbaImage, max = PREVIEW_MAX_WIDTH): RgbaImage {
  if (img.width <= max) return img;
  return resizeArea(img, max, Math.max(1, Math.round((img.height * max) / img.width)));
}

/** `cells` laid out `columns` across on a checker, each `cell` px, enlarged by `scale`. */
export function contactSheet(cells: readonly RgbaLike[], cell: readonly [number, number], scale: number, columns = CONTACT_COLUMNS): RgbaImage {
  const cols = Math.max(1, Math.min(columns, cells.length));
  const rows = Math.max(1, Math.ceil(cells.length / cols));
  const cw = cell[0] * scale, ch = cell[1] * scale;
  const sheet = checker(cols * cw, rows * ch);
  cells.forEach((img, i) => over(sheet, scale === 1 ? img : resizeNearest(img, img.width * scale, img.height * scale), (i % cols) * cw, Math.floor(i / cols) * ch));
  return capWidth(sheet);
}

export async function renderSpritePreview(args: {
  dir: string;
  spec: SpriteAssetSpec;
  frames: SpriteFramesFile;
  clips?: readonly string[];
  direction?: string;
  animate?: string;
}): Promise<PreviewResult> {
  const { dir, spec } = args;
  const notes: string[] = [];
  const pictures: PreviewPicture[] = [];
  const add = (label: string, img: RgbaImage) => pictures.push({ label, png: encode(img), mimeType: 'image/png' });

  switch (spec.kind) {
    case 'sheet': {
      const dirs = spriteSheetDirections(spec);
      const direction = args.direction ?? dirs[0]!;
      if (!dirs.includes(direction)) notes.push(`This sheet has no direction "${direction}"; it has ${dirs.join(', ')}.`);
      const scale = enlarge(spec.frameSize[0], spec.frameSize[1]);
      const clips = spec.clips.filter((c) => !args.clips || args.clips.includes(c.name));
      const composed = async (clip: (typeof clips)[number]) => {
        const out: RgbaImage[] = [];
        for (const f of clipFrames(args.frames, clip, direction)) {
          const img = await readImage(join(dir, spriteFramePath(f.clip, f.dir, f.n)));
          if (img) out.push(composeFrame(img, f.meta, spec.anchor.x));
        }
        return out;
      };
      for (const clip of clips) {
        const cells = await composed(clip);
        if (cells.length === 0) {
          notes.push(`${clip.name}/${direction}: no frames yet.`);
          continue;
        }
        add(`${clip.name}/${direction}: ${cells.length} of ${clip.frames} frames, ${clip.fps} fps, ${clip.loop}`, contactSheet(cells, spec.frameSize, scale));
      }
      if (args.animate) {
        const clip = spec.clips.find((c) => c.name === args.animate);
        const cells = clip ? await composed(clip) : [];
        if (!clip) notes.push(`There is no clip "${args.animate}" to animate.`);
        else if (cells.length === 0) notes.push(`${clip.name}/${direction} has no frames to animate.`);
        else {
          const order = clip.loop === 'ping-pong' && cells.length > 2 ? [...cells, ...cells.slice(1, -1).reverse()] : cells;
          const w = spec.frameSize[0] * scale, h = spec.frameSize[1] * scale;
          const frames = order.map((img) => {
            const big = img.width === w && img.height === h ? img : resizeNearest(img, w, h);
            return { data: new Uint8Array(big.data.buffer, big.data.byteOffset, big.data.byteLength), delayMs: 1000 / clip.fps };
          });
          pictures.push({ label: `${clip.name}/${direction} animated (APNG, ${clip.fps} fps)`, png: encodeApng(frames, w, h), mimeType: 'image/png' });
        }
      }
      return { pictures, notes };
    }
    case 'tileset': {
      const img = await readImage(join(dir, 'tileset.png'));
      if (!img) return { pictures, notes: ['No tileset.png yet. Run tileset_generate and wait for the job.'] };
      const scale = enlarge(spec.tileSize, spec.tileSize) > 1 ? 2 : 1;
      add(`tileset.png: ${spec.terrains.length} terrains, ${spec.scheme}, ${spec.projection}`, capWidth(over2(checker(img.width * scale, img.height * scale), scale === 1 ? img : resizeNearest(img, img.width * scale, img.height * scale))));
      return { pictures, notes };
    }
    case 'background': {
      const [w, h] = spec.size;
      const canvas = createRgba(w, h);
      let found = 0;
      for (const layer of spec.layers) {
        const img = await readImage(join(dir, backgroundLayerFile(layer.name)));
        if (!img) continue;
        over(canvas, img.width === w && img.height === h ? img : resizeArea(img, w, h), 0, 0);
        found += 1;
      }
      if (found === 0) return { pictures, notes: ['No layers yet. Run background_generate and wait for the job.'] };
      add(`${spec.layers.map((l) => `${l.name} ×${l.scrollFactor}`).join(', ')} composited back to front`, capWidth(canvas, 768));
      return { pictures, notes };
    }
    case 'prop-sheet': {
      const cells: RgbaImage[] = [];
      for (const prop of spec.props) {
        const img = await readImage(join(dir, `props/${prop.name}/000.png`));
        if (img) cells.push(img);
      }
      if (cells.length === 0) return { pictures, notes: ['No props drawn yet. Run sprite_generate on this prop sheet.'] };
      add(`${cells.length} props: ${spec.props.map((p) => p.name).join(', ')}`, contactSheet(cells, spec.cell, enlarge(spec.cell[0], spec.cell[1])));
      return { pictures, notes };
    }
    case 'map': {
      const raw = await readFile(join(dir, 'map.tmj'), 'utf8').catch(() => null);
      const map = raw ? readTmj(JSON.parse(raw)) : null;
      if (!map) return { pictures, notes: ['No map.tmj yet. Run map_generate and wait for the job.'] };
      const images = new Map<string, RgbaImage>();
      for (const t of map.tilesets) {
        const img = await readImage(join(dir, t.image));
        if (img) images.set(t.image, img);
      }
      add(`${map.width} × ${map.height} ${map.orientation} map: ground, decoration and objects`, capWidth(renderTiledMap(map, images)));
      return { pictures, notes };
    }
  }
}

function over2(dst: RgbaImage, src: RgbaLike): RgbaImage {
  over(dst, src, 0, 0);
  return dst;
}
