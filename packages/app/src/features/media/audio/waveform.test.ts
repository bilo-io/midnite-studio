import { describe, expect, it } from 'vitest';

import { formatDuration, reducePeaks } from './waveform';

describe('reducePeaks', () => {
  it('takes the loudest absolute sample per bucket and normalises to the loudest', () => {
    const channel = new Float32Array([0.1, -0.5, 0.25, 0.2, 0, -0.05, 0.4, 0.1]);
    expect(reducePeaks([channel], 4)).toEqual([1, 0.5, 0.1, 0.8]);
  });

  it('merges channels by taking the louder one', () => {
    const left = new Float32Array([0.2, 0, 0, 0]);
    const right = new Float32Array([0, 0, 0, -0.4]);
    expect(reducePeaks([left, right], 2)).toEqual([0.5, 1]);
  });

  it('keeps silence at zero and caps buckets at the sample count', () => {
    expect(reducePeaks([new Float32Array(3)], 10)).toEqual([0, 0, 0]);
    expect(reducePeaks([], 10)).toEqual([]);
  });

  it('covers every sample when the length does not divide evenly', () => {
    const channel = new Float32Array([0, 0, 0, 0, 1]);
    const peaks = reducePeaks([channel], 2);
    expect(peaks).toHaveLength(2);
    expect(peaks[1]).toBe(1);
  });
});

describe('formatDuration', () => {
  it('renders m:ss', () => {
    expect(formatDuration(125.4)).toBe('2:05');
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(undefined)).toBe('–:––');
  });
});
