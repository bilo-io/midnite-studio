import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

import {
  VIDEO_LAYOUT_MARKERS,
  VIDEO_REPO_MEDIA_DIR,
  type VideoRootResolution,
} from '@midnite/studio-shared';

/**
 * Media ▸ Video's root resolution (Phase 99 Theme D), in order:
 *
 * 1. **`repo`** — the active repo *is* a video workspace: it has the
 *    midnite-videos layout (`video-editor/` + `projects/` at its root);
 * 2. **`repo-media`** — `<repo>/.midnite/media/video/` exists (what Setup
 *    Video scaffolds);
 * 3. **`global`** — Phase 44's global root setting.
 *
 * Nothing resolving is a state, not an error: the tab offers Setup Video,
 * scaffolding into `setupTarget`. Pure apart from the directory probe, which
 * is injectable so the tests need no fixture tree.
 */
export type IsDir = (path: string) => boolean;

export const isDirectory: IsDir = (path) => {
  try {
    return existsSync(path) && statSync(path).isDirectory();
  } catch {
    return false;
  }
};

export function hasVideoLayout(dir: string, isDir: IsDir = isDirectory): boolean {
  return VIDEO_LAYOUT_MARKERS.every((marker) => isDir(join(dir, marker)));
}

export function resolveVideoRoot(
  input: { repoPath: string | null; globalRoot: string | null },
  isDir: IsDir = isDirectory,
): VideoRootResolution {
  const setupTarget = input.repoPath ? join(input.repoPath, VIDEO_REPO_MEDIA_DIR) : null;
  if (input.repoPath && hasVideoLayout(input.repoPath, isDir)) {
    return { root: input.repoPath, source: 'repo', setupTarget };
  }
  if (setupTarget && isDir(setupTarget)) {
    return { root: setupTarget, source: 'repo-media', setupTarget };
  }
  if (input.globalRoot) {
    return { root: input.globalRoot, source: 'global', setupTarget };
  }
  return { root: null, source: null, setupTarget };
}
