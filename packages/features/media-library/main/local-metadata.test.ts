// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { findLocalArt, parseNfo } from './local-metadata';

describe('parseNfo', () => {
  it('reads a movie .nfo', () => {
    const xml = `<?xml version="1.0"?><movie><title>Up</title><year>2009</year><plot><![CDATA[Carl &amp; Russell fly.]]></plot><thumb>https://example.invalid/p.jpg</thumb></movie>`;
    expect(parseNfo(xml)).toEqual({
      title: 'Up',
      year: 2009,
      plot: 'Carl & Russell fly.',
      showTitle: null,
      season: null,
      episode: null,
    });
  });

  it('reads an episode .nfo, taking the year from `aired`', () => {
    const xml = `<episodedetails><title>The Detail</title><showtitle>The Wire</showtitle><season>1</season><episode>2</episode><aired>2002-06-09</aired><outline>Short</outline></episodedetails>`;
    expect(parseNfo(xml)).toEqual({
      title: 'The Detail',
      year: 2002,
      plot: 'Short',
      showTitle: 'The Wire',
      season: 1,
      episode: 2,
    });
  });

  it('decodes numeric entities, and refuses what is not an nfo', () => {
    expect(parseNfo('<movie><title>Am&#233;lie &#x26; co</title></movie>')?.title).toBe(
      'Amélie & co',
    );
    expect(parseNfo('https://www.themoviedb.org/movie/14160')).toBeNull();
  });
});

describe('findLocalArt', () => {
  const names = ['Up (2009).mkv', 'Up (2009)-poster.jpg', 'folder.jpg', 'fanart.jpg'];

  it('prefers per-file art, then folder art', () => {
    expect(findLocalArt('Up (2009).mkv', names)).toBe('Up (2009)-poster.jpg');
    expect(findLocalArt('Other.mkv', names)).toBe('folder.jpg');
    expect(findLocalArt('Other.mkv', ['Poster.JPG', 'folder.jpg'])).toBe('Poster.JPG');
  });

  it('skips folder art when asked to', () => {
    expect(findLocalArt('Other.mkv', names, { folderArt: false })).toBeNull();
    expect(findLocalArt('a.mkv', ['a.mkv', 'notes.txt'])).toBeNull();
  });
});
