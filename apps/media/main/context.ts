import { join } from 'node:path';

import {
  createLibraryService,
  createTmdbProvider,
  libraryEmitters,
  MEDIA_LIBRARY_DATA_DIR,
  mediaLibraryMain,
  type LibraryService,
} from '@midnite/studio-feature-media-library/main';
import { createIpcContext, type IpcContextElectron } from '@midnite/studio-runtime';

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
};

/**
 * Registers every channel Media's renderer can call — the Library's roots, scans, items, progress and
 * settings, and nothing else — and returns the service, which the `mstudio-file://library/…` handler
 * resolves through. The online provider only runs when the user has switched online metadata on *and*
 * a granted key reads back; until then the library makes no network call at all.
 */
export function registerMediaHandlers(el: MediaElectron): LibraryService {
  const ctx = createIpcContext(el);
  const fetchFn = el.fetch;
  const library = createLibraryService({
    dataDir: el.dataDir,
    pickDirectory: el.pickDirectory,
    ...libraryEmitters(el.send),
    readKey: el.readKey,
    ...(fetchFn ? { online: createTmdbProvider((input, init) => fetchFn(input, init)) } : {}),
    ...(el.homeDir !== undefined ? { homeDir: el.homeDir } : {}),
  });
  mediaLibraryMain.register(ctx, { library });
  return library;
}

/** `<userData>/media-library` — the library's own data directory, never inside a library folder. */
export const mediaLibraryDataDir = (userData: string): string =>
  join(userData, MEDIA_LIBRARY_DATA_DIR);
