import { SongSchema, type Song } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { gridOf, lanesFor, readPattern, setGrid, slotOf, slotTick, toggleStep } from './drum-grid';

const BAR = 1920;
const drums = (): Song => SongSchema.parse({ tracks: [{ id: 'd', channel: 9, notes: [] }] });
const track = (s: Song) => s.tracks[0]!;

describe('drum grid', () => {
  it('writes a step as an ordinary note and reads it back', () => {
    let s = toggleStep(drums(), 'd', { barIndex: 0, step: 4, pitch: 36 }, BAR, 80);
    s = toggleStep(s, 'd', { barIndex: 1, step: 0, pitch: 38 }, BAR);
    expect(track(s).notes).toEqual([
      { pitch: 36, startTick: 480, durationTicks: 120, velocity: 80 },
      { pitch: 38, startTick: 1920, durationTicks: 120, velocity: 100 },
    ]);
    expect(readPattern(track(s), 0, BAR, gridOf(track(s))).get(36)![4]).toBe(80);
    expect(readPattern(track(s), 1, BAR, gridOf(track(s))).get(38)![0]).toBe(100);
  });

  it('round trips every step of a 32-step bar with swing', () => {
    let s = setGrid(drums(), 'd', { steps: 32, swing: 0.33 }, BAR);
    const hits = [0, 1, 5, 6, 17, 30, 31];
    for (const step of hits) s = toggleStep(s, 'd', { barIndex: 0, step, pitch: 42 }, BAR, 60 + step);
    const row = readPattern(track(s), 0, BAR, gridOf(track(s))).get(42)!;
    expect(row).toHaveLength(32);
    row.forEach((v, i) => expect(v).toBe(hits.includes(i) ? 60 + i : 0));
  });

  it('toggles a step off again and ignores off-grid notes', () => {
    let s = toggleStep(drums(), 'd', { barIndex: 0, step: 2, pitch: 36 }, BAR);
    s = { ...s, tracks: [{ ...track(s), notes: [...track(s).notes, { pitch: 36, startTick: 60, durationTicks: 10, velocity: 70 }] }] };
    expect(readPattern(track(s), 0, BAR, gridOf(track(s))).get(36)!.filter(Boolean)).toHaveLength(1);
    const off = toggleStep(s, 'd', { barIndex: 0, step: 2, pitch: 36 }, BAR);
    expect(track(off).notes).toHaveLength(1);
  });

  it('delays only odd steps by the swing amount', () => {
    const cfg = { steps: 16 as const, swing: 0.5 };
    expect([0, 1, 2, 3].map((g) => slotTick(g, BAR, cfg))).toEqual([0, 180, 240, 420]);
    expect(slotOf(180, BAR, cfg)).toBe(1);
    expect(slotOf(120, BAR, cfg)).toBeNull();
  });

  it('re-times the pattern when swing changes, and back again', () => {
    let s = toggleStep(drums(), 'd', { barIndex: 0, step: 1, pitch: 42 }, BAR);
    s = toggleStep(s, 'd', { barIndex: 0, step: 2, pitch: 42 }, BAR);
    const swung = setGrid(s, 'd', { swing: 0.5 }, BAR);
    expect(track(swung).notes.map((n) => n.startTick)).toEqual([180, 240]);
    expect(track(swung).grid).toEqual({ steps: 16, swing: 0.5 });
    const straight = setGrid(swung, 'd', { swing: 0 }, BAR);
    expect(track(straight).notes.map((n) => n.startTick)).toEqual([120, 240]);
  });

  it('keeps 16-step notes on the grid when going to 32 steps', () => {
    const s = setGrid(toggleStep(drums(), 'd', { barIndex: 0, step: 1, pitch: 36 }, BAR), 'd', { steps: 32 }, BAR);
    expect(readPattern(track(s), 0, BAR, gridOf(track(s))).get(36)![2]).toBe(100);
  });

  it('offers the standard kit plus any other pitch in use', () => {
    const s = toggleStep(drums(), 'd', { barIndex: 0, step: 0, pitch: 60 }, BAR);
    expect(lanesFor(track(s))[0]).toBe(60);
    expect(lanesFor(track(drums()))).toContain(36);
  });
});
