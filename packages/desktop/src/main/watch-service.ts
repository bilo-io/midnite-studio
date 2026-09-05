import { RepoWatcher } from '@midnite/studio-git-engine';
import { EVENT_CHANNELS, type WatchKind } from '@midnite/studio-shared';

import { broadcastToAllWindows } from './window-manager';

/**
 * One watcher per open repository, forwarding classified events to EVERY open
 * window.
 *
 * Keyed by repoId and reconciled against the registry rather than started
 * ad hoc, so closing a repo actually releases its file handles — a watcher on a
 * recursive worktree is not free, and leaking one per open/close cycle would
 * exhaust the process's descriptors on a long session.
 *
 * **One watcher, N consumers** (Theme I). These functions used to take a
 * `BrowserWindow` and capture it, which meant `watchEvent` reached main and
 * nowhere else; every other window stayed fresh only because main's renderer
 * rebroadcast each event over the Theme E relay. A detached PAGE broke that
 * bargain — it is a full data-driven view, not a panel, so its freshness must
 * not depend on another window's renderer being mounted and awake to forward
 * for it. The fix is fan-out at the send, NOT a watcher per window: the map
 * below is still keyed by repoId, so a repo open in three windows is watched
 * once and costs three `webContents.send` calls rather than three recursive
 * fs trees.
 */
const watchers = new Map<string, RepoWatcher>();

export async function watchRepo(repoId: string, repoPath: string): Promise<void> {
  if (watchers.has(repoId)) return;

  const watcher = await RepoWatcher.start({
    repoPath,
    repoId,
    onEvent: (kind: WatchKind) => {
      broadcastToAllWindows(EVENT_CHANNELS.watchEvent, { repoId, kind, at: Date.now() });
    },
  });

  watchers.set(repoId, watcher);
}

export function unwatchRepo(repoId: string): void {
  watchers.get(repoId)?.stop();
  watchers.delete(repoId);
}

/**
 * Bring the watcher set in line with the open repositories.
 *
 * Called after any change to the registry. Reconciling beats start/stop calls
 * sprinkled through the open and close paths, which is how a watcher gets
 * orphaned when a third path (restore-at-boot, say) forgets one of them.
 */
export async function reconcileWatchers(
  repos: readonly { id: string; path: string }[],
): Promise<void> {
  const wanted = new Set(repos.map((repo) => repo.id));

  for (const repoId of [...watchers.keys()]) {
    if (!wanted.has(repoId)) unwatchRepo(repoId);
  }
  for (const repo of repos) {
    await watchRepo(repo.id, repo.path);
  }
}

export function stopAllWatchers(): void {
  for (const repoId of [...watchers.keys()]) unwatchRepo(repoId);
}

/** Live watcher count — used by the shutdown path and by tests. */
export const watcherCount = (): number => watchers.size;
