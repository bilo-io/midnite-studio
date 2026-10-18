import { homedir, networkInterfaces } from 'node:os';
import { join } from 'node:path';

import {
  createLanStreamServer,
  createLibraryService,
  createTmdbProvider,
  libraryEmitters,
  libraryFileResolver,
  MEDIA_LIBRARY_DATA_DIR,
  mediaLibraryMain,
  type LibraryLanController,
} from '@midnite/studio-feature-media-library/main';
import type { FeatureMainContext } from '@midnite/studio-runtime';
import { app, BrowserWindow, dialog } from 'electron';

import { setLibraryFileResolver } from '../fs-protocol';
import { broadcastToAllWindows } from '../window-manager';
import { handle, handleBare, handleSend } from './handle';
import { readSecret } from './secrets-handlers';

/**
 * Studio's composition of Media ▸ Library's main half (Phase 113 Theme R).
 *
 * - The index and art cache live under `<userData>/media-library` — never inside a folder the user added.
 * - Roots come only from the native folder picker; the renderer never names a path to scan.
 * - The TMDB key is read from Studio's vault here in main (`media.tmdbApiKey`), and only when the user
 *   has switched online metadata on; the renderer learns only whether one is set.
 * - Files reach the renderer over the existing `mstudio-file:` scheme's `library` host, resolved by the
 *   feature through its index and the root's path jail — so the CSP is unchanged.
 * - Share on your network (slice 2) is a `node:http` server the user starts, bound to one private address of
 *   theirs, behind a sharing token; it serves only what that same resolver serves, and transcodes only through
 *   a system ffmpeg the user has (never a bundled one).
 */
let lan: LibraryLanController | null = null;

export function registerMediaLibraryHandlers(): void {
  const dataDir = join(app.getPath('userData'), MEDIA_LIBRARY_DATA_DIR);
  const library = createLibraryService({
    dataDir,
    pickDirectory: async () => {
      const win = BrowserWindow.getFocusedWindow();
      const options = {
        title: 'Add a folder to the library',
        buttonLabel: 'Add to library',
        properties: ['openDirectory' as const],
      };
      const picked = win
        ? await dialog.showOpenDialog(win, options)
        : await dialog.showOpenDialog(options);
      return picked.canceled ? null : (picked.filePaths[0] ?? null);
    },
    ...libraryEmitters(broadcastToAllWindows),
    readKey: () => readSecret('media.tmdbApiKey'),
    online: createTmdbProvider((input, init) => fetch(input, init)),
    homeDir: homedir(),
  });
  setLibraryFileResolver(libraryFileResolver(library));

  const ctx: FeatureMainContext = {
    ipc: { handle, handleBare, send: handleSend },
    emit: broadcastToAllWindows,
    trashItem: () => Promise.reject(new Error('the library never trashes a file')),
  };
  // Share on your network: built here, listening only once the user presses Start (or left it on and chose
  // "start with the app"). Bound to the private address they picked; the token lives under `dataDir`.
  lan = createLanStreamServer({
    library,
    dataDir,
    interfaces: networkInterfaces,
    pathEnv: process.env.PATH ?? '',
  });
  mediaLibraryMain.register(ctx, { library, lan });
  void lan.startAtLaunch();
}

/** Closes the Library's LAN server and any transcode, keeping "it was on" — `main/index.ts`'s `before-quit`. */
export function disposeMediaLibraryLan(): void {
  void lan?.dispose();
}
