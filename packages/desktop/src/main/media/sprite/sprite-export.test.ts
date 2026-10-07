import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  AsepriteJsonSchema,
  PhaserAnimsJsonSchema,
  PhaserAtlasJsonSchema,
  PhaserMultiAtlasJsonSchema,
  SPRITE_NO_FRAMES,
  SpriteFramesFileSchema,
  SpritePackOptionsSchema,
  SpriteSheetSpecSchema,
  spriteFrameKey,
  spriteFramePath,
  spriteMultiPageWarning,
  spritePackExists,
  type SpriteSheetSpec,
} from '@midnite/studio-shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { decodePng, encodePngRgba8 } from '../png/png-codec';
import { exportSprite } from './sprite-export';

/** An opaque block on a transparent canvas. */
function rectOn(width: number, height: number, x0: number, y0: number, w: number, h: number) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = y0; y < y0 + h; y += 1) for (let x = x0; x < x0 + w; x += 1) data.set([200, 40, 40, 255], (y * width + x) * 4);
  return { width, height, data };
}

let base: string;
let dir: string;
let dest: string;

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'sprite-export-'));
  dir = join(base, 'asset');
  dest = join(base, 'out');
  await mkdir(dir, { recursive: true });
});
afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

const spec = (over: Record<string, unknown> = {}): SpriteSheetSpec =>
  SpriteSheetSpecSchema.parse({
    kind: 'sheet',
    name: 'Hero Knight',
    frameSize: [32, 32],
    clips: [
      { name: 'idle', frames: 2, fps: 4 },
      { name: 'attack', frames: 2, fps: 10, loop: 'once' },
    ],
    ...over,
  });

/** Writes a frame PNG (a small opaque block) for every clip × e/w × n, and returns the frames file. */
async function seed(s: SpriteSheetSpec, size = 32, extra: string[] = []) {
  const keys: string[] = [];
  for (const clip of s.clips)
    for (const d of ['e', 'w'])
      for (let n = 0; n < clip.frames; n += 1) {
        const img = rectOn(size, size, 4 + n, 6, Math.min(10, size - 8), Math.min(12, size - 8));
        const path = join(dir, spriteFramePath(clip.name, d, n));
        await mkdir(join(path, '..'), { recursive: true });
        await writeFile(path, encodePngRgba8(new Uint8Array(img.data.buffer), size, size));
        keys.push(spriteFrameKey(clip.name, d, n));
      }
  for (const key of extra) {
    const [clip, d, n] = key.split('/');
    const path = join(dir, spriteFramePath(clip!, d!, Number(n)));
    await mkdir(join(path, '..'), { recursive: true });
    await writeFile(path, encodePngRgba8(new Uint8Array(size * size * 4), size, size));
    keys.push(key);
  }
  await writeFile(join(dir, 'sprite.json'), JSON.stringify(s));
  return SpriteFramesFileSchema.parse({ frames: Object.fromEntries(keys.map((k) => [k, k === 'idle/w/000' ? { flipped: true } : {}])) });
}

const pack = SpritePackOptionsSchema.parse({});

