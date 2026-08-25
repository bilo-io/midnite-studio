/**
 * Per-repository serialisation of git writes.
 *
 * git takes `.git/index.lock` for any operation that touches the index and
 * fails outright — "Another git process seems to be running" — rather than
 * waiting. A desktop client fires writes from several places at once (a click
 * to stage while a watcher-triggered fetch is mid-flight), so writes are
 * funnelled through one promise chain per repo.
 *
 * The queue is keyed by *repository*, not worktree: linked worktrees have their
 * own index files but share `.git/refs` and `packed-refs`, so two worktrees can
 * still collide on a ref update.
 *
 * The watcher subscribes to `onActivity` and suppresses its own events while a
 * write is in flight — without that, every stage/commit round-trips back
 * through the watcher as an external change and re-triggers the refetch that
 * caused it.
 */
export type WriteQueueListener = (active: boolean) => void;

export class WriteQueue {
  /** Tail of the promise chain per repo key. */
  private readonly chains = new Map<string, Promise<unknown>>();
  /** In-flight write count per repo — a chain can be several deep. */
  private readonly inFlight = new Map<string, number>();
  private readonly listeners = new Set<WriteQueueListener>();

  /**
   * Run `task` once every previously-queued write for `key` has settled.
   *
   * A rejecting task must not break the chain for everyone behind it, so the
   * stored tail swallows the rejection while the caller still sees it.
   */
  run<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.chains.get(key) ?? Promise.resolve();
    const result = previous.then(
      () => {
        this.begin(key);
        return task();
      },
      () => {
        this.begin(key);
        return task();
      },
    );

    const settled = result.then(
      (value) => {
        this.end(key);
        return value;
      },
      (error: unknown) => {
        this.end(key);
        throw error;
      },
    );

    this.chains.set(
      key,
      settled.catch(() => undefined),
    );
    return settled;
  }

  /** True while any write is running for `key` — the watcher's suppression gate. */
  isActive(key: string): boolean {
    return (this.inFlight.get(key) ?? 0) > 0;
  }

  /** Fired with `true` when a repo goes busy and `false` when it goes idle. */
  onActivity(listener: WriteQueueListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private begin(key: string): void {
    const next = (this.inFlight.get(key) ?? 0) + 1;
    this.inFlight.set(key, next);
    if (next === 1) this.emit(true);
  }

  private end(key: string): void {
    const next = (this.inFlight.get(key) ?? 1) - 1;
    if (next <= 0) {
      this.inFlight.delete(key);
      this.emit(false);
    } else {
      this.inFlight.set(key, next);
    }
  }

  private emit(active: boolean): void {
    for (const listener of this.listeners) listener(active);
  }
}

/**
 * The process-wide queue. One instance so two repo handles opened on the same
 * path (say the repo and one of its worktrees) still serialise against each
 * other.
 */
export const writeQueue = new WriteQueue();
