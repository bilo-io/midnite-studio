import { describe, expect, it } from 'vitest';

import { normaliseFrame } from './align';
import { rectOn } from './test-fixtures';
import { measureFrame, validateFrames } from './validate';

const spec = { frameSize: [64, 64] as const, anchor: { x: 0.5, y: 1 } };

function measure(source: ReturnType<typeof rectOn>, nudge: readonly [number, number] = [0, 0], referenceHeight = 20) {
  const { image } = normaliseFrame(source, { ...spec, referenceHeight, nudge });
  return measureFrame(source, image, spec);
}

describe('validateFrames', () => {
  const good = () => measure(rectOn(40, 40, 10, 10, 8, 20));
  const base = { 'walk/e/000': good(), 'walk/e/001': good(), 'walk/e/002': good() };

  it('a clean clip has no badges', () => {
    expect(validateFrames(base, spec)).toEqual({ 'walk/e/000': [], 'walk/e/001': [], 'walk/e/002': [] });
  });

  it('empty: under 1 % opaque', () => {
    const r = validateFrames({ ...base, 'walk/e/003': measure(rectOn(40, 40, 0, 0, 0, 0)) }, spec);
    expect(r['walk/e/003']).toEqual(['empty']);
  });

  it('clipped: the subject touches the source edge', () => {
    const r = validateFrames({ ...base, 'walk/e/003': measure(rectOn(40, 40, 0, 10, 8, 20)) }, spec);
    expect(r['walk/e/003']).toEqual(['clipped']);
  });

  it('height: outside ±12 % of the clip median', () => {
    const r = validateFrames({ ...base, 'walk/e/003': measure(rectOn(40, 40, 10, 10, 8, 12)) }, spec);
    expect(r['walk/e/003']).toEqual(['height']);
  });

  it('drift: the feet land too far from the anchor', () => {
    const r = validateFrames({ ...base, 'walk/e/003': measure(rectOn(40, 40, 10, 10, 8, 20), [6, 0]) }, spec);
    expect(r['walk/e/003']).toEqual(['drift']);
  });

  it('the height median is per clip', () => {
    const tall = measure(rectOn(40, 40, 10, 5, 8, 30));
    const r = validateFrames({ ...base, 'jump/e/000': tall, 'jump/e/001': tall }, spec);
    expect(r['jump/e/000']).toEqual([]);
  });
});
