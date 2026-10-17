import { createHash } from 'node:crypto';
import { lstat, mkdir, open, readdir, realpath, stat, unlink, writeFile } from 'node:fs/promises';
import { isAbsolute, join, posix, resolve, sep } from 'node:path';

import { confineToRoot } from '@midnite/studio-runtime';
import {
  failure,
  LIBRARY_ART_ROOT_ID,
  libraryIsFinished,
  ok,
  type GitOpResult,
  type LibraryChanged,
  type LibraryFileRef,
  type LibraryItem,
  type LibraryKind,
  type LibraryRoot,
  type LibraryScanProgress,
  type LibraryScanSummary,
  type LibrarySettings,
} from '@midnite/studio-shared';

import { classifyPath, isAudioName, isVideoName, stemOf } from './classify';
import { createIndexStore, toWireItem, type LibraryIndex, type StoredItem } from './index-store';
import { findLocalArt, NFO_READ_CAP, parseNfo, type NfoFields } from './local-metadata';
import type { OnlineProvider } from './online';
import { readAudioTags } from './tags';

/**
 * The media library (Phase 113 Theme R): the folders the user chose, what is in them, and where they
 * were in each film or episode.
 *
 * - **Roots come only from the picker the composer injects** — `pickDirectory` is Electron's folder dialog
 *   in an app, a stub in tests — and the service refuses `/`, the home directory itself, a duplicate,
 *   and a folder nested inside (or holding) one it already has. Nothing here ever lists `~`.
 * - **A scan is local**: names classify (`classify.ts`), a `.nfo` and sidecar images enrich, music tags
 *   and their embedded art are read with a bounded reader (`tags.ts`). It is incremental — a file whose
 *   size and mtime have not moved keeps its entry and is not read again.
 * - **The online provider runs only when the user switched it on** and its key is readable in main, and
 *   asks once per item (`onlineCheckedAt`). With the switch off nothing is sent anywhere.
 * - **Every byte served to the renderer resolves through {@link LibraryService.resolveFile}**: the root's
 *   path jail (`confineToRoot` — `..` and symlinks out of the root both fail), and only for a path the
 *   index actually holds — an item, or the art an item points at. The art cache sits under `dataDir`.
 */

export type LibraryServiceDeps = {
  /** Where `library.json` and the art cache live — never inside a root. */
  dataDir: string;
  /** The folder picker: an absolute path, or null when the user cancelled. */
  pickDirectory: () => Promise<string | null>;
  emitChanged?: (payload: LibraryChanged) => void;
  emitScanProgress?: (payload: LibraryScanProgress) => void;
  /** The online provider's key, read in main (the vault); null when unset or not granted. */
  readKey?: () => Promise<string | null>;
  /** The online provider; absent means the seam is not wired and the setting cannot do anything. */
  online?: OnlineProvider;
  /** The user's home directory — refused as a root in its own right. */
  homeDir?: string;
  now?: () => number;
};

export type LibraryService = {
  roots: () => Promise<LibraryRoot[]>;
  addRoot: () => Promise<GitOpResult<{ root: LibraryRoot | null }>>;
  /** Validates and adds `path` as a root — what `addRoot` does with the picker's answer. */
  addRootPath: (path: string) => Promise<GitOpResult<{ root: LibraryRoot }>>;
  removeRoot: (rootId: string) => Promise<GitOpResult>;
  scan: (rootId?: string) => Promise<GitOpResult<LibraryScanSummary>>;
  items: (kind?: LibraryKind) => Promise<LibraryItem[]>;
  setProgress: (req: {
    itemId: string;
    positionS: number;
    durationS: number;
    ended?: boolean;
  }) => Promise<GitOpResult>;
  clearProgress: (itemId: string) => Promise<GitOpResult>;
  getSettings: () => Promise<{ settings: LibrarySettings; onlineKeyAvailable: boolean }>;
  setSettings: (patch: Partial<LibrarySettings>) => Promise<GitOpResult>;
  /** The absolute path behind `mstudio-file://library/<rootId>/<relPath>`, or null when it is not served. */
  resolveFile: (rootId: string, relPath: string) => Promise<string | null>;
};

