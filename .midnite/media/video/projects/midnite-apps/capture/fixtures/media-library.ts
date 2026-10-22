/**
 * A seeded Media ▸ Library for media-dark: two folders, invented films, shows,
 * albums and photos. Art is rendered by `fixtures/media-art.mjs` into
 * `fixtures/data/media-art/` and served by the spec through `page.route`.
 *
 * The e2e mock bridge has no `media.library` namespace at all, so
 * `installLibraryBridge` adds one in an init script that runs after the mock's.
 */
import * as path from 'node:path';

export const ART_DIR = path.join(__dirname, 'data/media-art');

const ROOT_FILMS = 'r5f3a9c21';
const ROOT_PHOTOS = 'r8b04e7d3';
const NOW = Date.now();
const MIN = 60_000;
const art = (name: string) => ({ rootId: 'art', path: `${name}.jpg` });

type Item = Record<string, unknown>;
const base = (over: Item): Item => ({
  showTitle: null,
  season: null,
  episode: null,
  artist: null,
  album: null,
  track: null,
  plot: null,
  art: null,
  source: 'local',
  size: 1_800_000_000,
  mtimeMs: NOW - 86_400_000 * 9,
  progress: null,
  year: null,
  ...over,
});

const progress = (posMin: number, durMin: number, agoMin: number) => ({
  positionS: posMin * 60,
  durationS: durMin * 60,
  finished: false,
  updatedAt: NOW - agoMin * MIN,
});

const FILMS: Item[] = [
  ['salt-line', 'Salt Line', 2025, 'A ferry pilot returns to the island she left at sixteen to bring her father home, and finds the harbour town has been waiting for her to explain why she never came back.', progress(41, 112, 35)],
  ['long-meridian', 'The Long Meridian', 2024, 'Two estranged brothers follow their late mother’s hand-drawn map across the canyon country, one switchback and one old argument at a time.', progress(18, 128, 600)],
  ['northbound', 'Northbound', 2023, 'Oslo, winter 1987. A night-shift radio operator hears a mayday from a trawler that sank eleven years earlier.', null],
  ['quiet-grid', 'Quiet Grid', 2025, 'An insomniac traffic engineer notices the city’s lights are spelling something out at 3 a.m.', progress(76, 104, 1440)],
  ['parallax', 'Parallax', 2026, 'Two astronomers on opposite sides of the world fall for each other through the same distant star.', null],
  ['table-mountain', 'After the South Easter', 2024, 'One long summer weekend in Cape Town, three friends and a wedding nobody wants to talk about.', null],
  ['the-dry', 'The Dry', 2022, 'A hydrologist in the Mojave tracks a spring that should not exist.', null],
  ['signal', 'Signal / Noise', 2025, 'A documentary about the on-call engineers who keep the internet up, told across one very bad night.', null],
].map(([slug, title, year, plot, prog]) =>
  base({
    id: `film-${slug}`,
    kind: 'film',
    rootId: ROOT_FILMS,
    path: `Films/${title as string} (${year as number})/${title as string}.mkv`,
    title,
    year,
    plot,
    art: art(slug as string),
    progress: prog,
  }),
);

const SHOW_DEFS: Array<[string, string, number, string[]]> = [
  ['harbour-lights', 'Harbour Lights', 2, ['The Night Ferry', 'Low Water', 'Shipping Forecast', 'Breakwater', 'The Lighthouse Keeper’s Daughter', 'Slack Tide']],
  ['low-orbit', 'Low Orbit', 1, ['Ignition', 'Station Keeping', 'Debris Field', 'Terminator Line', 'Re-entry']],
  ['the-atlas-office', 'The Atlas Office', 1, ['Onboarding', 'All Hands', 'The Offsite', 'Reorg', 'Performance Review', 'Hackathon', 'Holiday Party', 'Last Day']],
  ['ridgeline', 'Ridgeline', 1, ['The First Snow', 'Cable Car', 'Whiteout', 'The Hut', 'Avalanche Season']],
];
const SHOWS: Item[] = SHOW_DEFS.flatMap(([slug, show, season, eps]) =>
  eps.map((title, i) =>
    base({
      id: `show-${slug}-${i + 1}`,
      kind: 'show',
      rootId: ROOT_FILMS,
      path: `Shows/${show}/Season ${season}/${show} - S0${season}E0${i + 1} - ${title}.mkv`,
      title,
      showTitle: show,
      season,
      episode: i + 1,
      year: 2025,
      art: art(slug),
      size: 900_000_000,
      progress:
        slug === 'harbour-lights' && i < 2
          ? { positionS: 2700, durationS: 2700, finished: true, updatedAt: NOW - 3 * 86_400_000 }
          : slug === 'harbour-lights' && i === 2
            ? progress(22, 46, 120)
            : slug === 'low-orbit' && i === 0
              ? progress(31, 52, 2880)
              : null,
    }),
  ),
);

