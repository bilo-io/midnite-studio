import type { LibraryItem } from '@midnite/studio-shared';

/** A wire item for the renderer's tests, with every field a scan would fill defaulted. */
export function makeItem(
  over: Partial<LibraryItem> & Pick<LibraryItem, 'id' | 'kind' | 'title'>,
): LibraryItem {
  return {
    rootId: 'r0123456789ab',
    path: `${over.title}.mkv`,
    year: null,
    showTitle: null,
    season: null,
    episode: null,
    artist: null,
    album: null,
    track: null,
    plot: null,
    art: null,
    source: 'local',
    size: 1,
    mtimeMs: 1,
    progress: null,
    ...over,
  };
}
