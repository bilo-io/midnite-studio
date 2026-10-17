import type { LibraryKind } from '@midnite/studio-shared';

/**
 * What a file *is*, read from its name and the folders above it — no bytes are read here, so the whole
 * scan's classification is pure and the tests hammer it with names alone.
 *
 * - **Video** is a show episode when its name (or a `Season N` folder above it) says so — `S01E02`,
 *   `s1e2`, `1x02` — and a film otherwise. A film's title and year come from `Title (2009)` or a release
 *   name (`Title.2009.1080p.BluRay…`), falling back to its folder when the file is called `movie.mkv`.
 * - **Audio** is music: `Artist/Album/NN - Title.ext` (tags, when the file has them, win later — see
 *   `tags.ts`).
 * - **Images** are photos, unless they are a sidecar of something else: `folder.jpg`, `poster.jpg`,
 *   `cover.jpg`, `fanart.jpg`, `<video>-poster.jpg` or `<video>.jpg` belong to the media beside them.
 */

export const VIDEO_EXTENSIONS = [
  'mkv',
  'mp4',
  'm4v',
  'mov',
  'avi',
  'webm',
  'wmv',
  'ts',
  'mpg',
  'mpeg',
] as const;
export const AUDIO_EXTENSIONS = [
  'mp3',
  'flac',
  'm4a',
  'aac',
  'ogg',
  'opus',
  'wav',
  'alac',
  'aiff',
] as const;
export const PHOTO_EXTENSIONS = [
  'jpg',
  'jpeg',
  'png',
  'heic',
  'heif',
  'webp',
  'gif',
  'tif',
  'tiff',
  'avif',
] as const;

const VIDEO = new Set<string>(VIDEO_EXTENSIONS);
const AUDIO = new Set<string>(AUDIO_EXTENSIONS);
const PHOTO = new Set<string>(PHOTO_EXTENSIONS);

/** Names a folder's own artwork goes by — never photos in their own right. */
export const FOLDER_ART_NAMES = [
  'folder',
  'poster',
  'cover',
  'fanart',
  'backdrop',
  'thumb',
  'front',
  'album',
  'albumart',
] as const;
const FOLDER_ART = new Set<string>(FOLDER_ART_NAMES);
const ART_SUFFIX = /-(poster|fanart|thumb|backdrop|cover|landscape|banner|clearart|logo)$/i;

export type Classified = {
  kind: LibraryKind;
  title: string;
  year: number | null;
  showTitle: string | null;
  season: number | null;
  episode: number | null;
  artist: string | null;
  album: string | null;
  track: number | null;
};

export const extensionOf = (name: string): string => {
  const dot = name.lastIndexOf('.');
  return dot <= 0 ? '' : name.slice(dot + 1).toLowerCase();
};
export const stemOf = (name: string): string => {
  const dot = name.lastIndexOf('.');
  return dot <= 0 ? name : name.slice(0, dot);
};

export const isVideoName = (name: string): boolean => VIDEO.has(extensionOf(name));
export const isAudioName = (name: string): boolean => AUDIO.has(extensionOf(name));
export const isImageName = (name: string): boolean => PHOTO.has(extensionOf(name));

/**
 * Whether an image is artwork for the media beside it rather than a photo: a folder-art name, an
 * art-suffixed name (`Up (2009)-poster.jpg`), or the same stem as a video or audio file in its folder.
 */
export function isSidecarArt(name: string, siblingStems: ReadonlySet<string>): boolean {
  if (!isImageName(name)) return false;
  const stem = stemOf(name).toLowerCase();
  if (FOLDER_ART.has(stem)) return true;
  if (ART_SUFFIX.test(stem)) return true;
  return siblingStems.has(stem);
}

/** Release-name noise after which nothing is title. */
const RELEASE_TAG =
  /\b(2160p|1080p|720p|480p|4k|uhd|hdr|hdr10|dv|bluray|blu-ray|brrip|bdrip|webrip|web-dl|webdl|web|hdtv|dvdrip|dvd|x264|x265|h264|h265|hevc|xvid|aac|ac3|dts|remux|proper|repack|extended|unrated|imax|10bit)\b/i;

