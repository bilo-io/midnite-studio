import { SongSchema } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { barAt, buildChangeSummary, describeChange, replyText } from './change-summary';

const note = (pitch: number, startTick: number, durationTicks = 480, velocity = 90) => ({ pitch, startTick, durationTicks, velocity });
const song = (tracks: Array<Record<string, unknown>>, extra: Record<string, unknown> = {}) => SongSchema.parse({ name: 'S', tracks, ...extra });
const BAR = 1920; // 4/4 at 480 PPQ

describe('barAt', () => {
  it('counts 4/4 bars from 1', () => {
    expect(barAt([{ tick: 0, numerator: 4, denominator: 4 }], 0)).toBe(1);
    expect(barAt([{ tick: 0, numerator: 4, denominator: 4 }], BAR - 1)).toBe(1);
    expect(barAt([{ tick: 0, numerator: 4, denominator: 4 }], BAR * 4)).toBe(5);
  });
  it('restarts the bar at a signature change', () => {
    const sigs = [
      { tick: 0, numerator: 4, denominator: 4 as const },
      { tick: BAR * 2, numerator: 3, denominator: 4 as const },
    ];
    expect(barAt(sigs, BAR * 2)).toBe(3);
    expect(barAt(sigs, BAR * 2 + 1440)).toBe(4);
  });
});

describe('buildChangeSummary', () => {
  it('reports the bars and notes an added run touched, and the indices to select', () => {
    const before = song([{ id: 'b', name: 'Bass', notes: [note(40, 0)] }]);
    const after = song([{ id: 'b', name: 'Bass', notes: [note(40, 0), note(43, BAR * 4), note(45, BAR * 5 + 480)] }]);
    const { changes, extras } = buildChangeSummary(before, after);
    expect(extras).toEqual([]);
    expect(changes).toEqual([
      { trackId: 'b', trackName: 'Bass', fromBar: 5, toBar: 6, added: 2, removed: 0, noteIndices: [1, 2] },
    ]);
  });

  it('counts removed notes and includes their bars, with no indices for what is gone', () => {
    const before = song([{ id: 'l', name: 'Lead', notes: [note(60, 0), note(62, BAR * 2)] }]);
    const after = song([{ id: 'l', name: 'Lead', notes: [note(60, 0)] }]);
    const { changes } = buildChangeSummary(before, after);
    expect(changes).toMatchObject([{ trackId: 'l', fromBar: 3, toBar: 3, added: 0, removed: 1, noteIndices: [] }]);
  });

  it('treats a rewritten note as one removed and one added', () => {
    const before = song([{ id: 'l', name: 'Lead', notes: [note(60, 0, 480, 90)] }]);
    const after = song([{ id: 'l', name: 'Lead', notes: [note(60, 0, 480, 40)] }]);
    expect(buildChangeSummary(before, after).changes).toMatchObject([{ added: 1, removed: 1, noteIndices: [0] }]);
  });

  it('handles duplicates by multiplicity', () => {
    const before = song([{ id: 'k', name: 'Kit', notes: [note(36, 0)] }]);
    const after = song([{ id: 'k', name: 'Kit', notes: [note(36, 0), note(36, 0)] }]);
    expect(buildChangeSummary(before, after).changes).toMatchObject([{ added: 1, removed: 0, noteIndices: [1] }]);
  });

  it('lists tempo, instrument and track changes as extras', () => {
    const before = song([{ id: 'a', name: 'A', program: 0 }, { id: 'gone', name: 'Gone' }]);
    const after = song([{ id: 'a', name: 'A', program: 40 }, { id: 'n', name: 'Strings' }], {
      tempos: [{ tick: 0, bpm: 90 }],
    });
    const { changes, extras } = buildChangeSummary(before, after);
    expect(changes).toEqual([]);
    expect(extras).toEqual([
      'Changed the instrument of "A"',
      'Added track "Strings"',
      'Removed track "Gone"',
      'Set the tempo to 90 BPM',
    ]);
  });

  it('is empty for an identical song', () => {
    const s = song([{ id: 'a', name: 'A', notes: [note(60, 0)] }]);
    expect(buildChangeSummary(s, s)).toEqual({ changes: [], extras: [] });
  });
});

describe('replyText', () => {
  it('writes the agent line then a bulleted what-changed list', () => {
    const c = { trackId: 'b', trackName: 'Bass', fromBar: 5, toBar: 8, added: 12, removed: 2, noteIndices: [] };
    expect(describeChange(c)).toBe('**Bass**, bars 5–8 (+12 notes, −2 notes)');
    expect(replyText('Added a walking bass.', { changes: [c], extras: ['Set the tempo to 90 BPM'] })).toBe(
      'Added a walking bass.\n\n**What changed**\n- **Bass**, bars 5–8 (+12 notes, −2 notes)\n- Set the tempo to 90 BPM',
    );
  });
  it('says so when nothing changed', () => {
    expect(replyText('', { changes: [], extras: [] })).toBe('The song did not change.');
  });
});
