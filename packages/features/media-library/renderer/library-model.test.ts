import { describe, expect, it, vi } from 'vitest';

import {
  continueWatching,
  countByKind,
  episodeCode,
  formatClock,
  groupAlbums,
  groupShows,
  matchesQuery,
  watchedFraction,
} from './library-model';
import { makeItem } from './test-items';
import { createProgressSaver, PROGRESS_SAVE_INTERVAL_MS } from './use-library';

const progress = (positionS: number, durationS: number, updatedAt: number, finished = false) => ({
  positionS,
  durationS,
  updatedAt,
  finished,
});

describe('continueWatching', () => {
  it('lists started, unfinished films and episodes, latest first', () => {
    const items = [
      makeItem({ id: 'a', kind: 'film', title: 'A', progress: progress(600, 6000, 1) }),
      makeItem({ id: 'b', kind: 'show', title: 'B', progress: progress(300, 1500, 3) }),
      makeItem({ id: 'c', kind: 'film', title: 'C', progress: progress(10, 6000, 5) }), // barely started
      makeItem({ id: 'd', kind: 'film', title: 'D', progress: progress(0, 6000, 6, true) }), // finished
      makeItem({ id: 'e', kind: 'music', title: 'E', progress: progress(120, 300, 7) }), // music is not "watching"
      makeItem({ id: 'f', kind: 'film', title: 'F' }),
    ];
    expect(continueWatching(items).map((i) => i.id)).toEqual(['b', 'a']);
  });
});

describe('grouping', () => {
  it('gathers episodes into shows in season/episode order', () => {
    const shows = groupShows([
      makeItem({
        id: '2',
        kind: 'show',
        title: 'Two',
        showTitle: 'The Wire',
        season: 1,
        episode: 2,
      }),
      makeItem({
        id: '1',
        kind: 'show',
        title: 'One',
        showTitle: 'The Wire',
        season: 1,
        episode: 1,
      }),
      makeItem({ id: 'x', kind: 'show', title: 'X', showTitle: 'Fargo', season: 2, episode: 1 }),
      makeItem({ id: 'f', kind: 'film', title: 'Up' }),
    ]);
    expect(shows.map((s) => s.title)).toEqual(['Fargo', 'The Wire']);
    expect(shows[1]?.episodes.map((e) => e.id)).toEqual(['1', '2']);
  });

  it('gathers tracks into albums in track order', () => {
    const albums = groupAlbums([
      makeItem({ id: 'b', kind: 'music', title: 'B', artist: 'Björk', album: 'Post', track: 2 }),
      makeItem({ id: 'a', kind: 'music', title: 'A', artist: 'Björk', album: 'Post', track: 1 }),
      makeItem({ id: 's', kind: 'music', title: 'Loose', artist: null, album: null }),
    ]);
    expect(albums.map((a) => a.title)).toEqual(['Singles', 'Post']);
    expect(albums[1]?.tracks.map((t) => t.id)).toEqual(['a', 'b']);
  });

  it('counts by kind and matches a query across fields', () => {
    const items = [
      makeItem({ id: 'a', kind: 'film', title: 'Up', year: 2009 }),
      makeItem({ id: 'b', kind: 'music', title: 'Joga', artist: 'Björk' }),
    ];
    expect(countByKind(items)).toEqual({ film: 1, show: 0, music: 1, photo: 0 });
    expect(items.filter((i) => matchesQuery(i, 'björk')).map((i) => i.id)).toEqual(['b']);
    expect(items.filter((i) => matchesQuery(i, '2009')).map((i) => i.id)).toEqual(['a']);
    expect(items.filter((i) => matchesQuery(i, '  ')).length).toBe(2);
  });
});

describe('formatting', () => {
  it('formats clocks, episode codes and watched fractions', () => {
    expect(formatClock(65)).toBe('1:05');
    expect(formatClock(3723)).toBe('1:02:03');
    expect(
      episodeCode(makeItem({ id: 'e', kind: 'show', title: 'E', season: 1, episode: 2 })),
    ).toBe('S01E02');
    expect(episodeCode(makeItem({ id: 'f', kind: 'film', title: 'F' }))).toBeNull();
    expect(
      watchedFraction(
        makeItem({ id: 'g', kind: 'film', title: 'G', progress: progress(50, 200, 1) }),
      ),
    ).toBe(0.25);
    expect(
      watchedFraction(
        makeItem({ id: 'h', kind: 'film', title: 'H', progress: progress(0, 200, 1, true) }),
      ),
    ).toBe(1);
  });
});

describe('createProgressSaver', () => {
  it('saves at most once per interval while playing, and always on pause or end', () => {
    let t = 0;
    const write = vi.fn();
    const save = createProgressSaver('item', write, () => t);
    save(40, 100, false);
    save(41, 100, false); // throttled
    t += PROGRESS_SAVE_INTERVAL_MS;
    save(52, 100, false);
    save(53, 100, false, true); // pause
    save(100, 100, true); // end
    expect(write.mock.calls.map(([req]) => req)).toEqual([
      { itemId: 'item', positionS: 40, durationS: 100 },
      { itemId: 'item', positionS: 52, durationS: 100 },
      { itemId: 'item', positionS: 53, durationS: 100 },
      { itemId: 'item', positionS: 100, durationS: 100, ended: true },
    ]);
  });

  it('ignores a position that is not a number yet', () => {
    const write = vi.fn();
    createProgressSaver('item', write)(Number.NaN, Number.NaN, false, true);
    expect(write).not.toHaveBeenCalled();
  });
});
