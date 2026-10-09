import { describe, expect, it } from 'vitest';

import { encodeWav, equalPowerCrossfade, finishTrack, stitch } from './pcm';

const fill = (n: number, v: number) => new Float32Array(n).fill(v);

describe('crossfade and stitch', () => {
  it('blends the overlap and shortens by it', () => {
    const out = equalPowerCrossfade(fill(10, 1), fill(10, 1), 4);
    expect(out.length).toBe(16);
    expect(out[0]).toBe(1);
    expect(out[15]).toBe(1);
    // Equal-power: correlated equal signals sum above unity mid-fade, never below it.
    for (let i = 6; i < 10; i += 1) expect(out[i]).toBeGreaterThanOrEqual(1 - 1e-6);
  });
  it('stitches many chunks and tolerates empty input', () => {
    expect(stitch([fill(10, 0.5), fill(10, 0.5), fill(10, 0.5)], 2).length).toBe(26);
    expect(stitch([], 2).length).toBe(0);
    expect(stitch([fill(5, 0.1)], 2).length).toBe(5);
  });
});

describe('finishTrack', () => {
  it('normalises the peak, fades the edges, and leaves silence alone', () => {
    const out = finishTrack(fill(96000, 1.28), 32000);
    expect(Math.max(...out)).toBeLessThanOrEqual(0.92 + 1e-6);
    expect(out[0]).toBe(0);
    expect(out.at(-1)).toBe(0);
    expect(out[48000]).toBeCloseTo(0.92, 3);
    expect(finishTrack(new Float32Array(100), 32000).every((v) => v === 0)).toBe(true);
  });
});

describe('encodeWav', () => {
  it('writes a canonical 16-bit mono header and clamps samples', () => {
    const wav = encodeWav(Float32Array.from([0, 1, -1, 2]), 32000);
    expect(wav.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(wav.subarray(8, 12).toString('ascii')).toBe('WAVE');
    expect(wav.readUInt16LE(20)).toBe(1);
    expect(wav.readUInt16LE(22)).toBe(1);
    expect(wav.readUInt32LE(24)).toBe(32000);
    expect(wav.readUInt32LE(40)).toBe(8);
    expect(wav.length).toBe(44 + 8);
    expect(wav.readInt16LE(46)).toBe(32767);
    expect(wav.readInt16LE(48)).toBe(-32768);
    expect(wav.readInt16LE(50)).toBe(32767);
  });
});
