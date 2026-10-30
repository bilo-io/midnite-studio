import { join } from 'node:path';

import {
  createLanStreamServer,
  createLibraryService,
  createTmdbProvider,
  libraryEmitters,
  MEDIA_LIBRARY_DATA_DIR,
  mediaLibraryMain,
  type FfmpegPort,
  type LanListen,
  type LibraryLanController,
  type LibraryService,
  type NetworkInterfaces,
} from '@midnite/studio-feature-media-library/main';
import { createIpcContext, type FeatureMainContext, type IpcContextElectron } from '@midnite/studio-runtime';

/** The electron pieces Media's main needs, injected so registration is testable under bare vitest. */
export type MediaElectron = IpcContextElectron & {
  /** Where the library's index and art cache live: `<userData>/media-library`, a temp dir under test. */
  dataDir: string;
  /** The native folder picker — an absolute path, or null when dismissed. Main's, never the renderer's. */
  pickDirectory: () => Promise<string | null>;
  /** The TMDB key, read in main from the runtime vault (`keys.ts`). Never sent to the renderer. */
  readKey: () => Promise<string | null>;
  /**
   * `fetch` for the opt-in online provider. Absent, no provider is wired and the library stays local
   * whatever the switch says; a test passes one that refuses the network.
   */
  fetch?: typeof fetch;
  /** The user's home directory — refused as a library folder in its own right. */
  homeDir?: string;
  /** `os.networkInterfaces` — the addresses Share on your network may bind (fake ones under test). */
  interfaces: () => NetworkInterfaces;
  /** The native "Choose ffmpeg" dialog — an absolute path, or null when dismissed. Main's, never the renderer's. */
  chooseFfmpeg?: () => Promise<string | null>;
  /** `PATH`, for finding a system ffmpeg. */
  pathEnv?: string;
  /** Test seams: bind loopback instead of the picked address; run no real ffmpeg. */
  listen?: LanListen;
  ffmpeg?: FfmpegPort;
  isExecutable?: (path: string) => Promise<boolean>;
};

/** What registration builds: the library, and the LAN server the user may start (never at registration). */
export type MediaServices = { library: LibraryService; lan: LibraryLanController };

/**
 * Registers every channel Media's renderer can call — the Library's roots, scans, items, progress,
 * settings, playlists and Share on your network, and nothing else — and returns the services, which the `mstudio-file://library/…` handler
 * resolves through. The online provider only runs when the user has switched online metadata on *and*
 * a granted key reads back; until then the library makes no network call at all.
 */
export function registerMediaHandlers(el: MediaElectron): MediaServices {
  return registerMediaOn(createIpcContext(el), el);
}

/**
 * {@link registerMediaHandlers} over a context the caller built — what the module's main half
 * (`mediaModuleMain`) registers through, so a host can mount it beside other modules.
 */
export function registerMediaOn(ctx: FeatureMainContext, el: MediaElectron): MediaServices {
  const fetchFn = el.fetch;
  const library = createLibraryService({
    dataDir: el.dataDir,
    pickDirectory: el.pickDirectory,
    ...libraryEmitters(el.send),
    readKey: el.readKey,
    ...(fetchFn ? { online: createTmdbProvider((input, init) => fetchFn(input, init)) } : {}),
    ...(el.homeDir !== undefined ? { homeDir: el.homeDir } : {}),
  });
  // Built, not started: it listens only after the user presses Start (or left it on with start-with-app).
  const lan = createLanStreamServer({
    library,
    dataDir: el.dataDir,
    interfaces: el.interfaces,
    ...(el.pathEnv !== undefined ? { pathEnv: el.pathEnv } : {}),
    ...(el.listen ? { listen: el.listen } : {}),
    ...(el.ffmpeg ? { ffmpeg: el.ffmpeg } : {}),
    ...(el.chooseFfmpeg ? { chooseFfmpeg: el.chooseFfmpeg } : {}),
    ...(el.isExecutable ? { isExecutable: el.isExecutable } : {}),
  });
  mediaLibraryMain.register(ctx, { library, lan });
  return { library, lan };
}

/** `<userData>/media-library` — the library's own data directory, never inside a library folder. */
export const mediaLibraryDataDir = (userData: string): string =>
  join(userData, MEDIA_LIBRARY_DATA_DIR);
