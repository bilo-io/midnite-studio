import { MUSIC_MAX_TICKS, MUSIC_PPQ, SongSchema, type Song } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { commit, commitExternal, createHistory, HISTORY_LIMIT, redo, undo } from './history';
import {
  addNote, addTrack, deleteNotes, duplicateNotes, gridTicks, instrumentOf, moveNotes, pitchName, quantizeNotes,
  removeTrack, resizeNotes, setInstrument, setMixerFlag, setVelocities, snapTick, updateTrack,
} from './song-edit';

const note = (pitch: number, startTick: number, durationTicks = 120, velocity = 90) => ({ pitch, startTick, durationTicks, velocity });
const song = (notes = [note(60, 0), note(64, 480)]): Song =>
  SongSchema.parse({ tracks: [{ id: 'a', name: 'A', notes }, { id: 'b', name: 'B' }] });
const notesOf = (s: Song, id = 'a') => s.tracks.find((t) => t.id === id)!.notes;

describe('grid and snap', () => {
  it('converts divisions to ticks', () => {
    expect(gridTicks(4)).toBe(MUSIC_PPQ);
    expect(gridTicks(16)).toBe(MUSIC_PPQ / 4);
  });
  it('snaps to the nearest line, and not at all when the grid is off', () => {
    expect(snapTick(250, 120)).toBe(240);
    expect(snapTick(61, 120)).toBe(120);
    expect(snapTick(-50, 120)).toBe(0);
    expect(snapTick(61.4, 0)).toBe(61);
  });
  it('names pitches', () => {
    expect(pitchName(60)).toBe('C4');
    expect(pitchName(61)).toBe('C#4');
  });
});

describe('note edits', () => {
  it('adds a clamped note and reports its index', () => {
    const r = addNote(song(), 'a', note(200, 10, 99999999, 500))!;
    expect(r.index).toBe(2);
    expect(notesOf(r.song)[2]).toMatchObject({ pitch: 127, velocity: 127, durationTicks: MUSIC_MAX_TICKS - 10 });
    expect(addNote(song(), 'nope', note(60, 0))).toBeNull();
  });
  it('moves a selection and clamps the delta as a group', () => {
    const s = moveNotes(song(), 'a', [0, 1], -9999, 100);
    expect(notesOf(s).map((n) => n.startTick)).toEqual([0, 480]);
    expect(notesOf(s).map((n) => n.pitch)).toEqual([123, 127]);
  });
  it('returns the same song when nothing changes', () => {
    const s = song();
    expect(moveNotes(s, 'a', [0], 0, 0)).toBe(s);
    expect(moveNotes(s, 'a', [], 10, 0)).toBe(s);
    expect(resizeNotes(s, 'a', [0], 0)).toBe(s);
    expect(deleteNotes(s, 'a', [9])).toBe(s);
    expect(quantizeNotes(s, 'a', 'all', 120)).toBe(s);
  });
  it('resizes with a one-tick floor', () => {
    expect(notesOf(resizeNotes(song(), 'a', [0], -1000))[0]!.durationTicks).toBe(1);
    expect(notesOf(resizeNotes(song(), 'a', [1], 60))[1]!.durationTicks).toBe(180);
  });
  it('deletes', () => {
    expect(notesOf(deleteNotes(song(), 'a', [0])).map((n) => n.pitch)).toEqual([64]);
  });
  it('duplicates after the selection, snapped up to the grid, and selects the copies', () => {
    const r = duplicateNotes(song([note(60, 0, 100), note(62, 130, 100)]), 'a', [0, 1], 120)!;
    expect(r.indices).toEqual([2, 3]);
    expect(notesOf(r.song).slice(2).map((n) => n.startTick)).toEqual([240, 370]);
    expect(duplicateNotes(song(), 'a', [], 120)).toBeNull();
  });
  it('quantises starts to the grid, fully or by strength', () => {
    const s = song([note(60, 130), note(62, 250)]);
    expect(notesOf(quantizeNotes(s, 'a', 'all', 120)).map((n) => n.startTick)).toEqual([120, 240]);
    expect(notesOf(quantizeNotes(s, 'a', [0], 120))[1]!.startTick).toBe(250);
    expect(notesOf(quantizeNotes(s, 'a', 'all', 120, 0.5))[0]!.startTick).toBe(125);
  });
  it('sets velocities', () => {
    const s = setVelocities(song(), 'a', new Map([[1, 200], [0, 10]]));
    expect(notesOf(s).map((n) => n.velocity)).toEqual([10, 127]);
  });
  it('keeps the song valid against the schema', () => {
    const s = moveNotes(duplicateNotes(song(), 'a', [0], 120)!.song, 'a', [0], 30, 2);
    expect(SongSchema.safeParse(s).success).toBe(true);
  });
});

