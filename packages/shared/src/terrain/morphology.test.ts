import { describe, expect, it } from 'vitest';

import { dilate, distanceTransform, erode, filterComponents, morphClose, morphOpen } from './morphology';

describe('morphology', () => {
  it('dilates a single pixel to a 3x3 square', () => {
    const mask = new Uint8Array(25); // 5x5
    mask[2 * 5 + 2] = 1; // centre
    const dilated = dilate(mask, 5, 5);
    for (let y = 0; y < 5; y += 1) {
      for (let x = 0; x < 5; x += 1) {
        const inBox = Math.abs(x - 2) <= 1 && Math.abs(y - 2) <= 1;
        expect(dilated[y * 5 + x]).toBe(inBox ? 1 : 0);
      }
    }
  });

  it('erodes a 3x3 square to a single pixel', () => {
    const mask = new Uint8Array(25);
    for (let y = 1; y <= 3; y += 1) {
      for (let x = 1; x <= 3; x += 1) {
        mask[y * 5 + x] = 1;
      }
    }
    const eroded = erode(mask, 5, 5);
    expect(eroded[2 * 5 + 2]).toBe(1);
    let count = 0;
    for (let i = 0; i < 25; i += 1) count += eroded[i]!;
    expect(count).toBe(1);
  });

  it('morphClose bridges a 1-pixel gap', () => {
    const mask = new Uint8Array(25); // 5x5
    // Two pixels separated by 1 pixel in row 2: (1, 2) and (3, 2)
    mask[2 * 5 + 1] = 1;
    mask[2 * 5 + 3] = 1;
    const closed = morphClose(mask, 5, 5);
    // Gap at (2, 2) should be closed
    expect(closed[2 * 5 + 2]).toBe(1);
  });

  it('morphOpen removes an isolated pixel', () => {
    const mask = new Uint8Array(25);
    mask[2 * 5 + 2] = 1;
    const opened = morphOpen(mask, 5, 5);
    expect(opened[2 * 5 + 2]).toBe(0);
  });

  it('computes exact Euclidean distance transform', () => {
    // 5x5 image where everything is 1 except the background at (0, 0)
    const mask = new Uint8Array(25).fill(1);
    mask[0] = 0;
    const dt = distanceTransform(mask, 5, 5);

    // Distance at (0, 0) should be 0
    expect(dt[0]).toBe(0);
    // Distance at (3, 4) from (0, 0) should be sqrt(3^2 + 4^2) = 5
    expect(dt[4 * 5 + 3]).toBeCloseTo(5, 4);
    // Distance at (1, 0) should be 1
    expect(dt[0 * 5 + 1]).toBeCloseTo(1, 4);
  });

  it('filters out small components', () => {
    const mask = new Uint8Array(25);
    // Component 1: 2 pixels
    mask[0] = 1;
    mask[1] = 1;
    // Component 2: 4 pixels
    mask[3 * 5 + 3] = 1;
    mask[3 * 5 + 4] = 1;
    mask[4 * 5 + 3] = 1;
    mask[4 * 5 + 4] = 1;

    const filtered = filterComponents(mask, 5, 5, 3);
    // Component 1 dropped
    expect(filtered[0]).toBe(0);
    expect(filtered[1]).toBe(0);
    // Component 2 kept
    expect(filtered[3 * 5 + 3]).toBe(1);
    expect(filtered[4 * 5 + 4]).toBe(1);
  });
});