/** Dots and underscores as spaces, brackets' contents dropped, whitespace collapsed. */
export function cleanTitle(raw: string): string {
  let s = raw.replace(/\[[^\]]*\]/g, ' ');
  // Dots or underscores between words are separators in a release name; a lone dot inside a title
  // ("Mr. Robot") survives because it is followed by a space.
  if (!/\s/.test(s) || /[._]\S/.test(s)) s = s.replace(/[._]+/g, ' ');
  const tag = RELEASE_TAG.exec(s);
  if (tag) s = s.slice(0, tag.index);
  return s
    .replace(/\s*[-–]\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** `Title (2009)`, `Title [2009]` or `Title.2009.…`: the title before the year, and the year. */
export function titleAndYear(stem: string): { title: string; year: number | null } {
  const bracketed = /^(.*?)[\s._]*[([](\d{4})[)\]]/.exec(stem);
  if (bracketed && plausibleYear(Number(bracketed[2]))) {
    return { title: cleanTitle(bracketed[1] ?? ''), year: Number(bracketed[2]) };
  }
  // Greedy: the *last* year-like run is the year (`Blade.Runner.2049.2017.2160p`).
  const bare = /^(.+)[\s._-]+((?:19|20)\d{2})(?:[\s._-]|$)/.exec(stem);
  if (bare && plausibleYear(Number(bare[2])) && cleanTitle(bare[1] ?? '').length > 0) {
    return { title: cleanTitle(bare[1] ?? ''), year: Number(bare[2]) };
  }
  return { title: cleanTitle(stem), year: null };
}

const plausibleYear = (year: number): boolean => year >= 1888 && year <= 2100;

const EPISODE_PATTERNS: readonly RegExp[] = [
  /^(.*?)[\s._-]*\bs(\d{1,2})[\s._-]*e(\d{1,3})\b/i,
  /^(.*?)[\s._-]*\b(\d{1,2})x(\d{2,3})\b/i,
];
const SEASON_FOLDER = /^(?:season|series|staffel|saison)[\s._-]*(\d{1,2})$/i;

/** `Show.S01E02.Title`, `Show - 1x02 - Title`: the show, season, episode and what follows. */
export function parseEpisode(
  stem: string,
): { showTitle: string; season: number; episode: number; rest: string } | null {
  for (const pattern of EPISODE_PATTERNS) {
    const match = pattern.exec(stem);
    if (!match) continue;
    const rest = stem.slice(match[0].length);
    return {
      showTitle: cleanTitle(match[1] ?? ''),
      season: Number(match[2]),
      episode: Number(match[3]),
      rest: cleanTitle(rest.replace(/^[\s._-]+/, '')),
    };
  }
  return null;
}

/** Generic file names that say nothing about the film — its folder names it instead. */
const GENERIC_FILM_STEMS = /^(movie|film|video|main|feature|title[\s_-]?\d*)$/i;

function lastIndexWhere<T>(list: readonly T[], test: (value: T) => boolean): number {
  for (let i = list.length - 1; i >= 0; i--) if (test(list[i] as T)) return i;
  return -1;
}

const blank = {
  showTitle: null,
  season: null,
  episode: null,
  artist: null,
  album: null,
  track: null,
} as const;

/**
 * Classifies one file by its path relative to its root (`/`-separated). Returns null for a file the
 * library does not hold (an unknown extension, a sidecar image) — `siblingStems` is the lowercase stems
 * of the video and audio files in the same folder.
 */
export function classifyPath(
  relPath: string,
  siblingStems: ReadonlySet<string> = new Set(),
): Classified | null {
  const parts = relPath.split('/').filter((p) => p.length > 0);
  const name = parts.at(-1);
  if (!name) return null;
  const folders = parts.slice(0, -1);
  const stem = stemOf(name);

  if (isVideoName(name)) {
    const episode = parseEpisode(stem);
    const seasonFolderIndex = lastIndexWhere(folders, (folder) => SEASON_FOLDER.test(folder));
    if (episode) {
      const showFromFolders =
        seasonFolderIndex > 0 ? cleanTitle(folders[seasonFolderIndex - 1] ?? '') : null;
      const showTitle =
        episode.showTitle || showFromFolders || cleanTitle(folders.at(-1) ?? '') || 'Unknown show';
      return {
        ...blank,
        kind: 'show',
        title: episode.rest || `Episode ${episode.episode}`,
        year: null,
        showTitle: titleAndYear(showTitle).title || showTitle,
        season: episode.season,
        episode: episode.episode,
      };
    }
    if (seasonFolderIndex >= 0) {
      // `Show/Season 2/03 - Title.mkv`: the leading number is the episode.
      const numbered = /^(\d{1,3})(?:[\s._-]+(.*))?$/.exec(stem);
      const show = cleanTitle(folders[seasonFolderIndex - 1] ?? '') || 'Unknown show';
      const season = Number(SEASON_FOLDER.exec(folders[seasonFolderIndex] ?? '')?.[1] ?? '0');
      return {
        ...blank,
        kind: 'show',
        title: numbered
          ? cleanTitle(numbered[2] ?? '') || `Episode ${Number(numbered[1])}`
          : cleanTitle(stem),
        year: null,
        showTitle: titleAndYear(show).title || show,
        season,
        episode: numbered ? Number(numbered[1]) : null,
      };
    }
    const fromName = titleAndYear(stem);
    const folder = folders.at(-1);
    const useFolder =
      folder !== undefined &&
      (GENERIC_FILM_STEMS.test(stem.trim()) ||
        (fromName.year === null && titleAndYear(folder).year !== null));
    const film = useFolder && folder !== undefined ? titleAndYear(folder) : fromName;
    return {
      ...blank,
      kind: 'film',
      title: film.title || cleanTitle(stem) || name,
      year: film.year,
    };
  }

  if (isAudioName(name)) {
    const numbered = /^(?:(\d{1,2})[-.])?(\d{1,3})[\s._-]+(.+)$/.exec(stem);
    const album = folders.length >= 1 ? (folders.at(-1) ?? null) : null;
    const artist = folders.length >= 2 ? (folders.at(-2) ?? null) : null;
    const albumTitle = album === null ? null : titleAndYear(album);
    // `Artist - Title.mp3` loose in a folder.
    const dashed = !numbered ? /^(.+?)\s+-\s+(.+)$/.exec(stem) : null;
    return {
      ...blank,
      kind: 'music',
      title:
        (numbered ? numbered[3]?.replace(/^[\s-]+/, '') : dashed ? dashed[2] : stem)?.trim() ||
        stem,
      year: albumTitle?.year ?? null,
      artist: dashed ? (dashed[1] ?? null) : artist,
      album: albumTitle ? albumTitle.title || album : null,
      track: numbered ? Number(numbered[2]) : null,
    };
  }

  if (isImageName(name)) {
    if (isSidecarArt(name, siblingStems)) return null;
    const album = folders.at(-1) ?? null;
    return { ...blank, kind: 'photo', title: stem, year: null, album };
  }

  return null;
}
