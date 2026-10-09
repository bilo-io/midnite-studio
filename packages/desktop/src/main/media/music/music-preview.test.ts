import { emptySong, type Song } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { decodePng } from '../png/png-codec';
import { renderPianoRoll, ticksPerBarOf } from './music-preview';

/** vitest: the piano-roll picture — size follows the bar range, notes show in their track's colour. */
function song(): Song {
  return {
    ...emptySong('s'),
    tracks: [
      { id: 'a', name: 'A', channel: 0, program: 0, color: '#ff0000', notes: [{ pitch: 60, startTick: 0, durationTicks: 1920, velocity: 127 }], controlChanges: [], pitchBends: [], automation: [], effects: [], mixer: { volume: 0.8, pan: 0, mute: false, solo: false } },
    ],
  };
}

describe('renderPianoRoll', () => {
  it('is as wide as the bars asked for and decodes as a PNG', () => {
    const one = renderPianoRoll(song(), 1, 1);
    const four = renderPianoRoll(song(), 1, 4);
    expect(four.width).toBe(one.width * 4);
    const decoded = decodePng(four.png);
    expect(decoded.ok && decoded.image.width).toBe(four.width);
    expect(four.pitchRange).toEqual([60, 60]);
  });

  it('draws a note in its track colour and leaves an empty range plain', () => {
    const roll = renderPianoRoll(song(), 1, 1);
    const decoded = decodePng(roll.png);
    if (!decoded.ok) throw new Error('decode failed');
    const { width, height, data } = decoded.image as { width: number; height: number; data: Uint8Array };
    let red = 0;
    for (let i = 0; i < width * height; i += 1) if (data[i * 4]! > 200 && data[i * 4 + 1]! < 40) red += 1;
    expect(red).toBeGreaterThan(100);

    const empty = renderPianoRoll(song(), 3, 1);
    expect(empty.pitchRange).toBeNull();
    const plain = decodePng(empty.png);
    if (!plain.ok) throw new Error('decode failed');
    const pd = plain.image.data as Uint8Array;
    let reds = 0;
    for (let i = 0; i < pd.length / 4; i += 1) if (pd[i * 4]! > 200 && pd[i * 4 + 1]! < 40) reds += 1;
    expect(reds).toBe(0);
  });

  it('counts bars in the first time signature', () => {
    const waltz = { ...emptySong('w'), timeSignatures: [{ tick: 0, numerator: 3, denominator: 4 as const }] };
    expect(ticksPerBarOf(waltz)).toBe(1440);
    expect(ticksPerBarOf(emptySong('x'))).toBe(1920);
  });
});
