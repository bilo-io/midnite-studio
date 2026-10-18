import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

import {
  failure,
  ok,
  type GitOpResult,
  type LibraryFfmpegStatus,
  type LibraryItem,
  type LibraryLanClient,
  type LibraryLanStatus,
} from '@midnite/studio-shared';

import { extensionOf } from './classify';
import {
  isFfmpegPathShaped,
  locateFfmpeg,
  nodeFfmpegPort,
  parseProbe,
  playbackPlan,
  transcodeArgs,
  transcodeContentType,
  type FfmpegPort,
  type PlaybackPlan,
  type TranscodeProcess,
} from './ffmpeg';
import type { MediaProbe } from './index-store';
import { checkBindAddress, isPrivateLanAddress, listLanInterfaces, type NetworkInterfaces } from './lan-addresses';
import { PAGE_CSP, renderIndexPage, renderItemPage, renderPlaylistPage, type IndexEntry } from './lan-pages';
import { createLanSettingsStore, createLanTokenStore } from './lan-store';
import type { LibraryLanController } from './lan';
import type { LibraryService } from './library-service';

/**
 * The LAN stream server (Phase 113 Theme R slice 2) — plain `node:http`, started only by the user.
 *
 * - **Bind**: one private IPv4 address the user picked that one of this computer's interfaces holds now
 *   (`lan-addresses.ts`). Never `0.0.0.0`, never a public address, never at launch unless the user left it on
 *   *and* asked for "start with the app".
 * - **Token**: every request carries `?k=<token>` (256 random bits, `lan-store.ts`), checked in constant time
 *   *before* anything is routed — a request without it gets a bare 401 and learns nothing else, not even
 *   whether a path exists. "Regenerate" mints a new one and cuts every open connection.
 * - **Path jail**: routes take an item id, never a path. The bytes behind an id come only from
 *   `LibraryService.resolveFile` — the index and the root's `confineToRoot` jail, as for the app's own player.
 *   Read-only: `GET`/`HEAD` and nothing else; no folder listing.
 * - **Transcoding** (opt-in, system ffmpeg only): at most `maxTranscodes` at once, each killed when its client
 *   goes away or the server stops.
 */

export type LanListen = (
  server: Server,
  address: string,
  port: number,
) => Promise<{ address: string; port: number }>;

export type LanServerDeps = {
  library: LibraryService;
  /** The library's data dir: `lan.json` and `lan-token` live here. */
  dataDir: string;
  /** `os.networkInterfaces` — fake ones under test. */
  interfaces: () => NetworkInterfaces;
  /** Binds the server. The default listens on exactly `address`; a test binds 127.0.0.1 instead. */
  listen?: LanListen;
  ffmpeg?: FfmpegPort;
  isExecutable?: (path: string) => Promise<boolean>;
  /** `PATH`, for finding ffmpeg. */
  pathEnv?: string;
  now?: () => number;
  maxTranscodes?: number;
  random?: (bytes: number) => Buffer;
};

export const MAX_TRANSCODES = 2;
const MAX_PROBES = 2;
const MAX_CLIENTS = 32;
const ITEM_ID = /^[0-9a-f]{20}$/;
const PLAYLIST_ID = /^p[0-9a-f]{12}$/;

/** Headers on every response. `no-store`: pages carry the token in their links. */
const BASE_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Cache-Control': 'no-store',
} as const;

/** Bytes are never a document: a served file (an SVG photo, say) runs nothing and fetches nothing. */
const FILE_CSP = "default-src 'none'; sandbox";

const CONTENT_TYPES: Record<string, string> = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  avi: 'video/x-msvideo',
  wmv: 'video/x-ms-wmv',
  ts: 'video/mp2t',
  mpg: 'video/mpeg',
  mpeg: 'video/mpeg',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  flac: 'audio/flac',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/ogg',
  wav: 'audio/wav',
  aiff: 'audio/aiff',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  heic: 'image/heic',
  heif: 'image/heif',
  tif: 'image/tiff',
  tiff: 'image/tiff',
};

const contentTypeOf = (path: string): string =>
  CONTENT_TYPES[extensionOf(path.split('/').at(-1) ?? path)] ?? 'application/octet-stream';

