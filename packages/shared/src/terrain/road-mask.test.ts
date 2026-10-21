import { describe, expect, it } from 'vitest';

import { cleanRoadMask, detectRoadColour, extractRoadMask, maskIoU, pickColour } from './road-mask';
import { paintedRaster } from './road-test-fixtures';

const hue = (hex: string): number => {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d === 0) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
};

describe('road mask', () => {
  const line = paintedRaster(64, (_x, y) => y >= 27 && y < 37);

  it('detects cyan as the dominant road colour', () => {
    const { colour } = detectRoadColour(line);
    expect(colour).not.toBeNull();
    expect(Math.abs(hue(colour!) - 180)).toBeLessThanOrEqual(10);
  });

  it('returns null when no saturated hue dominates (luminance fallback)', () => {
    const grey = paintedRaster(32, (x) => x < 8, [220, 220, 220]);
    expect(detectRoadColour(grey).colour).toBeNull();
    const mask = extractRoadMask(grey, null, 0.25);
    expect(mask[0]).toBe(1);
    expect(mask[31]).toBe(0);
  });

  it('keys the colour within the tolerance', () => {
    const mask = extractRoadMask(line, '#00ffff', 0.25);
    let on = 0;
    for (const v of mask) on += v;
    expect(on).toBe(64 * 10);
    expect(extractRoadMask(line, '#ff0000', 0.25).every((v) => v === 0)).toBe(true);
  });

  it('closes gaps, opens specks and drops small components', () => {
    const noisy = paintedRaster(64, (x, y) => (y >= 27 && y < 37 && x !== 30) || (x === 5 && y === 5));
    const cleaned = cleanRoadMask(extractRoadMask(noisy, '#00ffff', 0.25), 64, 64, 50);
    expect(cleaned[5 * 64 + 5]).toBe(0);
    expect(cleaned[32 * 64 + 30]).toBe(1);
  });

  it('picks the colour under the eyedropper and scores mask agreement', () => {
    expect(pickColour(line, 0.5, 0.5)).toBe('#00ffff');
    expect(pickColour(line, 0.1, 0.1)).toBe('#000000');
    const a = new Uint8Array([1, 1, 0, 0]);
    expect(maskIoU(a, new Uint8Array([1, 0, 0, 0]))).toBeCloseTo(0.5);
    expect(maskIoU(new Uint8Array(4), new Uint8Array(4))).toBe(1);
  });
});
