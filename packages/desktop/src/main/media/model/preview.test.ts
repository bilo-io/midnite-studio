import { inflateSync } from 'node:zlib';

import {
  MODEL_PREVIEW_SIZE_DEFAULT,
  MODEL_PREVIEW_SIZE_MAX,
  MODEL_PREVIEW_SIZE_MIN,
  MODEL_PREVIEW_VIEWS,
  ModelSpecSchema,
} from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { buildScene } from './mesh';
import { clampPreviewSize, encodePng, pngSize, renderPreviews, renderView } from './preview';

/** Decode our own 8-bit RGB, filter-0 PNG back to pixels — enough to look at what was drawn. */
function decode(png: Buffer): { width: number; height: number; rgb: Uint8Array } {
  const size = pngSize(png)!;
  let at = 8;
  const idat: Buffer[] = [];
  while (at < png.length) {
    const length = png.readUInt32BE(at);
    const type = png.toString('ascii', at + 4, at + 8);
    if (type === 'IDAT') idat.push(png.subarray(at + 8, at + 8 + length));
    at += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = size.width * 3;
  const rgb = new Uint8Array(size.height * stride);
  for (let y = 0; y < size.height; y += 1) {
    rgb.set(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), y * stride);
  }
  return { ...size, rgb };
}

const scene = (parts: unknown[]) => buildScene(ModelSpecSchema.parse({ name: 't', parts }));
const TABLE = scene([
  { name: 'top', shape: 'box', size: [1, 0.1, 1], position: [0, 0.7, 0], color: '#cc3333' },
  { name: 'leg', shape: 'cylinder', radiusTop: 0.05, radiusBottom: 0.05, height: 0.7, position: [0.4, 0.35, 0.4], color: '#3366cc' },
]);

const pixelAt = (img: ReturnType<typeof decode>, x: number, y: number): number[] => [...img.rgb.subarray((y * img.width + x) * 3, (y * img.width + x) * 3 + 3)];

describe('model preview renderer', () => {
  it('renders every default view as a non-empty PNG of the requested size', () => {
    const views = renderPreviews(TABLE, { size: 256 });
    expect(views.map((v) => v.view)).toEqual([...MODEL_PREVIEW_VIEWS]);
    for (const view of views) {
      expect(pngSize(view.png)).toEqual({ width: 256, height: 256 });
      const img = decode(view.png);
      const background = pixelAt(img, 2, 2);
      const drawn = [...img.rgb].some((_, i) => i % 3 === 0 && img.rgb[i] !== background[0]);
      expect(drawn, view.view).toBe(true);
    }
  });

  it('draws the part colours: the red top is red from the front, the blue leg blue from the top-down corner', () => {
    const front = decode(renderPreviews(TABLE, { views: ['front'], size: 256 })[0]!.png);
    // The slab sits ~70 px above the frame's centre (scene height 0.75 m at ~220 px per metre).
    const centre = pixelAt(front, 128, 58);
    // The tabletop: red dominates.
    expect(centre[0]).toBeGreaterThan(centre[2]! + 40);
    const iso = decode(renderPreviews(TABLE, { views: ['iso'], size: 256 })[0]!.png);
    let blue = 0;
    for (let i = 0; i < iso.rgb.length; i += 3) if (iso.rgb[i + 2]! > iso.rgb[i]! + 60) blue += 1;
    expect(blue).toBeGreaterThan(20);
  });

  it('is deterministic and the views are genuinely different pictures', () => {
    const a = renderPreviews(TABLE, { size: 192 });
    const b = renderPreviews(TABLE, { size: 192 });
    expect(a.map((v) => v.png.toString('base64'))).toEqual(b.map((v) => v.png.toString('base64')));
    expect(new Set(a.map((v) => v.png.toString('base64'))).size).toBe(a.length);
  });

  it('bounds the size: out-of-range requests are clamped, and the PNG stays small', () => {
    expect(clampPreviewSize(undefined)).toBe(MODEL_PREVIEW_SIZE_DEFAULT);
    expect(clampPreviewSize(5000)).toBe(MODEL_PREVIEW_SIZE_MAX);
    expect(clampPreviewSize(3)).toBe(MODEL_PREVIEW_SIZE_MIN);
    const [view] = renderPreviews(TABLE, { views: ['iso'], size: 5000 });
    expect(pngSize(view!.png)).toEqual({ width: MODEL_PREVIEW_SIZE_MAX, height: MODEL_PREVIEW_SIZE_MAX });
    // A flat-shaded render compresses well: four views of the biggest size still fit an MCP response by a wide margin.
    expect(view!.png.length).toBeLessThan(500_000);
  });

  it('drops duplicate views and renders an empty scene as a blank image rather than throwing', () => {
    expect(renderPreviews(TABLE, { views: ['front', 'front', 'top'], size: 128 })).toHaveLength(2);
    const blank = decode(encodePng(128, 128, renderView([], 'iso', 128)));
    expect(new Set([...blank.rgb]).size).toBeLessThanOrEqual(3);
  });

  it('puts the model upright: the top of a tall box is above its bottom in the front view', () => {
    const tall = scene([{ name: 'post', shape: 'box', size: [0.2, 2, 0.2], position: [0, 1, 0], color: '#222222' }]);
    const img = decode(renderPreviews(tall, { views: ['front'], size: 256 })[0]!.png);
    const rows = (test: (px: number[]) => boolean): number[] => {
      const found: number[] = [];
      for (let y = 0; y < img.height; y += 1) if (test(pixelAt(img, 128, y))) found.push(y);
      return found;
    };
    const dark = rows((px) => px[0]! < 120);
    expect(dark.length).toBeGreaterThan(100);
    // Fitted with a margin: it fills most of the frame vertically and is centred.
    expect(dark[0]!).toBeLessThan(40);
    expect(dark.at(-1)!).toBeGreaterThan(216);
  });
});
