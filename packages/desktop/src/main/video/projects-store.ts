import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Video Studio's only piece of persisted state (Phase 44 Theme B) — the
 * configured video root directory. Everything else (which projects exist,
 * what renders are on disk) is read straight off the filesystem on every
 * request; see `project-discovery.ts`'s own doc comment for why this store
 * is a pointer, not a mirror.
 *
 * JSON under `userData`, following `councils-store.ts`'s shape, scaled down
 * to the one field this domain actually persists.
 */
const FILE_NAME = 'video-settings.json';

export type VideoSettings = { videoRoot: string | null };

export type ProjectsStore = {
  load: () => Promise<VideoSettings>;
  save: (settings: VideoSettings) => Promise<void>;
};

type StoredState = { version: 1; videoRoot: string | null };

export function createProjectsStore(directory: string): ProjectsStore {
  const file = join(directory, FILE_NAME);

  return {
    load: async () => {
      let raw: unknown;
      try {
        raw = JSON.parse(await readFile(file, 'utf8'));
      } catch {
        // Missing (first launch) or unreadable/corrupt — no root configured yet.
        return { videoRoot: null };
      }
      return parseStoredSettings(raw);
    },

    save: async (settings) => {
      const state: StoredState = { version: 1, videoRoot: settings.videoRoot };
      try {
        await writeFile(file, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
      } catch {
        // A read-only data dir shouldn't take the app down; the session still
        // works, it just won't be remembered.
      }
    },
  };
}

/** Exported for the store's own tests. A non-string `videoRoot` is treated as unset, never thrown. */
export function parseStoredSettings(value: unknown): VideoSettings {
  if (typeof value !== 'object' || value === null) return { videoRoot: null };
  const videoRoot = (value as { videoRoot?: unknown }).videoRoot;
  return { videoRoot: typeof videoRoot === 'string' ? videoRoot : null };
}

/** A store that remembers nothing — the fallback before one is configured. */
export const nullProjectsStore: ProjectsStore = {
  load: async () => ({ videoRoot: null }),
  save: async () => {},
};
