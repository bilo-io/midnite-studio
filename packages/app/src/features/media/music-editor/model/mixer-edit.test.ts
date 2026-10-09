import { SongSchema, type Song } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import {
  addEffect,
  addLane,
  addLanePoint,
  availableTargets,
  moveEffect,
  removeEffect,
  removeLane,
  setChannel,
  setEffectBypass,
  setEffectParam,
  setLaneCurve,
  targetRange,
} from './mixer-edit';

const base = (): Song => SongSchema.parse({ tracks: [{ id: 'a' }, { id: 'b' }] });

function withChain(): Song {
  let song = base();
  for (const type of ['reverb', 'delay', 'eq3'] as const) song = addEffect(song, 'a', type)!.song;
  return song;
}

describe('mixer strips', () => {
  it('sets and clamps volume, pan, mute and solo', () => {
    let song = setChannel(base(), 'a', { volume: 5, pan: -3, mute: true, solo: true });
    expect(song.tracks[0]!.mixer).toEqual({ volume: 2, pan: -1, mute: true, solo: true });
    expect(song.tracks[1]!.mixer.volume).toBe(0.8);
    song = setChannel(song, 'master', { volume: 0.5 });
    expect(song.mixer.master.volume).toBe(0.5);
  });
  it('returns the same song when nothing changes', () => {
    const song = base();
    expect(setChannel(song, 'a', { volume: 0.8 })).toBe(song);
    expect(setChannel(song, 'master', {})).toBe(song);
  });
});

describe('effects chain', () => {
  it('adds with unique ids in order and validates against the schema', () => {
    const song = withChain();
    expect(song.tracks[0]!.effects.map((e) => `${e.id}:${e.type}`)).toEqual([
      'fx1:reverb',
      'fx2:delay',
      'fx3:eq3',
    ]);
    expect(SongSchema.safeParse(song).success).toBe(true);
  });
  it('refuses beyond the limit', () => {
    let song = base();
    for (let i = 0; i < 8; i++) song = addEffect(song, 'a', 'filter')!.song;
    expect(addEffect(song, 'a', 'filter')).toBeNull();
  });
  it('reorders, clamping the target index', () => {
    expect(moveEffect(withChain(), 'a', 'fx3', 0).tracks[0]!.effects.map((e) => e.id)).toEqual([
      'fx3',
      'fx1',
      'fx2',
    ]);
    expect(moveEffect(withChain(), 'a', 'fx1', 99).tracks[0]!.effects.map((e) => e.id)).toEqual([
      'fx2',
      'fx3',
      'fx1',
    ]);
  });
  it('bypasses and clamps parameters', () => {
    let song = setEffectBypass(withChain(), 'a', 'fx2', true);
    expect(song.tracks[0]!.effects[1]!.bypass).toBe(true);
    song = setEffectParam(song, 'a', 'fx1', 'decay', 999);
    expect(song.tracks[0]!.effects[0]!.params.decay).toBe(10);
    expect(setEffectParam(song, 'a', 'fx1', 'nonsense', 1)).toBe(song);
  });
  it('removing an effect drops the lanes that automate it', () => {
    let song = withChain();
    song = addLane(song, 'a', 'fx:fx1:wet')!.song;
    song = addLane(song, 'a', 'volume')!.song;
    song = removeEffect(song, 'a', 'fx1');
    expect(song.tracks[0]!.automation.map((l) => l.target)).toEqual(['volume']);
    expect(SongSchema.safeParse(song).success).toBe(true);
  });
});

describe('automation lanes', () => {
  it('adds a lane per target once, and refuses a dangling target', () => {
    const song = addLane(withChain(), 'a', 'fx:fx2:feedback')!.song;
    expect(addLane(song, 'a', 'fx:fx2:feedback')).toBeNull();
    expect(addLane(song, 'a', 'fx:nope:wet')).toBeNull();
    expect(availableTargets(song.tracks[0]!).some((t) => t.target === 'fx:fx2:feedback')).toBe(
      false,
    );
  });
  it('clamps points into the target range and sorts them', () => {
    let { song, id } = addLane(base(), 'a', 'pan')!;
    song = addLanePoint(song, 'a', id, { tick: 960, value: 7 });
    song = addLanePoint(song, 'a', id, { tick: 0, value: -0.5 });
    expect(song.tracks[0]!.automation[0]!.points).toEqual([
      { tick: 0, value: -0.5 },
      { tick: 960, value: 1 },
    ]);
  });
  it('switches curve and removes a lane', () => {
    let { song, id } = addLane(base(), 'a', 'volume')!;
    song = setLaneCurve(song, 'a', id, 'step');
    expect(song.tracks[0]!.automation[0]!.curve).toBe('step');
    expect(removeLane(song, 'a', id).tracks[0]!.automation).toEqual([]);
  });
  it('describes the range of each target kind', () => {
    const track = withChain().tracks[0]!;
    expect(targetRange(track, 'volume')).toMatchObject({ min: 0, max: 2 });
    expect(targetRange(track, 'fx:fx1:decay')).toMatchObject({
      min: 0.1,
      max: 10,
      label: 'Reverb Decay',
    });
    expect(targetRange(track, 'fx:zz:decay')).toBeNull();
  });
});
