import { watch, type FSWatcher } from 'node:fs';
import { basename, join, sep } from 'node:path';

import type { WatchKind } from '@midnite/git-shared';

import { execGit } from '../exec/git-exec';
import { writeQueue } from '../exec/write-queue';

/**
 * Watches a repository and reports *what kind* of thing changed.
 *
 * The kind is the point. A git client that refetches everything on every
 * filesystem event is unusable on a real repo: a `pnpm install` fires thousands
 * of events, and re-streaming a 50 000-row log for each one would peg a core
 * and make the graph flicker. Classifying lets the renderer invalidate narrowly
 * — a staged file touches status and nothing else.
 *
 * Three things keep the noise down:
 *
 * 1. **Narrow watches.** `.git/HEAD`, `.git/refs` (recursive), `.git/index` and
 *    `packed-refs` are watched individually rather than watching `.git` whole,
 *    which would include every loose object git writes during a commit.
 * 2. **Debounce.** A single `git commit` touches the index, HEAD, refs and the
 *    worktree within a few milliseconds. One event out the far side, not four.
 * 3. **Own-write suppression.** Every write this app makes goes through the
 *    write queue, and events produced while the queue is busy are dropped.
 *    Without it, staging a file emits a watch event, which refetches status,
 *    which is exactly the work the stage already did — and a `pull` would
 *    trigger a cascade of refetches while it is still running.
 */
export type WatchEventHandler = (kind: WatchKind) => void;

export type RepoWatcherOptions = {
  /** Absolute path to the main worktree. */
  repoPath: string;
  onEvent: WatchEventHandler;
  /**
   * How long to wait for the storm to settle. 200ms is long enough to collapse
   * a commit's four writes and short enough that the UI feels live.
   */
  debounceMs?: number;
  /**
   * Grace period after the write queue goes idle during which events are still
   * suppressed. git's own writes land slightly after the process exits, so
   * dropping only *while* busy leaves a tail that reads as an external change.
   */
  settleMs?: number;
};

export class RepoWatcher {
  private readonly watchers: FSWatcher[] = [];
  private readonly pending = new Set<WatchKind>();
  private timer: NodeJS.Timeout | null = null;
  private stopped = false;
  private busyUntil = 0;
  private releaseQueueListener: (() => void) | null = null;

  private constructor(
    private readonly options: Required<Omit<RepoWatcherOptions, 'onEvent'>> & {
      onEvent: WatchEventHandler;
    },
  ) {}

  static async start(options: RepoWatcherOptions): Promise<RepoWatcher> {
    const watcher = new RepoWatcher({
      repoPath: options.repoPath,
      onEvent: options.onEvent,
      debounceMs: options.debounceMs ?? 200,
      settleMs: options.settleMs ?? 300,
    });
    await watcher.attach();
    return watcher;
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.releaseQueueListener?.();
    for (const watcher of this.watchers) {
      try {
        watcher.close();
      } catch {
        // Already closed.
      }
    }
    this.watchers.length = 0;
  }

  private async attach(): Promise<void> {
    const { repoPath } = this.options;

    // Resolve the real git dir: in a linked worktree `.git` is a file, and the
    // shared refs live somewhere else entirely.
    const gitDirResult = await execGit(repoPath, [
      'rev-parse',
      '--path-format=absolute',
      '--git-common-dir',
    ]);
    const gitDir = gitDirResult.exitCode === 0 ? gitDirResult.stdout.trim() : join(repoPath, '.git');

    this.releaseQueueListener = writeQueue.onActivity((active) => {
      // Extend the suppression window on every transition, including the one
      // to idle — that is what covers the tail of git's own writes.
      this.busyUntil = Date.now() + (active ? 60_000 : this.options.settleMs);
    });

    this.watchPath(join(gitDir, 'HEAD'), () => 'head');
    this.watchPath(join(gitDir, 'index'), () => 'index');
    this.watchPath(join(gitDir, 'packed-refs'), () => 'refs');
    this.watchPath(join(gitDir, 'refs'), () => 'refs', true);
    // A linked worktree's HEAD lives under `.git/worktrees/<name>/HEAD`, so a
    // checkout in another worktree is invisible without this.
    this.watchPath(join(gitDir, 'worktrees'), () => 'head', true);

    // The working tree itself. Recursive, and filtered hard — this is the noisy
    // one, and the filter is what stops `node_modules` churn from reaching the UI.
    this.watchPath(repoPath, (file) => (isNoise(file) ? null : 'worktree'), true);
  }

  private watchPath(
    target: string,
    classify: (file: string) => WatchKind | null,
    recursive = false,
  ): void {
    try {
      const watcher = watch(target, { recursive, persistent: false }, (_event, filename) => {
        const kind = classify(filename ? String(filename) : '');
        if (kind) this.queue(kind);
      });
      // A watcher on a path that disappears (a worktree is removed) must not
      // take the process down.
      watcher.on('error', () => undefined);
      this.watchers.push(watcher);
    } catch {
      // The path may not exist — `packed-refs` only appears after a gc, and
      // `worktrees` only once a linked worktree exists. Not an error.
    }
  }

  private queue(kind: WatchKind): void {
    if (this.stopped) return;
    this.pending.add(kind);

    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), this.options.debounceMs);
  }

  private flush(): void {
    this.timer = null;
    if (this.stopped) return;

    const kinds = [...this.pending];
    this.pending.clear();

    // Own-write suppression, applied at flush rather than at queue time: a write
    // can start after an event is queued but before the debounce fires.
    if (Date.now() < this.busyUntil) return;

    for (const kind of kinds) this.options.onEvent(kind);
  }
}

/**
 * Working-tree paths that must never wake the UI.
 *
 * `.git` itself is excluded because it is watched precisely above — letting the
 * recursive worktree watcher see it too would report every loose object write
 * during a commit as a worktree change.
 *
 * The rest are the directories that generate filesystem events by the thousand
 * and are ignored by every repo that has them. This is a pragmatic list, not a
 * `.gitignore` parser: reading gitignore per event would cost more than the
 * refetch it saves, and a false negative here only means one extra `git status`.
 */
const NOISE_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  'out',
  'target',
  '.next',
  '.turbo',
  '.moon',
  'coverage',
  '.venv',
  '__pycache__',
]);

export function isNoise(filename: string): boolean {
  if (filename.length === 0) return true;
  const segments = filename.split(sep);
  if (segments.some((segment) => NOISE_DIRS.has(segment))) return true;

  const name = basename(filename);
  // Editors write `.foo.swp`, `4913`, `file~` and similar while saving.
  if (name.endsWith('~') || name.endsWith('.swp') || name.endsWith('.tmp')) return true;
  return false;
}
