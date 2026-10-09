import { describe, expect, it } from 'vitest';

import { SpriteFramesFileSchema, SpriteSheetSpecSchema, spriteFrameKey } from '../media-sprite';
import {
  AsepriteJsonSchema,
  buildSpriteAnimsJson,
  buildSpriteAtlasJson,
  PhaserAnimsJsonSchema,
  PhaserAtlasJsonSchema,
  PhaserMultiAtlasJsonSchema,
  type AtlasFrame,
} from './atlas';
import { sheetFrames } from './frames';
import { packRects } from './pack';

const spec = SpriteSheetSpecSchema.parse({
  kind: 'sheet',
  name: 'hero',
  directions: 4,
  targetPerspective: 'top-down',
  clips: [
    { name: 'idle', frames: 2, fps: 4, loop: 'loop' },
    { name: 'attack', frames: 3, fps: 12, loop: 'once' },
    { name: 'wave', frames: 2, fps: 6, loop: 'ping-pong' },
  ],
});
const file = SpriteFramesFileSchema.parse({
  frames: Object.fromEntries(
    spec.clips.flatMap((c) => ['s', 'w', 'n', 'e'].flatMap((d) => Array.from({ length: c.frames }, (_, n) => [spriteFrameKey(c.name, d, n), {}]))),
  ),
});
const frames: AtlasFrame[] = sheetFrames(spec, file).map((f) => ({
  name: f.key,
  clip: f.clip,
  dir: f.dir,
  spriteSourceSize: { x: 1, y: 2, w: 10, h: 12 },
  sourceSize: { w: 16, h: 16 },
  trimmed: true,
}));

describe('buildSpriteAtlasJson', () => {
  it('writes one file that is both a Phaser JSON-hash atlas and an Aseprite JSON', () => {
    const json = buildSpriteAtlasJson(frames, packRects(frames.map((f) => ({ key: f.name, w: 10, h: 12 }))), spec.clips);
    expect(PhaserAtlasJsonSchema.safeParse(json).success).toBe(true);
    const aseprite = AsepriteJsonSchema.parse(json);
    expect(Object.keys(aseprite.frames)).toEqual(frames.map((f) => f.name));
    expect(aseprite.frames['idle/s/000']!.duration).toBe(250);
    expect(aseprite.meta.image).toBe('atlas.png');
  });

  it("gives each clip/direction a contiguous tag covering exactly that clip's frames", () => {
    const json = AsepriteJsonSchema.parse(buildSpriteAtlasJson(frames, packRects(frames.map((f) => ({ key: f.name, w: 10, h: 12 }))), spec.clips));
    const names = Object.keys(json.frames);
    expect(json.meta.frameTags).toHaveLength(12);
    for (const tag of json.meta.frameTags) {
      const covered = names.slice(tag.from, tag.to + 1);
      const [clip, dir] = tag.name.split('/');
      expect(covered).toEqual(names.filter((n) => n.startsWith(`${clip}/${dir}/`)));
      expect(covered).toHaveLength(spec.clips.find((c) => c.name === clip)!.frames);
    }
    expect(json.meta.frameTags.find((t) => t.name === 'wave/e')!.direction).toBe('pingpong');
    expect(json.meta.frameTags.find((t) => t.name === 'attack/e')!.direction).toBe('forward');
  });

  it('writes the multiatlas form, without tags, when the frames spill onto several pages', () => {
    const big = frames.map((f) => ({ ...f, spriteSourceSize: { x: 0, y: 0, w: 1000, h: 1000 }, sourceSize: { w: 1000, h: 1000 } }));
    const pack = packRects(big.map((f) => ({ key: f.name, w: 1000, h: 1000 })));
    expect(pack.pages.length).toBeGreaterThan(1);
    const json = PhaserMultiAtlasJsonSchema.parse(buildSpriteAtlasJson(big, pack, spec.clips));
    expect(json.textures.map((t) => t.image)).toEqual(pack.pages.map((_, i) => `atlas-${i}.png`));
    expect(json.textures.flatMap((t) => t.frames).length).toBe(big.length);
    expect('frameTags' in json.meta).toBe(false);
  });
});

describe('buildSpriteAnimsJson', () => {
  it('keys one animation per tag, with repeat and yoyo from the loop mode', () => {
    const anims = PhaserAnimsJsonSchema.parse(buildSpriteAnimsJson('hero', frames, spec.clips));
    const tags = AsepriteJsonSchema.parse(buildSpriteAtlasJson(frames, packRects(frames.map((f) => ({ key: f.name, w: 10, h: 12 }))), spec.clips)).meta.frameTags;
    expect(anims.anims.map((a) => a.key).sort()).toEqual(tags.map((t) => `hero/${t.name}`).sort());
    const attack = anims.anims.find((a) => a.key === 'hero/attack/s')!;
    expect(attack).toMatchObject({ frameRate: 12, repeat: 0, yoyo: false });
    expect(attack.frames).toEqual([0, 1, 2].map((n) => ({ key: 'hero', frame: `attack/s/00${n}` })));
    expect(anims.anims.find((a) => a.key === 'hero/wave/n')).toMatchObject({ repeat: -1, yoyo: true });
    expect(anims.anims.find((a) => a.key === 'hero/idle/w')).toMatchObject({ repeat: -1, yoyo: false });
  });
});