describe('exportSprite', () => {
  it('writes <name>.sprite/ with exactly atlas.png, atlas.json, anims.json and sprite.json, which parse with their schemas', async () => {
    const s = spec();
    const frames = await seed(s, 32, ['idle/e/005']);
    const result = await exportSprite({ dir, spec: s, frames, pack, dest });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({ path: join(dest, 'hero-knight.sprite'), frames: 8, pages: 1, warnings: [] });
    const folder = join(dest, 'hero-knight.sprite');
    expect((await readdir(folder)).sort()).toEqual(['anims.json', 'atlas.json', 'atlas.png', 'sprite.json']);
    const atlas = JSON.parse(await readFile(join(folder, 'atlas.json'), 'utf8'));
    expect(PhaserAtlasJsonSchema.safeParse(atlas).success).toBe(true);
    const aseprite = AsepriteJsonSchema.parse(atlas);
    // The stale frame past the clip is not packed.
    expect(Object.keys(aseprite.frames)).not.toContain('idle/e/005');
    expect(aseprite.meta.frameTags.map((t) => t.name)).toEqual(['idle/e', 'idle/w', 'attack/e', 'attack/w']);
    expect(aseprite.frames['idle/e/000']).toMatchObject({ trimmed: true, sourceSize: { w: 32, h: 32 }, spriteSourceSize: { x: 4, y: 6, w: 10, h: 12 } });
    // `flipped` is applied before trimming: the block mirrors about the centre column.
    expect(aseprite.frames['idle/w/000']!.spriteSourceSize).toMatchObject({ x: 32 - 4 - 10, w: 10 });
    const anims = PhaserAnimsJsonSchema.parse(JSON.parse(await readFile(join(folder, 'anims.json'), 'utf8')));
    expect(anims.anims.map((a) => a.key)).toEqual(['hero-knight/idle/e', 'hero-knight/idle/w', 'hero-knight/attack/e', 'hero-knight/attack/w']);
    const png = decodePng(await readFile(join(folder, 'atlas.png')));
    expect(png.ok && [png.image.width, png.image.height]).toEqual([aseprite.meta.size.w, aseprite.meta.size.h]);
    // The asset's own export/ is refreshed too, for a game's asset bridge.
    expect((await readdir(join(dir, 'export'))).sort()).toEqual(['anims.json', 'atlas.json', 'atlas.png']);
  });

  it('refuses to overwrite an existing pack folder', async () => {
    const s = spec();
    const frames = await seed(s);
    await mkdir(join(dest, 'hero-knight.sprite'), { recursive: true });
    expect(await exportSprite({ dir, spec: s, frames, pack, dest })).toMatchObject({ ok: false, message: spritePackExists('hero-knight.sprite') });
  });

  it('writes only export/ without a destination, and refuses a sheet with no frames', async () => {
    const s = spec();
    expect(await exportSprite({ dir, spec: s, frames: SpriteFramesFileSchema.parse({}), pack })).toMatchObject({ ok: false, message: SPRITE_NO_FRAMES });
    const result = await exportSprite({ dir, spec: s, frames: await seed(s), pack });
    expect(result.ok && result.value.path).toBe(join(dir, 'export'));
  });

  it('spills into a multiatlas with a warning when one page is not enough', async () => {
    const s = spec({ frameSize: [512, 512], clips: [{ name: 'idle', frames: 8, fps: 8 }] });
    const keys: string[] = [];
    for (const d of ['e', 'w'])
      for (let n = 0; n < 8; n += 1) {
        const img = rectOn(512, 512, 0, 0, 512, 512);
        const path = join(dir, spriteFramePath('idle', d, n));
        await mkdir(join(path, '..'), { recursive: true });
        await writeFile(path, encodePngRgba8(new Uint8Array(img.data.buffer), 512, 512));
        keys.push(spriteFrameKey('idle', d, n));
      }
    await writeFile(join(dir, 'sprite.json'), JSON.stringify(s));
    const frames = SpriteFramesFileSchema.parse({ frames: Object.fromEntries(keys.map((k) => [k, {}])) });
    const result = await exportSprite({ dir, spec: s, frames, pack, dest });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.pages).toBe(2);
    expect(result.value.warnings).toEqual([spriteMultiPageWarning(2)]);
    const folder = join(dest, 'hero-knight.sprite');
    expect((await readdir(folder)).sort()).toEqual(['anims.json', 'atlas-0.png', 'atlas-1.png', 'atlas.json', 'sprite.json']);
    expect(PhaserMultiAtlasJsonSchema.safeParse(JSON.parse(await readFile(join(folder, 'atlas.json'), 'utf8'))).success).toBe(true);
  });

  it('refuses kinds whose packs land with later themes', async () => {
    const result = await exportSprite({ dir, spec: { kind: 'tileset', name: 't' } as never, frames: SpriteFramesFileSchema.parse({}), pack });
    expect(result).toMatchObject({ ok: false, message: 'Tileset export is not available yet.' });
  });
});
