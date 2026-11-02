import { join } from 'node:path';

import { app, BrowserWindow, dialog } from 'electron';

import {
  createAnimationLibrary,
  createAnimationService,
  type AnimationLibrary,
  type AnimationService,
} from '@midnite/studio-feature-media-model/main';
import { EVENT_CHANNELS } from '@midnite/studio-shared';

import { broadcastToAllWindows } from '../window-manager';

/**
 * Media ▸ Animations (Phase 125) — Studio's half: the global clip library under `<userData>/animation-library`
 * and the two native pickers. The feature owns the library, the importer and the dispatcher; this binds them to
 * Electron. Built on first use, so nothing touches the disk at startup.
 */
let service: AnimationService | null = null;
let library: AnimationLibrary | null = null;

/** The folder every repo shares; a path outside any repo, so a clip is never a stray file in one. */
export const animationLibraryRoot = (): string => join(app.getPath('userData'), 'animation-library');

/**
 * The one library instance: the channel's service and the game asset bridge (Phase 125 Theme G) both read it, so a
 * clip just added is visible to an import without either holding a stale copy of the manifest.
 */
export const animationLibrary = (): AnimationLibrary => (library ??= createAnimationLibrary({ root: animationLibraryRoot() }));

async function pickPaths(kind: 'files' | 'folder'): Promise<string[] | null> {
  const options = {
    title: kind === 'files' ? 'Import animation clips' : 'Import a folder of animation clips',
    filters: kind === 'files' ? [{ name: 'Animation clips', extensions: ['fbx', 'glb', 'gltf', 'bvh'] }] : undefined,
    properties: (kind === 'files' ? ['openFile', 'multiSelections'] : ['openDirectory']) as Array<'openFile' | 'multiSelections' | 'openDirectory'>,
  };
  const win = BrowserWindow.getFocusedWindow();
  const picked = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
  return picked.canceled ? null : picked.filePaths;
}

/** The dispatcher the `mediaAnimation` channel shares; the library is created the first time it is asked. */
export const animationService: AnimationService = {
  handle: (req) => {
    service ??= createAnimationService({
      library: animationLibrary(),
      pickPaths,
      emitChanged: (event) => broadcastToAllWindows(EVENT_CHANNELS.mediaAnimationChanged, event),
      emitProgress: (event) => broadcastToAllWindows(EVENT_CHANNELS.mediaAnimationProgress, event),
    });
    return service.handle(req);
  },
};
