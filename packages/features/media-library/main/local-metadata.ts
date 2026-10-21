import { FOLDER_ART_NAMES, isImageName, stemOf } from './classify';

/**
 * Local metadata — what a library learns without leaving the disk (Phase 113 Theme R): a Kodi-style
 * sidecar `.nfo` beside a film or episode (or `tvshow.nfo` for a show), and artwork sitting next to the
 * media (`<video>-poster.jpg`, `<video>.jpg`, `poster.jpg`, `folder.jpg`, `cover.jpg`).
 *
 * The `.nfo` is XML written by other tools, so it is read as text with a handful of tag lookups — never
 * evaluated, never fetched (a `<thumb>` URL is ignored), capped in size by the scanner.
 */

export type NfoFields = {
  title: string | null;
  year: number | null;
  plot: string | null;
  showTitle: string | null;
  season: number | null;
  episode: number | null;
};

/** The .nfo bytes a scan reads at most — they are a few KB in practice. */
export const NFO_READ_CAP = 256 * 1024;

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, entity: string) => {
    if (entity.startsWith('#x') || entity.startsWith('#X'))
      return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
    if (entity.startsWith('#')) return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
    return ENTITIES[entity.toLowerCase()] ?? whole;
  });
}

function tag(xml: string, name: string): string | null {
  const match = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i').exec(xml);
  if (!match) return null;
  const raw = (match[1] ?? '').replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, '$1');
  const text = decodeEntities(raw).trim();
  return text === '' ? null : text;
}

const int = (value: string | null): number | null => {
  if (value === null) return null;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
};

/** The fields of a `<movie>`, `<episodedetails>` or `<tvshow>` .nfo; null when it is not one. */
export function parseNfo(xml: string): NfoFields | null {
  if (!/<(movie|episodedetails|tvshow)[\s>]/i.test(xml)) return null;
  const premiered = tag(xml, 'premiered') ?? tag(xml, 'aired');
  return {
    title: tag(xml, 'title'),
    year: int(tag(xml, 'year')) ?? int(premiered?.slice(0, 4) ?? null),
    plot: tag(xml, 'plot') ?? tag(xml, 'outline'),
    showTitle: tag(xml, 'showtitle'),
    season: int(tag(xml, 'season')),
    episode: int(tag(xml, 'episode')),
  };
}

/** Per-file art names, best first, for a media file whose stem is `stem`. */
const fileArtCandidates = (stem: string): string[] =>
  ['-poster', '-thumb', '-cover', '', '-fanart'].flatMap((suffix) =>
    ['jpg', 'jpeg', 'png', 'webp'].map((ext) => `${stem}${suffix}.${ext}`.toLowerCase()),
  );

/** Folder art names, best first (`poster.jpg` before `folder.jpg` before `cover.jpg`…). */
const FOLDER_ART_CANDIDATES = [
  'poster',
  'folder',
  'cover',
  'front',
  'albumart',
  'album',
  'thumb',
  'fanart',
  'backdrop',
]
  .filter((name) => (FOLDER_ART_NAMES as readonly string[]).includes(name))
  .flatMap((name) => ['jpg', 'jpeg', 'png', 'webp'].map((ext) => `${name}.${ext}`));

/**
 * The sidecar artwork for `fileName` among the names in its folder: a per-file image first, then the
 * folder's own art. Returns the matching name as it appears on disk, or null.
 */
export function findLocalArt(
  fileName: string,
  folderNames: readonly string[],
  options: { folderArt?: boolean } = {},
): string | null {
  const byLower = new Map<string, string>();
  for (const name of folderNames) if (isImageName(name)) byLower.set(name.toLowerCase(), name);
  for (const candidate of fileArtCandidates(stemOf(fileName))) {
    const hit = byLower.get(candidate);
    if (hit) return hit;
  }
  if (options.folderArt === false) return null;
  for (const candidate of FOLDER_ART_CANDIDATES) {
    const hit = byLower.get(candidate);
    if (hit) return hit;
  }
  return null;
}
