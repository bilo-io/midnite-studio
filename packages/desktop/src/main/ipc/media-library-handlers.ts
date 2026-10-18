import { homedir } from 'node:os';
import { join } from 'node:path';

import {
  createLibraryService,
  createTmdbProvider,
  libraryEmitters,
  libraryFileResolver,
  MEDIA_LIBRARY_DATA_DIR,
  mediaLibraryMain,
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
 */
export function registerMediaLibraryHandlers(): void {
  const library = createLibraryService({
    dataDir: join(app.getPath('userData'), MEDIA_LIBRARY_DATA_DIR),
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
  mediaLibraryMain.register(ctx, { library });
}
