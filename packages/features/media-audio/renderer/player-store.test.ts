import { describe, expect, it } from 'vitest';

import { buildOrder, createPlayerStore, currentTrack, nextPos, prevPos, type AudioLike, type PlayerTrack } from './player-store';

class FakeAudio implements AudioLike {
  src = '';
  currentTime = 0;
  duration = 100;
  volume = 1;
  paused = true;
  plays: string[] = [];
  private handlers = new Map<string, Array<() => void>>();
  play = () => {
    this.paused = false;
    this.plays.push(this.src);
    this.fire('play');
    return Promise.resolve();
  };
  pause = () => {
    this.paused = true;
    this.fire('pause');
  };
  load = () => undefined;
  addEventListener = ((type: string, fn: () => void) => {
    this.handlers.set(type, [...(this.handlers.get(type) ?? []), fn]);
  }) as AudioLike['addEventListener'];
  fire(type: string) {
    for (const fn of this.handlers.get(type) ?? []) fn();
  }
}

const tracks: PlayerTrack[] = ['a', 'b', 'c', 'd'].map((k) => ({
  key: k,
  title: k.toUpperCase(),
  url: `mstudio-file://${k}.mp3`,
  project: 'p',
  path: `${k}.mp3`,
}));

/** A deterministic "random" so shuffle orders are reproducible. */
const seq = (values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length]!;
};

function setup(random = seq([0.1, 0.9, 0.5, 0.3])) {
  const audio = new FakeAudio();
  const store = createPlayerStore(() => audio, random);
  return { audio, store, key: () => currentTrack(store.getState())?.key };
}

describe('player pure helpers', () => {
  it('nextPos: loop-one repeats on end, but Next still moves on', () => {
    expect(nextPos(1, 4, 'one', true)).toBe(1);
    expect(nextPos(1, 4, 'one', false)).toBe(2);
  });

  it('nextPos: past the end, loop-off stops and loop-all wraps', () => {
    expect(nextPos(3, 4, 'off', true)).toBeNull();
    expect(nextPos(3, 4, 'off', false)).toBeNull();
    expect(nextPos(3, 4, 'all', true)).toBe(0);
  });

  it('prevPos: restarts past 3s, steps back otherwise, wraps only under loop-all', () => {
    expect(prevPos(2, 4, 'off', 10)).toBe(2);
    expect(prevPos(2, 4, 'off', 1)).toBe(1);
    expect(prevPos(0, 4, 'off', 1)).toBe(0);
    expect(prevPos(0, 4, 'all', 1)).toBe(3);
  });

  it('buildOrder puts the playing track first and is a permutation', () => {
    const order = buildOrder(5, true, 3, seq([0.7, 0.2, 0.9, 0.4]));
    expect(order[0]).toBe(3);
    expect([...order].sort()).toEqual([0, 1, 2, 3, 4]);
    expect(buildOrder(3, false, 2)).toEqual([0, 1, 2]);
  });
});

describe('player store', () => {
  it('plays the chosen track and advances in queue order', () => {
    const { audio, store, key } = setup();
    store.getState().playQueue(tracks, 'b');
    expect(key()).toBe('b');
    expect(store.getState().playing).toBe(true);
    store.getState().next();
    expect(key()).toBe('c');
    expect(audio.plays).toEqual(['mstudio-file://b.mp3', 'mstudio-file://c.mp3']);
  });

  it('next at the end of the queue with loop off stops', () => {
    const { audio, store, key } = setup();
    store.getState().playQueue(tracks, 'd');
    audio.fire('ended');
    expect(store.getState().playing).toBe(false);
    expect(audio.paused).toBe(true);
    expect(key()).toBe('d');
    expect(audio.plays).toHaveLength(1);
  });

  it('loop-one repeats the same track when it ends', () => {
    const { audio, store, key } = setup();
    store.getState().playQueue(tracks, 'b');
    store.getState().cycleLoop(); // all
    store.getState().cycleLoop(); // one
    expect(store.getState().loop).toBe('one');
    audio.fire('ended');
    audio.fire('ended');
    expect(key()).toBe('b');
    expect(audio.plays).toEqual(['mstudio-file://b.mp3', 'mstudio-file://b.mp3', 'mstudio-file://b.mp3']);
  });

  it('loop-all wraps to the first track', () => {
    const { audio, store, key } = setup();
    store.getState().playQueue(tracks, 'd');
    store.getState().cycleLoop();
    audio.fire('ended');
    expect(key()).toBe('a');
  });

  it('shuffle order stays stable within a pass and visits every track once', () => {
    const { audio, store, key } = setup();
    store.getState().playQueue(tracks, 'a');
    store.getState().toggleShuffle();
    const order = [...store.getState().order];
    expect(key()).toBe('a');
    const heard = [key()];
    for (let i = 0; i < 3; i++) {
      audio.fire('ended');
      heard.push(key());
      expect(store.getState().order).toEqual(order);
    }
    expect([...heard].sort()).toEqual(['a', 'b', 'c', 'd']);
    audio.fire('ended');
    expect(store.getState().playing).toBe(false);
  });

  it('toggle pauses and resumes; volume and seek clamp', () => {
    const { audio, store } = setup();
    store.getState().playQueue(tracks, 'a');
    store.getState().toggle();
    expect(audio.paused).toBe(true);
    expect(store.getState().playing).toBe(false);
    store.getState().toggle();
    expect(audio.paused).toBe(false);
    store.getState().setVolume(2);
    expect(audio.volume).toBe(1);
    audio.fire('loadedmetadata');
    store.getState().seek(500);
    expect(audio.currentTime).toBe(100);
  });
});
