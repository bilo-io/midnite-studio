import { z } from 'zod';

import type { SpriteClip } from '../media-sprite';
import type { PackResult, SpriteSourceSize } from './pack';

/**
 * The files a sprite pack ships (Phase 106 Theme G, Decisions 3 and 4):
 *
 * - **`atlas.json`** is Phaser's JSON-hash atlas *and* an Aseprite JSON export at once. Phaser's
 *   `load.atlas` reads `frames` and ignores the rest; `load.aseprite` + `anims.createFromAseprite`
 *   and Aseprite itself also read each frame's `duration` and `meta.frameTags`. Frames are listed
 *   clip → direction → n, so each `<clip>/<dir>` tag's `from..to` is one contiguous run.
 * - When the frames overflow one page it is Phaser's **multiatlas** form instead (`textures[]`, one per
 *   `atlas-<i>.png`) and carries no frame tags — Aseprite cannot read a multi-page sheet.
 * - **`anims.json`** is Phaser's `AnimationManager.fromJSON` shape: one animation per clip and
 *   direction, keyed `<asset>/<clip>/<dir>`. `loop` → repeat −1, `once` → 0, `ping-pong` → −1 + yoyo.
 *   (Phaser's JSON-hash has no `anims` section; the x1 refinement corrected the doc.)
 *
 * The schemas below are written from Phaser's `JSONHash`/`MultiAtlas` parsers and Aseprite's export.
 */
const Rect = z.object({ x: z.number().int().min(0), y: z.number().int().min(0), w: z.number().int().positive(), h: z.number().int().positive() });
const Size = z.object({ w: z.number().int().positive(), h: z.number().int().positive() });

const FrameEntry = z.object({
  frame: Rect,
  rotated: z.literal(false),
  trimmed: z.boolean(),
  spriteSourceSize: Rect,
  sourceSize: Size,
  /** Milliseconds (Aseprite). */
  duration: z.number().int().positive(),
});

export const AsepriteFrameTagSchema = z.object({
  name: z.string().min(1),
  from: z.number().int().min(0),
  to: z.number().int().min(0),
  direction: z.enum(['forward', 'reverse', 'pingpong']),
});
export type AsepriteFrameTag = z.infer<typeof AsepriteFrameTagSchema>;

/** Phaser 3's JSON-hash atlas (`Textures.Parsers.JSONHash`): a `frames` object plus `meta`. */
export const PhaserAtlasJsonSchema = z.object({
  frames: z.record(FrameEntry),
  meta: z.object({
    app: z.string(),
    version: z.string(),
    image: z.string().min(1),
    format: z.string(),
    size: Size,
    scale: z.string(),
  }),
});

/** Aseprite's JSON export (hash form) — the same file, read for durations and tags. */
export const AsepriteJsonSchema = PhaserAtlasJsonSchema.extend({
  meta: PhaserAtlasJsonSchema.shape.meta.extend({ frameTags: z.array(AsepriteFrameTagSchema) }),
});
export type SpriteAtlasJson = z.infer<typeof AsepriteJsonSchema>;

/** Phaser 3's multiatlas (`Textures.Parsers.JSONArray` per texture), for frames that overflow a page. */
export const PhaserMultiAtlasJsonSchema = z.object({
  textures: z
    .array(
      z.object({
        image: z.string().min(1),
        format: z.string(),
        size: Size,
        scale: z.number(),
        frames: z.array(FrameEntry.extend({ filename: z.string().min(1) })),
      }),
    )
    .min(2),
  meta: z.object({ app: z.string(), version: z.string() }),
});
export type SpriteMultiAtlasJson = z.infer<typeof PhaserMultiAtlasJsonSchema>;

/** Phaser 3's `AnimationManager.fromJSON` input. */
export const PhaserAnimsJsonSchema = z.object({
  anims: z.array(
    z.object({
      key: z.string().min(1),
      frames: z.array(z.object({ key: z.string().min(1), frame: z.string().min(1) })).min(1),
      frameRate: z.number().positive(),
      repeat: z.number().int(),
      yoyo: z.boolean(),
    }),
  ),
});
export type SpriteAnimsJson = z.infer<typeof PhaserAnimsJsonSchema>;

