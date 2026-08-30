import { watch, type FSWatcher } from 'node:fs';
import { basename, join, sep } from 'node:path';

import type { WatchKind } from '@midnite/studio-shared';

import { fsActivity } from '../exec/fs-activity';
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
 * 3. **Own-write suppression.** Every git write this app makes goes through
 *    the write queue, and events produced while the queue is busy are
 *    dropped. Without it, staging a file emits a watch event, which refetches
 *    status, which is exactly the work the stage already did — and a `pull`
 *    would trigger a cascade of refetches while it is still running.
 *
 *    Suppression is scoped by arrival time, not by the window alone: an event
 *    already waiting when the write began is not that write's echo, so it is
 *    delivered rather than dropped. Blanket dropping silently lost external
 *    changes that landed as a write started.
 *
 *    A plain fs write (Phase 24 — create/rename/delete/save through the
 *    Files view) never touches `write-queue.ts`, so it gets its own,
 *    independent suppression window off `fs-activity.ts`, scoped to this
 *    watcher's own `repoId` and applied only to `worktree`-classified events
 *    — an fs write can never touch `.git/HEAD`, `.git/index` or refs.
 */
export type WatchEventHandler = (kind: WatchKind) => void;

export type RepoWatcherOptions = {
  /** Absolute path to the main worktree. */
  repoPath: string;
  /** Which repo this watcher belongs to — how it filters `fs-activity.ts` events down to its own. */
  repoId: string;
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
  /**
   * The same grace period, for `fs-activity.ts` instead of the write queue.
   * Shorter than {@link settleMs} on purpose: a plain file write has no
   * `index.lock`-style tail the way a git write does, so recovery can be
   * snappier.
   */
  fsSettleMs?: number;
};

export class RepoWatcher {
  private readonly watchers: FSWatcher[] = [];
  /** Each pending kind, against the time it was FIRST seen this window. */
  private readonly pending = new Map<WatchKind, number>();
  private timer: NodeJS.Timeout | null = null;
  private stopped = false;
  private busyUntil = 0;
  /** When the current own-write suppression window opened. */
  private busySince = 0;
  /** The same pair, for `fs-activity.ts` — independent of the git write queue's window. */
  private fsBusyUntil = 0;
  private fsBusySince = 0;
  private releaseQueueListener: (() => void) | null = null;
  private releaseFsActivityListener: (() => void) | null = null;

  private constructor(
    private readonly options: Required<Omit<RepoWatcherOptions, 'onEvent'>> & {
      onEvent: WatchEventHandler;
    },
  ) {}

  static async start(options: RepoWatcherOptions): Promise<RepoWatcher> {
    const watcher = new RepoWatcher({
      repoPath: options.repoPath,
      repoId: options.repoId,
      onEvent: options.onEvent,
      debounceMs: options.debounceMs ?? 200,
      settleMs: options.settleMs ?? 300,
      fsSettleMs: options.fsSettleMs ?? 150,
    });
    await watcher.attach();
    return watcher;
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.releaseQueueListener?.();
    this.releaseFsActivityListener?.();
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
      const now = Date.now();
      // Anchor the window at the transition that OPENED it, and leave it there
      // across the busy/idle flips within one operation. `flush` needs a stable
      // answer to "had this event already arrived before we started writing?",
      // and re-anchoring on each flip would keep moving the line past events
      // that were waiting before the write began.
      if (now >= this.busyUntil) this.busySince = now;
      // Extend the suppression window on every transition, including the one
      // to idle — that is what covers the tail of git's own writes.
      this.busyUntil = now + (active ? 60_000 : this.options.settleMs);
    });

    this.releaseFsActivityListener = fsActivity.onActivity((repoId, active) => {
      if (repoId !== this.options.repoId) return;
      const now = Date.now();
      if (now >= this.fsBusyUntil) this.fsBusySince = now;
      this.fsBusyUntil = now + (active ? 60_000 : this.options.fsSettleMs);
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
    // First sighting wins. `flush` compares this against the start of the write
    // window, and the answer it wants is "when did this kind start waiting?",
    // not "when was it last re-reported".
    if (!this.pending.has(kind)) this.pending.set(kind, Date.now());

    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), this.options.debounceMs);
  }

  private flush(): void {
    this.timer = null;
    if (this.stopped) return;

    // Own-write suppression, applied at flush rather than at queue time: a write
    // can start after an event is queued but before the debounce fires.
    const now = Date.now();
    const gitSuppressing = now < this.busyUntil;
    const fsSuppressing = now < this.fsBusyUntil;

    const kinds: WatchKind[] = [];
    for (const [kind, queuedAt] of this.pending) {
      // Suppression exists to drop the echo of OUR OWN write — stage, event,
      // refetch the status the stage already knew. An event that was queued
      // before that write began cannot be that echo, so dropping it is pure
      // loss: an external change (a prune, a checkout, a rebase from the
      // integrated terminal) that happened to land just as the app started
      // writing was discarded and never re-checked, leaving the UI stale until
      // something unrelated moved. Deliver those; still drop the rest.
      const droppedByGit = gitSuppressing && queuedAt >= this.busySince;
      // fs writes (Phase 24) never touch `.git/HEAD`, `.git/index` or refs, so
      // their echo can only ever be a `worktree` event — a `head`/`index`/
      // `refs` event during an fs write is a real, concurrent git change.
      const droppedByFs = kind === 'worktree' && fsSuppressing && queuedAt >= this.fsBusySince;
      if (!droppedByGit && !droppedByFs) kinds.push(kind);
    }
    this.pending.clear();

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