/** Folders a scan never enters: NAS thumbnails, recycle bins, package trees. Dot-folders are skipped too. */
const SKIP_DIRS = new Set([
  '@eadir',
  '$recycle.bin',
  'system volume information',
  'node_modules',
  'lost+found',
]);
export const SCAN_MAX_DEPTH = 16;
export const SCAN_MAX_ENTRIES = 200_000;
const PROGRESS_EVERY = 200;
/** Online lookups one scan makes at most — the provider is asked in batches, never for a whole library at once. */
export const ONLINE_LOOKUPS_PER_SCAN = 40;

const sha1 = (text: string | Uint8Array): string => createHash('sha1').update(text).digest('hex');
export const rootIdFor = (realPath: string): string => `r${sha1(realPath).slice(0, 12)}`;
export const itemIdFor = (rootId: string, relPath: string): string =>
  sha1(`${rootId}\0${relPath}`).slice(0, 20);

type WalkedFile = { rel: string; name: string; dir: string; size: number; mtimeMs: number };
type Walked = { files: WalkedFile[]; folders: Map<string, string[]>; truncated: boolean };

async function walk(rootPath: string): Promise<Walked> {
  const files: WalkedFile[] = [];
  const folders = new Map<string, string[]>();
  let entries = 0;
  let truncated = false;
  const visit = async (dir: string, depth: number): Promise<void> => {
    if (depth > SCAN_MAX_DEPTH || truncated) return;
    let listing;
    try {
      listing = await readdir(dir === '' ? rootPath : join(rootPath, dir), { withFileTypes: true });
    } catch {
      return;
    }
    const names: string[] = [];
    const subdirs: string[] = [];
    for (const entry of listing) {
      if (++entries > SCAN_MAX_ENTRIES) {
        truncated = true;
        break;
      }
      if (entry.name.startsWith('.')) continue;
      // A symlink is never followed: it could lead anywhere, including out of the root.
      if (entry.isSymbolicLink()) continue;
      const rel = dir === '' ? entry.name : `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name.toLowerCase())) subdirs.push(rel);
      } else if (entry.isFile()) {
        names.push(entry.name);
        try {
          const info = await lstat(join(rootPath, rel));
          files.push({
            rel,
            name: entry.name,
            dir,
            size: info.size,
            mtimeMs: Math.trunc(info.mtimeMs),
          });
        } catch {
          // vanished mid-scan
        }
      }
    }
    folders.set(dir, names);
    for (const sub of subdirs) await visit(sub, depth + 1);
  };
  await visit('', 0);
  return { files, folders, truncated };
}

async function readCapped(path: string, cap: number): Promise<string | null> {
  try {
    const handle = await open(path, 'r');
    try {
      const buffer = new Uint8Array(cap);
      const { bytesRead } = await handle.read(buffer, 0, cap, 0);
      return new TextDecoder('utf-8').decode(buffer.subarray(0, bytesRead));
    } finally {
      await handle.close();
    }
  } catch {
    return null;
  }
}

const IMAGE_EXT_FOR_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

const parentOf = (dir: string): string => {
  const slash = dir.lastIndexOf('/');
  return slash < 0 ? '' : dir.slice(0, slash);
};

const byTitle = (a: LibraryItem, b: LibraryItem): number => {
  const show = (a.showTitle ?? '').localeCompare(b.showTitle ?? '');
  if (show !== 0) return show;
  if ((a.season ?? 0) !== (b.season ?? 0)) return (a.season ?? 0) - (b.season ?? 0);
  if ((a.episode ?? 0) !== (b.episode ?? 0)) return (a.episode ?? 0) - (b.episode ?? 0);
  const artist = (a.artist ?? '').localeCompare(b.artist ?? '');
  if (artist !== 0) return artist;
  const album = (a.album ?? '').localeCompare(b.album ?? '');
  if (album !== 0) return album;
  if ((a.track ?? 0) !== (b.track ?? 0)) return (a.track ?? 0) - (b.track ?? 0);
  return a.title.localeCompare(b.title) || a.path.localeCompare(b.path);
};

export function createLibraryService(deps: LibraryServiceDeps): LibraryService {
  const store = createIndexStore(deps.dataDir);
  const artDir = join(deps.dataDir, 'art');
  const now = deps.now ?? Date.now;
  const emitChanged = (reason: LibraryChanged['reason']) => deps.emitChanged?.({ reason });
  const scans = new Map<string, Promise<GitOpResult<LibraryScanSummary>>>();
  /** `rootId\0relPath` of every path the library serves; rebuilt after a change. */
  let served: Set<string> | null = null;

  const servedPaths = async (): Promise<Set<string>> => {
    if (served) return served;
    const index = await store.read();
    const set = new Set<string>();
    for (const item of Object.values(index.items)) {
      set.add(`${item.rootId}\0${item.path}`);
      if (item.art) set.add(`${item.art.rootId}\0${item.art.path}`);
    }
    served = set;
    return set;
  };
  const update = async (change: (index: LibraryIndex) => void) => {
    const index = await store.update(change);
    served = null;
    return index;
  };

  const writeArt = async (data: Uint8Array, mime: string): Promise<LibraryFileRef | null> => {
    const ext = IMAGE_EXT_FOR_MIME[mime.toLowerCase()];
    if (!ext || data.length === 0) return null;
    const file = `${sha1(data).slice(0, 24)}.${ext}`;
    try {
      await mkdir(artDir, { recursive: true });
      await writeFile(join(artDir, file), data, { flag: 'wx' }).catch(
        (error: NodeJS.ErrnoException) => {
          if (error.code !== 'EEXIST') throw error;
        },
      );
      return { rootId: LIBRARY_ART_ROOT_ID, path: file };
    } catch {
      return null;
    }
  };

  /** Drops cached art no item points at any more. */
  const pruneArt = async (index: LibraryIndex): Promise<void> => {
    const used = new Set<string>();
    for (const item of Object.values(index.items))
      if (item.art?.rootId === LIBRARY_ART_ROOT_ID) used.add(item.art.path);
    let names: string[];
    try {
      names = await readdir(artDir);
    } catch {
      return;
    }
    await Promise.all(
      names
        .filter((name) => !used.has(name))
        .map((name) => unlink(join(artDir, name)).catch(() => undefined)),
    );
  };

  const addRootPath = async (picked: string): Promise<GitOpResult<{ root: LibraryRoot }>> => {
    if (!isAbsolute(picked)) return failure('A library folder must be an absolute path.');
    let real: string;
    try {
      real = await realpath(picked);
      if (!(await stat(real)).isDirectory()) return failure('That is not a folder.');
    } catch {
      return failure('That folder cannot be read.');
    }
    if (real === resolve('/') || real === sep)
      return failure(
        'The whole disk cannot be a library folder — choose the folder your media is in.',
      );
    if (deps.homeDir) {
      const home = await realpath(deps.homeDir).catch(() => resolve(deps.homeDir as string));
      if (real === home)
        return failure(
          'Your home folder cannot be a library folder — choose the folder your media is in.',
        );
    }
    const index = await store.read();
    for (const existing of index.roots) {
      if (existing.path === real) return failure('That folder is already in the library.');
      if (real.startsWith(existing.path + sep))
        return failure(`That folder is already inside “${existing.label}”.`);
      if (existing.path.startsWith(real + sep))
        return failure(
          `That folder holds “${existing.label}”, already in the library — remove it first.`,
        );
    }
    const label = real.split(sep).filter(Boolean).at(-1) ?? real;
    const root: LibraryRoot = {
      id: rootIdFor(real),
      path: real,
      label,
      addedAt: now(),
      lastScanAt: null,
      itemCount: 0,
    };
    await update((i) => {
      i.roots.push(root);
    });
    emitChanged('roots');
    return ok({ root });
  };

  /** One root's local pass: classify, enrich, and reconcile against what the index held. */
  const scanRoot = async (root: LibraryRoot, totals: LibraryScanSummary): Promise<void> => {
    const walked = await walk(root.path);
    const index = await store.read();
    const previous = new Map<string, StoredItem>();
    for (const item of Object.values(index.items))
      if (item.rootId === root.id) previous.set(item.id, item);

    const next = new Map<string, StoredItem>();
    const videosPerFolder = new Map<string, number>();
    for (const file of walked.files)
      if (isVideoName(file.name))
        videosPerFolder.set(file.dir, (videosPerFolder.get(file.dir) ?? 0) + 1);

    let scanned = 0;
    for (const file of walked.files) {
      scanned++;
      if (scanned % PROGRESS_EVERY === 0)
        deps.emitScanProgress?.({
          phase: 'scanning',
          rootId: root.id,
          scanned: totals.scanned + scanned,
        });
      const folderNames = walked.folders.get(file.dir) ?? [];
      const siblingStems = new Set(
        folderNames
          .filter((n) => isVideoName(n) || isAudioName(n))
          .map((n) => stemOf(n).toLowerCase()),
      );
      const classified = classifyPath(file.rel, siblingStems);
      if (!classified) {
        totals.skipped++;
        continue;
      }
      const id = itemIdFor(root.id, file.rel);
      const before = previous.get(id);
      const absolute = join(root.path, file.rel);

      const nfoName =
        classified.kind === 'film' || classified.kind === 'show'
          ? findNfo(file.name, folderNames, classified.kind, videosPerFolder.get(file.dir) ?? 0)
          : null;
      let nfoMtimeMs: number | null = null;
      if (nfoName) {
        try {
          nfoMtimeMs = Math.trunc((await lstat(join(root.path, file.dir, nfoName))).mtimeMs);
        } catch {
          nfoMtimeMs = null;
        }
      }

      // Unchanged since the last scan: keep the entry, refresh only the name-derived sidecar art.
      if (
        before &&
        before.size === file.size &&
        before.mtimeMs === file.mtimeMs &&
        before.nfoMtimeMs === nfoMtimeMs
      ) {
        const art =
          before.art?.rootId === LIBRARY_ART_ROOT_ID || before.source === 'online'
            ? before.art
            : sidecarArt(root.id, file, classified.kind, walked, videosPerFolder);
        next.set(id, { ...before, art: art ?? before.art });
        continue;
      }

      const item: StoredItem = {
        id,
        kind: classified.kind,
        rootId: root.id,
        path: file.rel,
        title: classified.title,
        year: classified.year,
        showTitle: classified.showTitle,
        season: classified.season,
        episode: classified.episode,
        artist: classified.artist,
        album: classified.album,
        track: classified.track,
        plot: null,
        art: null,
        source: 'local',
        size: file.size,
        mtimeMs: file.mtimeMs,
        nfoMtimeMs,
        onlineCheckedAt: before?.onlineCheckedAt ?? null,
      };

      if (nfoName) {
        const text = await readCapped(join(root.path, file.dir, nfoName), NFO_READ_CAP);
        const nfo = text === null ? null : parseNfo(text);
        if (nfo) applyNfo(item, nfo);
      }
      if (classified.kind === 'music') {
        const tags = await readAudioTags(absolute);
        if (tags) {
          if (tags.title) item.title = tags.title;
          if (tags.artist) item.artist = tags.artist;
          if (tags.album) item.album = tags.album;
          if (tags.track !== null) item.track = tags.track;
          if (tags.year !== null) item.year = tags.year;
          if (tags.picture) item.art = await writeArt(tags.picture.data, tags.picture.mime);
        }
      }
      item.art ??= sidecarArt(root.id, file, classified.kind, walked, videosPerFolder);
      // A changed file keeps an online poster it already had; online metadata is not asked again.
      if (!item.art && before?.source === 'online' && before.art) item.art = before.art;

      if (!before) totals.added++;
      else totals.updated++;
      next.set(id, item);
    }
    for (const id of previous.keys()) if (!next.has(id)) totals.removed++;
    totals.scanned += scanned;

    await update((i) => {
      for (const id of previous.keys()) delete i.items[id];
      for (const [id, item] of next) i.items[id] = item;
      const r = i.roots.find((candidate) => candidate.id === root.id);
      if (r) {
        r.lastScanAt = now();
        r.itemCount = next.size;
      }
    });
  };

  /** The online pass: films and shows the provider has not been asked about, a bounded batch per scan. */
  const enrichOnline = async (): Promise<void> => {
    const index = await store.read();
    if (!index.settings.onlineMetadata || !deps.online || !deps.readKey) return;
    const key = await deps.readKey().catch(() => null);
    if (!key) return;
    const pending = Object.values(index.items).filter(
      (item) => (item.kind === 'film' || item.kind === 'show') && item.onlineCheckedAt === null,
    );
    if (pending.length === 0) return;

    type Group = { kind: 'film' | 'show'; title: string; year: number | null; items: StoredItem[] };
    const groups = new Map<string, Group>();
    for (const item of pending) {
      const kind = item.kind as 'film' | 'show';
      const title = kind === 'show' ? (item.showTitle ?? item.title) : item.title;
      const key_ = `${kind}\0${title.toLowerCase()}\0${kind === 'film' ? (item.year ?? '') : ''}`;
      const group = groups.get(key_) ?? {
        kind,
        title,
        year: kind === 'film' ? item.year : null,
        items: [],
      };
      group.items.push(item);
      groups.set(key_, group);
    }

    const results: Array<{
      group: Group;
      plot: string | null;
      year: number | null;
      art: LibraryFileRef | null;
    }> = [];
    for (const group of [...groups.values()].slice(0, ONLINE_LOOKUPS_PER_SCAN)) {
      try {
        const match = await deps.online.lookup(
          { kind: group.kind, title: group.title, year: group.year },
          key,
        );
        const art = match?.poster ? await writeArt(match.poster.bytes, match.poster.mime) : null;
        results.push({ group, plot: match?.plot ?? null, year: match?.year ?? null, art });
      } catch {
        results.push({ group, plot: null, year: null, art: null });
      }
    }
    if (results.length === 0) return;
    const checkedAt = now();
    await update((i) => {
      for (const { group, plot, year, art } of results) {
        for (const item of group.items) {
          const stored = i.items[item.id];
          if (!stored) continue;
          stored.onlineCheckedAt = checkedAt;
          let used = false;
          if (group.kind === 'film' && stored.plot === null && plot) {
            stored.plot = plot;
            used = true;
          }
          if (group.kind === 'film' && stored.year === null && year !== null) {
            stored.year = year;
            used = true;
          }
          if (stored.art === null && art) {
            stored.art = art;
            used = true;
          }
          if (used) stored.source = 'online';
        }
      }
    });
  };

  const runScan = async (rootId?: string): Promise<GitOpResult<LibraryScanSummary>> => {
    const index = await store.read();
    const targets =
      rootId === undefined ? [...index.roots] : index.roots.filter((root) => root.id === rootId);
    if (rootId !== undefined && targets.length === 0)
      return failure('That library folder is not in the library.');
    const totals: LibraryScanSummary = { scanned: 0, added: 0, updated: 0, removed: 0, skipped: 0 };
    try {
      for (const root of targets) {
        deps.emitScanProgress?.({ phase: 'scanning', rootId: root.id, scanned: totals.scanned });
        await scanRoot(root, totals);
      }
      await enrichOnline();
      await pruneArt(await store.read());
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      deps.emitScanProgress?.({
        phase: 'error',
        rootId: rootId ?? null,
        scanned: totals.scanned,
        message,
      });
      return failure(message);
    }
    deps.emitScanProgress?.({ phase: 'done', rootId: rootId ?? null, scanned: totals.scanned });
    emitChanged('scan');
    return ok(totals);
  };

  return {
    roots: async () => (await store.read()).roots.map((root) => ({ ...root })),

    addRoot: async () => {
      const picked = await deps.pickDirectory();
      if (picked === null) return ok({ root: null });
      return addRootPath(picked);
    },
    addRootPath,

    removeRoot: async (rootId) => {
      const index = await store.read();
      if (!index.roots.some((root) => root.id === rootId))
        return failure('That library folder is not in the library.');
      const next = await update((i) => {
        i.roots = i.roots.filter((root) => root.id !== rootId);
        for (const [id, item] of Object.entries(i.items)) {
          if (item.rootId !== rootId) continue;
          delete i.items[id];
          delete i.progress[id];
        }
      });
      await pruneArt(next);
      emitChanged('roots');
      return ok();
    },

    scan: (rootId) => {
      // One scan at a time per target: a second request while one runs joins it.
      const key = rootId ?? '*';
      const running = scans.get(key) ?? scans.get('*');
      if (running) return running;
      const started = runScan(rootId).finally(() => scans.delete(key));
      scans.set(key, started);
      return started;
    },

    items: async (kind) => {
      const index = await store.read();
      return Object.values(index.items)
        .filter((item) => kind === undefined || item.kind === kind)
        .map((item) => toWireItem(item, index.progress[item.id]))
        .sort(byTitle);
    },

    setProgress: async ({ itemId, positionS, durationS, ended }) => {
      const index = await store.read();
      if (!index.items[itemId]) return failure('That item is not in the library.');
      const finished = libraryIsFinished(positionS, durationS, ended);
      await update((i) => {
        i.progress[itemId] = {
          positionS: finished ? 0 : positionS,
          durationS,
          finished,
          updatedAt: now(),
        };
      });
      emitChanged('progress');
      return ok();
    },

    clearProgress: async (itemId) => {
      await update((i) => {
        delete i.progress[itemId];
      });
      emitChanged('progress');
      return ok();
    },

    getSettings: async () => {
      const { settings } = await store.read();
      const key = deps.online && deps.readKey ? await deps.readKey().catch(() => null) : null;
      return { settings: { ...settings }, onlineKeyAvailable: key !== null && key !== '' };
    },

    setSettings: async (patch) => {
      await update((i) => {
        i.settings = { ...i.settings, ...patch };
      });
      emitChanged('settings');
      return ok();
    },

    resolveFile: async (rootId, relPath) => {
      const normalised = posix.normalize(relPath).replace(/^\/+/, '');
      if (!(await servedPaths()).has(`${rootId}\0${normalised}`)) return null;
      if (rootId === LIBRARY_ART_ROOT_ID) return confineToRoot(artDir, normalised);
      const root = (await store.read()).roots.find((candidate) => candidate.id === rootId);
      return root ? confineToRoot(root.path, normalised) : null;
    },
  };
}

function applyNfo(item: StoredItem, nfo: NfoFields): void {
  if (nfo.title) item.title = nfo.title;
  if (nfo.year !== null) item.year = nfo.year;
  if (nfo.plot) item.plot = nfo.plot;
  if (item.kind === 'show') {
    if (nfo.showTitle) item.showTitle = nfo.showTitle;
    if (nfo.season !== null) item.season = nfo.season;
    if (nfo.episode !== null) item.episode = nfo.episode;
  }
}

/** `<video>.nfo` beside it, or a film folder's `movie.nfo` when that folder holds just the one film. */
function findNfo(
  fileName: string,
  folderNames: readonly string[],
  kind: 'film' | 'show',
  videosInFolder: number,
): string | null {
  const wanted = `${stemOf(fileName)}.nfo`.toLowerCase();
  const own = folderNames.find((name) => name.toLowerCase() === wanted);
  if (own) return own;
  if (kind === 'film' && videosInFolder === 1)
    return folderNames.find((name) => name.toLowerCase() === 'movie.nfo') ?? null;
  return null;
}

/**
 * Sidecar art by name. A film takes its folder's art only when the folder is that film's alone (a folder
 * of loose films shares no poster); an episode falls back to its season folder, then its show folder; an
 * album takes its folder's cover; a photo is its own art.
 */
function sidecarArt(
  rootId: string,
  file: WalkedFile,
  kind: LibraryKind,
  walked: Walked,
  videosPerFolder: ReadonlyMap<string, number>,
): LibraryFileRef | null {
  if (kind === 'photo') return { rootId, path: file.rel };
  const ref = (dir: string, name: string | null): LibraryFileRef | null =>
    name === null ? null : { rootId, path: dir === '' ? name : `${dir}/${name}` };
  const here = walked.folders.get(file.dir) ?? [];
  if (kind === 'film')
    return ref(
      file.dir,
      findLocalArt(file.name, here, {
        folderArt: (videosPerFolder.get(file.dir) ?? 0) === 1 && file.dir !== '',
      }),
    );
  if (kind === 'music')
    return ref(file.dir, findLocalArt(file.name, here, { folderArt: file.dir !== '' }));
  // show
  const own = findLocalArt(file.name, here, { folderArt: file.dir !== '' });
  if (own) return ref(file.dir, own);
  const parent = parentOf(file.dir);
  if (file.dir === '') return null;
  return ref(
    parent,
    findLocalArt('', walked.folders.get(parent) ?? [], { folderArt: parent !== '' }),
  );
}
