import { SongSchema } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import {
  addEffect,
  addLane,
  addLanePoint,
  setChannel,
  setEffectBypass,
  setEffectParam,
} from '../model/mixer-edit';
import { buildMixerSpec, chainShapeKey, gainToDb, stripValuesAt } from './mixer-spec';
import { createTickMap } from './tick-map';

const map = createTickMap([{ tick: 0, bpm: 120 }]);
const song0 = () => SongSchema.parse({ tracks: [{ id: 'a' }, { id: 'b' }] });

describe('buildMixerSpec', () => {
  it('builds the chain in order and leaves bypassed effects out', () => {
    let song = addEffect(song0(), 'a', 'reverb')!.song;
    song = addEffect(song, 'a', 'delay')!.song;
    song = addEffect(song, 'a', 'filter')!.song;
    song = setEffectBypass(song, 'a', 'fx2', true);
    const chain = buildMixerSpec(song, map).tracks.a!.chain;
    expect(chain.map((n) => n.type)).toEqual(['reverb', 'filter']);
    expect(chain[0]!.params).toMatchObject({ decay: 2.5, wet: 0.3 });
  });
  it('keeps the chain shape key stable across a parameter change but not a bypass', () => {
    const song = addEffect(song0(), 'a', 'reverb')!.song;
    const key = (s: typeof song) => chainShapeKey(buildMixerSpec(s, map).tracks.a!.chain);
    expect(key(setEffectParam(song, 'a', 'fx1', 'decay', 5))).toBe(key(song));
    expect(key(setEffectBypass(song, 'a', 'fx1', true))).not.toBe(key(song));
  });
  it('silences a muted track, and every track but the soloed one', () => {
    const muted = buildMixerSpec(setChannel(song0(), 'a', { mute: true }), map);
    expect(muted.tracks.a!.gain).toBe(0);
    expect(muted.tracks.b!.gain).toBe(0.8);
    const solo = buildMixerSpec(setChannel(song0(), 'b', { solo: true }), map);
    expect(solo.tracks.a!.gain).toBe(0);
    expect(solo.tracks.b!.gain).toBe(0.8);
  });
  it('carries master volume, pan and mute', () => {
    expect(
      buildMixerSpec(setChannel(song0(), 'master', { volume: 0.5, pan: 0.25 }), map).master,
    ).toEqual({ gain: 0.5, pan: 0.25 });
    expect(buildMixerSpec(setChannel(song0(), 'master', { mute: true }), map).master.gain).toBe(0);
  });
  it('turns lanes into timed events and skips empty ones', () => {
    let song = addEffect(song0(), 'a', 'reverb')!.song;
    let r = addLane(song, 'a', 'fx:fx1:wet')!;
    song = addLanePoint(r.song, 'a', r.id, { tick: 0, value: 0 });
    song = addLanePoint(song, 'a', r.id, { tick: 960, value: 1 });
    song = addLane(song, 'a', 'pan')!.song;
    const lanes = buildMixerSpec(song, map).tracks.a!.lanes;
    expect(lanes).toHaveLength(1);
    expect(lanes[0]).toMatchObject({ kind: 'effect', effectId: 'fx1', param: 'wet' });
    expect(lanes[0]!.events.at(-1)).toEqual({ time: 1, value: 1 });
  });
});

describe('stripValuesAt and gainToDb', () => {
  it('reads automated volume, pan and effect values at a position', () => {
    let song = addEffect(song0(), 'a', 'reverb')!.song;
    for (const target of ['volume', 'pan', 'fx:fx1:wet']) {
      const r = addLane(song, 'a', target)!;
      song = addLanePoint(r.song, 'a', r.id, { tick: 0, value: target === 'pan' ? -1 : 0 });
      song = addLanePoint(song, 'a', r.id, { tick: 960, value: target === 'pan' ? 1 : 1 });
    }
    const strip = buildMixerSpec(song, map).tracks.a!;
    const at = stripValuesAt(strip, 1);
    expect(at.gain).toBeCloseTo(1);
    expect(at.pan).toBeCloseTo(1);
    expect(at.effects.fx1!.wet).toBeCloseTo(1);
    expect(stripValuesAt(strip, 0.5).pan).toBeCloseTo(0, 0);
  });
  it('keeps a silenced strip silent whatever its volume lane says', () => {
    let song = setChannel(song0(), 'a', { mute: true });
    const r = addLane(song, 'a', 'volume')!;
    song = addLanePoint(r.song, 'a', r.id, { tick: 0, value: 1 });
    expect(stripValuesAt(buildMixerSpec(song, map).tracks.a!, 0).gain).toBe(0);
  });
  it('converts gain to dB with a floor', () => {
    expect(gainToDb(1)).toBeCloseTo(0);
    expect(gainToDb(0.5)).toBeCloseTo(-6.02, 1);
    expect(gainToDb(0)).toBe(-100);
  });
});
