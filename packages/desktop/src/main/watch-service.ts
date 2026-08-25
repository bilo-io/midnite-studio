import { RepoWatcher } from '@midnite-git/git-engine';
import { EVENT_CHANNELS, type WatchKind } from '@midnite-git/shared';
import type { BrowserWindow } from 'electron';

/**
 * One watcher per open repository, forwarding classified events to the renderer.
 *
 * Keyed by repoId and reconciled against the registry rather than started
 * ad hoc, so closing a repo actually releases its file handles — a watcher on a
 * recursive worktree is not free, and leaking one per open/close cycle would
 * exhaust the process's descriptors on a long session.
 */
const watchers = new Map<string, RepoWatcher>();

export async function watchRepo(
  win: BrowserWindow,
  repoId: string,
  repoPath: string,
): Promise<void> {
  if (watchers.has(repoId)) return;

  const watcher = await RepoWatcher.start({
    repoPath,
    onEvent: (kind: WatchKind) => {
      if (win.isDestroyed()) return;
      win.webContents.send(EVENT_CHANNELS.watchEvent, { repoId, kind, at: Date.now() });
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
  win: BrowserWindow,
  repos: readonly { id: string; path: string }[],
): Promise<void> {
  const wanted = new Set(repos.map((repo) => repo.id));

  for (const repoId of [...watchers.keys()]) {
    if (!wanted.has(repoId)) unwatchRepo(repoId);
  }
  for (const repo of repos) {
    await watchRepo(win, repo.id, repo.path);
  }
}

export function stopAllWatchers(): void {
  for (const repoId of [...watchers.keys()]) unwatchRepo(repoId);
}

/** Live watcher count — used by the shutdown path and by tests. */
export const watcherCount = (): number => watchers.size;
