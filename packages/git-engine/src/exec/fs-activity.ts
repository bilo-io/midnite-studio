/**
 * Per-repo activity signal for plain filesystem writes (Phase 24).
 *
 * `fs-write-handlers.ts` deliberately does not run through `write-queue.ts` —
 * that queue exists to serialise writers racing on `index.lock`, and a plain
 * file write never touches it. The consequence write-queue.ts's own comment
 * predicted: the watcher's own-write-echo problem, unaddressed until now.
 * This mirrors `WriteQueue`'s `onActivity`/begin/end shape rather than
 * inventing a new one, keyed by `repoId` (which every fs write request
 * already carries) so a write in one repo cannot suppress another's watcher —
 * `write-queue.ts`'s own suppression is global only because none of its
 * callers currently pass a repo-distinguishing key to `onActivity`.
 */
export type FsActivityListener = (repoId: string, active: boolean) => void;

export class FsActivity {
  /** In-flight write count per repo — a repo can have several writes queued at once. */
  private readonly inFlight = new Map<string, number>();
  private readonly listeners = new Set<FsActivityListener>();

  /** True while any fs write is running for `repoId` — the watcher's suppression gate. */
  isActive(repoId: string): boolean {
    return (this.inFlight.get(repoId) ?? 0) > 0;
  }

  /** Fired with `true` when a repo's fs writes go busy and `false` when they go idle. */
  onActivity(listener: FsActivityListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  begin(repoId: string): void {
    const next = (this.inFlight.get(repoId) ?? 0) + 1;
    this.inFlight.set(repoId, next);
    if (next === 1) this.emit(repoId, true);
  }

  end(repoId: string): void {
    const next = (this.inFlight.get(repoId) ?? 1) - 1;
    if (next <= 0) {
      this.inFlight.delete(repoId);
      this.emit(repoId, false);
    } else {
      this.inFlight.set(repoId, next);
    }
  }

  private emit(repoId: string, active: boolean): void {
    for (const listener of this.listeners) listener(repoId, active);
  }
}

/** The process-wide tracker. One instance so every fs write handler reports to the same signal. */
export const fsActivity = new FsActivity();

/** Wraps a write so its whole duration — not just its own event loop tick — is reported as active. */
export async function withFsActivity<T>(repoId: string, task: () => Promise<T>): Promise<T> {
  fsActivity.begin(repoId);
  try {
    return await task();
  } finally {
    fsActivity.end(repoId);
  }
}
