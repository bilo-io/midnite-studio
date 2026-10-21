import { watch, type FSWatcher } from 'node:fs';
import { join } from 'node:path';

import { EVENT_CHANNELS, MEDIA_ROOT_DIR, MEDIA_TABS, type MediaTab } from '@midnite/studio-shared';

import { createMediaStore, type MediaStore } from './media-store';

/**
 * The repo-scoped media store with its watcher and its debounced
 * `mediaChanged` ping (Phase 99 Theme A; out of desktop's `media-handlers.ts`
 * since Phase 113 Theme Q). One per composer: Studio's resolves a repository
 * id through its registry, Creator's to its own media root.
 */
export type MediaServiceDeps = {
  /** `repoId` → the folder that holds `.midnite/media/`, or `null` when it is not open. */
  resolveRepo: (repoId: string) => Promise<string | null>;
  /** Move a path to the OS Trash. */
  trash: (absPath: string) => Promise<void>;
  /** Push an event to every window that shows media. */
  emit: (channel: string, payload: unknown) => void;
  /** How long a burst of changes to one tab coalesces for (default 150 ms). */
  debounceMs?: number;
};

export type MediaService = {
  store: MediaStore;
  /** Ping the renderer (debounced) and make sure the repo's watcher runs — for writers that bypass the store. */
  notifyChanged: (repoId: string, tab: MediaTab) => void;
  /** Start the recursive watcher on `<repo>/.midnite/media`, once. */
  ensureWatcher: (repoId: string) => Promise<void>;
  stopWatchers: () => void;
};

export function createMediaService(deps: MediaServiceDeps): MediaService {
  const debounceMs = deps.debounceMs ?? 150;
  const pending = new Map<string, ReturnType<typeof setTimeout>>();
  const watchers = new Map<string, FSWatcher>();

  function emitChanged(repoId: string, tab: MediaTab): void {
    const key = `${repoId}\0${tab}`;
    const prev = pending.get(key);
    if (prev) clearTimeout(prev);
    pending.set(
      key,
      setTimeout(() => {
        pending.delete(key);
        deps.emit(EVENT_CHANNELS.mediaChanged, { repoId, tab });
      }, debounceMs),
    );
  }

  async function ensureWatcher(repoId: string): Promise<void> {
    if (watchers.has(repoId)) return;
    const repoPath = await deps.resolveRepo(repoId);
    if (!repoPath) return;
    try {
      const watcher = watch(join(repoPath, MEDIA_ROOT_DIR), { recursive: true }, (_event, filename) => {
        const tab = String(filename ?? '').split(/[\\/]/)[0] as MediaTab;
        if ((MEDIA_TABS as readonly string[]).includes(tab)) emitChanged(repoId, tab);
      });
      watcher.on('error', () => {
        watcher.close();
        watchers.delete(repoId);
      });
      watchers.set(repoId, watcher);
    } catch {
      // No media folder yet — the first write starts the watcher.
    }
  }

  const notifyChanged = (repoId: string, tab: MediaTab): void => {
    emitChanged(repoId, tab);
    void ensureWatcher(repoId);
  };

  const store = createMediaStore({ resolveRepo: deps.resolveRepo, trash: deps.trash, onChanged: notifyChanged });

  return {
    store,
    notifyChanged,
    ensureWatcher,
    stopWatchers: () => {
      for (const watcher of watchers.values()) watcher.close();
      watchers.clear();
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
    },
  };
}
