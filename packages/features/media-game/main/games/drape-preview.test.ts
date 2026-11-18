// @vitest-environment node
import { decodePng } from '@midnite/studio-runtime';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { noisyPng } from './drape-preview-fixture';
import { cachedDrapePreview, clearDrapePreviewCache, downscalePng, downscaleToRgba8, DRAPE_PREVIEW_MAX_BYTES } from './drape-preview';

describe('downscaleToRgba8', () => {
  it('averages each box of source pixels', () => {
    const image = { width: 2, height: 2, channels: 4 as const, bitDepth: 8 as const, data: Uint8Array.from([0, 0, 0, 255, 100, 0, 0, 255, 0, 100, 0, 255, 100, 100, 0, 255]) };
    expect(Array.from(downscaleToRgba8(image, 1, 1))).toEqual([50, 50, 0, 255]);
  });

  it('widens grey and 16-bit inputs to RGBA8', () => {
    const grey = { width: 1, height: 1, channels: 1 as const, bitDepth: 8 as const, data: Uint8Array.from([80]) };
    expect(Array.from(downscaleToRgba8(grey, 1, 1))).toEqual([80, 80, 80, 255]);
    const deep = { width: 1, height: 1, channels: 1 as const, bitDepth: 16 as const, data: Uint16Array.from([0x8000]) };
    expect(Array.from(downscaleToRgba8(deep, 1, 1))).toEqual([128, 128, 128, 255]);
  });
});

describe('downscalePng', () => {
  it('shrinks the longest side to the cap, keeps the aspect, and fits the byte budget', () => {
    const big = noisyPng(1600, 800);
    const small = downscalePng(big, 1024);
    expect(small).not.toBeNull();
    expect(small!.length).toBeLessThanOrEqual(DRAPE_PREVIEW_MAX_BYTES);
    const decoded = decodePng(small!);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(Math.max(decoded.image.width, decoded.image.height)).toBeLessThanOrEqual(1024);
    expect(decoded.image.width / decoded.image.height).toBeCloseTo(2, 1);
  });

  it('never upscales an image already under the cap', () => {
    const decoded = decodePng(downscalePng(noisyPng(100, 60), 1024)!);
    expect(decoded.ok && [decoded.image.width, decoded.image.height]).toEqual([100, 60]);
  });

  it('answers null for bytes that are not a PNG', () => {
    expect(downscalePng(Buffer.from('not a png'))).toBeNull();
  });
});

describe('cachedDrapePreview', () => {
  beforeEach(clearDrapePreviewCache);

  it('makes a preview once per file version, and again when the mtime or size changes', async () => {
    const make = vi.fn(async () => Buffer.from('png'));
    const a = await cachedDrapePreview('/g/drape.png', { mtimeMs: 1, size: 10 }, make);
    const b = await cachedDrapePreview('/g/drape.png', { mtimeMs: 1, size: 10 }, make);
    expect(a).toBe(`data:image/png;base64,${Buffer.from('png').toString('base64')}`);
    expect(b).toBe(a);
    expect(make).toHaveBeenCalledTimes(1);
    await cachedDrapePreview('/g/drape.png', { mtimeMs: 2, size: 10 }, make);
    await cachedDrapePreview('/g/drape.png', { mtimeMs: 2, size: 11 }, make);
    expect(make).toHaveBeenCalledTimes(3);
  });

  it('remembers a failure too, so an undecodable drape is not re-read every time', async () => {
    const make = vi.fn(async () => null);
    expect(await cachedDrapePreview('/g/x.png', { mtimeMs: 1, size: 1 }, make)).toBeNull();
    expect(await cachedDrapePreview('/g/x.png', { mtimeMs: 1, size: 1 }, make)).toBeNull();
    expect(make).toHaveBeenCalledTimes(1);
  });
});