describe('tracks', () => {
  it('adds with a fresh id and removes with its clips', () => {
    const s = addTrack(song());
    expect(s.tracks.map((t) => t.id)).toEqual(['a', 'b', 'track-3']);
    expect(SongSchema.safeParse(s).success).toBe(true);
    const withClip = { ...s, clips: [{ id: 'c', trackId: 'a', name: '', startTick: 0, lengthTicks: 10, sourceStartTick: 0, loop: false }] };
    expect(removeTrack(withClip, 'a').clips).toEqual([]);
  });
  it('renames, recolours and mutes without touching other tracks', () => {
    const s = song();
    const next = setMixerFlag(updateTrack(s, 'a', { name: 'Lead', color: '#112233' }), 'a', 'mute', true);
    expect(next.tracks[0]).toMatchObject({ name: 'Lead', color: '#112233', mixer: { mute: true } });
    expect(next.tracks[1]).toBe(s.tracks[1]);
    expect(updateTrack(s, 'a', { name: 'A' })).toBe(s);
  });
  it('maps the drum kit to channel 10 and back off it', () => {
    const kit = setInstrument(song(), 'a', { kind: 'drums' });
    expect(kit.tracks[0]).toMatchObject({ channel: 9, program: 0 });
    expect(instrumentOf(kit.tracks[0]!)).toEqual({ kind: 'drums' });
    const back = setInstrument(kit, 'a', { kind: 'program', program: 40 });
    expect(back.tracks[0]).toMatchObject({ channel: 0, program: 40 });
  });
});

describe('history', () => {
  it('undoes and redoes one step per commit', () => {
    let h = createHistory(song());
    h = commit(h, moveNotes(h.present, 'a', [0], 120, 0));
    h = commit(h, deleteNotes(h.present, 'a', [1]));
    expect(notesOf(h.present)).toHaveLength(1);
    h = undo(h);
    expect(notesOf(h.present)).toHaveLength(2);
    h = undo(h);
    expect(notesOf(h.present)[0]!.startTick).toBe(0);
    h = redo(h);
    expect(notesOf(h.present)[0]!.startTick).toBe(120);
  });
  it('skips no-op commits and clears redo on a new edit', () => {
    let h = createHistory(song());
    expect(commit(h, h.present)).toBe(h);
    h = commit(h, deleteNotes(h.present, 'a', [0]));
    h = undo(h);
    h = commit(h, deleteNotes(h.present, 'a', [1]));
    expect(h.future).toEqual([]);
  });
  it('folds commits sharing a key into one step', () => {
    let h = createHistory(song());
    for (let i = 1; i <= 3; i++) h = commit(h, moveNotes(h.present, 'a', [0], 10, 0), 'nudge');
    expect(h.past).toHaveLength(1);
    expect(notesOf(undo(h).present)[0]!.startTick).toBe(0);
  });
  it('lands an external edit as its own step', () => {
    let h = createHistory(song());
    h = commit(h, moveNotes(h.present, 'a', [0], 10, 0), 'nudge');
    h = commitExternal(h, addNote(h.present, 'a', note(70, 0))!.song);
    h = commit(h, moveNotes(h.present, 'a', [0], 10, 0), 'nudge');
    expect(h.past).toHaveLength(3);
  });
  it('caps the stack', () => {
    let h = createHistory(song());
    for (let i = 0; i < HISTORY_LIMIT + 20; i++) h = commit(h, moveNotes(h.present, 'a', [0], 1, 0));
    expect(h.past).toHaveLength(HISTORY_LIMIT);
  });
});
