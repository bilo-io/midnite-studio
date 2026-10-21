import { describe, expect, it } from 'vitest';

import {
  GM_DRUM_CHANNEL,
  GM_FAMILIES,
  GM_PROGRAMS,
  GmLoadResultSchema,
  GmProgressSchema,
  gmProgramsByFamily,
  gmSampleSetUrl,
} from './media-music-gm';

describe('GM catalogue', () => {
  it('has all 128 programs, unique, in program order', () => {
    expect(GM_PROGRAMS).toHaveLength(128);
    expect(new Set(GM_PROGRAMS.map((p) => p.id)).size).toBe(128);
    GM_PROGRAMS.forEach((p, index) => expect(p.program).toBe(index));
  });

  it('groups eight programs into each of the 16 families', () => {
    const groups = gmProgramsByFamily();
    expect(groups.map((g) => g.family)).toEqual([...GM_FAMILIES]);
    for (const g of groups) expect(g.programs).toHaveLength(8);
    expect(GM_PROGRAMS[0]).toMatchObject({ name: 'Acoustic Grand Piano', family: 'Piano' });
    expect(GM_PROGRAMS[24]).toMatchObject({ id: 'acoustic_guitar_nylon', family: 'Guitar' });
    expect(GM_PROGRAMS[127]).toMatchObject({ id: 'gunshot', family: 'Sound Effects' });
  });

  it('builds sample-set urls and names channel 10', () => {
    expect(gmSampleSetUrl(0, 'https://h')).toBe('https://h/acoustic_grand_piano-mp3.js');
    expect(gmSampleSetUrl(128)).toBeUndefined();
    expect(GM_DRUM_CHANNEL).toBe(9);
  });

  it('validates the wire payloads', () => {
    expect(GmLoadResultSchema.safeParse({ program: 0, notes: { C4: 'QUJD' } }).success).toBe(true);
    expect(GmProgressSchema.safeParse({ program: 3, phase: 'download', fraction: 2 }).success).toBe(false);
  });
});
