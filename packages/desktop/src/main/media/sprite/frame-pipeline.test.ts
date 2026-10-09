import { alphaBounds, createRgba, hexToRgb, parseSpriteSpec, rgbToHex, type RgbaImage, type SpriteSheetSpec } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { decodePng, encodePngRgba8 } from '../png/png-codec';
import { createFramePipeline, decodeFrame, NOT_A_FRAME_IMAGE, processFrame } from './frame-pipeline';

const sheet = (over: Record<string, unknown> = {}): SpriteSheetSpec => parseSpriteSpec({ kind: 'sheet', name: 'hero', frameSize: [32, 32], ...over }) as SpriteSheetSpec;

/** An opaque `fg` rectangle on an opaque `bg` canvas, as PNG bytes. */
function pngRect(size: number, x0: number, y0: number, w: number, h: number, fg: string, bg: string | null): Buffer {
  const img = createRgba(size, size);
  const f = hexToRgb(fg);
  const b = bg ? hexToRgb(bg) : null;
  for (let y = 0; y < size; y += 1)
    for (let x = 0; x < size; x += 1) {
      const inside = x >= x0 && x < x0 + w && y >= y0 && y < y0 + h;
      const c = inside ? f : b;
      if (c) img.data.set([c[0], c[1], c[2], 255], (y * size + x) * 4);
    }
  return encodePngRgba8(new Uint8Array(img.data.buffer), size, size);
}

const rgba = (png: Buffer): RgbaImage => {
  const d = decodePng(png);
  if (!d.ok || d.image.channels !== 4) throw new Error('bad png');
  return { width: d.image.width, height: d.image.height, data: new Uint8ClampedArray(d.image.data) };
};

const noTranscode = async () => null;

describe('processFrame', () => {
  it('keys a magenta background and anchors the subject bottom-centre', async () => {
    const out = await processFrame(pngRect(64, 10, 8, 12, 30, '#2060c0', '#ff00ff'), sheet(), { toPng: noTranscode });
    expect(out.sourceHeight).toBe(30);
    const box = alphaBounds(out.image)!;
    expect(box.y1).toBe(32);
    expect((box.x0 + box.x1) / 2).toBeCloseTo(16, 0);
    expect(out.measure).toMatchObject({ clipped: false });
  });

  it('keeps a provider alpha and skips keying', async () => {
    // A magenta subject on transparency survives: keying would have removed it.
    const out = await processFrame(pngRect(64, 10, 8, 12, 30, '#ff00ff', null), sheet(), { toPng: noTranscode });
    expect(alphaBounds(out.image)).not.toBeNull();
  });

  it('keys green for a pink subject', async () => {
    const out = await processFrame(pngRect(64, 10, 8, 12, 30, '#ff70c0', '#00ff00'), sheet({ prompt: 'a pink slime' }), { toPng: noTranscode });
    expect(out.image.data[3]).toBe(0);
    expect(alphaBounds(out.image)).not.toBeNull();
  });

  it('transcodes non-PNG bytes, and refuses what is not an image', async () => {
    const png = pngRect(8, 1, 1, 4, 4, '#000000', '#ff00ff');
    await expect(decodeFrame(new Uint8Array([0xff, 0xd8]), async () => png)).resolves.toMatchObject({ width: 8 });
    await expect(decodeFrame(new Uint8Array([0xff, 0xd8]), noTranscode)).rejects.toThrow(NOT_A_FRAME_IMAGE);
  });
});

describe('createFramePipeline', () => {
  function harness(spec: SpriteSheetSpec, referenceHeights?: Record<string, number>) {
    const files = new Map<string, Buffer>();
    let yields = 0;
    const pipeline = createFramePipeline(
      spec,
      {
        toPng: noTranscode,
        writeFrame: async ({ clip, dir, n, png }) => void files.set(`${clip}/${dir}/${n}`, png),
        readFrame: async (clip, dir, n) => files.get(`${clip}/${dir}/${n}`) ?? null,
        yieldNow: async () => void (yields += 1),
      },
      { referenceHeights },
    );
    return { pipeline, files, yields: () => yields };
  }

  it('one sheet-wide scale per direction, set by the first frame', async () => {
    const { pipeline, files } = harness(sheet());
    await pipeline.process({ clip: 'idle', dir: 'e', n: 0, bytes: pngRect(64, 10, 4, 12, 40, '#2060c0', '#ff00ff') });
    await pipeline.process({ clip: 'idle', dir: 'e', n: 1, bytes: pngRect(64, 10, 24, 12, 20, '#2060c0', '#ff00ff') });
    const h = (key: string) => {
      const b = alphaBounds(rgba(files.get(key)!))!;
      return b.y1 - b.y0;
    };
    expect(h('idle/e/1') / h('idle/e/0')).toBeCloseTo(0.5, 1);
    const result = await pipeline.finish();
    expect(result.referenceHeights).toEqual({ e: 40 });
    expect(result.badges['idle/e/000']).toEqual(['height']);
    expect(result.badges['idle/e/001']).toEqual(['height']);
  });

  it('reuses a known reference height', async () => {
    const { pipeline } = harness(sheet(), { e: 20 });
    await pipeline.process({ clip: 'walk', dir: 'e', n: 0, bytes: pngRect(64, 10, 24, 12, 20, '#2060c0', '#ff00ff') });
    expect((await pipeline.finish()).referenceHeights).toEqual({ e: 20 });
  });

  it('pixel mode: one palette across frames, hard alpha, outline in the darkest colour', async () => {
    const spec = sheet({ style: 'pixel', palette: { size: 4 }, outline: true });
    const { pipeline, files, yields } = harness(spec);
    await pipeline.process({ clip: 'idle', dir: 'e', n: 0, bytes: pngRect(64, 20, 4, 16, 40, '#d03030', '#ff00ff') });
    await pipeline.process({ clip: 'idle', dir: 'e', n: 1, bytes: pngRect(64, 20, 4, 16, 40, '#3040c0', '#ff00ff') });
    const result = await pipeline.finish();
    expect(result.palette!.length).toBeLessThanOrEqual(4);
    const colours = new Set<string>();
    for (const png of files.values()) {
      const img = rgba(png);
      for (let i = 0; i < img.data.length; i += 4) {
        expect([0, 255]).toContain(img.data[i + 3]);
        if (img.data[i + 3]) colours.add(rgbToHex([img.data[i]!, img.data[i + 1]!, img.data[i + 2]!]));
      }
    }
    for (const c of colours) expect(result.palette).toContain(c);
    expect(yields()).toBe(4);
  });

  it('a fixed palette is used as-is and not returned', async () => {
    const { pipeline, files } = harness(sheet({ style: 'pixel', palette: { colours: ['#000000', '#ff0000'] } }));
    await pipeline.process({ clip: 'idle', dir: 'e', n: 0, bytes: pngRect(64, 20, 4, 16, 40, '#d03030', '#ff00ff') });
    expect((await pipeline.finish()).palette).toBeUndefined();
    const img = rgba(files.get('idle/e/0')!);
    const i = (31 * 32 + 16) * 4;
    expect(Array.from(img.data.slice(i, i + 4))).toEqual([255, 0, 0, 255]);
  });
});
