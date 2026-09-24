import { describe, expect, it } from 'vitest';

import { WAVEFORM_BAR_COUNT, sampleAnalyser } from './waveform';

/**
 * The pure downsampling math behind the input bar's two level meters. jsdom
 * has no real Web Audio implementation — no `AudioContext`, no
 * `AnalyserNode` — so the rAF-driven hooks themselves (`useMicLevelBars`,
 * `useCompanionSpeakingLevelBars`) are exercised through the input bar's own
 * behavioural tests instead; what is unit-testable here in isolation is
 * `sampleAnalyser`'s conversion from a raw byte buffer to `LevelBars`, fed a
 * hand-built fake shaped like the one real method it calls.
 */

function fakeAnalyser(bytes: number[]): AnalyserNode {
  return {
    getByteTimeDomainData: (out: Uint8Array) => {
      for (let i = 0; i < out.length; i += 1) out[i] = bytes[i] ?? 128;
    },
  } as unknown as AnalyserNode;
}

describe('sampleAnalyser', () => {
  it('returns WAVEFORM_BAR_COUNT levels, all 0..1', () => {
    const buffer = new Uint8Array(64) as Uint8Array<ArrayBuffer>;
    const bars = sampleAnalyser(fakeAnalyser(new Array(64).fill(128)), buffer);
    expect(bars).toHaveLength(WAVEFORM_BAR_COUNT);
    for (const level of bars) {
      expect(level).toBeGreaterThanOrEqual(0);
      expect(level).toBeLessThanOrEqual(1);
    }
  });

  it('reads silence (every byte at the 128 midpoint) as every bar at 0', () => {
    const buffer = new Uint8Array(64) as Uint8Array<ArrayBuffer>;
    const bars = sampleAnalyser(fakeAnalyser(new Array(64).fill(128)), buffer);
    expect(bars.every((level) => level === 0)).toBe(true);
  });

  it('reads a full-scale sample (byte 255, the furthest a byte gets from the 128 midpoint) as the loudest bar', () => {
    const buffer = new Uint8Array(64) as Uint8Array<ArrayBuffer>;
    const silent = sampleAnalyser(fakeAnalyser(new Array(64).fill(128)), buffer);
    const loud = sampleAnalyser(fakeAnalyser(new Array(64).fill(255)), buffer);
    for (let i = 0; i < WAVEFORM_BAR_COUNT; i += 1) {
      expect(loud[i]).toBeGreaterThan(silent[i] ?? 0);
      expect(loud[i]).toBeCloseTo(127 / 128, 5);
    }
  });

  it('takes the peak within each bar\'s own chunk, not an average', () => {
    // One loud sample at the very start of the buffer, everything else
    // silent — only the first bar (whose chunk contains index 0) should be
    // non-zero.
    const bytes = new Array(WAVEFORM_BAR_COUNT * 8).fill(128);
    bytes[0] = 255;
    const buffer = new Uint8Array(bytes.length) as Uint8Array<ArrayBuffer>;
    const bars = sampleAnalyser(fakeAnalyser(bytes), buffer);

    expect(bars[0]).toBeCloseTo(127 / 128, 5);
    expect(bars.slice(1).every((level) => level === 0)).toBe(true);
  });
});