const ALBUM_DEFS: Array<[string, string, string, number, string[]]> = [
  ['neon-tide', 'Neon Tide', 'Halcyon Drive', 2025, ['Undertow', 'Glass Coast', 'Neon Tide', 'Midnight Ferry', 'Phosphor', 'Riptide (Interlude)', 'Low Bridges', 'Last Train Home', 'Afterglow']],
  ['late-session', 'Late Session', 'The Night Desk', 2024, ['Room Tone', 'Take Seven', 'Sidechain', 'Tape Hiss', 'Rough Mix', '4 a.m. Bounce']],
  ['meridian', 'Meridian', 'Kalahari Sound System', 2023, ['Dust Devil', 'Salt Pan', 'Meridian', 'Heat Shimmer', 'Wind Pump']],
  ['blue-hour', 'Blue Hour', 'Marta Lindqvist', 2026, ['Before the Lamps', 'Fjord', 'Blue Hour', 'Northern Line', 'Snow on the Water']],
  ['loft-parties', 'Warehouse Hours', 'Okuhle & The Strangers', 2025, ['Doors at Ten', 'Freight Elevator', 'Strangers', 'Sunrise Set']],
  ['terra', 'Terra', 'Field Recordings', 2022, ['Canyon Floor', 'Rimrock Wind', 'River at Dusk', 'Night Insects']],
];
const MUSIC: Item[] = ALBUM_DEFS.flatMap(([slug, album, artist, year, tracks]) =>
  tracks.map((title, i) =>
    base({
      id: `music-${slug}-${i + 1}`,
      kind: 'music',
      rootId: ROOT_FILMS,
      path: `Music/${artist}/${album}/${String(i + 1).padStart(2, '0')} ${title}.flac`,
      title,
      artist,
      album,
      track: i + 1,
      year,
      art: art(slug),
      size: 38_000_000,
    }),
  ),
);

const PHOTO_DEFS: Array<[string, string, string]> = [
  ['grand-canyon', 'Grand Canyon, South Rim', 'Road trip 2026'],
  ['robben-island', 'Robben Island from the ferry flight', 'Cape Town'],
  ['table-bay', 'Table Bay at noon', 'Cape Town'],
  ['central-park', 'Central Park, straight down', 'New York'],
  ['bern-old-town', 'The Aare bend, Bern', 'Switzerland'],
  ['oslofjord', 'Oslofjord islands', 'Norway'],
  ['sydney-harbour', 'Sydney Harbour', 'Australia'],
  ['mojave-edge', 'Edge of the Mojave', 'Road trip 2026'],
  ['chapmans-peak', 'Chapman’s Peak Drive', 'Cape Town'],
  ['the-studio', 'The studio, late', 'Studio'],
  ['loft-launch-party', 'Launch night', 'Studio'],
  ['sea-point-block', 'Sea Point, new build', 'Cape Town'],
];
const PHOTOS: Item[] = PHOTO_DEFS.map(([slug, title, album], i) =>
  base({
    id: `photo-${slug}`,
    kind: 'photo',
    rootId: ROOT_PHOTOS,
    path: `${album}/${slug}.jpg`,
    title,
    album,
    year: 2026,
    art: { rootId: ROOT_PHOTOS, path: `${album}/${slug}.jpg` },
    size: 6_400_000,
    mtimeMs: NOW - i * 86_400_000,
  }),
);