/** One `bytes=` range against a file of `size` bytes: the span, the whole file, or unsatisfiable. */
export function parseRange(
  header: string | undefined,
  size: number,
): { start: number; end: number } | 'whole' | 'unsatisfiable' {
  if (header === undefined || header === '') return 'whole';
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  // A multi-range or another unit: answer the whole file, which a client must accept.
  if (!match) return 'whole';
  const [, from = '', to = ''] = match;
  if (size === 0 || (from === '' && to === '')) return 'unsatisfiable';
  if (from === '') {
    const suffix = Number(to);
    if (suffix === 0) return 'unsatisfiable';
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = Number(from);
  const end = to === '' ? size - 1 : Math.min(Number(to), size - 1);
  if (!Number.isSafeInteger(start) || start >= size || end < start) return 'unsatisfiable';
  return { start, end };
}

const defaultListen: LanListen = (server, address, port) =>
  new Promise((resolve, reject) => {
    const onError = (error: Error) => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.off('error', onError);
      const info = server.address() as AddressInfo;
      resolve({ address: info.address, port: info.port });
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen({ host: address, port, exclusive: true });
  });

/** A counting gate: `run` waits for one of `size` slots. */
function gate(size: number) {
  let active = 0;
  const waiting: Array<() => void> = [];
  return async <T>(task: () => Promise<T>): Promise<T> => {
    if (active >= size) await new Promise<void>((resolve) => waiting.push(resolve));
    active++;
    try {
      return await task();
    } finally {
      active--;
      waiting.shift()?.();
    }
  };
}

const remoteOf = (req: IncomingMessage): string => {
  const raw = req.socket.remoteAddress ?? 'unknown';
  return raw.startsWith('::ffff:') ? raw.slice(7) : raw;
};

export function createLanStreamServer(deps: LanServerDeps): LibraryLanController {
  const { library } = deps;
  const settingsStore = createLanSettingsStore(deps.dataDir);
  const tokens = createLanTokenStore(deps.dataDir, deps.random);
  const listen = deps.listen ?? defaultListen;
  const port: FfmpegPort = deps.ffmpeg ?? nodeFfmpegPort;
  const now = deps.now ?? Date.now;
  const maxTranscodes = deps.maxTranscodes ?? MAX_TRANSCODES;
  const probeGate = gate(MAX_PROBES);
  const probing = new Map<string, Promise<MediaProbe | null>>();
  const transcodes = new Set<TranscodeProcess>();
  const clients = new Map<string, LibraryLanClient>();
  let running: { server: Server; url: string; closed: Promise<void> } | null = null;
  let starting: Promise<GitOpResult<LibraryLanStatus>> | null = null;
  let ffmpeg: Promise<LibraryFfmpegStatus> | null = null;

  const ffmpegStatus = async (): Promise<LibraryFfmpegStatus> =>
    (ffmpeg ??= settingsStore.read().then((settings) =>
      locateFfmpeg({
        configured: settings.ffmpegPath,
        ...(deps.isExecutable ? { isExecutable: deps.isExecutable } : {}),
        ...(deps.pathEnv !== undefined ? { pathEnv: deps.pathEnv } : {}),
      }),
    ));

  /** ffmpeg's path when the user has transcoding on and it was found; null otherwise. */
  const transcoder = async (): Promise<string | null> => {
    const settings = await settingsStore.read();
    if (!settings.transcode) return null;
    const found = await ffmpegStatus();
    return found.found ? found.path : null;
  };

  const probeItem = (item: LibraryItem, ffmpegPath: string): Promise<MediaProbe | null> => {
    const inFlight = probing.get(item.id);
    if (inFlight) return inFlight;
    const run = probeGate(async () => {
      const path = await library.resolveFile(item.rootId, item.path);
      if (!path) return null;
      const probe = parseProbe(await port.probe(ffmpegPath, path), item);
      if (probe.container !== null) await library.storeProbe(item.id, probe);
      return probe;
    }).finally(() => probing.delete(item.id));
    probing.set(item.id, run);
    return run;
  };

  /** How an item goes out. Probes (spawning ffmpeg) only when transcoding is on and `probe` asks for it. */
  const planFor = async (
    item: LibraryItem,
    probe: boolean,
  ): Promise<{ plan: PlaybackPlan; probe: MediaProbe | null; ffmpegPath: string | null }> => {
    const ffmpegPath = await transcoder();
    let known = item.kind === 'photo' ? null : await library.cachedProbe(item.id);
    if (!known && probe && ffmpegPath && item.kind !== 'photo') known = await probeItem(item, ffmpegPath);
    return { plan: playbackPlan(item, known, ffmpegPath !== null), probe: known, ffmpegPath };
  };

  const entriesFor = async (items: readonly LibraryItem[]): Promise<IndexEntry[]> => {
    const ffmpegPath = await transcoder();
    return Promise.all(
      items.map(async (item) => ({
        item,
        plan: playbackPlan(
          item,
          item.kind === 'photo' ? null : await library.cachedProbe(item.id),
          ffmpegPath !== null,
        ),
      })),
    );
  };

  // --- responses ------------------------------------------------------------------

  const bare = (res: ServerResponse, status: number, extra: Record<string, string> = {}) => {
    res.writeHead(status, { ...BASE_HEADERS, 'Content-Length': '0', ...extra });
    res.end();
  };
  const text = (res: ServerResponse, status: number, body: string) => {
    res.writeHead(status, {
      ...BASE_HEADERS,
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Length': String(Buffer.byteLength(body)),
    });
    res.end(body);
  };
  const html = (res: ServerResponse, body: string) => {
    res.writeHead(200, {
      ...BASE_HEADERS,
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': PAGE_CSP,
      'Content-Length': String(Buffer.byteLength(body)),
    });
    res.end(body);
  };
  const notFound = (res: ServerResponse) => text(res, 404, 'Not found');

  /** A file's bytes, with `Range` — `path` is always `resolveFile`'s answer. */
  const sendFile = async (req: IncomingMessage, res: ServerResponse, path: string) => {
    let size: number;
    try {
      const info = await stat(path);
      if (!info.isFile()) return notFound(res);
      size = info.size;
    } catch {
      return notFound(res);
    }
    const headers = {
      ...BASE_HEADERS,
      'Content-Type': contentTypeOf(path),
      'Content-Security-Policy': FILE_CSP,
      'Accept-Ranges': 'bytes',
    };
    const range = parseRange(req.headers.range, size);
    if (range === 'unsatisfiable') {
      res.writeHead(416, { ...headers, 'Content-Range': `bytes */${size}`, 'Content-Length': '0' });
      res.end();
      return;
    }
    const { start, end } = range === 'whole' ? { start: 0, end: size - 1 } : range;
    const length = size === 0 ? 0 : end - start + 1;
    res.writeHead(range === 'whole' ? 200 : 206, {
      ...headers,
      'Content-Length': String(length),
      ...(range === 'whole' ? {} : { 'Content-Range': `bytes ${start}-${end}/${size}` }),
    });
    if (req.method === 'HEAD' || length === 0) {
      res.end();
      return;
    }
    const stream = createReadStream(path, { start, end });
    res.on('close', () => stream.destroy());
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  };

  const transcode = async (req: IncomingMessage, res: ServerResponse, item: LibraryItem) => {
    const { plan, probe, ffmpegPath } = await planFor(item, true);
    if (plan !== 'transcode' || !ffmpegPath) return notFound(res);
    const input = await library.resolveFile(item.rootId, item.path);
    if (!input) return notFound(res);
    if (transcodes.size >= maxTranscodes) return text(res, 503, 'Busy — try again shortly.');
    const headers = {
      ...BASE_HEADERS,
      'Content-Type': transcodeContentType(item.kind),
      'Content-Security-Policy': FILE_CSP,
      'Accept-Ranges': 'none',
    };
    if (req.method === 'HEAD') {
      res.writeHead(200, headers);
      res.end();
      return;
    }
    const proc = port.transcode(ffmpegPath, transcodeArgs(input, item.kind, probe));
    transcodes.add(proc);
    const finish = () => {
      if (transcodes.delete(proc)) proc.kill();
    };
    res.on('close', finish);
    proc.onExit(() => {
      transcodes.delete(proc);
      if (!res.writableEnded) res.end();
    });
    proc.stdout.on('error', () => res.destroy());
    res.writeHead(200, headers);
    proc.stdout.pipe(res);
  };

  const route = async (req: IncomingMessage, res: ServerResponse) => {
    const raw = req.url ?? '';
    // Origin-form only: `//host/x` or an absolute URL is not a path on this server.
    if (!raw.startsWith('/') || raw.startsWith('//')) return bare(res, 400);
    const url = new URL(raw, 'http://lan.invalid');
    // The token first, before routing: without it, every path — real or not — is the same bare 401.
    if (!(await tokens.matches(url.searchParams.get('k')))) return bare(res, 401);
    const remote = remoteOf(req);
    const seen = clients.get(remote);
    clients.delete(remote);
    clients.set(remote, {
      address: remote,
      lastRequestAt: now(),
      requests: (seen?.requests ?? 0) + 1,
    });
    while (clients.size > MAX_CLIENTS) clients.delete(clients.keys().next().value as string);

    if (req.method !== 'GET' && req.method !== 'HEAD') return bare(res, 405, { Allow: 'GET, HEAD' });
    const token = await tokens.token();
    const segments = url.pathname.split('/').slice(1);
    const [head = '', id = '', ...rest] = segments;
    if (url.pathname === '/') {
      const [items, playlists] = await Promise.all([library.items(), library.playlists()]);
      return html(res, renderIndexPage({ token, entries: await entriesFor(items), playlists }));
    }
    if (rest.length > 0) return notFound(res);
    if (head === 'playlist' && PLAYLIST_ID.test(id)) {
      const playlist = (await library.playlists()).find((candidate) => candidate.id === id);
      if (!playlist) return notFound(res);
      const items = (await Promise.all(playlist.itemIds.map((itemId) => library.item(itemId)))).filter(
        (item): item is LibraryItem => item !== null,
      );
      return html(res, renderPlaylistPage({ token, playlist, entries: await entriesFor(items) }));
    }
    if (!ITEM_ID.test(id)) return notFound(res);
    const item = await library.item(id);
    if (!item) return notFound(res);
    switch (head) {
      case 'item': {
        const { plan } = await planFor(item, true);
        return html(res, renderItemPage({ token, item, plan }));
      }
      case 'media': {
        const path = await library.resolveFile(item.rootId, item.path);
        return path ? sendFile(req, res, path) : notFound(res);
      }
      case 'art': {
        const path = item.art ? await library.resolveFile(item.art.rootId, item.art.path) : null;
        return path ? sendFile(req, res, path) : notFound(res);
      }
      case 'transcode':
        return transcode(req, res, item);
      default:
        return notFound(res);
    }
  };

  const handler = (req: IncomingMessage, res: ServerResponse) => {
    route(req, res).catch(() => {
      if (!res.headersSent) bare(res, 500);
      else res.destroy();
    });
  };

  // --- lifecycle ------------------------------------------------------------------

  const cutStreams = () => {
    for (const proc of transcodes) proc.kill();
    transcodes.clear();
  };

  const halt = async () => {
    const current = running;
    running = null;
    cutStreams();
    clients.clear();
    if (!current) return;
    current.server.close();
    current.server.closeAllConnections();
    await current.closed;
  };

  const status = async (): Promise<LibraryLanStatus> => ({
    available: true,
    running: running !== null,
    url: running?.url ?? null,
    settings: await settingsStore.read(),
    interfaces: listLanInterfaces(deps.interfaces()),
    clients: [...clients.values()].sort((a, b) => b.lastRequestAt - a.lastRequestAt),
    transcodes: transcodes.size,
    ffmpeg: await ffmpegStatus(),
  });

  const doStart = async (address?: string): Promise<GitOpResult<LibraryLanStatus>> => {
    if (running) return ok(await status());
    const settings = await settingsStore.read();
    const chosen = address ?? settings.address;
    if (!chosen) return failure('Pick the network to share on first.');
    const checked = checkBindAddress(chosen, deps.interfaces());
    if (!checked.ok) return failure(checked.message);
    const token = await tokens.token();
    const server = createServer(handler);
    const closed = new Promise<void>((resolve) => server.once('close', () => resolve()));
    let bound: { address: string; port: number };
    try {
      bound = await listen(server, checked.address, settings.port);
    } catch (error) {
      server.close();
      const code = (error as NodeJS.ErrnoException).code;
      return failure(
        code === 'EADDRINUSE'
          ? `Port ${settings.port} is in use on this computer — pick another.`
          : code === 'EADDRNOTAVAIL'
            ? 'That address is not on any of this computer’s network connections now.'
            : 'The server could not start.',
      );
    }
    running = { server, closed, url: `http://${bound.address}:${bound.port}/?k=${token}` };
    await settingsStore.update({ address: checked.address, wasOn: true });
    return ok(await status());
  };

  const start = (address?: string): Promise<GitOpResult<LibraryLanStatus>> => {
    starting ??= doStart(address).finally(() => {
      starting = null;
    });
    return starting;
  };

  return {
    available: true,
    status,
    start,
    stop: async () => {
      await halt();
      await settingsStore.update({ wasOn: false });
      return ok();
    },
    regenerateToken: async () => {
      await tokens.regenerate();
      if (running) {
        const url = new URL(running.url);
        url.searchParams.set('k', await tokens.token());
        running.url = url.toString();
        cutStreams();
        clients.clear();
        // Old links stop working at once, including a player's open keep-alive connection.
        running.server.closeAllConnections();
      }
      return ok();
    },
    setSettings: async (patch) => {
      if (patch.ffmpegPath !== undefined && patch.ffmpegPath !== null && !isFfmpegPathShaped(patch.ffmpegPath))
        return failure('The ffmpeg path must be an absolute path to a file named ffmpeg.');
      if (patch.address !== undefined && patch.address !== null && !isPrivateLanAddress(patch.address))
        return failure('Only a private local-network address can be shared on.');
      const current = await settingsStore.read();
      if (
        running &&
        ((patch.address !== undefined && patch.address !== current.address) ||
          (patch.port !== undefined && patch.port !== current.port))
      )
        return failure('Stop sharing before changing the network or port.');
      await settingsStore.update(patch);
      if (patch.ffmpegPath !== undefined) ffmpeg = null;
      return ok();
    },
    detectFfmpeg: async () => {
      ffmpeg = null;
      return ffmpegStatus();
    },
    startAtLaunch: async () => {
      const settings = await settingsStore.read();
      if (!settings.startWithApp || !settings.wasOn || !settings.address) return;
      await start(settings.address).catch(() => undefined);
    },
    dispose: halt,
  };
}