/** One frame ready to pack: its name, where it came from, and its trim. */
export type AtlasFrame = {
  name: string;
  clip: string;
  dir: string;
  spriteSourceSize: SpriteSourceSize;
  sourceSize: { w: number; h: number };
  trimmed: boolean;
};

const APP = 'midnite-studio';
const VERSION = '1';

export const atlasPageImage = (page: number, pages: number): string => (pages === 1 ? 'atlas.png' : `atlas-${page}.png`);

/** A frame's duration in ms at its clip's fps. */
export const frameDurationMs = (fps: number): number => Math.max(1, Math.round(1000 / fps));

/** `<clip>/<dir>` runs over `frames` in order, with each clip's loop as the tag direction. */
export function spriteFrameTags(frames: readonly AtlasFrame[], clips: readonly SpriteClip[]): AsepriteFrameTag[] {
  const loopOf = new Map(clips.map((c) => [c.name, c.loop]));
  const tags: AsepriteFrameTag[] = [];
  frames.forEach((f, i) => {
    const name = `${f.clip}/${f.dir}`;
    const last = tags[tags.length - 1];
    if (last && last.name === name && last.to === i - 1) {
      last.to = i;
      return;
    }
    tags.push({ name, from: i, to: i, direction: loopOf.get(f.clip) === 'ping-pong' ? 'pingpong' : 'forward' });
  });
  return tags;
}

/** `atlas.json`: the dual-purpose single page, or the multiatlas when `pack` has several pages. */
export function buildSpriteAtlasJson(frames: readonly AtlasFrame[], pack: PackResult, clips: readonly SpriteClip[]): SpriteAtlasJson | SpriteMultiAtlasJson {
  const fpsOf = new Map(clips.map((c) => [c.name, c.fps]));
  const placed = new Map<string, { page: number; x: number; y: number }>();
  pack.pages.forEach((page, i) => page.placements.forEach((p) => placed.set(p.key, { page: i, x: p.x, y: p.y })));
  const entry = (f: AtlasFrame) => {
    const at = placed.get(f.name);
    if (!at) throw new Error(`Frame ${f.name} was not packed.`);
    return {
      page: at.page,
      value: {
        frame: { x: at.x, y: at.y, w: f.spriteSourceSize.w, h: f.spriteSourceSize.h },
        rotated: false as const,
        trimmed: f.trimmed,
        spriteSourceSize: f.spriteSourceSize,
        sourceSize: f.sourceSize,
        duration: frameDurationMs(fpsOf.get(f.clip) ?? 8),
      },
    };
  };
  if (pack.pages.length === 1) {
    const page = pack.pages[0]!;
    return {
      frames: Object.fromEntries(frames.map((f) => [f.name, entry(f).value])),
      meta: { app: APP, version: VERSION, image: 'atlas.png', format: 'RGBA8888', size: { w: page.w, h: page.h }, scale: '1', frameTags: spriteFrameTags(frames, clips) },
    };
  }
  const textures = pack.pages.map((page, i) => ({
    image: atlasPageImage(i, pack.pages.length),
    format: 'RGBA8888',
    size: { w: page.w, h: page.h },
    scale: 1,
    frames: [] as Array<ReturnType<typeof entry>['value'] & { filename: string }>,
  }));
  for (const f of frames) {
    const { page, value } = entry(f);
    textures[page]!.frames.push({ filename: f.name, ...value });
  }
  return { textures, meta: { app: APP, version: VERSION } };
}

/** `anims.json`: one Phaser animation per clip and direction, keyed `<asset>/<clip>/<dir>`. */
export function buildSpriteAnimsJson(asset: string, frames: readonly AtlasFrame[], clips: readonly SpriteClip[]): SpriteAnimsJson {
  const anims: SpriteAnimsJson['anims'] = [];
  for (const clip of clips) {
    const dirs: string[] = [];
    for (const f of frames) if (f.clip === clip.name && !dirs.includes(f.dir)) dirs.push(f.dir);
    for (const dir of dirs) {
      anims.push({
        key: `${asset}/${clip.name}/${dir}`,
        frames: frames.filter((f) => f.clip === clip.name && f.dir === dir).map((f) => ({ key: asset, frame: f.name })),
        frameRate: clip.fps,
        repeat: clip.loop === 'once' ? 0 : -1,
        yoyo: clip.loop === 'ping-pong',
      });
    }
  }
  return { anims };
}
