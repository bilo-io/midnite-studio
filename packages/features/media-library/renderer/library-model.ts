import { LIBRARY_RESUME_MIN_S, type LibraryItem, type LibraryKind } from '@midnite/studio-shared';

/**
 * Pure views over the library's items (Phase 113 Theme R) — what the tab groups and sorts, kept out of
 * the components so the suite checks it without rendering.
 */

/** How many tiles the continue-watching row shows at most. */
export const CONTINUE_WATCHING_LIMIT = 12;

/** Films and episodes started and not finished, most recently watched first. */
export function continueWatching(items: readonly LibraryItem[]): LibraryItem[] {
  return items
    .filter(
      (item) =>
        (item.kind === 'film' || item.kind === 'show') &&
        item.progress !== null &&
        !item.progress.finished &&
        item.progress.positionS >= LIBRARY_RESUME_MIN_S,
    )
    .sort((a, b) => (b.progress?.updatedAt ?? 0) - (a.progress?.updatedAt ?? 0))
    .slice(0, CONTINUE_WATCHING_LIMIT);
}

/** The fraction watched, 0–1, for a progress bar. */
export function watchedFraction(item: LibraryItem): number {
  const progress = item.progress;
  if (!progress) return 0;
  if (progress.finished) return 1;
  if (progress.durationS <= 0) return 0;
  return Math.min(1, Math.max(0, progress.positionS / progress.durationS));
}

export type ShowGroup = {
  key: string;
  title: string;
  episodes: LibraryItem[];
  /** The first episode's art — season or show posters are what episodes carry. */
  art: LibraryItem['art'];
};

/** Episodes gathered into shows, each show's episodes in season/episode order. */
export function groupShows(items: readonly LibraryItem[]): ShowGroup[] {
  const shows = new Map<string, ShowGroup>();
  for (const item of items) {
    if (item.kind !== 'show') continue;
    const title = item.showTitle ?? 'Unknown show';
    const key = title.toLowerCase();
    const group = shows.get(key) ?? { key, title, episodes: [], art: null };
    group.episodes.push(item);
    group.art ??= item.art;
    shows.set(key, group);
  }
  for (const group of shows.values()) {
    group.episodes.sort(
      (a, b) =>
        (a.season ?? 0) - (b.season ?? 0) ||
        (a.episode ?? 0) - (b.episode ?? 0) ||
        a.path.localeCompare(b.path),
    );
  }
  return [...shows.values()].sort((a, b) => a.title.localeCompare(b.title));
}

export type AlbumGroup = {
  key: string;
  title: string;
  artist: string | null;
  year: number | null;
  tracks: LibraryItem[];
  art: LibraryItem['art'];
};

/** Tracks gathered into albums (artist + album), in track order. */
export function groupAlbums(items: readonly LibraryItem[]): AlbumGroup[] {
  const albums = new Map<string, AlbumGroup>();
  for (const item of items) {
    if (item.kind !== 'music') continue;
    const title = item.album ?? 'Singles';
    const artist = item.artist;
    const key = `${(artist ?? '').toLowerCase()}\0${title.toLowerCase()}`;
    const group = albums.get(key) ?? { key, title, artist, year: item.year, tracks: [], art: null };
    group.tracks.push(item);
    group.art ??= item.art;
    group.year ??= item.year;
    albums.set(key, group);
  }
  for (const group of albums.values()) {
    group.tracks.sort(
      (a, b) => (a.track ?? 999) - (b.track ?? 999) || a.title.localeCompare(b.title),
    );
  }
  return [...albums.values()].sort(
    (a, b) => (a.artist ?? '').localeCompare(b.artist ?? '') || a.title.localeCompare(b.title),
  );
}

/** A case-insensitive match over the fields a user would search by. */
export function matchesQuery(item: LibraryItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === '') return true;
  return [item.title, item.showTitle, item.artist, item.album, item.year?.toString(), item.path]
    .filter((field): field is string => typeof field === 'string')
    .some((field) => field.toLowerCase().includes(q));
}

export function countByKind(items: readonly LibraryItem[]): Record<LibraryKind, number> {
  const counts: Record<LibraryKind, number> = { film: 0, show: 0, music: 0, photo: 0 };
  for (const item of items) counts[item.kind]++;
  return counts;
}

/** `S01E02`, padded the way episode names are written. */
export function episodeCode(item: LibraryItem): string | null {
  if (item.season === null && item.episode === null) return null;
  const pad = (n: number | null) => String(n ?? 0).padStart(2, '0');
  return `S${pad(item.season)}E${pad(item.episode)}`;
}

/** The line under a card's title. */
export function itemSubtitle(item: LibraryItem): string {
  switch (item.kind) {
    case 'film':
      return item.year !== null ? String(item.year) : '';
    case 'show':
      return [item.showTitle, episodeCode(item)].filter(Boolean).join(' · ');
    case 'music':
      return [item.artist, item.album].filter(Boolean).join(' · ');
    case 'photo':
      return item.album ?? '';
  }
}

/** `1:02:03` / `4:05`. */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/** Whether an item plays (films, episodes, music) or is only shown (photos). */
export const isPlayable = (item: LibraryItem): boolean => item.kind !== 'photo';