export const LIBRARY_ITEMS: Item[] = [...FILMS, ...SHOWS, ...MUSIC, ...PHOTOS];

export const LIBRARY_ROOTS = [
  { id: ROOT_FILMS, path: '/Volumes/Archive/Media', label: 'Media', addedAt: NOW - 86_400_000 * 30, lastScanAt: NOW - 3_600_000, itemCount: FILMS.length + SHOWS.length + MUSIC.length },
  { id: ROOT_PHOTOS, path: '/Users/bilo/Pictures/Library', label: 'Pictures', addedAt: NOW - 86_400_000 * 30, lastScanAt: NOW - 3_600_000, itemCount: PHOTOS.length },
];

export const LIBRARY_PLAYLISTS = [
  { id: 'pl-road-trip', name: 'Road trip', itemIds: MUSIC.slice(0, 6).map((m) => m['id'] as string), createdAt: NOW - 86_400_000 * 6, updatedAt: NOW - 86_400_000 },
  { id: 'pl-focus', name: 'Deep focus', itemIds: MUSIC.slice(9, 15).map((m) => m['id'] as string), createdAt: NOW - 86_400_000 * 12, updatedAt: NOW - 86_400_000 * 2 },
];

/** Runs in the page, after the mock bridge: adds `media.library` and rewrites `mstudio-file://library/…` img srcs. */
export function libraryInit(seed: { items: Item[]; roots: unknown[]; playlists: unknown[] }): void {
  const w = window as unknown as { midniteStudio?: { media?: Record<string, unknown> } };
  const ok = <T,>(value: T) => ({ ok: true as const, value });
  const none = () => () => {};
  const install = (): void => {
    if (!w.midniteStudio?.media) return;
    w.midniteStudio.media['library'] = {
      roots: async () => ({ roots: seed.roots }),
      items: async () => ({ items: seed.items }),
      settings: async () => ({ settings: { onlineMetadata: false, onlineProvider: 'tmdb' }, onlineKeyAvailable: false }),
      setSettings: async () => ok(undefined),
      scan: async () => ok({ scanned: 0, added: 0, updated: 0, removed: 0, skipped: 0 }),
      addRoot: async () => ok({ root: null }),
      removeRoot: async () => ok(undefined),
      clearProgress: async () => ok(undefined),
      progress: async () => ok(undefined),
      onChanged: none,
      onScanProgress: none,
      playlists: {
        list: async () => ({ playlists: seed.playlists }),
        create: async () => ok(undefined),
        rename: async () => ok(undefined),
        setItems: async () => ok(undefined),
        remove: async () => ok(undefined),
      },
      lan: {
        status: async () => ({
          available: false,
          running: false,
          url: null,
          settings: { address: null, port: 8765, startWithApp: false, wasOn: false, transcode: false, ffmpegPath: null },
          interfaces: [],
          clients: [],
          transcodes: 0,
          ffmpeg: { found: false, path: null, source: null },
        }),
        start: async () => ok(undefined),
        stop: async () => ok(undefined),
        setSettings: async () => ok(undefined),
        revoke: async () => ok(undefined),
      },
    };
  };
  install();
  // Serve the art over the dev server instead of the Electron-only scheme.
  const rewrite = (img: HTMLImageElement): void => {
    const src = img.getAttribute('src') ?? '';
    if (!src.startsWith('mstudio-file://library/')) return;
    const name = decodeURIComponent(src.split('/').pop() ?? '');
    img.setAttribute('src', `/__cap/media/${encodeURIComponent(name)}`);
    img.removeAttribute('loading');
  };
  new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'attributes' && r.target instanceof HTMLImageElement) rewrite(r.target);
      for (const n of r.addedNodes) {
        if (n instanceof HTMLImageElement) rewrite(n);
        else if (n instanceof Element) n.querySelectorAll('img').forEach(rewrite);
      }
    }
  }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['src'] });
}
