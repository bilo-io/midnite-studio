import { describe, expect, it } from 'vitest';

import { frameToTime, initialPlayer, playerReducer, timelineKey, timeReadout, timeToFrame, type PlayerState } from './player-state';

const at = (over: Partial<PlayerState> = {}): PlayerState => ({ ...initialPlayer(2, 30), ...over });

describe('player-state', () => {
  it('starts paused at 0 with the full range, looping at 1×', () => {
    expect(initialPlayer(2, 30)).toEqual({ time: 0, playing: false, loop: true, speed: 1, inPoint: 0, outPoint: 2, duration: 2, fps: 30 });
  });

  it('falls back to 30 fps and a zero duration for unreadable input', () => {
    expect(initialPlayer(Number.NaN, 0)).toMatchObject({ duration: 0, outPoint: 0, fps: 30 });
  });

  it('converts between time and frames', () => {
    expect(timeToFrame(0.5, 30)).toBe(15);
    expect(frameToTime(15, 30)).toBe(0.5);
  });

  it('plays, pauses and toggles; an empty clip cannot play', () => {
    expect(playerReducer(at(), { type: 'play' }).playing).toBe(true);
    expect(playerReducer(at({ playing: true }), { type: 'pause' }).playing).toBe(false);
    expect(playerReducer(at(), { type: 'toggle' }).playing).toBe(true);
    expect(playerReducer(initialPlayer(0), { type: 'play' }).playing).toBe(false);
  });

  it('play from the end restarts at the in point', () => {
    expect(playerReducer(at({ time: 2, inPoint: 0.5 }), { type: 'play' }).time).toBe(0.5);
    expect(playerReducer(at({ time: 0.2, inPoint: 0.5 }), { type: 'play' }).time).toBe(0.5);
    expect(playerReducer(at({ time: 1 }), { type: 'play' }).time).toBe(1);
  });

  it('scrub pauses and clamps to the clip', () => {
    expect(playerReducer(at({ playing: true }), { type: 'scrub', time: 1.2 })).toMatchObject({ time: 1.2, playing: false });
    expect(playerReducer(at(), { type: 'scrub', time: -4 }).time).toBe(0);
    expect(playerReducer(at(), { type: 'scrub', time: 9 }).time).toBe(2);
  });

  it('steps a whole frame either way and snaps to the frame grid', () => {
    expect(playerReducer(at({ time: 0.5 }), { type: 'step', frames: 1 }).time).toBeCloseTo(16 / 30);
    expect(playerReducer(at({ time: 0.51 }), { type: 'step', frames: -1 }).time).toBeCloseTo(14 / 30);
    expect(playerReducer(at({ time: 0 }), { type: 'step', frames: -1 }).time).toBe(0);
    expect(playerReducer(at({ time: 2 }), { type: 'step', frames: 1 }).time).toBe(2);
  });

  it('sets the range from the playhead, never leaving less than a frame', () => {
    const s = playerReducer(at({ time: 0.5 }), { type: 'setIn' });
    expect(s.inPoint).toBe(0.5);
    expect(playerReducer(s, { type: 'setOut', time: 0.5 }).outPoint).toBeCloseTo(0.5 + 1 / 30);
    expect(playerReducer(s, { type: 'setOut', time: 1.5 }).outPoint).toBe(1.5);
    expect(playerReducer(at({ outPoint: 1 }), { type: 'setIn', time: 1.8 }).inPoint).toBeCloseTo(1 - 1 / 30);
    expect(playerReducer({ ...s, outPoint: 1 }, { type: 'clearRange' })).toMatchObject({ inPoint: 0, outPoint: 2 });
  });

  it('clamps the speed to 0.25–2', () => {
    expect(playerReducer(at(), { type: 'setSpeed', speed: 9 }).speed).toBe(2);
    expect(playerReducer(at(), { type: 'setSpeed', speed: 0 }).speed).toBe(0.25);
    expect(playerReducer(at(), { type: 'setSpeed', speed: 0.5 }).speed).toBe(0.5);
  });

  describe('tick', () => {
    it('advances by dt times speed while playing, and not otherwise', () => {
      expect(playerReducer(at({ playing: true, speed: 2 }), { type: 'tick', dt: 0.1 }).time).toBeCloseTo(0.2);
      expect(playerReducer(at({ speed: 2 }), { type: 'tick', dt: 0.1 }).time).toBe(0);
    });
    it('wraps inside the range when looping', () => {
      const s = at({ playing: true, time: 1.9, inPoint: 1, outPoint: 2 });
      expect(playerReducer(s, { type: 'tick', dt: 0.2 }).time).toBeCloseTo(1.1);
    });
    it('stops at the out point when not looping', () => {
      const s = at({ playing: true, loop: false, time: 1.9, outPoint: 2 });
      expect(playerReducer(s, { type: 'tick', dt: 0.5 })).toMatchObject({ time: 2, playing: false });
    });
  });

  it('maps only the timeline keys', () => {
    expect(timelineKey(' ')).toEqual({ type: 'toggle' });
    expect(timelineKey('ArrowLeft')).toEqual({ type: 'step', frames: -1 });
    expect(timelineKey('ArrowRight')).toEqual({ type: 'step', frames: 1 });
    expect(timelineKey('[')).toEqual({ type: 'setIn' });
    expect(timelineKey(']')).toEqual({ type: 'setOut' });
    expect(timelineKey('L')).toEqual({ type: 'toggleLoop' });
    expect(timelineKey('x')).toBeNull();
  });

  it('reads out time and frame', () => {
    expect(timeReadout({ time: 0.5, fps: 30, duration: 2 })).toBe('0.50s · frame 15 / 60');
  });
});
