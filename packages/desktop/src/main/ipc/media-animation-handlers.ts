import { join } from 'node:path';

import { app, BrowserWindow, dialog } from 'electron';

import {
  createAnimationLibrary,
  createAnimationService,
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

/** The folder every repo shares; a path outside any repo, so a clip is never a stray file in one. */
export const animationLibraryRoot = (): string => join(app.getPath('userData'), 'animation-library');

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
      library: createAnimationLibrary({ root: animationLibraryRoot() }),
      pickPaths,
      emitChanged: (event) => broadcastToAllWindows(EVENT_CHANNELS.mediaAnimationChanged, event),
      emitProgress: (event) => broadcastToAllWindows(EVENT_CHANNELS.mediaAnimationProgress, event),
    });
    return service.handle(req);
  },
};
