/**
 * Per-key serialisation for the media store's writes — the semantics of
 * git-engine's `WriteQueue.run`, which the store used while it lived in
 * desktop, without making a feature's main half depend on git-engine
 * (Phase 113 Theme Q). The store's queue was private to it, so nothing ever
 * listened to it: only the ordering moved here.
 *
 * `run(key, task)` starts `task` once every earlier task for `key` has
 * settled. A rejecting task does not break the chain for those behind it;
 * its caller still sees the rejection.
 */
export type SerialQueue = { run<T>(key: string, task: () => Promise<T>): Promise<T> };

export function createSerialQueue(): SerialQueue {
  const tails = new Map<string, Promise<unknown>>();
  return {
    run<T>(key: string, task: () => Promise<T>): Promise<T> {
      const result = (tails.get(key) ?? Promise.resolve()).then(task);
      const tail = result.then(
        () => undefined,
        () => undefined,
      );
      tails.set(key, tail);
      void tail.then(() => {
        if (tails.get(key) === tail) tails.delete(key);
      });
      return result;
    },
  };
}
