// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { classifyPath, cleanTitle, isSidecarArt, parseEpisode, titleAndYear } from './classify';

describe('titleAndYear', () => {
  it('reads `Title (2009)`, `Title [2009]` and a release name', () => {
    expect(titleAndYear('Up (2009)')).toEqual({ title: 'Up', year: 2009 });
    expect(titleAndYear('Up [2009]')).toEqual({ title: 'Up', year: 2009 });
    expect(titleAndYear('The.Matrix.1999.1080p.BluRay.x264')).toEqual({
      title: 'The Matrix',
      year: 1999,
    });
    expect(titleAndYear('Blade_Runner_2049_2017_2160p')).toEqual({
      title: 'Blade Runner 2049',
      year: 2017,
    });
  });

  it('leaves a title without a year alone', () => {
    expect(titleAndYear('Mr. Robot')).toEqual({ title: 'Mr. Robot', year: null });
    expect(cleanTitle('Some.Film.720p.WEB-DL')).toBe('Some Film');
  });
});

describe('parseEpisode', () => {
  it('reads S01E02 and 1x02', () => {
    expect(parseEpisode('The.Wire.S01E02.The.Detail')).toEqual({
      showTitle: 'The Wire',
      season: 1,
      episode: 2,
      rest: 'The Detail',
    });
    expect(parseEpisode('Fargo - 2x10 - Palindrome')).toEqual({
      showTitle: 'Fargo',
      season: 2,
      episode: 10,
      rest: 'Palindrome',
    });
    expect(parseEpisode('Up (2009)')).toBeNull();
  });
});

describe('classifyPath', () => {
  it('classifies a film from its name, or its folder when the file is generic', () => {
    expect(classifyPath('Films/Up (2009)/Up (2009).mkv')).toMatchObject({
      kind: 'film',
      title: 'Up',
      year: 2009,
    });
    expect(classifyPath('Films/Heat (1995)/movie.mkv')).toMatchObject({
      kind: 'film',
      title: 'Heat',
      year: 1995,
    });
    expect(classifyPath('loose.mp4')).toMatchObject({ kind: 'film', title: 'loose', year: null });
  });

  it('classifies an episode by name, or by its Season folder', () => {
    expect(classifyPath('TV/The Wire/Season 1/The.Wire.S01E02.mkv')).toMatchObject({
      kind: 'show',
      showTitle: 'The Wire',
      season: 1,
      episode: 2,
      title: 'Episode 2',
    });
    expect(classifyPath('TV/Fargo (2014)/Season 02/03 - The Myth of Sisyphus.mkv')).toMatchObject({
      kind: 'show',
      showTitle: 'Fargo',
      season: 2,
      episode: 3,
      title: 'The Myth of Sisyphus',
    });
    // No show name in the file: the folder above the season folder names it.
    expect(classifyPath('TV/Severance/Season 1/S01E04.mkv')).toMatchObject({
      kind: 'show',
      showTitle: 'Severance',
      episode: 4,
    });
  });

  it('classifies music from Artist/Album/NN - Title, or `Artist - Title`', () => {
    expect(classifyPath('Music/Radiohead/OK Computer (1997)/02 - Paranoid Android.flac')).toEqual({
      kind: 'music',
      title: 'Paranoid Android',
      year: 1997,
      showTitle: null,
      season: null,
      episode: null,
      artist: 'Radiohead',
      album: 'OK Computer',
      track: 2,
    });
    expect(classifyPath('Singles/Bjork - Joga.mp3')).toMatchObject({
      kind: 'music',
      artist: 'Bjork',
      title: 'Joga',
      track: null,
    });
  });

  it('keeps photos, but not artwork beside other media', () => {
    expect(classifyPath('Photos/2024 Lisbon/IMG_0001.HEIC')).toMatchObject({
      kind: 'photo',
      title: 'IMG_0001',
      album: '2024 Lisbon',
    });
    expect(classifyPath('Films/Up (2009)/poster.jpg')).toBeNull();
    expect(classifyPath('Films/Up (2009)/Up (2009)-fanart.jpg')).toBeNull();
    expect(classifyPath('Films/Up (2009)/Up (2009).jpg', new Set(['up (2009)']))).toBeNull();
  });

  it('ignores what it does not hold', () => {
    expect(classifyPath('Films/Up (2009)/Up (2009).nfo')).toBeNull();
    expect(classifyPath('Films/Up (2009)/Up (2009).srt')).toBeNull();
    expect(classifyPath('')).toBeNull();
  });
});

describe('isSidecarArt', () => {
  it('names folder art, suffixed art and same-stem images', () => {
    expect(isSidecarArt('folder.jpg', new Set())).toBe(true);
    expect(isSidecarArt('cover.PNG', new Set())).toBe(true);
    expect(isSidecarArt('track.jpg', new Set(['track']))).toBe(true);
    expect(isSidecarArt('beach.jpg', new Set(['track']))).toBe(false);
    expect(isSidecarArt('notes.txt', new Set())).toBe(false);
  });
});
